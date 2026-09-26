// ── Recebimento de Produtos / Entrada de Materiais ───────────────────────────
// Regras de negócio do fluxo compra → recebimento → estoque. Tudo no Supabase
// NOVO (compras, recebimentos, estoque_itens). Nunca escreve no ERP legado.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { notificar } from "@/lib/notificacoes";
import { gerarUnidadesEmLotes } from "@/lib/estoque-unidades-gerar";
import { padraoDeNomeExato, umItemPeloNome, ErroNomeAmbiguo, TETO_NOMES } from "@/lib/estoque-nome";
import { liberarEsperasDoItem } from "@/lib/producao-liberacao";
import { avisoDeColunasIgnoradas } from "@/lib/estoque-colunas-ignoradas";
import {
  guardadaAte, faltaChegar, statusAposEvento, precisaGuardar, avisoDeFaltaGuardar,
  STATUS_PENDENTES, STATUS_AGUARDANDO_CHEGADA, STATUS_LEGADO,
  type StatusCompra, type EtapaRecebimento,
} from "@/lib/recebimento-etapas";

// A régua das duas etapas (chegou ≠ está no estoque) mora em
// lib/recebimento-etapas.ts, que é puro — a TELA precisa da mesma régua, e ela
// não pode importar este arquivo (que abre cliente de servidor). Re-exportado
// aqui porque quem já importava daqui continua importando daqui.
export {
  STATUS_PENDENTES, STATUS_AGUARDANDO_CHEGADA, precisaGuardar, guardadaAte,
} from "@/lib/recebimento-etapas";
export type { StatusCompra, EtapaRecebimento } from "@/lib/recebimento-etapas";

export type Prioridade = "baixa" | "normal" | "alta" | "critica";

export class TabelaAusenteError extends Error {}

export interface Compra {
  id: string;
  item_nome: string; categoria: string | null; unidade: string;
  estoque_item_id: string | null;
  // Hierarquia do item comprado — só é usada quando o item ainda NÃO existe no
  // catálogo: é ela que o item novo herda. Opcional porque a coluna nasce em
  // supabase/estoque_recebimento_v3.sql, que é rodado na mão.
  hierarquia?: string | null;
  quantidade_comprada: number; quantidade_recebida: number;
  // ── As duas etapas (supabase/recebimento_v4.sql) ───────────────────────────
  // `quantidade_recebida` é o que CHEGOU; `quantidade_guardada` é o que de fato
  // entrou no estoque. Opcionais porque nascem num SQL rodado à mão — a chave
  // ausente é a prova de que a migração não passou, e é assim que o código
  // descobre em qual dos dois mundos está.
  quantidade_guardada?: number | null;
  /** Coluna GERADA (recebida − guardada): a fila do corredor, indexável. */
  falta_guardar?: number | null;
  chegou_em?: string | null; chegou_por?: string | null;
  guardado_em?: string | null; guardado_por?: string | null;
  fornecedor: string | null; fornecedor_id?: string | null; local_id?: string | null;
  /** Motivo de o último recebimento não ter entrado no estoque. Nulo = entrou. */
  estoque_erro?: string | null;
  preco_unit: number | null; preco_total: number | null;
  codigo_rastreio: string | null; codigo_recebimento: string | null; nota_fiscal: string | null; pedido_ref: string | null;
  palavra_chave: string | null;
  prioridade: Prioridade; previsao_entrega: string | null;
  status: StatusCompra; foto_obrigatoria: boolean;
  solicitante: string | null; solicitante_id: string | null; criado_por: string | null; criado_por_id: string | null;
  observacoes: string | null;
  comprado_em: string | null; created_at: string; updated_at: string;
}

export interface ChecklistRecebimento {
  produto_correto?: boolean; quantidade_correta?: boolean; embalagem_ok?: boolean;
  bom_estado?: boolean; nota_recebida?: boolean; foto?: boolean;
}

export interface Recebimento {
  id: string; compra_id: string; recebido_por: string | null;
  quantidade_recebida: number; correto: boolean; divergencia_motivo: string | null;
  observacoes: string | null; foto_url: string | null; checklist: ChecklistRecebimento | null;
  /** Qual das duas etapas este evento registrou. Ausente = banco sem a coluna. */
  etapa?: EtapaRecebimento | null;
  created_at: string;
}

const nowIso = () => new Date().toISOString();

// TABELA ausente (o SQL do recebimento nunca rodou). O "|schema cache" solto
// que morava aqui casava também com "Could not find the 'fornecedor_id' column
// of 'compras' in the schema cache" — ou seja, uma COLUNA nova faltando fazia
// a tela inteira dizer "falta criar as tabelas". A frase da tabela ausente
// ("Could not find the table 'public.compras' in the schema cache") continua
// coberta pelo segundo ramo.
function ausente(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e || "");
  return /relation .* does not exist|could not find the table/i.test(msg);
}

// ── Escrita tolerante a coluna que ainda não existe ──────────────────────────
// Parte das colunas de `compras` nasce num SQL rodado NA MÃO
// (recebimento_v2.sql: palavra_chave; estoque_recebimento_v3.sql:
// fornecedor_id, local_id, hierarquia, estoque_erro). Enquanto ninguém rodou,
// o PostgREST recusa a escrita INTEIRA e diz qual coluna não achou — e
// derrubar o recebimento por causa de um campo novo troca um problema pequeno
// por um grande. Aqui a coluna desconhecida sai da linha e a escrita é
// repetida sem ela. Vale só pra ESCRITA de campo acessório; erro de verdade
// (RLS, timeout, check) não casa com nenhum padrão e sobe normalmente.
function colunaDesconhecida(e: unknown): string | null {
  const msg = String((e as { message?: string })?.message || e || "");
  return (
    msg.match(/Could not find the '([a-z_]+)' column/i)?.[1]
    ?? msg.match(/column "?([a-z_]+)"? of relation/i)?.[1]
    ?? msg.match(/column ([a-z_]+) does not exist/i)?.[1]
    ?? null
  );
}

