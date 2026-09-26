import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import type { Role } from "@/lib/rbac";
import { partirCodigo } from "@/lib/estoque-unidades";
import { planoDeEtiquetas } from "@/lib/estoque-plano-de-etiquetas";
import {
  gerarUnidadesEmLotes,
  ErroItemNaoSerializado,
  ErroItemNaoEncontrado,
  ErroCorridaDeSequencial,
  ErroQuantidadeFracionaria,
  ErroSchemaDesatualizado,
  fraseQuantidadeFracionaria,
  schemaDesatualizado,
} from "@/lib/estoque-unidades-gerar";

export const dynamic = "force-dynamic";

const PODE_GERIR = ["admin", "estoquista", "gerente_producao"];

// ── Preparar itens pra etiquetagem, em lote ─────────────────────────────────
//
// Existe por causa de um beco sem saída fechado dos dois lados:
//
//   • a guarda `estoque_itens_guarda` (supabase/estoque_hierarquia_unidades.sql
//     §6b) RECUSA ligar `serializado` num item que tem estoque digitado e
//     nenhuma etiqueta — ligar zeraria a contagem e o número não voltaria;
//   • `gerarUnidades` RECUSA gerar etiqueta pra item que não é serializado.
//
// Ou seja: pra ligar precisa de etiqueta, e pra etiquetar precisa estar ligado.
// Pela tela, item com estoque contado não tinha caminho NENHUM. Aqui o caminho
// é o servidor fazer os três passos na ordem certa:
//
//   1. zera a quantidade digitada (o item ainda não é serializado, então a
//      guarda (c) não se aplica e a (a) passa a ver `old.quantidade = 0`);
//   2. liga `serializado`;
//   3. gera as N etiquetas — o gatilho reconta e a quantidade volta a ser N.
//
// Não é uma transação: PostgREST não expõe uma. Se o passo 3 falhar, o passo 4
// desfaz (desliga `serializado` e devolve a quantidade digitada), pra ninguém
// ficar com o estoque zerado por causa de um erro no meio.
//
// É também o caminho em LOTE do catálogo: 40 itens numa chamada em vez de 40
// idas ao modal.
//
// ── Duas formas de etiquetar a mesma pilha ─────────────────────────────────
//
// A decisão é de quem está de frente pra prateleira, não do servidor:
//
//   • `peca`  (default, o comportamento de sempre) — N etiquetas de 1 peça.
//     É pra pilha de coisas que saem uma a uma;
//   • `pilha` — UMA etiqueta valendo o saldo inteiro. É a caixa lacrada: 191
//     folhas dentro de uma caixa só, com um código só colado por fora, e é
//     assim que a conferência da produção já cunha (lib/estoque-conferencia.ts).
//
// O teto por item vale só no modo `peca`: em `pilha` sai uma etiqueta, e o
// gatilho reconta uma linha.

/** Teto de itens por chamada — o cliente fatia e mostra o progresso. */
const MAX_ITENS = 40;
/** Teto de etiquetas por item numa chamada (o gatilho reconta a tabela a cada linha). */
const MAX_POR_ITEM = 2000;

/** Como a pilha vira etiqueta. Ver o cabeçalho. */
export type ModoPreparo = "peca" | "pilha";

const SCHEMA_DESATUALIZADO = {
  error: "schema_desatualizado",
  detalhe: "Rode supabase/estoque_hierarquia_unidades.sql no Supabase — as unidades etiquetadas ainda não têm tabela.",
} as const;

// Mesma chave da geração avulsa (POST /api/estoque/unidades): ligar a etiqueta
// gera as unidades do item, e unidade é QUANTIDADE. Deixar esta rota em
// `estoque:itens` seria a porta lateral que faz em lote o que a outra nega.
async function podeGerir(me: { id: string; role: string; username?: string | null }): Promise<boolean> {
  if (PODE_GERIR.includes(me.role)) return true;
  const keys = await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username });
  return keys.includes("estoque:ajustar");
}

interface ItemRow {
  id: string;
  nome: string;
  sku: string | null;
  hierarquia: string | null;
  serializado: boolean;
  quantidade: number;
}

export interface ResultadoPreparo {
  item_id: string;
  nome: string;
  ok: boolean;
  /** Quantas etiquetas foram criadas nesta chamada. */
  geradas: number;
  /** Peças em CADA etiqueta — 1 no modo `peca`, o saldo inteiro no modo `pilha`. */
  pecas: number;
  /** SKU que ficou valendo (o automático, quando o item não tinha). */
  sku: string | null;
  /** Frase pronta pra tela quando `ok` é false. */
  erro?: string;
}

