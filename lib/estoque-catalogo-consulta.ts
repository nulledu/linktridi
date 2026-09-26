import { createHash } from "crypto";

// ── O catálogo reduzido ao que se responde DE PÉ, no galpão ──────────────────
//
// A pergunta que o tablet passa a responder é uma só: "quantos temos disso, e
// onde fica?". Ela não precisa de custo, fornecedor, dimensão, ficha técnica
// nem imagem — e mandar isso tudo pro aparelho seria pagar egress em cada
// campo que ninguém vai ler de luva na mão.
//
// Este arquivo é puro (sem Supabase, sem Next) porque é onde moram as duas
// decisões que importam e que se conferem em teste: o que entra na linha, e
// como se resume o catálogo inteiro numa ASSINATURA — o que deixa o aparelho
// perguntar "mudou?" e receber uma resposta de 20 bytes no caso comum, em vez
// do catálogo inteiro a cada sincronização.

/** Uma linha do catálogo como o tablet a guarda. Nada além disto. */
export interface LinhaCatalogo {
  id: string;
  nome: string;
  sku: string | null;
  categoria: string | null;
  unidade: string;
  /** Peças em estoque. `numeric` do Postgres pode vir string — sempre número aqui. */
  quantidade: number;
  /** "COR-01 · Corredor A" — já pronto pra tela. `null` quando não há local. */
  local: string | null;
}

export interface LocalDoGalpao {
  id: string;
  codigo?: string | null;
  nome?: string | null;
}

export interface ItemCru extends Record<string, unknown> {
  id?: unknown;
  nome?: unknown;
}

/**
 * O rótulo que a pessoa lê na prateleira.
 *
 * Código E nome, nessa ordem: o código é o que está escrito na placa do
 * corredor (é curto justamente por isso — ver `estoque_locais.codigo`), e o
 * nome é o que alguém que chegou hoje entende. Um sozinho não resolve: "P-12"
 * não diz nada pra quem é novo, "Prateleira 12" não casa com a placa.
 */
export function rotuloDoLocal(local: LocalDoGalpao | null | undefined): string | null {
  if (!local) return null;
  const codigo = String(local.codigo ?? "").trim();
  const nome = String(local.nome ?? "").trim();
  if (codigo && nome && codigo.toLowerCase() !== nome.toLowerCase()) return `${codigo} · ${nome}`;
  return codigo || nome || null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : valor == null ? "" : String(valor).trim();
}

/** `numeric` do Postgres pode chegar string. Nunca NaN: o que não é número é 0. */
export function quantidadeDoItem(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * As linhas cruas do `select` viram as linhas que o tablet guarda.
 *
 * Item sem `id` ou sem `nome` é DESCARTADO em vez de virar linha vazia: no
 * aparelho ele apareceria como um resultado em branco na busca, que é pior do
 * que não aparecer — a pessoa acha que achou alguma coisa.
 */
export function montarCatalogo(rows: ItemCru[], locais: LocalDoGalpao[] = []): LinhaCatalogo[] {
  const porId = new Map(locais.map((l) => [String(l.id), l]));
  const linhas: LinhaCatalogo[] = [];
  for (const row of rows ?? []) {
    const id = texto(row?.id);
    const nome = texto(row?.nome);
    if (!id || !nome) continue;
    linhas.push({
      id,
      nome,
      sku: texto(row?.sku) || null,
      categoria: texto(row?.categoria) || null,
      // O galpão fala em "un" quando ninguém disse outra coisa — é o mesmo
      // default da coluna (`estoque_itens.unidade`).
      unidade: texto(row?.unidade) || "un",
      quantidade: quantidadeDoItem(row?.quantidade),
      local: rotuloDoLocal(porId.get(texto(row?.local_id))),
    });
  }
  return linhas;
}

/**
 * O catálogo inteiro resumido em 16 caracteres.
 *
 * É o que faz o tick comum voltar VAZIO: o aparelho manda a assinatura que
 * tem, e quando ela bate a resposta é `{ mudou: false }` — nada de reenviar
 * 192 itens porque alguém abriu a tela.
 *
 * A assinatura é sobre o CONTEÚDO ENVIADO, não sobre `updated_at`. Seria mais
 * barato perguntar ao banco a data mais recente, mas há caminhos de escrita
 * que mexem em `quantidade` sem carimbar a data (os rollbacks de
 * /api/estoque/unidades/preparar, por exemplo) — e a quantidade é justamente o
 * número que esta tela existe pra mostrar. Assinatura que erra pra menos é
 * pior que consulta que custa um pouco mais: ela mostra prateleira errada e
 * ninguém desconfia.
 */
export function assinaturaDoCatalogo(itens: LinhaCatalogo[]): string {
  // Separadores de caractere de controle (nunca aparecem em nome de item nem
  // em código de local): colar campo com campo direto faria ("AB","C") assinar
  // igual a ("A","BC") — duas mudanças se cancelando em silêncio, e o aparelho
  // seguindo com a prateleira antiga sem ninguém desconfiar.
  const CAMPO = "\u001f";
  const LINHA = "\u001e";
  const canonico = itens
    .map((i) => [i.id, i.nome, i.sku ?? "", i.categoria ?? "", i.unidade, i.quantidade, i.local ?? ""].join(CAMPO))
    .join(LINHA);
  return createHash("sha1").update(`${itens.length}${LINHA}${canonico}`).digest("hex").slice(0, 16);
}