// O CHECK de `status` recusando um valor que ele não conhece. Acontece com
// `chegou` (supabase/recebimento_v4.sql não rodado): não é coluna faltando, é
// VALOR faltando, então `colunaDesconhecida` não pega e a escrita inteira
// morreria — a chegada não seria registrada de jeito nenhum.
function valorDeStatusRecusado(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  const msg = String(err?.message || "");
  return err?.code === "23514" || /violates check constraint/i.test(msg);
}

interface RespostaEscrita<T> { data: T | null; error: { message?: string; code?: string } | null }

async function escreverTolerante<T>(
  linha: Record<string, unknown>,
  exec: (linha: Record<string, unknown>) => PromiseLike<RespostaEscrita<T>>,
): Promise<RespostaEscrita<T> & { ignoradas: string[] }> {
  const atual = { ...linha };
  const ignoradas: string[] = [];
  // Teto de voltas: cada uma tira UMA coluna. Sem ele, um erro que sempre cita
  // a mesma coluna (mas não é "coluna ausente") viraria laço infinito.
  for (let volta = 0; volta < 8; volta++) {
    const r = await exec(atual);
    if (!r.error) return { ...r, ignoradas };
    const col = colunaDesconhecida(r.error);
    if (col && col in atual) { delete atual[col]; ignoradas.push(col); continue; }
    // Segunda linha de defesa do status novo: quem chama já rebaixa sozinho
    // quando a sondagem diz que a migração não passou. Isto cobre o banco
    // meio-rodado (colunas novas sim, CHECK não).
    const legado = typeof atual.status === "string" ? STATUS_LEGADO[atual.status as StatusCompra] : undefined;
    if (valorDeStatusRecusado(r.error) && legado && legado !== atual.status) { atual.status = legado; continue; }
    return { ...r, ignoradas };
  }
  return { data: null, error: { message: "colunas_desconhecidas" }, ignoradas };
}

// ── Criar compra (financeiro registra a compra) ──────────────────────────────
export async function criarCompra(input: {
  item_nome: string; categoria?: string | null; unidade?: string | null;
  /** Item do catálogo escolhido na tela. Sem ele, cai na busca por nome exato. */
  estoque_item_id?: string | null;
  /** Hierarquia do item que vai NASCER, quando a compra é de item novo. */
  hierarquia?: string | null;
  quantidade_comprada: number; fornecedor?: string | null;
  fornecedor_id?: string | null; local_id?: string | null;
  preco_unit?: number | null; preco_total?: number | null;
  codigo_rastreio?: string | null; codigo_recebimento?: string | null; nota_fiscal?: string | null; pedido_ref?: string | null;
  palavra_chave?: string | null;
  prioridade?: Prioridade; previsao_entrega?: string | null; status?: StatusCompra;
  foto_obrigatoria?: boolean; solicitante?: string | null; solicitante_id?: string | null;
  criado_por?: string | null; criado_por_id?: string | null; observacoes?: string | null;
}): Promise<{ compra: Compra; aviso: string | null }> {
  const db = createSupabaseAdminClient();
  // O vínculo com o catálogo é o que faz o custo da compra grudar no item e o
  // recebimento saber ONDE somar. Quando a tela escolheu o item, ele vem
  // pronto; a busca por nome exato só existe pra quem chegou por outra porta
  // (importação, tablet) — e é justamente ela que erra quando a digitação
  // difere por um caractere.
  //
  // O nome vai escapado (`padraoDeNomeExato`) e o casamento é refeito em JS
  // (`umItemPeloNome`): `ilike` é LIKE, então "ADESIVO 100% PP" cru vira
  // padrão e casa item que não é o comprado. Duplicata (`ErroNomeAmbiguo`)
  // deixa o vínculo NULO de propósito — a compra nasce assim mesmo, e quem
  // decide é a confirmação do recebimento, que tem tela pra reclamar. Chutar
  // aqui grudaria o custo da compra no item errado, calado.
  let estoque_item_id: string | null = input.estoque_item_id ?? null;
  if (!estoque_item_id) {
    try {
      const { data } = await db.from("estoque_itens").select("id,nome")
        .ilike("nome", padraoDeNomeExato(input.item_nome.trim())).limit(TETO_NOMES);
      estoque_item_id = umItemPeloNome(data as { id: string; nome: string }[] | null, input.item_nome)?.id ?? null;
    } catch { /* nome ambíguo ou tabela ausente: segue sem vínculo */ }
  }

  const preco_total = input.preco_total ?? (input.preco_unit != null ? input.preco_unit * input.quantidade_comprada : null);
  const row = {
    item_nome: input.item_nome.trim(),
    categoria: input.categoria ?? null,
    unidade: (input.unidade || "un").trim(),
    estoque_item_id,
    hierarquia: input.hierarquia ?? null,
    quantidade_comprada: input.quantidade_comprada,
    fornecedor: input.fornecedor ?? null,
    fornecedor_id: input.fornecedor_id ?? null,
    local_id: input.local_id ?? null,
    preco_unit: input.preco_unit ?? null,
    preco_total,
    codigo_rastreio: input.codigo_rastreio || null,
    codigo_recebimento: input.codigo_recebimento || null,
    nota_fiscal: input.nota_fiscal || null,
    pedido_ref: input.pedido_ref || null,
    palavra_chave: input.palavra_chave || null,
    prioridade: input.prioridade ?? "normal",
    previsao_entrega: input.previsao_entrega || null,
    status: input.status ?? "aguardando_entrega",
    foto_obrigatoria: input.foto_obrigatoria ?? true,
    solicitante: input.solicitante ?? null,
    solicitante_id: input.solicitante_id ?? null,
    criado_por: input.criado_por ?? null,
    criado_por_id: input.criado_por_id ?? null,
    observacoes: input.observacoes ?? null,
    comprado_em: nowIso(),
  };
  const { data, error, ignoradas } = await escreverTolerante<Compra>(row, (r) =>
    db.from("compras").insert(r).select("*").single());
  if (error) {
    if (ausente(error)) throw new TabelaAusenteError("compras");
    throw new Error(error.message || "falha_ao_criar_compra");
  }
  // `ignoradas` era descartado aqui. Como `compras.fornecedor_id`, `local_id`
  // e `hierarquia` ainda não existem no banco, TODA compra registrada hoje
  // perde o que a pessoa escolheu nesses campos — e a tela dizia "registrada"
  // do mesmo jeito. Quem chama decide como mostrar; o que não pode é sumir.
  return { compra: data as Compra, aviso: avisoDeColunasIgnoradas(ignoradas, row) };
}

