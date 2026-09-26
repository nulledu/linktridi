import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { FRASE_JA_RODANDO } from "@/lib/maquina-fila";
import {
  fimDaColuna, montarQuadro, patchDeStatus, SEM_MAQUINA,
  type LinhaAtividadeQuadro, type LinhaMaquinaQuadro, type LinhaProgQuadro, type StatusQuadro,
} from "@/lib/maquina-quadro";

export const dynamic = "force-dynamic";

// ── O quadro das máquinas ────────────────────────────────────────────────────
//
// Lê as três tabelas (máquinas + programações + atividades da faixa "maquinas")
// e devolve uma raia por máquina, já dividida em Pendente / Em andamento /
// Concluído. O PATCH move UM cartão — de status, de máquina, ou os dois no
// mesmo gesto — e vale pros dois tipos de cartão, que é o que mantém as duas
// listas sincronizadas.
//
// Gate: o mesmo do controle das máquinas. Marcar "em andamento" e "feita" é do
// operador (módulo Produção); nada aqui vai além do que a tela de controle já
// deixa fazer.
type Quem = { id: string; role: string; username?: string | null };
const podeMexer = (me: Quem) => papelOuChave(me, ["admin", "gerente_producao"], "producao");

const SEM_TABELA = {
  error: "schema_desatualizado",
  detalhe: "Rode supabase/maquinas.sql no Supabase — as máquinas ainda não têm tabela.",
} as const;

const tabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /relation .* does not exist|schema cache/i.test(e.message ?? ""));

// `supabase/maquinas_quadro.sql` ainda não rodado: `atividades.maquina_id` não
// existe. O quadro então mostra as atividades no monte "sem máquina" e trava o
// arrasto delas, em vez de a Produção inteira cair por causa de uma coluna.
const colunaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || /column .* does not exist|schema cache/i.test(e.message ?? ""));

// Índice único `maq_prog_uma_executando`: duas pessoas no quadro tentando pôr
// dois cortes pra rodar na mesma máquina. "duplicate key" não diz o que fazer.
const jaRodando = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "23505" || /duplicate key|maq_prog_uma_executando/i.test(e.message ?? ""));

const COLS_MAQ = "id,nome,porte,materiais,ativa,ordem,parada_motivo";
const COLS_PROG = "id,maquina_id,referencia,material,minutos_estimados,posicao,status,iniciada_at,concluida_at";
const COLS_ATV_BASE = "id,tarefa,categoria,para_nome,status,urgente,tempo_estimado_min,iniciada_at,concluida_at";
const COLS_ATV = COLS_ATV_BASE + ",maquina_id,quadro_posicao";

