// ── Geração de unidades etiquetadas (estoque_unidades) ───────────────────────
// Compartilhado entre app/api/estoque/unidades/route.ts (geração manual, pela
// tela) e lib/recebimento.ts (geração automática ao confirmar uma entrega) —
// a MESMA regra de sequencial/SKU/lote vale nos dois casos, então mora aqui
// uma vez só. Toca banco (ao contrário de lib/estoque-unidades.ts, que é puro).
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { codigoDaUnidade, skuAutomatico, PREFIXO_SKU } from "./estoque-unidades";
import { maiorSequencial, normalizarSku } from "./estoque-sku";
import { hierarquiaDef } from "./estoque-hierarquia";

// Teto de um lote por chamada a `gerarUnidades`. A trigger do banco
// (estoque_recontar_unidades, em estoque_hierarquia_unidades.sql §6) reconta
// TODAS as unidades em_estoque do item a cada linha inserida — um INSERT de N
// linhas dispara N recontagens, cada uma varrendo a tabela: é O(N²) segurando
// lock de linha a transação inteira. 500 é o paliativo deliberado enquanto a
// trigger não vira "conta 1x por statement" (registrado no plano); lote maior
// usa `gerarUnidadesEmLotes`, que fatia.
export const LOTE_MAXIMO_UNIDADES = 500;

export class ErroItemNaoSerializado extends Error {
  constructor() { super("item_nao_serializado"); }
}
export class ErroItemNaoEncontrado extends Error {
  constructor() { super("item_nao_encontrado"); }
}
export class ErroLoteGrande extends Error {
  constructor(public max: number) { super("lote_grande"); }
}
export class ErroCorridaDeSequencial extends Error {
  constructor() { super("corrida_de_sequencial"); }
}
// Quantidade que não fecha em número inteiro — 2,5 kg de cola, 0,75 m de fita,
// ou um `Number("abc")` que virou NaN no caminho.
//
// Aqui morava um `Math.trunc`. Truncar é a pior saída possível neste ponto:
// `estoque_unidades.quantidade` é `int` com `check (> 0)`, então 2,5 viraria 2,
// o banco aceitaria feliz e o meio quilo sumiria PRA SEMPRE — sem erro, sem
// log, sem ninguém pra reconferir. Item medido em peso, volume ou comprimento
// não se etiqueta por unidade: a contagem digitada é o instrumento dele.
export class ErroQuantidadeFracionaria extends Error {
  readonly frase: string;
  constructor(public quantidade: number) {
    super("quantidade_fracionaria");
    this.frase = fraseQuantidadeFracionaria(quantidade);
  }
}

/**
 * A frase que a tela mostra quando a quantidade não fecha em etiqueta inteira.
 * Mora aqui pra rota, recebimento e preparo dizerem a MESMA coisa — quem lê
 * está de frente pra prateleira e precisa saber o que fazer, não o nome do erro.
 */
export function fraseQuantidadeFracionaria(quantidade: number): string {
  if (!Number.isFinite(quantidade)) return "A quantidade não é um número — nada foi gerado.";
  const n = String(quantidade).replace(".", ",");
  return `${n} não fecha em etiqueta inteira, e etiqueta não se parte pela metade. Item medido em peso, volume ou comprimento entra pela contagem digitada, não por etiqueta.`;
}

/** Recusa em vez de cortar — ver `ErroQuantidadeFracionaria`. */
function inteiroOuRecusa(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new ErroQuantidadeFracionaria(n);
  return n;
}
// O arquivo supabase/estoque_hierarquia_unidades.sql cria a tabela inteira
// (não só colunas novas) — enquanto ninguém rodou, todo SELECT/INSERT nela
// falha com 42P01 (relação inexistente); colunas novas em estoque_itens
// (hierarquia, serializado) falham com 42703. As duas viram este erro, que a
// rota traduz num 409 explicando o que rodar — igual ao SCHEMA_DESATUALIZADO
// de app/api/estoque-itens/route.ts.
// As duas peças são PURAS e mudaram de casa: vivem em `lib/estoque-schema.ts`,
// que não cria cliente de banco. Este arquivo cria — e um módulo compartilhado
// com a tela que importasse a checagem daqui arrastaria `lib/supabase/server`
// até o navegador, quebrando o build do Next.
//
// Reexportadas para quem já as importava deste caminho; e importadas logo
// abaixo porque `export ... from` não traz os nomes para o escopo deste
// arquivo, que usa os dois em quase toda função.
export { ErroSchemaDesatualizado, schemaDesatualizado } from "./estoque-schema";
import { ErroSchemaDesatualizado, schemaDesatualizado } from "./estoque-schema";