// ── Listagens ────────────────────────────────────────────────────────────────
export async function listarCompras(filtro?: {
  status?: StatusCompra | null;
  /** Tudo que ainda não terminou (inclui o que chegou e ninguém guardou). */
  pendentesOnly?: boolean;
  /** Só o que ainda espera MERCADORIA — é o que o tablet da recepção mostra. */
  aguardandoChegada?: boolean;
  /** A fila do corredor: chegou, ninguém guardou. */
  aGuardar?: boolean;
  limite?: number;
}): Promise<Compra[]> {
  const db = createSupabaseAdminClient();
  const limite = filtro?.limite ?? 500;
  if (filtro?.aGuardar) return await filaDeGuardar(db, limite);
  try {
    let q = db.from("compras").select("*").order("created_at", { ascending: false }).limit(limite);
    if (filtro?.status) q = q.eq("status", filtro.status);
    else if (filtro?.aguardandoChegada) q = q.in("status", STATUS_AGUARDANDO_CHEGADA);
    else if (filtro?.pendentesOnly) q = q.in("status", STATUS_PENDENTES);
    const { data, error } = await q;
    if (error) throw error;
    const lista = (data ?? []) as Compra[];
    // `divergencia` está em STATUS_AGUARDANDO_CHEGADA porque uma entrega torta
    // pode ter resto a caminho. Quando não tem, ela não é mais assunto da
    // recepção — e no banco sem a migração TODA chegada vira `divergencia`
    // (STATUS_LEGADO), então sem este filtro a caixa já assinada ficaria pra
    // sempre na tela de quem assina, com "faltam 0" do lado. A comparação é
    // entre duas colunas, coisa que o PostgREST não faz num filtro; a lista
    // aqui é curta e já veio com `.limit()`.
    if (filtro?.aguardandoChegada) return lista.filter((c) => faltaChegar(c) > 0);
    return lista;
  } catch (e) {
    if (ausente(e)) throw new TabelaAusenteError("compras");
    throw e;
  }
}

/**
 * O que chegou e ninguém guardou, do mais antigo pro mais novo — mercadoria
 * parada há três dias tem de aparecer ANTES da que chegou agora.
 *
 * `falta_guardar` é coluna GERADA: comparar duas colunas é coisa que o
 * PostgREST não faz num filtro, e sem ela a única saída seria baixar a tabela
 * inteira. Enquanto o SQL não roda, o caminho de baixo faz o mesmo com os
 * pendentes (que são poucos) e a régua comum.
 */
async function filaDeGuardar(db: ReturnType<typeof createSupabaseAdminClient>, limite: number): Promise<Compra[]> {
  try {
    const { data, error } = await db.from("compras").select("*")
      .gt("falta_guardar", 0)
      .not("status", "in", "(cancelado,recebido)")
      .order("chegou_em", { ascending: true, nullsFirst: false })
      .limit(limite);
    if (error) throw error;
    return (data ?? []) as Compra[];
  } catch (e) {
    if (ausente(e)) throw new TabelaAusenteError("compras");
    const { data, error } = await db.from("compras").select("*")
      .in("status", STATUS_PENDENTES).order("created_at", { ascending: true }).limit(limite);
    if (error) throw error;
    return ((data ?? []) as Compra[]).filter(precisaGuardar);
  }
}

// UMA compra pela chave primária. Existe porque o detalhe do painel chamava
// `listarCompras()` e procurava o id em memória: 500 linhas baixadas do
// Supabase a cada toque num card, com a chave na mão. O `select("*")` aqui é
// deliberado e não é a listagem: é uma linha só, e pedir coluna por coluna
// quebraria enquanto supabase/estoque_recebimento_v3.sql não roda (42703 mata
// a query inteira, e o detalhe ficaria vazio pra todo mundo).
export async function compraPorId(id: string): Promise<Compra | null> {
  const db = createSupabaseAdminClient();
  try {
    const { data, error } = await db.from("compras").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as Compra) ?? null;
  } catch (e) {
    if (ausente(e)) throw new TabelaAusenteError("compras");
    throw e;
  }
}

export async function recebimentosDaCompra(compraId: string): Promise<Recebimento[]> {
  const db = createSupabaseAdminClient();
  try {
    const { data } = await db.from("recebimentos").select("*").eq("compra_id", compraId)
      .order("created_at", { ascending: false }).limit(100);
    return (data ?? []) as Recebimento[];
  } catch { return []; }
}