export async function GET() {
  const me = await getProfile();
  if (!me || !(await podeMexer(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createSupabaseAdminClient();
  // Janela de 2 dias no que já fechou: é o que alimenta a coluna "Concluído"
  // (que mostra só o dia) sem arrastar o histórico da fábrica pra dentro da
  // leitura.
  const desde = new Date(Date.now() - 2 * 86400000).toISOString();

  const [{ data: maquinas, error: eMaq }, { data: progs, error: eProg }] = await Promise.all([
    db.from("maquinas").select(COLS_MAQ).eq("ativa", true).order("ordem").limit(60),
    db.from("maquina_programacoes").select(COLS_PROG)
      .or(`status.neq.concluida,concluida_at.gte.${desde}`).order("posicao").limit(600),
  ]);
  if (tabelaAusente(eMaq) || tabelaAusente(eProg)) return NextResponse.json({ disponivel: false, ...SEM_TABELA });
  if (eMaq || eProg || !maquinas) return NextResponse.json({ error: "banco" }, { status: 500 });

  // A faixa "maquinas" é o recorte: o quadro é das MÁQUINAS, e a atividade de
  // montagem não tem o que fazer numa raia de laser.
  const lerAtividades = (cols: string) =>
    db.from("atividades").select(cols)
      .eq("faixa", "maquinas")
      .or(`status.neq.concluida,concluida_at.gte.${desde}`)
      .limit(400);

  let { data: atvs, error: eAtv } = await lerAtividades(COLS_ATV);
  const temColunaMaquina = !colunaAusente(eAtv);
  if (!temColunaMaquina) ({ data: atvs, error: eAtv } = await lerAtividades(COLS_ATV_BASE));
  // Faixa ausente (schema antigo) ou tabela sem atividade nenhuma: o quadro
  // vive só de programações — não é erro, é uma fábrica que ainda não usa.
  if (eAtv) atvs = [];

  return NextResponse.json({
    disponivel: true,
    // Sem a coluna, mudar a MÁQUINA de uma atividade não teria onde gravar (o
    // status ainda muda). A tela desenha essas raias travadas em vez de fingir
    // que o gesto funcionou.
    moveAtividade: temColunaMaquina,
    quadro: montarQuadro(
      maquinas as unknown as LinhaMaquinaQuadro[],
      (progs ?? []) as unknown as LinhaProgQuadro[],
      (atvs ?? []) as unknown as LinhaAtividadeQuadro[],
    ),
  });
}

const STATUS_VALIDOS: StatusQuadro[] = ["pendente", "andamento", "concluida"];

/**
 * PATCH — `{ tipo, id, paraMaquinaId?, paraStatus? }`. Move UM cartão.
 *
 * Os dois eixos no mesmo gesto: arrastar da raia do P1/Pendente pra
 * G2/Em andamento muda a máquina E o status numa escrita só.
 *
 * `paraMaquinaId: null` devolve o cartão pro monte "sem máquina" — só
 * atividade, porque programação nasce presa a uma máquina (o banco exige).
 */
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeMexer(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }

  const tipo = String(b.tipo ?? "");
  const id = String(b.id ?? "").trim();
  const mudaMaquina = "paraMaquinaId" in b;
  const bruto = b.paraMaquinaId == null ? null : String(b.paraMaquinaId).trim();
  const destino = !bruto || bruto === SEM_MAQUINA ? null : bruto;
  const paraStatus = b.paraStatus == null ? null : String(b.paraStatus) as StatusQuadro;

  if (!id || (tipo !== "programacao" && tipo !== "atividade")) {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }
  if (paraStatus && !STATUS_VALIDOS.includes(paraStatus)) {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }
  if (!mudaMaquina && !paraStatus) {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }
  if (tipo === "programacao" && mudaMaquina && !destino) {
    return NextResponse.json({
      error: "recusado",
      detalhe: "Um corte sempre pertence a uma máquina. Para tirá-lo da fábrica, cancele a programação.",
    }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  if (mudaMaquina && destino) {
    const { data: maq, error } = await db.from("maquinas").select("id,nome,ativa").eq("id", destino).limit(1);
    if (error && tabelaAusente(error)) return NextResponse.json(SEM_TABELA, { status: 409 });
    if (!maq?.length) return NextResponse.json({ error: "recusado", detalhe: "Esta máquina não existe mais. Recarregue a página." }, { status: 400 });
    if (maq[0].ativa === false) return NextResponse.json({ error: "recusado", detalhe: `${maq[0].nome} está desativada.` }, { status: 400 });
  }

  // O fim da fila da raia de destino conta as DUAS fontes: com contadores
  // separados, programação e atividade nasceriam nas mesmas posições e a
  // coluna embaralharia a cada leitura.
  let posicao = 1;
  if (mudaMaquina && destino) {
    const [{ data: fp }, { data: fa }] = await Promise.all([
      db.from("maquina_programacoes").select("posicao").eq("maquina_id", destino).in("status", ["fila", "executando"]).limit(300),
      db.from("atividades").select("quadro_posicao").eq("maquina_id", destino).limit(300),
    ]);
    posicao = fimDaColuna([
      ...(fp ?? []).map((r: { posicao: number | null }) => r.posicao),
      ...(fa ?? []).map((r: { quadro_posicao: number | null }) => r.quadro_posicao),
    ]);
  }

  const tabela = tipo === "programacao" ? "maquina_programacoes" : "atividades";
  const { data: atual, error: eLer } = await db.from(tabela)
    .select("id,status,iniciada_at,maquina_id").eq("id", id).limit(1);
  if (eLer && tabelaAusente(eLer)) return NextResponse.json(SEM_TABELA, { status: 409 });
  // `maquina_id` pode não existir em `atividades` (SQL não rodado): relê sem
  // ela em vez de recusar o gesto de status, que não depende da coluna.
  let linha = atual?.[0] as { status: string | null; iniciada_at: string | null; maquina_id?: string | null } | undefined;
  if (!linha && colunaAusente(eLer)) {
    const { data } = await db.from(tabela).select("id,status,iniciada_at").eq("id", id).limit(1);
    linha = data?.[0] as typeof linha;
  }
  if (!linha) return NextResponse.json({ error: "recusado", detalhe: "Este cartão não existe mais. Recarregue a página." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (paraStatus) {
    const t = patchDeStatus(tipo, { status: linha.status, iniciada_at: linha.iniciada_at }, paraStatus);
    if (!t.ok) return NextResponse.json({ error: "recusado", detalhe: t.frase }, { status: 400 });
    Object.assign(patch, t.patch);
  }
  if (mudaMaquina) {
    if (tipo === "programacao") { patch.maquina_id = destino; patch.posicao = posicao; }
    else { patch.maquina_id = destino; patch.quadro_posicao = destino ? posicao : 0; }
  }

  // `.eq("status", …)` é o compare-and-swap contra duas pessoas no mesmo
  // quadro: quem perde a corrida recebe a verdade, não um sucesso vazio.
  const { data: feito, error } = await db.from(tabela)
    .update(patch).eq("id", id).eq("status", linha.status ?? "").select("id");

  if (error) {
    if (jaRodando(error)) return NextResponse.json({ error: "recusado", detalhe: FRASE_JA_RODANDO }, { status: 409 });
    if (colunaAusente(error)) {
      return NextResponse.json({
        error: "schema_desatualizado",
        detalhe: "Rode supabase/maquinas_quadro.sql no Supabase — as atividades ainda não guardam a máquina.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: "banco", detalhe: error.message.slice(0, 200) }, { status: 500 });
  }
  if (!feito?.length) {
    return NextResponse.json({
      error: "recusado",
      detalhe: "Alguém mexeu neste cartão agora. Recarregue pra ver como ele está.",
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
