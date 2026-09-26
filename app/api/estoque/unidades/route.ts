import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys, meuNivel } from "@/lib/perfis";
import { podeVerCustoNivel } from "@/lib/niveis";
import type { Role } from "@/lib/rbac";
import { MOTIVOS_BAIXA } from "@/lib/estoque-unidades";
import { planoDeEtiquetas, problemaDoPlano } from "@/lib/estoque-plano-de-etiquetas";
import {
  gerarUnidades,
  ErroItemNaoSerializado,
  ErroItemNaoEncontrado,
  ErroLoteGrande,
  ErroCorridaDeSequencial,
  ErroQuantidadeFracionaria,
  ErroSchemaDesatualizado,
  schemaDesatualizado,
} from "@/lib/estoque-unidades-gerar";
import { baixarUnidades, ErroMotivoInvalido, ErroLoteBaixaGrande } from "@/lib/estoque-baixa";
import {
  atividadeIdValido, consumoDaAtividade, consumoPorAtividade, idsDaQuery, TETO_ETIQUETAS,
} from "@/lib/estoque-consumo";
import { classificarCodigos } from "@/lib/estoque-codigo-lido";

export const dynamic = "force-dynamic";

const PODE_GERIR = ["admin", "estoquista", "gerente_producao"];

// supabase/estoque_hierarquia_unidades.sql roda NA MÃO. Enquanto ninguém
// rodou, a tabela `estoque_unidades` nem existe (42P01) e as colunas novas de
// `estoque_itens` (hierarquia, serializado) faltam (42703) — os dois casos
// viram este 409, que diz exatamente o que rodar. Mesmo texto de
// app/api/estoque-itens/route.ts, mesma causa raiz.
const SCHEMA_DESATUALIZADO = {
  error: "schema_desatualizado",
  detalhe: "Rode supabase/estoque_hierarquia_unidades.sql no Supabase — as unidades etiquetadas ainda não têm tabela.",
} as const;

// Gerar etiqueta e dar baixa nela são ações de quem trabalha no estoque físico
// (papel de sempre) OU a sub-permissão específica da grade — "ajustar" pra
// criar, "bipar" pra dar baixa. As duas são `sensivel` e IMPLICAM itens (ver
// lib/areas.ts).
//
// Gerar unidade é QUANTIDADE, não cadastro: cada etiqueta gerada é uma unidade
// a mais na prateleira (o gatilho `estoque_recontar_unidades` soma sozinho).
// Ficava em `estoque:itens`, a mesma chave de quem só consulta o catálogo.
async function podeGerir(me: { id: string; role: string; username?: string | null }): Promise<boolean> {
  if (PODE_GERIR.includes(me.role)) return true;
  const keys = await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username });
  return keys.includes("estoque:ajustar");
}
async function podeBipar(me: { id: string; role: string; username?: string | null }): Promise<boolean> {
  if (PODE_GERIR.includes(me.role)) return true;
  const keys = await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username });
  return keys.includes("estoque:bipar");
}
async function verCusto(me: { id: string; role: string; username?: string | null }): Promise<boolean> {
  if (podeVerCustoNivel((await meuNivel(me as { id: string; role: Role })).nivel)) return true;
  return (await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username })).includes("estoque:precos");
}