// ── Confirmar recebimento (chegou o produto) ────────────────────────────────
// Grava o evento, atualiza a quantidade/status da compra e o estoque. Se o item
// não existir no catálogo, cria com base na ordem de compra. Recebimento
// parcial: sobe só o que chegou e mantém a compra pendente.
export interface ResultadoRecebimento {
  ok: boolean; compra: Compra; status: StatusCompra;
  /**
   * O status HONESTO — o que a régua calculou, antes de o banco antigo
   * rebaixá-lo (`chegou` → `divergencia`, ver STATUS_LEGADO).
   *
   * Num banco migrado é idêntico a `status`. No de hoje é a diferença entre o
   * tablet da recepção dizer "Recebimento confirmado" e dizer "Recebido com
   * divergência" em vermelho para TODA entrega correta — que é o que
   * acontecia, porque o rebaixamento existe só para caber no CHECK antigo, não
   * porque algo deu errado. Quem precisa do que está gravado usa `status`.
   */
  status_efetivo: StatusCompra;
  /** Qual etapa este evento registrou. */
  etapa: EtapaRecebimento;
  quantidade_recebida_total: number; faltam: number;
  /** Total que já entrou no estoque, e quanto ainda espera alguém guardar. */
  quantidade_guardada_total: number; falta_guardar: number;
  // `unidades` só vem preenchido quando o item é serializado (as etiquetas
  // geradas nesta chamada) — usado pelo leitor do galpão
  // (POST /api/estoque/device/recebimento), que precisa dos CÓDIGOS pra
  // imprimir/mostrar na hora. O tablet de recebimento (foto + checklist) só
  // lê `quantidade`, então não quebra por ganhar um campo a mais.
  estoque: { nome: string; quantidade: number; criado: boolean; unidades?: string[] } | null;
  // Por que o estoque NÃO subiu. Antes isso era um `catch` vazio: a compra ia
  // pra "recebido" do mesmo jeito, o painel escrevia "Recebido e lançado" e
  // ninguém reconferia, porque a compra já tinha sumido dos pendentes. Agora a
  // compra fica pendente (`divergencia`) e o motivo volta aqui e na coluna
  // `compras.estoque_erro`, pra tela poder dizer o que aconteceu.
  estoque_falhou: string | null;
}

/** Mensagem curta e em português do que impediu o lançamento no estoque. */
function motivoDaFalha(e: unknown): string {
  // Duplicata de nome no catálogo: a frase precisa dizer o que fazer, senão
  // vira "nome_ambiguo" na cara de quem está recebendo mercadoria no galpão.
  if (e instanceof ErroNomeAmbiguo)
    return `há ${e.quantos} itens chamados "${e.nome}" no catálogo, então não dá pra saber em qual somar — apague o repetido ou escolha o item na tela da compra`;
  const msg = String((e as { message?: string })?.message || e || "erro desconhecido");
  if (/schema_desatualizado/.test(msg)) return "o banco ainda não tem a tabela das unidades (rode supabase/estoque_hierarquia_unidades.sql)";
  if (/hierarquia_sem_prefixo/.test(msg)) return "o item do catálogo está sem hierarquia, então não dá pra gerar o SKU das etiquetas";
  if (/item_nao_serializado/.test(msg)) return "o item deixou de ser serializado no meio do caminho";
  if (/corrida_de_sequencial/.test(msg)) return "duas gerações de etiqueta ao mesmo tempo; tente confirmar de novo";
  if (/lote_grande/.test(msg)) return "a quantidade recebida passa do teto de etiquetas por lote";
  if (/quantidade_fracionaria/.test(msg)) return "a quantidade recebida não fecha em etiqueta inteira, e o item é etiquetado — confira a unidade de compra do item";
  if (/nenhuma_etiqueta_gerada/.test(msg)) return "nenhuma etiqueta foi gerada, então nada entrou no estoque — confirme de novo";
  return msg;
}