// POST → liga a etiqueta e gera as unidades de um ou mais itens.
// Body: { itens: [{ item_id, quantidade? }], modo?: "peca" | "pilha",
//         pecasPorEtiqueta? } — `quantidade` ausente significa "as que já estão
// contadas na prateleira"; `modo` ausente é `peca`, o comportamento de sempre.
//
// `pecasPorEtiqueta` é a CAIXA, e vale no modo `peca`: 93 travas em caixas de
// 50 viram duas etiquetas (50 e 43), não 93. Ausente (ou 1) é uma etiqueta por
// peça, exatamente como antes.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeGerir(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const modo: ModoPreparo = b.modo === "pilha" ? "pilha" : "peca";
  const porCaixa = Math.max(1, Math.trunc(Number(b.pecasPorEtiqueta)) || 1);
  const pedidos = (Array.isArray(b.itens) ? b.itens : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({
      item_id: String(x.item_id || ""),
      // Sem `Math.trunc`: quem digitou "2,5" precisa ouvir que não dá, e não
      // receber 2 etiquetas com a meia sumida — ver ErroQuantidadeFracionaria.
      quantidade: x.quantidade === undefined || x.quantidade === null || x.quantidade === ""
        ? null
        : Number(x.quantidade),
    }))
    .filter((x) => x.item_id);
  if (!pedidos.length) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  if (pedidos.length > MAX_ITENS) return NextResponse.json({ error: "lote_grande", max: MAX_ITENS }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("estoque_itens")
    .select("id,nome,sku,hierarquia,serializado,quantidade")
    .in("id", pedidos.map((p) => p.item_id))
    .limit(MAX_ITENS);
  if (error) {
    if (schemaDesatualizado(error)) return NextResponse.json(SCHEMA_DESATUALIZADO, { status: 409 });
    return NextResponse.json({ error: "failed", detalhe: error.message }, { status: 500 });
  }
  const linhas = (data ?? []) as unknown as ItemRow[];
  const porId = new Map<string, ItemRow>(linhas.map((r) => [r.id, r]));

  const resultados: ResultadoPreparo[] = [];
  // Um item por vez, de propósito: o gatilho de recontagem varre as unidades do
  // item a cada linha inserida. Em paralelo, dois lotes grandes prendem lock e
  // o ganho de tempo vira espera.
  for (const p of pedidos) {
    const item = porId.get(p.item_id);
    if (!item) {
      resultados.push({ item_id: p.item_id, nome: "—", ok: false, geradas: 0, pecas: 0, sku: null, erro: "Item não encontrado." });
      continue;
    }
    resultados.push(await prepararUm(db, item, p.quantidade, modo, me, porCaixa));
  }

  return NextResponse.json({
    ok: true,
    modo,
    resultados,
    resumo: {
      itens: resultados.filter((r) => r.ok).length,
      etiquetas: resultados.reduce((s, r) => s + r.geradas, 0),
      falhas: resultados.filter((r) => !r.ok).length,
    },
  });
}

