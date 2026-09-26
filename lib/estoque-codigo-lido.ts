// ── O que é ESTE código que acabou de ser bipado? ────────────────────────────
//
// O galpão cola dois papéis diferentes na peça, e quem bipa não sabe qual dos
// dois veio — a pistola e a câmera entregam texto:
//
//   "PRD-0270"          → etiqueta de PRODUTO. Todas as peças iguais têm a
//                         mesma. Tirar do estoque é DIMINUIR O SALDO.
//   "PRD-0001-000042"   → etiqueta de UNIDADE. Uma peça (ou uma caixa lacrada)
//                         e só ela. Tirar do estoque é BAIXAR AQUELA etiqueta.
//
// ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
//
// A tela de bipar saída só sabia o segundo caso. Ela procurava o código em
// `estoque_unidades` e, não achando, respondia "Não existe no sistema".
//
// Medido no banco no dia em que isto foi escrito: 263 dos 274 itens são de
// código fixo, e o catálogo inteiro tem 10 etiquetas de unidade (1 em
// estoque). Ou seja, a resposta "não existe" era o desfecho NORMAL — quase
// todo item do galpão caía nela. E a frase é a pior possível: ela acusa o
// cadastro (que está certo) em vez de dizer que a tela olhou no lugar errado.
// Quem estava com a peça na mão, vendo o item no catálogo, concluía que o
// sistema tinha perdido o produto.
//
// A classificação mora aqui, separada da tela e da rota, porque três lugares
// precisam dela — a web, o tablet do galpão e o teste — e uma segunda cópia
// viraria uma segunda regra no dia em que alguém ajustasse a primeira.
//
// ── ESTE ARQUIVO NÃO CRIA CLIENTE DE BANCO ──────────────────────────────────
//
// O `db` vem SEMPRE de fora. A primeira versão criava o cliente admin quando
// ninguém injetava um, e isso pareceu conveniente por dez minutos: a TELA
// (`BiparClient`, "use client") importa a frase e o tipo daqui, então o import
// de `lib/supabase/server` viajava junto até o navegador — e o build do Next
// quebra com isso ("You're importing a module that depends on next/headers")
// enquanto `tsc` e `vitest` passam verdes. Quem pegou foi
// `lib/__tests__/cliente-nao-importa-servidor.test.ts`, e é ele que segura isto
// se alguém "simplificar" o parâmetro de volta.

import { partirCodigo, pecasDaUnidade } from "@/lib/estoque-unidades";
import { schemaDesatualizado, ErroSchemaDesatualizado } from "@/lib/estoque-schema";

/** O Supabase não tem tipos gerados aqui; fronteira dinâmica isolada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type TipoDoCodigo = "unidade" | "produto" | "nenhum";

export interface CodigoClassificado {
  codigo: string;
  tipo: TipoDoCodigo;
  /** Nome do item, quando o código casou com alguma coisa. */
  item: string | null;
  /** Id do item — o que a baixa por quantidade precisa. */
  itemId: string | null;
  /** Só em `unidade`: peças que a etiqueta vale (a caixa sai inteira). */
  pecas: number;
  /** Só em `unidade`: se ela ainda estava em estoque quando foi lida. */
  status: string | null;
  /** Saldo atual do item — só em `produto`, pra tela avisar antes de zerar. */
  saldo: number | null;
  unidade: string | null;
}

/**
 * O teto é o mesmo do lote de baixa: quem bipou 200 chapas classifica 200.
 * Acima disso a tela já fatia sozinha.
 */
export const TETO_CLASSIFICACAO = 200;

/**
 * Classifica um lote de códigos com DUAS consultas, não duas por código.
 *
 * A ordem é unidade → produto, e não o contrário, porque a etiqueta de unidade
 * é a mais específica: `PRD-0001-000042` também "começa" com um SKU, e resolver
 * pelo produto primeiro baixaria o saldo do item inteiro em vez da etiqueta que
 * a pessoa tem na mão.
 */