export async function confirmarRecebimento(input: {
  compra_id: string;
  /** Quantidade DESTE evento: o que chegou agora, ou o que foi guardado agora. */
  quantidade_recebida: number;
  correto: boolean;
  divergencia_motivo?: string | null; observacoes?: string | null;
  foto_url?: string | null; checklist?: ChecklistRecebimento | null;
  recebido_por?: string | null; device_id?: string | null; local?: string | null;
  /**
   * Qual etapa registrar. Default `ambas` — o comportamento histórico, e o que
   * o totem do galpão faz de propósito (a pessoa está com a caixa na mão).
   * `chegada` não encosta no estoque; `estoque` não mexe no que já chegou.
   */
  etapa?: EtapaRecebimento;
}): Promise<ResultadoRecebimento> {
  const db = createSupabaseAdminClient();
  const etapa: EtapaRecebimento = input.etapa ?? "ambas";
  const registraChegada = etapa !== "estoque";
  const daEntradaNoEstoque = etapa !== "chegada";

  const { data: compraRow, error: cErr } = await db.from("compras").select("*").eq("id", input.compra_id).maybeSingle();
  if (cErr && ausente(cErr)) throw new TabelaAusenteError("compras");
  if (!compraRow) throw new Error("compra_nao_encontrada");
  const compra = compraRow as Compra;
  if (compra.status === "cancelado") throw new Error("compra_cancelada");
  if (compra.status === "recebido") throw new Error("compra_ja_recebida");

  // `select("*")` traz as colunas que EXISTEM: a chave ausente é a prova de que
  // supabase/recebimento_v4.sql não rodou. Uma sondagem só, aqui, em vez de
  // descobrir coluna por coluna a cada escrita recusada lá embaixo.
  const bancoSabeEtapas = "quantidade_guardada" in (compraRow as Record<string, unknown>);

  const qtdEvento = Math.max(0, Number(input.quantidade_recebida) || 0);
  const guardadaAntes = guardadaAte(compra);
  const aGuardarAntes = Math.max(0, Number(compra.quantidade_recebida || 0) - guardadaAntes);

  // Confirmar a chegada de novo do que já chegou inteiro é entrada em dobro na
  // conta de quem confere. Vale só pra etapa 1 pura: `ambas` é o totem bipando
  // com a caixa na mão, onde receber a mais é a vida real do galpão.
  if (etapa === "chegada" && faltaChegar(compra) <= 0 && qtdEvento > 0) throw new Error("compra_ja_chegou");
  // Guardar mais do que chegou inventaria estoque do nada. "Não há o que
  // guardar" vem ANTES porque é o caso mais comum (a compra ainda nem chegou) e
  // a frase certa muda o que a pessoa faz em seguida.
  if (etapa === "estoque" && aGuardarAntes <= 0) throw new Error("nada_para_guardar");
  if (etapa === "estoque" && qtdEvento > aGuardarAntes) throw new Error("quantidade_maior_que_o_recebido");

  const totalRecebido = Number(compra.quantidade_recebida || 0) + (registraChegada ? qtdEvento : 0);
  const faltam = Number(compra.quantidade_comprada || 0) - totalRecebido;
  const houveDivergencia = input.correto === false;

  // 1) Registra o evento de recebimento (auditoria: quem, quando, foto, checklist).
  //    Tolerante porque `etapa` nasce em supabase/recebimento_v4.sql: sem a
  //    coluna, o evento entra sem ela em vez de derrubar o recebimento inteiro.
  try {
    const { error: eEvento } = await escreverTolerante<unknown>({
      compra_id: compra.id, device_id: input.device_id ?? null,
      recebido_por: input.recebido_por ?? null, quantidade_recebida: qtdEvento,
      correto: input.correto, divergencia_motivo: input.divergencia_motivo ?? null,
      observacoes: input.observacoes ?? null, foto_url: input.foto_url ?? null,
      checklist: input.checklist ?? null, local: input.local ?? null,
      ...(bancoSabeEtapas ? { etapa } : {}),
    }, (r) => db.from("recebimentos").insert(r));
    if (eEvento) throw eEvento;
  } catch (e) { if (ausente(e)) throw new TabelaAusenteError("recebimentos"); throw e; }

  // 2) Atualiza o estoque (só a quantidade que chegou agora). Cria o item se
  //    não existir, com base na ordem de compra.
  let estoqueRes: ResultadoRecebimento["estoque"] = null;
  let estoqueItemId = compra.estoque_item_id;
  let falhaEstoque: string | null = null;
  if (qtdEvento > 0 && daEntradaNoEstoque) {
    try {
      if (!estoqueItemId) {
        // Este é o ponto em que a quantidade ENTRA no estoque, então errar o
        // item aqui move peça de verdade. `ilike` cru fazia duas coisas
        // erradas: interpretava o nome como padrão (o `%` de "ADESIVO 100% PP"
        // casa qualquer item que comece com "ADESIVO 100"; o `_` casa um
        // caractere qualquer) e, com duas linhas de mesmo nome, o `.limit(1)`
        // sorteava uma — a compra abastecia um item hoje e o outro amanhã.
        // Ambiguidade agora ESTOURA: cai no catch abaixo, vira `estoque_erro`
        // e a compra volta pros pendentes em vez de somar no item errado.
        const { data: existe } = await db.from("estoque_itens").select("id,nome")
          .ilike("nome", padraoDeNomeExato(compra.item_nome.trim())).limit(TETO_NOMES);
        estoqueItemId = umItemPeloNome(existe as { id: string; nome: string }[] | null, compra.item_nome)?.id ?? null;
      }
      if (estoqueItemId) {
        const { data: it, error: eItem } = await db.from("estoque_itens").select("nome,quantidade,serializado").eq("id", estoqueItemId).maybeSingle();
        if (eItem) throw new Error(eItem.message);
        // Item apagado entre o registro da compra e a chegada. Sem esta guarda o
        // `update` abaixo não acha linha nenhuma, não devolve erro, e a tela
        // diria que entrou uma quantidade que não existe em lugar nenhum.
        if (!it) throw new Error("o item vinculado a esta compra não existe mais no catálogo");
        if (it.serializado) {
          // ARMADILHA: item serializado tem a `quantidade` mantida por
          // gatilho (contagem de estoque_unidades em 'em_estoque'), NUNCA por
          // soma manual — supabase/estoque_hierarquia_unidades.sql §6b
          // (estoque_itens_guarda) ESTOURA (RAISE) se alguém escrever
          // `quantidade` num valor que não bate com a contagem real, e
          // derrubaria a confirmação de recebimento inteira. Em vez de somar
          // e escrever, gera as etiquetas que chegaram — o gatilho
          // (estoque_recontar_unidades) recalcula sozinho.
          const geradas = await gerarUnidadesEmLotes({
            item_id: estoqueItemId, quantidade: qtdEvento, origem: "recebimento",
            compra_id: compra.id, custo: compra.preco_unit ?? null,
            criado_por_id: null, criado_por: input.recebido_por ?? "Recebimento",
          });
          // Lista vazia NÃO é sucesso. `gerarUnidadesEmLotes` devolve `[]` sem
          // erro quando a quantidade não vira etiqueta nenhuma, e o caminho
          // seguinte relia a quantidade do item (que não mudou), montava
          // `estoqueRes` e a tela escrevia "Recebido e lançado" — a compra saía
          // dos pendentes com ZERO etiqueta no galpão. Mesmo defeito que o
          // `catch {}` vazio tinha, por outra porta: silêncio no lugar de aviso.
          if (!geradas.length) throw new Error("nenhuma_etiqueta_gerada");
          const { data: atualizado } = await db.from("estoque_itens").select("nome,quantidade").eq("id", estoqueItemId).maybeSingle();
          estoqueRes = {
            nome: (atualizado?.nome as string) || compra.item_nome, quantidade: Number(atualizado?.quantidade) || 0,
            criado: false, unidades: geradas.map((u) => u.codigo),
          };
          // Estoque entrou (pelas etiquetas): libera quem aguardava material.
          void liberarEsperasDoItem(estoqueItemId);
        } else {
          const novo = Math.max(0, Number(it.quantidade || 0) + qtdEvento);
          // O erro do UPDATE era ignorado: a guarda do banco podia recusar a
          // escrita e a tela dizia "Recebido e lançado" do mesmo jeito.
          const { error: eSoma } = await db.from("estoque_itens").update({ quantidade: novo, updated_at: nowIso() }).eq("id", estoqueItemId);
          if (eSoma) throw new Error(eSoma.message);
          estoqueRes = { nome: (it.nome as string) || compra.item_nome, quantidade: novo, criado: false };
          // Estoque entrou: quem aguardava material deste item pode andar.
          void liberarEsperasDoItem(estoqueItemId);
        }
      } else {
        // Cria o item automaticamente a partir da compra.
        //
        // `hierarquia` e não `tipo`: `tipo` é um dos três eixos que a fundação
        // nova aposentou, e o CHECK que sobrou no banco só aceita
        // componente/peca/produto — o "insumo" que morava aqui fazia o INSERT
        // voltar 23514 e o item NUNCA nascia. Pior: sem hierarquia o item não
        // aparece em nenhuma das 8 abas do Catálogo nem consegue gerar SKU.
        // Quando a compra não diz qual é (registro antigo, tablet), cai em
        // insumo indireto — o balde honesto de compra avulsa, e o único que
        // entra em toda composição.
        const linhaItem = {
          nome: compra.item_nome.trim(), categoria: compra.categoria, unidade: compra.unidade,
          quantidade: qtdEvento, ativo: true,
          hierarquia: compra.hierarquia || "insumo_indireto",
          fornecedor_id: compra.fornecedor_id ?? null,
          local_id: compra.local_id ?? null,
          ...(compra.preco_unit != null ? { custo: compra.preco_unit, custo_em: nowIso() } : {}),
        };
        const { data: criado, error: eCriar } = await escreverTolerante<{ id: string; nome: string; quantidade: number }>(
          linhaItem, (r) => db.from("estoque_itens").insert(r).select("id,nome,quantidade").single());
        if (eCriar) throw new Error(eCriar.message || "nao_consegui_criar_o_item");
        estoqueItemId = (criado?.id as string) ?? null;
        estoqueRes = { nome: (criado?.nome as string) || compra.item_nome, quantidade: qtdEvento, criado: true };
      }
    } catch (e) {
      // NÃO é mais um catch vazio. Antes daqui saía silêncio: o passo seguinte
      // marcava a compra como "recebido", o painel escrevia "Recebido e
      // lançado" e o estoque não tinha mexido. Como a compra some dos
      // pendentes, ninguém reconfere — o erro só aparecia num inventário meses
      // depois.
      falhaEstoque = motivoDaFalha(e);
    }
  }

  // ── O status, agora com DUAS contas ────────────────────────────────────────
  // Quanto chegou (`totalRecebido`) e quanto está no estoque (`guardadaTotal`)
  // deixaram de ser o mesmo número. A régua é pura e está em
  // lib/recebimento-etapas.ts, com teste próprio: é ela que decide quando a
  // compra fica em `chegou` (parada no corredor) e quando fecha em `recebido`.
  const guardadaAgora = daEntradaNoEstoque && !falhaEstoque ? qtdEvento : 0;
  const guardadaTotal = guardadaAntes + guardadaAgora;
  let status = statusAposEvento({
    statusAtual: compra.status, comprada: Number(compra.quantidade_comprada || 0),
    recebidaTotal: totalRecebido, guardadaTotal,
    houveDivergencia, falhaEstoque: !!falhaEstoque,
  });
  const statusEfetivo = status;
  const aindaFaltaGuardar = Math.max(0, totalRecebido - guardadaTotal);

  // Banco sem a migração não conhece o status `chegou` — o CHECK recusaria a
  // linha inteira e a chegada não seria registrada. Rebaixa aqui, ANTES de
  // escrever, e explica o porquê no campo que a tela já mostra em vermelho.
  const legado = STATUS_LEGADO[status];
  if (!bancoSabeEtapas && legado) status = legado;
  // A frase leva o NÚMERO do que falta guardar: sem a coluna, ela é a única
  // memória disso, e um sim/não faz uma compra guardada pela metade voltar a
  // valer zero na próxima chegada (ver `guardadaAte` em recebimento-etapas.ts).
  const avisoEstoque = !bancoSabeEtapas && aindaFaltaGuardar > 0
    ? avisoDeFaltaGuardar(aindaFaltaGuardar, falhaEstoque)
    : falhaEstoque;

  // 3) Custo = valor da última compra (o pedido). Sem isto o custo é digitado à
  //    mão uma vez e envelhece calado até alguém notar que a margem está errada.
  //    Roda pra QUALQUER item que o recebimento tenha resolvido (vindo da tela,
  //    achado pelo nome ou criado agora) — restringir ao vínculo pré-existente
  //    só transformava um erro de digitação no formulário em custo velho.
  if (compra.preco_unit != null && estoqueItemId && !estoqueRes?.criado) {
    try {
      await db.from("estoque_itens").update({
        custo: compra.preco_unit, custo_em: nowIso(),
      }).eq("id", estoqueItemId);
    } catch { /* custo é efeito colateral — não trava o recebimento */ }
  }

  // 4) Atualiza a compra (quantidade acumulada + status + vínculo de estoque).
  //    As colunas das duas etapas só entram quando o banco as tem: uma sondagem
  //    no lugar de quatro escritas recusadas em sequência.
  const agora = nowIso();
  const quem = input.recebido_por ?? null;
  const linhaCompra: Record<string, unknown> = {
    quantidade_recebida: totalRecebido, status, estoque_item_id: estoqueItemId,
    estoque_erro: avisoEstoque, updated_at: agora,
  };
  if (bancoSabeEtapas) {
    linhaCompra.quantidade_guardada = guardadaTotal;
    // `chegou_em` é a PRIMEIRA vez que a porta abriu — quem chega depois é
    // recebimento parcial, e o histórico completo está em `recebimentos`.
    if (registraChegada && qtdEvento > 0) {
      if (!compra.chegou_em) linhaCompra.chegou_em = agora;
      linhaCompra.chegou_por = quem ?? compra.chegou_por ?? null;
    }
    if (guardadaAgora > 0) { linhaCompra.guardado_em = agora; linhaCompra.guardado_por = quem; }
  }
  const { data: atualizada } = await escreverTolerante<Compra>(
    linhaCompra,
    (r) => db.from("compras").update(r).eq("id", compra.id).select("*").single(),
  );
  // O que VALE é o que ficou gravado: se o CHECK do banco rebaixou o status na
  // segunda linha de defesa, quem chamou precisa saber disso, não do que a
  // régua tinha calculado.
  const statusGravado = (atualizada as Compra | null)?.status;
  if (statusGravado) status = statusGravado;

  // 5) Notifica quem pediu e quem comprou (best-effort).
  await notificarRecebimento(compra, { status, etapa, totalRecebido, faltaGuardar: aindaFaltaGuardar, falhaEstoque });

  return {
    ok: true, compra: (atualizada as Compra) ?? compra, status,
    // Só o rebaixamento por CHECK antigo é maquiagem; qualquer outra coisa que
    // o banco tenha gravado é a verdade e vale pros dois campos.
    status_efetivo: status === legado && statusEfetivo !== status ? statusEfetivo : status,
    etapa,
    quantidade_recebida_total: totalRecebido, faltam: Math.max(0, faltam),
    quantidade_guardada_total: guardadaTotal, falta_guardar: aindaFaltaGuardar,
    estoque: estoqueRes, estoque_falhou: falhaEstoque,
  };
}

