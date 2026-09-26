import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import {
  FRASE_JA_RODANDO, montarControle, problemaDaNovaProgramacao, proximaPosicao, transicao,
  type AcaoDaProgramacao,
} from "@/lib/maquina-fila";
import {
  COLS_MAQUINA, COLS_PROGRAMACAO, COLS_MAQUINA_OEE, COLS_PROGRAMACAO_OEE,
  type LinhaMaquina, type LinhaProgramacao,
} from "@/lib/painel-maquinas";

export const dynamic = "force-dynamic";

// ── A escrita da fila das máquinas ───────────────────────────────────────────
//
// O painel da TV (`/api/maquinas/painel`) é público e SÓ LÊ. Esta rota é a mão
// no volante, e ela tem DOIS níveis — porque o pedido tem dois lados:
//
//  · MARCAR ("em andamento", "feita") é do operador: quem está na máquina
//    aperta e pronto, sem aceite ("não teria como aceitar, teria que fazer
//    direto mesmo"). Gate: estar no módulo Produção — a mesma porta da tela.
//  · PROGRAMAR, cancelar e parar máquina decidem O QUE a fábrica corta:
//    ficam com o controle da produção (`producao:controle`).
//
// Papéis de sempre como fallback, chave da grade como caminho — o padrão dos
// gates do repo (ver lib/acesso.ts).
type Quem = { id: string; role: string; username?: string | null };
const podeMarcar = (me: Quem) => papelOuChave(me, ["admin", "gerente_producao"], "producao");
const podeControlar = (me: Quem) => papelOuChave(me, ["admin", "gerente_producao"], "producao:controle");

const SEM_TABELA = {
  error: "schema_desatualizado",
  detalhe: "Rode supabase/maquinas.sql no Supabase — as máquinas ainda não têm tabela.",
} as const;

// Coluna do OEE ainda inexistente (`supabase/maquinas_oee.sql` não rodado):
// a leitura repete sem elas em vez de derrubar a tela de controle inteira.
const colunaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || /column .* does not exist/i.test(e.message ?? ""));

const tabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /relation .* does not exist|schema cache/i.test(e.message ?? ""));

/**
 * GET — a fila inteira de cada máquina, SEM o cache de 30s da TV.
 *
 * A tela de controle acabou de apertar "iniciar" e precisa ver o efeito JÁ:
 * responder do cache faria o botão parecer que não funcionou, e a pessoa
 * apertaria de novo — que é exatamente a corrida que o índice único existe
 * pra barrar. A TV continua no cache dela; aqui cada leitura é um gesto.
 *
 * `controla` na resposta é o que decide quais botões a tela desenha — a
 * mesma conta do PATCH/POST, pra tela nunca mostrar botão que a rota recusa.
 */