export interface UnidadeGerada {
  id: string;
  codigo: string;
  seq: number;
  /** Peças NESTA etiqueta — 1 na avulsa, N na caixa. */
  pecas: number;
}

export interface GerarUnidadesInput {
  item_id: string;
  /** Quantas ETIQUETAS gerar (não quantas peças — ver `pecasPorUnidade`). */
  quantidade: number;
  /**
   * Peças em CADA etiqueta — a CAIXA. Default 1 (uma etiqueta, uma peça).
   * Uma caixa lacrada de 50 folhas é `{ quantidade: 1, pecasPorUnidade: 50 }`:
   * UMA etiqueta valendo 50, não 50 etiquetas.
   *
   * Só viaja pro banco quando é > 1: assim quem ainda não rodou o SQL da caixa
   * (a coluna `estoque_unidades.quantidade`) continua gerando etiqueta avulsa
   * normalmente, e só a caixa de verdade esbarra no `ErroSchemaDesatualizado`.
   */
  pecasPorUnidade?: number;
  origem?: "recebimento" | "producao" | "manual";
  compra_id?: string | null;
  custo?: number | null;
  criado_por_id?: string | null;
  criado_por?: string | null;
}

interface ItemRow { id: string; sku: string | null; hierarquia: string | null; serializado: boolean }

/**
 * Gera N unidades etiquetadas pro item (`estoque_unidades`), com o próximo
 * sequencial disponível. Recusa item não serializado (etiquetar item a
 * granel — cola, tinta — é onde a confusão começa), quantidade que não fecha
 * em inteiro (`ErroQuantidadeFracionaria`) e lote acima de
 * `LOTE_MAXIMO_UNIDADES`. Se o item não tem SKU ainda, gera um automático e
 * grava no item ANTES de criar as unidades — o código da unidade deriva do
 * SKU (`codigoDaUnidade`).
 */
export async function gerarUnidades(input: GerarUnidadesInput): Promise<UnidadeGerada[]> {
  const quantidade = inteiroOuRecusa(input.quantidade);
  if (quantidade <= 0) return [];

  const db = createSupabaseAdminClient();
  const { data: item, error: eItem } = await db
    .from("estoque_itens")
    .select("id,sku,hierarquia,serializado")
    .eq("id", input.item_id)
    .maybeSingle();
  if (eItem) { if (schemaDesatualizado(eItem)) throw new ErroSchemaDesatualizado(); throw new Error(eItem.message); }
  if (!item) throw new ErroItemNaoEncontrado();
  const itemRow = item as ItemRow;

  // 1) Item não serializado: etiquetar item a granel é onde a confusão começa.
  if (!itemRow.serializado) throw new ErroItemNaoSerializado();
  // 2) Teto de lote — ver comentário de LOTE_MAXIMO_UNIDADES.
  if (quantidade > LOTE_MAXIMO_UNIDADES) throw new ErroLoteGrande(LOTE_MAXIMO_UNIDADES);

  // 3) SKU é obrigatório: o código da unidade deriva dele. Gera e grava ANTES
  //    de criar qualquer unidade.
  let sku = itemRow.sku;
  if (!sku) {
    sku = await gerarSkuUnico(db, itemRow.hierarquia);
    const { error: eSku } = await db.from("estoque_itens").update({ sku, updated_at: new Date().toISOString() }).eq("id", itemRow.id);
    if (eSku) { if (schemaDesatualizado(eSku)) throw new ErroSchemaDesatualizado(); throw new Error(eSku.message); }
  }

  // Peças por etiqueta: 1 é o normal (etiqueta avulsa). Só a caixa de verdade
  // (> 1) grava a coluna — ver o comentário de `pecasPorUnidade`. Vale a mesma
  // recusa da quantidade: a caixa também vira `int` no banco, e uma caixa de
  // "2,5" cortada pra 2 é meio quilo apagado sem aviso.
  const pecas = input.pecasPorUnidade == null
    ? 1
    : Math.max(1, inteiroOuRecusa(input.pecasPorUnidade));
  const caixa = pecas > 1 ? { quantidade: pecas } : {};

  const origem = input.origem ?? "manual";
  const compra_id = input.compra_id ?? null;
  const custo = input.custo ?? null;
  const criado_por_id = input.criado_por_id ?? null;
  const criado_por = input.criado_por ?? null;

  // 4) Corrida de sequencial: duas gerações do MESMO item ao mesmo tempo leem
  //    o mesmo `max(seq)` e tentam gravar o mesmo código — a UNIQUE em
  //    `codigo` (e em `(item_id, seq)`) barra a segunda, que recalcula do
  //    zero e tenta de novo. Mesmo padrão de lib/marketing-criativos.ts
  //    (max+1 com retry em 23505), em lote em vez de linha a linha.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data: ultima, error: eMax } = await db
      .from("estoque_unidades")
      .select("seq")
      .eq("item_id", itemRow.id)
      .order("seq", { ascending: false })
      .limit(1);
    if (eMax) { if (schemaDesatualizado(eMax)) throw new ErroSchemaDesatualizado(); throw new Error(eMax.message); }
    const inicio = (Number((ultima as { seq: number }[] | null)?.[0]?.seq ?? 0) || 0) + 1;

    const linhas = Array.from({ length: quantidade }, (_, i) => {
      const seq = inicio + i;
      return {
        item_id: itemRow.id, codigo: codigoDaUnidade(sku as string, seq), seq,
        status: "em_estoque", origem, compra_id, custo, criado_por_id, criado_por,
        ...caixa,
      };
    });

    const { data, error } = await db.from("estoque_unidades").insert(linhas).select("id,codigo,seq");
    // `pecas` vem daqui, não do `select`: pedir a coluna `quantidade` de volta
    // quebraria a geração comum em todo banco onde o SQL da caixa ainda não
    // rodou, e o valor já está em mãos.
    if (!error) return ((data ?? []) as Omit<UnidadeGerada, "pecas">[]).map((u) => ({ ...u, pecas }));
    if (schemaDesatualizado(error)) throw new ErroSchemaDesatualizado();
    if ((error as { code?: string }).code !== "23505") throw new Error(error.message);
    // 23505: outra geração ganhou a corrida no meio do caminho — recalcula o
    // sequencial (próxima volta do for) e tenta de novo.
  }
  throw new ErroCorridaDeSequencial();
}