async function notificarRecebimento(compra: Compra, e: {
  status: StatusCompra; etapa: EtapaRecebimento;
  totalRecebido: number; faltaGuardar: number; falhaEstoque: string | null;
}) {
  const alvos = [compra.solicitante_id, compra.criado_por_id].filter(Boolean) as string[];
  if (!alvos.length) return;
  const ok = e.status === "recebido";
  const conta = `${e.totalRecebido}/${compra.quantidade_comprada} ${compra.unidade}`;
  // A frase "já entrou no estoque" é uma promessa: só pode sair quando o
  // lançamento de fato aconteceu. Com as duas etapas separadas, "chegou" é uma
  // notícia legítima por si — e sem essa distinção quem pediu o material iria
  // ao galpão procurar uma caixa que ninguém abriu.
  const titulo = e.falhaEstoque ? `Chegou mas não entrou no estoque: ${compra.item_nome}`
    : ok ? `Entrou no estoque: ${compra.item_nome}`
    : e.faltaGuardar > 0 ? `Chegou (falta guardar): ${compra.item_nome}`
    : e.status === "chegou_parcial" ? `Chegou parcial: ${compra.item_nome}`
    : `Divergência no recebimento: ${compra.item_nome}`;
  const corpo = e.falhaEstoque
    ? `A mercadoria chegou (${conta}), mas o estoque não subiu: ${e.falhaEstoque}`
    : ok
    ? `Chegou tudo (${conta}) e já entrou no estoque.`
    : e.faltaGuardar > 0
    ? `A mercadoria chegou (${conta}) e está esperando alguém do galpão conferir e guardar — ainda NÃO conta no estoque.`
    : `Comprado: ${compra.quantidade_comprada} · Recebido: ${e.totalRecebido} ${compra.unidade}.`;
  await notificar([...new Set(alvos)].map((user_id) => ({
    user_id, tipo: "sistema" as const, titulo, corpo, link: "/estoque", de_nome: "Recebimento",
  })));
}