export async function GET() {
  const me = await getProfile();
  if (!me || !(await podeMarcar(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createSupabaseAdminClient();
  const desde = new Date(Date.now() - 2 * 86400000).toISOString();
  const lerMaquinas = (cols: string) =>
    db.from("maquinas").select(cols).eq("ativa", true).order("ordem").limit(60);
  const lerProgs = (cols: string) =>
    db.from("maquina_programacoes").select(cols)
      .or(`status.neq.concluida,concluida_at.gte.${desde}`)
      .order("posicao")
      .limit(600);

  let [{ data: maquinas, error: e1 }, { data: progs, error: e2 }] = await Promise.all([
    lerMaquinas(COLS_MAQUINA_OEE), lerProgs(COLS_PROGRAMACAO_OEE),
  ]);
  const apontaPecas = !colunaAusente(e2);
  if (colunaAusente(e1)) ({ data: maquinas, error: e1 } = await lerMaquinas(COLS_MAQUINA));
  if (!apontaPecas) ({ data: progs, error: e2 } = await lerProgs(COLS_PROGRAMACAO));
  if (tabelaAusente(e1) || tabelaAusente(e2)) return NextResponse.json({ disponivel: false, ...SEM_TABELA });
  if (e1 || e2 || !maquinas) return NextResponse.json({ error: "banco" }, { status: 500 });

  return NextResponse.json({
    disponivel: true,
    controla: await podeControlar(me),
    // Sem as colunas do OEE a tela não desenha o apontamento de peças — pedir
    // um número que o banco não guarda é a pior forma de perder a confiança
    // de quem opera.
    apontaPecas,
    maquinas: montarControle(maquinas as LinhaMaquina[], (progs ?? []) as LinhaProgramacao[]),
  });
}

/** POST — cria uma programação na fila de UMA máquina. Só o controle. */
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeControlar(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }

  const problema = problemaDaNovaProgramacao({ maquinaId: b.maquinaId, referencia: b.referencia, minutos: b.minutos });
  if (problema) return NextResponse.json({ error: "recusado", detalhe: problema }, { status: 400 });

  const db = createSupabaseAdminClient();
  const maquinaId = String(b.maquinaId).trim();

  // A máquina tem de existir e estar ativa — id inventado criaria uma fila
  // fantasma que nenhuma parede mostra.
  const { data: maq, error: eMaq } = await db.from("maquinas")
    .select("id,nome,ativa").eq("id", maquinaId).limit(1);
  if (eMaq && tabelaAusente(eMaq)) return NextResponse.json(SEM_TABELA, { status: 409 });
  if (!maq?.length) return NextResponse.json({ error: "recusado", detalhe: "Esta máquina não existe mais. Recarregue a página." }, { status: 400 });
  if (maq[0].ativa === false) return NextResponse.json({ error: "recusado", detalhe: `${maq[0].nome} está desativada — reative antes de programar.` }, { status: 400 });

  // O fim da fila DESTA máquina. Só posições vivas contam (ver proximaPosicao).
  const { data: fila } = await db.from("maquina_programacoes")
    .select("posicao").eq("maquina_id", maquinaId).in("status", ["fila", "executando"]).limit(200);
  const posicao = proximaPosicao((fila ?? []).map((f: { posicao: number | null }) => f.posicao));

  const { data, error } = await db.from("maquina_programacoes").insert({
    maquina_id: maquinaId,
    referencia: String(b.referencia).trim(),
    material: b.material ? String(b.material).trim().slice(0, 80) : null,
    minutos_estimados: Math.trunc(Number(b.minutos)),
    posicao,
  }).select(COLS_PROGRAMACAO).single();

  if (error) {
    if (tabelaAusente(error)) return NextResponse.json(SEM_TABELA, { status: 409 });
    return NextResponse.json({ error: "banco", detalhe: error.message.slice(0, 200) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, programacao: data });
}

/**
 * Lê `{ pecas, refugos }` do corpo. Devolve `null` quando não veio nada — e
 * recusa refugo maior que o total, que é a única forma de o apontamento
 * mentir sem ninguém perceber (qualidade negativa).
 */
function apontamento(b: Record<string, unknown>): { pecas: number; refugos: number } | null {
  if (b.pecas == null || b.pecas === "") return null;
  const pecas = Math.trunc(Number(b.pecas));
  if (!Number.isFinite(pecas) || pecas < 0 || pecas > 1_000_000) return null;
  const bruto = b.refugos == null || b.refugos === "" ? 0 : Math.trunc(Number(b.refugos));
  const refugos = Number.isFinite(bruto) ? Math.max(0, Math.min(bruto, pecas)) : 0;
  return { pecas, refugos };
}

/**
 * PATCH — { id, acao: "iniciar" | "concluir" | "cancelar" }.
 *
 * Iniciar e concluir são o MARCAR do operador ("em andamento", "feita").
 * Cancelar tira trabalho da fábrica — esse é do controle.
 */
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }
  const id = String(b.id ?? "").trim();
  const acao = String(b.acao ?? "") as AcaoDaProgramacao;
  if (!id || !["iniciar", "concluir", "cancelar"].includes(acao)) {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }
  const deixa = acao === "cancelar" ? await podeControlar(me) : await podeMarcar(me);
  if (!deixa) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createSupabaseAdminClient();
  const { data: atual, error: eLer } = await db.from("maquina_programacoes")
    .select("id,status,iniciada_at").eq("id", id).limit(1);
  if (eLer && tabelaAusente(eLer)) return NextResponse.json(SEM_TABELA, { status: 409 });
  if (!atual?.length) return NextResponse.json({ error: "recusado", detalhe: "Esta programação não existe mais. Recarregue a página." }, { status: 400 });

  const t = transicao(atual[0].status, acao);
  if (!t.ok) return NextResponse.json({ error: "recusado", detalhe: t.frase }, { status: 400 });

  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = { status: t.para };
  // Concluir direto da fila carimba início e fim juntos — o operador esquece
  // de apertar "iniciar" o dia inteiro, e exigir a ordem transformaria o
  // esquecimento num trabalho que nunca fecha (ver lib/maquina-fila.ts).
  if (t.para === "executando") patch.iniciada_at = agora;
  if (t.para === "concluida") {
    if (!atual[0].iniciada_at) patch.iniciada_at = agora;
    patch.concluida_at = agora;
    // Apontamento de peças (pilar QUALIDADE do OEE). Opcional de propósito:
    // exigir o número faria o operador chutar, e chute vira OEE de mentira.
    // Quem não aponta fica `null` — "ninguém contou", diferente de "contou
    // zero" (ver lib/oee.ts).
    const ap = apontamento(b);
    if (ap) { patch.pecas = ap.pecas; patch.refugos = ap.refugos; }
  }

  // `.eq("status", atual)` é o compare-and-swap contra duas pessoas na tela de
  // controle: quem perde a corrida recebe a verdade, não um sucesso vazio.
  let { data, error } = await db.from("maquina_programacoes")
    .update(patch).eq("id", id).eq("status", atual[0].status).select("id");

  if (error && colunaAusente(error)) {
    // `supabase/maquinas_oee.sql` ainda não rodado: a marcação de "feita" não
    // pode falhar por causa do apontamento. Repete sem ele.
    delete patch.pecas; delete patch.refugos;
    ({ data, error } = await db.from("maquina_programacoes")
      .update(patch).eq("id", id).eq("status", atual[0].status).select("id"));
  }
  if (error) {
    // O índice único `maq_prog_uma_executando`: segunda programação rodando na
    // mesma máquina. A frase diz o que fazer; "duplicate key" não.
    if (error.code === "23505") return NextResponse.json({ error: "recusado", detalhe: FRASE_JA_RODANDO }, { status: 409 });
    if (tabelaAusente(error)) return NextResponse.json(SEM_TABELA, { status: 409 });
    return NextResponse.json({ error: "banco", detalhe: error.message.slice(0, 200) }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "recusado", detalhe: "Alguém mexeu neste trabalho agora mesmo. Recarregue pra ver como ele ficou." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: t.para });
}