// GET tem quatro perguntas, e a de sempre (`?item=`) é só uma delas:
//
//   ?item=<id>       → unidades de UM item + contagem por status
//   ?codigos=A,B,C   → o que estas etiquetas SÃO (item + tamanho da caixa)
//   ?atividade=<id>  → o que esta atividade consumiu (lista + total)
//   ?atividades=a,b  → quais destas atividades consumiram algo (só os números)
//
// As três últimas nasceram com o vínculo `baixa_atividade_id`: bipar a caixa
// lacrada é o começo do trabalho, e quem confere depois precisa ver o que
// entrou. Nenhuma delas devolve custo.
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;

  // ?codigos= — a tela de bipar pergunta ANTES de dar baixa, pra poder dizer
  // "Caixa · 50 un" no instante em que a etiqueta entra na fila. Sem isso a
  // pessoa bipa uma caixa lacrada de 50 folhas achando que tirou uma folha.
  const codigosBrutos = p.get("codigos");
  if (codigosBrutos !== null) {
    const codigos = [...new Set(codigosBrutos.split(",").map((c) => c.trim()).filter(Boolean))].slice(0, TETO_ETIQUETAS);
    try {
      /*
       * A resposta diz o que cada código É — unidade, produto ou nada.
       *
       * Antes ela só olhava `estoque_unidades`, e o silêncio significava duas
       * coisas muito diferentes: "etiqueta que não existe" e "etiqueta de
       * produto, que esta consulta nem procura". A tela lia as duas como a
       * primeira e escrevia "Não existe no sistema" — para 263 dos 274 itens
       * do catálogo, que são de código fixo.
       *
       * `etiquetas` continua saindo igual para quem já consumia esta rota (a
       * fila da baixa por unidade); `classificacao` é o campo novo.
       */
      const classificacao = await classificarCodigos(createSupabaseAdminClient(), codigos);
      const etiquetas = classificacao
        .filter((c) => c.tipo === "unidade")
        .map((c) => ({ codigo: c.codigo, item: c.item, pecas: c.pecas, status: c.status ?? "" }));
      return NextResponse.json({ etiquetas, classificacao });
    } catch (e) {
      if (e instanceof ErroSchemaDesatualizado) return NextResponse.json(SCHEMA_DESATUALIZADO, { status: 409 });
      return NextResponse.json({ error: "failed", detail: (e as Error).message }, { status: 500 });
    }
  }

  // ?atividade= — o que entrou nesta atividade (a caixa que virou as peças).
  const atividade = p.get("atividade");
  if (atividade !== null) {
    const id = atividadeIdValido(atividade);
    if (!id) return NextResponse.json({ error: "atividade_invalida" }, { status: 400 });
    try {
      return NextResponse.json(await consumoDaAtividade(id));
    } catch (e) {
      return NextResponse.json({ error: "failed", detail: (e as Error).message }, { status: 500 });
    }
  }

  // ?atividades= — o mesmo, mas só os números, pro quadro inteiro numa consulta.
  const atividades = p.get("atividades");
  if (atividades !== null) {
    try {
      return NextResponse.json(await consumoPorAtividade(idsDaQuery(atividades)));
    } catch (e) {
      return NextResponse.json({ error: "failed", detail: (e as Error).message }, { status: 500 });
    }
  }

  const itemId = p.get("item");
  if (!itemId) return NextResponse.json({ error: "missing_item" }, { status: 400 });

  const db = createSupabaseAdminClient();
  /**
   * `quantidade` é a coluna da CAIXA, e o SQL dela pode ainda não ter rodado
   * neste banco. Pedir a coluna crua num banco sem ela devolve 42703, que vira
   * 409 — e o painel inteiro de "Unidades etiquetadas", que hoje funciona,
   * morreria com "rode o SQL". Então: tenta COM, e no erro de schema repete
   * SEM. Sem a coluna cada etiqueta vale 1 peça (`pecasDaUnidade`), que é como
   * o galpão funcionava antes da caixa existir.
   *
   * Falhar duas vezes é a TABELA faltando, não a coluna — aí sim é 409. Mesmo
   * padrão de `lib/estoque-baixa.ts`.
   */
  const COLUNAS = "id,codigo,seq,status,origem,compra_id,custo,criado_por,criado_em,baixa_motivo,baixa_obs,baixado_por,baixado_em";
  const listar = (colunas: string) =>
    db
      .from("estoque_unidades")
      .select(colunas)
      .eq("item_id", itemId)
      .order("criado_em", { ascending: false })
      .limit(500);

  let { data, error } = await listar(`${COLUNAS},quantidade`);
  if (error && schemaDesatualizado(error)) ({ data, error } = await listar(COLUNAS));
  if (error) {
    if (schemaDesatualizado(error)) return NextResponse.json(SCHEMA_DESATUALIZADO, { status: 409 });
    return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  }

  // Contagem por status: uma consulta count-only por status (5 no total), sem
  // trazer linha nenhuma — é o que deixa a tela mostrar "312 em estoque" sem
  // baixar 312 registros pra contar no navegador.
  const statuses = ["em_estoque", ...MOTIVOS_BAIXA.map((m) => m.key)];
  const pares = await Promise.all(statuses.map(async (status) => {
    const { count } = await db
      .from("estoque_unidades")
      .select("id", { count: "exact", head: true })
      .eq("item_id", itemId)
      .eq("status", status);
    return [status, count ?? 0] as const;
  }));
  const contagem = Object.fromEntries(pares) as Record<string, number>;

  const podeVerCusto = await verCusto(me);
  const unidades = (data ?? []).map((u: Record<string, unknown>) => {
    if (podeVerCusto) return u;
    const { custo: _omit, ...rest } = u; // custo é dado de custo — mesma regra do catálogo
    void _omit;
    return rest;
  });

  return NextResponse.json({ unidades, contagem });
}