export async function cancelarCompra(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  await db.from("compras").update({ status: "cancelado", updated_at: nowIso() }).eq("id", id);
}

/**
 * Encerra uma compra que chegou mas ficou com divergência.
 *
 * Sem isto a compra com `status = "divergencia"` ficava presa em "Pendentes"
 * PARA SEMPRE — os cards "Com divergência" e "Materiais críticos" nunca
 * voltavam a zero, e a única saída que a tela oferecia era "Cancelar compra",
 * ou seja, gravar que uma compra recebida foi cancelada. Mentir no dado pra
 * limpar a tela é pior que a tela suja.
 *
 * O que aconteceu fica escrito nas observações: o status vira `recebido`, mas
 * quem abrir a compra depois lê que foi encerrada na mão e por quem.
 */
export async function encerrarCompra(id: string, por?: string | null): Promise<void> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("compras").select("observacoes").eq("id", id).maybeSingle();
  const carimbo = `Encerrada com divergência${por ? ` por ${por}` : ""} em ${new Date().toLocaleString("pt-BR")}.`;
  const anterior = (data?.observacoes as string | null) || "";
  // `quantidade_guardada = quantidade_recebida` fecha também a FILA de guardar:
  // sem isso a compra sairia dos pendentes mas continuaria aparecendo em "A
  // guardar" pra sempre, porque lá quem manda é a diferença entre os dois
  // números, não o status. Tolerante: a coluna nasce em recebimento_v4.sql.
  const { data: atual } = await db.from("compras").select("quantidade_recebida").eq("id", id).maybeSingle();
  await escreverTolerante<unknown>({
    status: "recebido",
    quantidade_guardada: Number((atual as { quantidade_recebida?: number } | null)?.quantidade_recebida ?? 0) || 0,
    observacoes: anterior ? `${anterior}\n${carimbo}` : carimbo,
    updated_at: nowIso(),
  }, (r) => db.from("compras").update(r).eq("id", id));
}