/**
 * Fatia uma geração grande em lotes de até `LOTE_MAXIMO_UNIDADES`, um insert
 * por vez, mantendo o sequencial contínuo (cada lote lê o `max(seq)` já
 * gravado pelo lote anterior — `gerarUnidades` faz essa leitura sozinho a
 * cada chamada). É o que deixa `lib/recebimento.ts` respeitar o teto sem
 * obrigar quem recebe 800 peças a fazer isso na mão.
 */
export async function gerarUnidadesEmLotes(input: GerarUnidadesInput): Promise<UnidadeGerada[]> {
  // Recusa ANTES de fatiar: truncar aqui esconderia a fração de `gerarUnidades`,
  // que nunca chegaria a ver o número original pra reclamar dele.
  const total = inteiroOuRecusa(input.quantidade);
  const geradas: UnidadeGerada[] = [];
  for (let restante = total; restante > 0; restante -= LOTE_MAXIMO_UNIDADES) {
    const lote = Math.min(restante, LOTE_MAXIMO_UNIDADES);
    geradas.push(...(await gerarUnidades({ ...input, quantidade: lote })));
  }
  return geradas;
}

// SKU automático único: "<prefixo da hierarquia>-<n>", incrementando `n` até
// achar um que ainda não está em uso. Não há UNIQUE em `estoque_itens.sku` no
// banco (checagem em app, ver supabase/estoque_classes.sql) — esta função é a
// única linha de defesa, mas colisão exigiria duas gerações do MESMO prefixo
// no MESMO instante, e cada uma delas já é rara.
async function gerarSkuUnico(db: ReturnType<typeof createSupabaseAdminClient>, hierarquia: string | null): Promise<string> {
  // Prefixo único no catálogo inteiro (PREFIXO_SKU): a numeração é global, então
  // dois itens nunca disputam o mesmo número por estarem em hierarquias
  // diferentes — que era o buraco do desenho anterior.
  const { data, error } = await db
    .from("estoque_itens")
    .select("sku")
    .ilike("sku", `${PREFIXO_SKU}-%`)
    .limit(2000);
  if (error) { if (schemaDesatualizado(error)) throw new ErroSchemaDesatualizado(); throw new Error(error.message); }
  const brutos = ((data ?? []) as { sku: string | null }[]).map((r) => r.sku);
  const usados = new Set(brutos.map((s) => normalizarSku(s)).filter(Boolean));
  // ÚLTIMO + 1, e não `quantos existem` + 1 — a mesma conta de `sugerirSku` na
  // tela. Com um buraco na sequência, contar devolve um número já ocupado: o
  // laço abaixo consertava calado, mas a tela prometia PRD-0246 e a etiqueta
  // saía PRD-0247. Duas contas diferentes pro mesmo número é como o papel
  // impresso deixa de bater com o cadastro.
  let n = maiorSequencial(usados) + 1;
  let sku = skuAutomatico(hierarquia ?? "", n);
  while (usados.has(sku)) { n += 1; sku = skuAutomatico(hierarquia ?? "", n); }
  return sku;
}