// POST → gera N unidades pro item. Body: { item_id, quantidade, origem?,
// compra_id?, custo? }. Toda a regra de negócio (serializado, teto de lote,
// SKU automático, corrida de sequencial) mora em gerarUnidades — a rota só
// traduz os erros dela pro formato HTTP.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeGerir(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const item_id = String(b.item_id || "");
  // Sem `Math.trunc`: cortar aqui faria "2,5" virar 2 etiquetas caladamente, e
  // quem digitou nunca saberia da meia. Passa o número como veio — `gerarUnidades`
  // recusa o que não for inteiro e a frase desce pra tela.
  const quantidade = Number(b.quantidade);
  if (!item_id || !(quantidade > 0)) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  // ── A CAIXA ──────────────────────────────────────────────────────────────
  //
  // `pecasPorEtiqueta` é o que faltava aqui: o motor (`gerarUnidades`) aceita
  // `pecasPorUnidade` desde a conferência da produção, mas esta rota nunca o
  // repassava — então a tela só sabia fazer UMA etiqueta por peça, e 400 folhas
  // guardadas em 8 caixas viravam 400 papéis.
  //
  // `quantidade` aqui continua sendo PEÇAS, como sempre foi. Quem reparte em
  // caixas é o plano (lib/estoque-plano-de-etiquetas.ts), e ele devolve LOTES —
  // porque 410 peças em caixas de 50 são 8 de 50 mais UMA de 10, e a última tem
  // de dizer 10: a trigger do banco soma PEÇA, não papel.
  const pecasPorEtiqueta = b.pecasPorEtiqueta === undefined ? 1 : Number(b.pecasPorEtiqueta);
  const plano = planoDeEtiquetas(quantidade, pecasPorEtiqueta);
  const problemaPlano = problemaDoPlano(plano);
  if (problemaPlano) {
    return NextResponse.json({ error: "plano_invalido", detalhe: problemaPlano }, { status: 400 });
  }

  const origensValidas = ["recebimento", "producao", "manual"] as const;
  const origem = origensValidas.includes(b.origem as (typeof origensValidas)[number])
    ? (b.origem as (typeof origensValidas)[number])
    : "manual";
  const custo = b.custo !== undefined && b.custo !== null && b.custo !== ""
    ? Math.max(0, Number(b.custo) || 0)
    : null;

  try {
    // Um lote por tamanho de caixa. Sem caixa é UM lote com `pecas: 1`, ou
    // seja, exatamente a chamada de sempre.
    const unidades = [];
    for (const lote of plano.lotes) {
      unidades.push(...await gerarUnidades({
        item_id, quantidade: lote.etiquetas, origem,
        pecasPorUnidade: lote.pecas,
        compra_id: b.compra_id ? String(b.compra_id) : null,
        custo,
        criado_por_id: me.id, criado_por: me.name,
      }));
    }
    return NextResponse.json({ ok: true, unidades, plano: { frase: plano.frase, totalEtiquetas: plano.totalEtiquetas, totalPecas: plano.totalPecas } });
  } catch (e) {
    // 1) Item não serializado: gerar etiqueta pra item a granel (cola, tinta)
    //    é onde a confusão começa — recusa cedo, com erro específico.
    if (e instanceof ErroItemNaoSerializado) return NextResponse.json({ error: "item_nao_serializado" }, { status: 400 });
    // 2) Teto de lote (500): a trigger reconta a tabela inteira por linha
    //    inserida, então um lote gigante prende um lock de linha na
    //    transação inteira — paliativo deliberado, ver lib/estoque-unidades-gerar.ts.
    if (e instanceof ErroLoteGrande) return NextResponse.json({ error: "lote_grande", max: e.max }, { status: 400 });
    // 3) Quantidade fracionária: a etiqueta é uma unidade inteira e a coluna do
    //    banco é `int` — cortar era apagar saldo em silêncio.
    if (e instanceof ErroQuantidadeFracionaria) return NextResponse.json({ error: "quantidade_fracionaria", detalhe: e.frase }, { status: 400 });
    // 4) Corrida de sequencial: 3 tentativas já recalculando o `max(seq)`
    //    esgotadas — desiste e devolve 409 pra quem chamou tentar de novo.
    if (e instanceof ErroCorridaDeSequencial) return NextResponse.json({ error: "corrida_de_sequencial" }, { status: 409 });
    if (e instanceof ErroItemNaoEncontrado) return NextResponse.json({ error: "item_nao_encontrado" }, { status: 404 });
    if (e instanceof ErroSchemaDesatualizado) return NextResponse.json(SCHEMA_DESATUALIZADO, { status: 409 });
    return NextResponse.json({ error: "failed", detail: (e as Error).message }, { status: 500 });
  }
}