/**
 * ETAPA 2 — alguém do galpão abriu, conferiu, etiquetou e guardou.
 *
 * É aqui que a quantidade sobe e as etiquetas nascem. Só existe como nome
 * próprio: por dentro é a mesma `confirmarRecebimento`, porque as duas etapas
 * compartilham o cálculo de status, a auditoria e o lançamento — separar em
 * duas funções seria duplicar a parte que mais dói quando diverge.
 */
export async function guardarNoEstoque(input: {
  compra_id: string; quantidade: number;
  guardado_por?: string | null; device_id?: string | null; observacoes?: string | null;
}): Promise<ResultadoRecebimento> {
  return confirmarRecebimento({
    compra_id: input.compra_id, quantidade_recebida: input.quantidade, correto: true,
    recebido_por: input.guardado_por ?? null, device_id: input.device_id ?? null,
    observacoes: input.observacoes ?? null, etapa: "estoque",
  });
}

// ── Dashboard (agregados) ────────────────────────────────────────────────────
export interface DashboardRecebimento {
  aguardando: number; recebidosHoje: number; divergencias: number; parciais: number;
  criticos: number; abaixoMinimo: number; comprasPendentes: number;
  /** Chegou e ninguém guardou — a fila do corredor. */
  aGuardar: number;
}

const SP_OFFSET_MS = 3 * 3600 * 1000;
const spDay = (iso: string) => new Date(new Date(iso).getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);

// Seis números que eram lidos baixando a tabela `compras` INTEIRA, sem
// `.limit()`, a cada abertura da aba. Agora cada um é uma contagem no banco
// (`count: "exact", head: true`) — o corpo da resposta volta vazio e o número
// vem no cabeçalho. É a regra do projeto: só o número, quando é só o número.
export async function dashboardRecebimento(): Promise<DashboardRecebimento> {
  const db = createSupabaseAdminClient();
  const vazio: DashboardRecebimento = { aguardando: 0, recebidosHoje: 0, divergencias: 0, parciais: 0, criticos: 0, abaixoMinimo: 0, comprasPendentes: 0, aGuardar: 0 };

  // Início do dia em São Paulo, em UTC (o banco guarda timestamptz).
  const inicioDoDia = `${spDay(nowIso())}T03:00:00.000Z`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Consulta = any;
  const contar = async (afinar: (q: Consulta) => Consulta): Promise<number> => {
    const { count, error } = await afinar(db.from("compras").select("id", { count: "exact", head: true }));
    if (error) throw error;
    return count ?? 0;
  };

  try {
    const [aguardando, parciais, divergencias, comprasPendentes, recebidosHoje, criticos] = await Promise.all([
      contar((q) => q.in("status", ["aguardando_entrega", "comprado"])),
      contar((q) => q.eq("status", "chegou_parcial")),
      contar((q) => q.eq("status", "divergencia")),
      contar((q) => q.in("status", STATUS_PENDENTES)),
      contar((q) => q.eq("status", "recebido").gte("updated_at", inicioDoDia)),
      contar((q) => q.eq("prioridade", "critica").in("status", STATUS_PENDENTES)),
    ]);
    const d: DashboardRecebimento = { ...vazio, aguardando, parciais, divergencias, comprasPendentes, recebidosHoje, criticos };

    // A fila do corredor. `falta_guardar` é coluna GERADA: sem ela (migração
    // pendente) não dá pra comparar duas colunas num filtro do PostgREST, e o
    // que sobra é contar quem carrega a marca de "chegou e não subiu".
    try {
      d.aGuardar = await contar((q) => q.gt("falta_guardar", 0).not("status", "in", "(cancelado,recebido)"));
    } catch {
      try {
        d.aGuardar = await contar((q) => q.in("status", STATUS_PENDENTES).not("estoque_erro", "is", null));
      } catch { /* banco sem estoque_erro também: o número fica em 0, a lista continua certa */ }
    }

    // Itens do catálogo abaixo do estoque mínimo. Este não vira contagem: o
    // PostgREST não compara uma coluna com outra num filtro. O que dá pra fazer
    // é não trazer quem nem tem mínimo definido — e pôr o teto que faltava.
    try {
      const { data: itens } = await db.from("estoque_itens")
        .select("quantidade,qtd_minima").eq("ativo", true).gt("qtd_minima", 0).limit(2000);
      d.abaixoMinimo = ((itens ?? []) as { quantidade: number | null; qtd_minima: number | null }[])
        .filter((i) => (i.quantidade ?? 0) <= (i.qtd_minima ?? 0)).length;
    } catch { /* ok */ }
    return d;
  } catch (e) {
    if (ausente(e)) throw new TabelaAusenteError("compras");
    return vazio;
  }
}