export async function classificarCodigos(
  db: Db,
  codigos: string[],
): Promise<CodigoClassificado[]> {
  const alvo = [...new Set(codigos.map((c) => String(c ?? "").trim()).filter(Boolean))].slice(0, TETO_CLASSIFICACAO);
  if (!alvo.length) return [];

  // ── 1. As etiquetas de unidade ─────────────────────────────────────────────
  // `quantidade` é a coluna da CAIXA e pode não existir ainda (o SQL roda na
  // mão): sem ela cada etiqueta vale 1, que é como era antes. Bipar é o que o
  // galpão faz o dia inteiro — pedir uma coluna ausente derrubaria tudo.
  type Unidade = { codigo: string; status: string; item_id: string; quantidade?: number | null };
  let unidades: Unidade[] = [];
  const comCaixa = await db.from("estoque_unidades")
    .select("codigo,status,item_id,quantidade").in("codigo", alvo).limit(TETO_CLASSIFICACAO);
  if (comCaixa.error && schemaDesatualizado(comCaixa.error)) {
    const semCaixa = await db.from("estoque_unidades")
      .select("codigo,status,item_id").in("codigo", alvo).limit(TETO_CLASSIFICACAO);
    // Falhou de novo: aí é a TABELA que não existe, não a coluna.
    if (semCaixa.error) {
      if (schemaDesatualizado(semCaixa.error)) throw new ErroSchemaDesatualizado();
      throw new Error(semCaixa.error.message);
    }
    unidades = (semCaixa.data ?? []) as Unidade[];
  } else if (comCaixa.error) {
    throw new Error(comCaixa.error.message);
  } else {
    unidades = (comCaixa.data ?? []) as Unidade[];
  }
  const porCodigo = new Map(unidades.map((u) => [u.codigo, u]));

  // ── 2. O que sobrou pode ser etiqueta de PRODUTO ───────────────────────────
  // Só os códigos que não são unidade — não adianta perguntar de novo por quem
  // já foi resolvido, e a consulta é `in`, uma só para o lote inteiro.
  const restantes = alvo.filter((c) => !porCodigo.has(c));
  type Item = { id: string; nome: string; sku: string | null; quantidade: number | null; unidade: string | null; serializado: boolean | null };
  let itens: Item[] = [];
  if (restantes.length) {
    const { data } = await db.from("estoque_itens")
      .select("id,nome,sku,quantidade,unidade,serializado")
      .in("sku", restantes)
      .limit(TETO_CLASSIFICACAO);
    itens = (data ?? []) as Item[];
  }
  /*
   * SKU DUPLICADO é ausência, não escolha.
   *
   * Dois itens com o mesmo SKU é cadastro torto, e escolher um ao acaso tiraria
   * peça do item errado — o pior desfecho possível, porque o número fecha e
   * ninguém procura. A mesma decisão de `itemPorCodigo`, mantida aqui de
   * propósito para as duas leituras do galpão concordarem.
   */
  const contagem = new Map<string, number>();
  for (const i of itens) if (i.sku) contagem.set(i.sku, (contagem.get(i.sku) ?? 0) + 1);
  const porSku = new Map<string, Item>();
  for (const i of itens) if (i.sku && contagem.get(i.sku) === 1) porSku.set(i.sku, i);

  // ── 3. Os nomes dos itens das unidades — um join só, para o lote inteiro ───
  const idsDeUnidade = [...new Set(unidades.map((u) => u.item_id).filter(Boolean))];
  const nomePorId = new Map<string, { nome: string; unidade: string | null }>();
  if (idsDeUnidade.length) {
    const { data } = await db.from("estoque_itens").select("id,nome,unidade").in("id", idsDeUnidade).limit(TETO_CLASSIFICACAO);
    for (const i of (data ?? []) as { id: string; nome: string; unidade: string | null }[]) {
      nomePorId.set(i.id, { nome: i.nome, unidade: i.unidade });
    }
  }

  return alvo.map((codigo) => {
    const u = porCodigo.get(codigo);
    if (u) {
      const dono = nomePorId.get(u.item_id);
      return {
        codigo, tipo: "unidade" as const,
        item: dono?.nome ?? null, itemId: u.item_id,
        pecas: pecasDaUnidade(u), status: u.status,
        saldo: null, unidade: dono?.unidade ?? null,
      };
    }
    const p = porSku.get(codigo);
    if (p) {
      return {
        codigo, tipo: "produto" as const,
        item: p.nome, itemId: p.id,
        pecas: 1, status: null,
        saldo: p.quantidade ?? 0, unidade: p.unidade ?? "un",
      };
    }
    return { codigo, tipo: "nenhum" as const, item: null, itemId: null, pecas: 0, status: null, saldo: null, unidade: null };
  });
}

/**
 * A frase para o código que não casou com nada.
 *
 * Ela é a única que ainda pode dizer "não existe" — e agora isso é verdade,
 * porque as duas leituras foram tentadas. A dica do formato existe porque o
 * erro mais comum é bipar o código de barras do FORNECEDOR (o EAN da caixa),
 * que não é etiqueta nossa nenhuma.
 */
export function fraseDoCodigoDesconhecido(codigo: string): string {
  const temSerie = !!partirCodigo(codigo);
  return temSerie
    ? "Esta etiqueta de peça não está no sistema — ela pode ter sido apagada, ou é de outro galpão."
    : "Este código não é de nenhum produto do catálogo. Se é o código de barras do fornecedor, ele ainda não está cadastrado no item.";
}