// PATCH → dá baixa num lote de códigos. Body: { codigos: string[], motivo,
// obs?, atividadeId? }. A regra de negócio (código ruim não derruba o lote,
// motivo válido, teto de lote) mora em lib/estoque-baixa.ts — compartilhada com
// a baixa que vem do leitor do galpão (POST /api/estoque/device/baixa), pra não
// poderem divergir.
//
// `atividadeId` é opcional PRA SEMPRE: o galpão dá baixa sem atividade nenhuma
// no meio (perda, expedição, devolução ao fornecedor). Quando vem, é o começo
// do ciclo — a caixa lacrada que a pessoa acabou de pegar pra trabalhar.
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeBipar(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const codigos = (Array.isArray(b.codigos) ? b.codigos : [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  if (!codigos.length) return NextResponse.json({ error: "sem_codigos" }, { status: 400 });

  const motivo = String(b.motivo || "");
  const obs = b.obs ? String(b.obs).trim() : null;
  // Id ruim vira `null` em vez de 400: o vínculo é informação a mais no
  // histórico, a baixa é a caixa deixar de contar como estoque. Recusar o lote
  // inteiro por causa do vínculo inverteria as duas importâncias.
  const atividadeId = atividadeIdValido(b.atividadeId);

  try {
    const resultado = await baixarUnidades({ codigos, motivo, obs, atividadeId, baixadoPorId: me.id, baixadoPor: me.name });
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    if (e instanceof ErroMotivoInvalido) return NextResponse.json({ error: "motivo_invalido" }, { status: 400 });
    if (e instanceof ErroLoteBaixaGrande) return NextResponse.json({ error: "lote_grande", max: e.max }, { status: 400 });
    if (e instanceof ErroSchemaDesatualizado) return NextResponse.json(SCHEMA_DESATUALIZADO, { status: 409 });
    return NextResponse.json({ error: "failed", detail: (e as Error).message }, { status: 500 });
  }
}