async function prepararUm(
  db: ReturnType<typeof createSupabaseAdminClient>,
  item: ItemRow,
  pedida: number | null,
  modo: ModoPreparo,
  me: { id: string; name?: string | null },
  /** Peças por etiqueta no modo `peca`. 1 = uma etiqueta por peça (o de sempre). */
  porCaixa = 1,
): Promise<ResultadoPreparo> {
  const base: ResultadoPreparo = { item_id: item.id, nome: item.nome, ok: true, geradas: 0, pecas: 0, sku: item.sku };

  // O saldo da prateleira vai virar papel colado — se ele não é um número
  // inteiro, NADA aqui pode acontecer. O passo 1 zera a quantidade digitada, e
  // zerar "2,5" pra devolver 2 etiquetas apagaria a meia unidade pra sempre,
  // sem erro em lugar nenhum. Item a granel não se etiqueta.
  const saldo = Number(item.quantidade) || 0;
  if (!Number.isInteger(saldo)) return { ...base, ok: false, erro: fraseQuantidadeFracionaria(saldo) };
  if (pedida !== null && !Number.isInteger(pedida)) return { ...base, ok: false, erro: fraseQuantidadeFracionaria(pedida) };

  // Item que JÁ é etiquetado não tem o que preparar — e preparar de novo
  // DOBRARIA o estoque: num item serializado a `quantidade` é a contagem das
  // etiquetas (gatilho), então usá-la como alvo cunha uma segunda leva do
  // mesmo saldo. A tela do catálogo já esconde esses itens da lista, mas o
  // gesto novo da Conferir é um botão só: dois cliques seguidos, ou dois
  // gerentes na mesma atividade, chegariam aqui com o item já ligado. Quem
  // precisa de MAIS etiquetas gera pela ficha do item, onde a quantidade é
  // digitada de propósito.
  if (item.serializado) {
    return { ...base, ok: false, erro: "Este item já é etiquetado — o saldo dele já é a soma das etiquetas coladas. Pra gerar mais, use a ficha do item." };
  }

  const alvo = Math.max(0, pedida ?? saldo);
  // Recusa em vez de cortar: gerar 2000 e ficar calado sobre as outras 3000
  // deixaria o estoque MENOR do que a prateleira, que é o pior desfecho
  // possível aqui. Nessa escala o item é a granel (parafuso, cola) e
  // etiqueta por unidade não é o instrumento certo.
  //
  // No modo `pilha` o teto não se aplica: sai UMA etiqueta valendo 5000, uma
  // linha só pro gatilho recontar — o teto existe por causa da recontagem por
  // linha inserida, e nesse modo ela acontece uma vez.
  if (modo === "peca" && alvo > MAX_POR_ITEM) {
    return { ...base, ok: false, erro: `${alvo} etiquetas de uma vez é demais (máximo ${MAX_POR_ITEM}). Item contado aos milhares costuma ser a granel — nesse caso a quantidade digitada serve melhor que etiqueta por unidade, ou a pilha inteira vira uma caixa só.` };
  }

  // Daqui pra baixo o item é sempre não serializado — a guarda acima já
  // devolveu quem tinha etiqueta.
  const qtdAntes = Math.max(0, saldo);
  let zeramos = false;

  // 1) A guarda (a) só olha `old.quantidade` no instante do UPDATE que liga a
  //    serialização. Zerar antes é o que abre a porta — e o número volta no
  //    passo 3, pela recontagem das etiquetas.
  if (qtdAntes > 0) {
    const { error } = await db.from("estoque_itens").update({ quantidade: 0, updated_at: new Date().toISOString() }).eq("id", item.id);
    if (error) return { ...base, ok: false, erro: mensagemDeErro(error) };
    zeramos = true;
  }
  // 2) Liga a etiqueta.
  {
    const { error } = await db.from("estoque_itens").update({ serializado: true, updated_at: new Date().toISOString() }).eq("id", item.id);
    if (error) {
      if (zeramos) await db.from("estoque_itens").update({ quantidade: qtdAntes }).eq("id", item.id);
      return { ...base, ok: false, erro: mensagemDeErro(error) };
    }
  }

  if (alvo === 0) {
    return { ...base, ok: true, geradas: 0 };
  }

  // 3) Gera as etiquetas. `gerarUnidadesEmLotes` fatia no teto de 500 e atribui
  //    o SKU automático quando o item ainda não tem — o código da etiqueta
  //    deriva dele.
  //
  //    Três formas de repartir, e a do meio é a que faltava:
  //
  //      peça   → N etiquetas de 1        (93 travas = 93 papéis)
  //      CAIXA  → ceil(N / tamanho)       (93 em caixas de 50 = 50 + 43)
  //      pilha  → 1 etiqueta valendo N    (93 travas = 1 papel)
  //
  //    A pilha é o caso particular da caixa em que ela comporta tudo. Quem
  //    reparte é `planoDeEtiquetas`, e ele devolve LOTES porque a última caixa
  //    costuma ser parcial — e ela tem de dizer 43, não 50: a trigger do banco
  //    soma PEÇA, não papel.
  const lotes = modo === "pilha"
    ? [{ etiquetas: 1, pecas: alvo }]
    : planoDeEtiquetas(alvo, porCaixa).lotes;
  try {
    const unidades = [];
    for (const lote of lotes) {
      unidades.push(...await gerarUnidadesEmLotes({
        quantidade: lote.etiquetas, pecasPorUnidade: lote.pecas,
        item_id: item.id, origem: "manual",
        criado_por_id: me.id, criado_por: me.name ?? null,
      }));
    }
    const sku = unidades.length ? partirCodigo(unidades[0].codigo)?.sku ?? item.sku : item.sku;
    // `pecas` é o tamanho da etiqueta quando ele é ÚNICO; com caixa parcial as
    // etiquetas têm tamanhos diferentes e o número que interessa é o total.
    const tamanhos = new Set(lotes.map((l) => l.pecas));
    return {
      ...base, ok: true, geradas: unidades.length, sku,
      pecas: tamanhos.size === 1 ? [...tamanhos][0] : alvo,
    };
  } catch (e) {
    // 4) Desfaz o que ligamos: melhor voltar ao estado de antes do que deixar
    //    o item serializado com estoque zerado por causa de uma falha no meio.
    //    Vale nos dois modos — a falha da caixa única deixaria o mesmo buraco
    //    que a falha das N avulsas.
    await db.from("estoque_itens").update({ serializado: false, updated_at: new Date().toISOString() }).eq("id", item.id);
    if (zeramos) await db.from("estoque_itens").update({ quantidade: qtdAntes }).eq("id", item.id);
    return { ...base, ok: false, erro: mensagemDeGeracao(e) };
  }
}

function mensagemDeErro(error: { code?: string; message?: string }): string {
  if (schemaDesatualizado(error)) return SCHEMA_DESATUALIZADO.detalhe;
  // A guarda do banco levanta check_violation com a frase pronta em português.
  if (error.code === "23514") return error.message ?? "O banco recusou a mudança.";
  return error.message ?? "Não foi possível salvar.";
}

function mensagemDeGeracao(e: unknown): string {
  if (e instanceof ErroSchemaDesatualizado) return SCHEMA_DESATUALIZADO.detalhe;
  if (e instanceof ErroQuantidadeFracionaria) return e.frase;
  if (e instanceof ErroItemNaoSerializado) return "O item não ficou marcado como etiquetado — nada foi gerado.";
  if (e instanceof ErroItemNaoEncontrado) return "Item não encontrado.";
  if (e instanceof ErroCorridaDeSequencial) return "O sequencial das etiquetas colidiu. Confira se outro item usa o mesmo SKU.";
  return (e as Error)?.message ?? "Falha ao gerar etiquetas.";
}
