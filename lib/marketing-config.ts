// ── Config de Marketing (Supabase novo, tabela marketing_config id=1, jsonb data).
// Guarda o teto de gasto (editável pelo admin) e a classificação de cada conta
// do Facebook em "carimbo" ou "chancela". Tolerante à ausência da tabela.

import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached, invalidate } from "@/lib/cache";
import type { Regra } from "@/lib/trafego-regras";
import { normalizarComissoes, type ComissaoGestor } from "./comissao-gestor";
import { normalizarAcordoMarketplace, type AcordoMarketplace } from "./comissao-marketplace";

export type ContaTipo = "carimbo" | "chancela";

// Modelo de custos p/ o LUCRO real (estilo Utmify): descontados do faturamento.
export interface CustosConfig {
  produtoPct: number;   // custo do produto (% do faturamento)
  impostoPct: number;   // imposto (%)
  gatewayPct: number;   // taxa do gateway/checkout (%)
  custoFixo: number;    // custo fixo por venda (R$)
}
export const DEFAULT_CUSTOS: CustosConfig = { produtoPct: 0, impostoPct: 0, gatewayPct: 0, custoFixo: 0 };

// Mora em lib/marketing-const.ts (sem dependência de servidor) e é re-exportado
// aqui pra quem já importava daqui não quebrar. Client component deve importar
// de "@/lib/marketing-const" — importar daqui arrasta o supabase/server junto.
export { IMPOSTO_GASTO_PCT } from "./marketing-const";

// Metas do tráfego (Fase 1 do cockpit) — usadas na barra de meta + saúde + alertas.
export interface MetasConfig {
  roas: number;         // ROAS-alvo (ex.: 3 = 300%)
  cpa: number;          // CPA-alvo (R$ por venda) · 0 = sem meta
  faturamento: number;  // meta de faturamento no período (R$) · 0 = sem meta
  lucro: number;        // meta de lucro no período (R$) · 0 = sem meta
  investimento: number; // teto/meta de investimento no período (R$) · 0 = sem meta
  vendas: number;       // meta de nº de vendas no período · 0 = sem meta
  margem: number;       // meta de margem (%) · 0 = sem meta
}
export const DEFAULT_METAS: MetasConfig = { roas: 0, cpa: 0, faturamento: 0, lucro: 0, investimento: 0, vendas: 0, margem: 0 };

export interface MarketingConfig {
  teto: number;                          // teto de gasto mensal em tráfego (R$)
  contas: Record<string, ContaTipo>;     // account_id → tipo
  tagLabels: Record<string, string>;     // tag crua ({SM-8660}) → nome amigável
  custos: CustosConfig;                  // p/ calcular lucro líquido real
  metas: MetasConfig;                    // metas do cockpit (ROAS/CPA/faturamento/lucro)
  regras: Regra[];                       // regras/alertas automáticos do tráfego
  fonteTrafego?: string;                 // (legado) loja Yampi de tráfego — hoje vive em `fontes`
  fontes?: Record<string, FonteTipo>;    // origem da venda → como ela conta (ver FonteTipo)
  classificacao?: RegraClassificacao[];  // regras por produto/categoria/origem/UTM (mandam mais que `fontes`)
  comercialFonte?: ComercialFonte;       // de onde vem o faturamento do Comercial
  pecas?: PecaCategoria[];               // quais produtos contar nos cards de peça (ordem importa)
  comissoes?: ComissaoGestor[];          // acordos de comissão dos gestores de tráfego
  marketplaceGestor?: AcordoMarketplace; // quem cuida dos marketplaces e quanto ganha (% do bruto)
}

// Comissão do gestor: o tipo e a conta moram em `lib/comissao-gestor.ts` (puro,
// sem servidor) porque o card do painel é client component. Aqui só o guarda.
export type { ComissaoGestor } from "./comissao-gestor";

// Como cada venda entra nos números.
//   trafego     = faturamento do TRÁFEGO PAGO (e também no total da empresa)
//   comercial   = venda do time comercial (entra no total da empresa, fora do tráfego)
//   organico    = entra no total da empresa, fora do tráfego
//   marketplace = venda de marketplace (Shopee, Mercado Livre, etc.) — entra no total da empresa, fora do tráfego
//   ignorar     = não entra em nenhum total
export type FonteTipo = "trafego" | "comercial" | "organico" | "marketplace" | "ignorar";

// De onde sai o "Comercial" do total da empresa. Existe pra NÃO contar duas
// vezes: só uma das fontes vale por vez.
//   erp      = pedidos do ERP com responsavel_id preenchido (padrão) — o pedido
//              tem uma vendedora do comercial atribuída, direto no ERP, sem
//              depender de lançamento manual. Também passa a decidir o tipo da
//              ORIGEM (tráfego × comercial): pedido com responsável vira
//              Comercial e sai do total do Tráfego, evitando contar 2x.
//   planilha = legado (vendas lançadas manualmente pelas vendedoras)
//   regras   = soma dos pedidos que caírem em "comercial" pelas regras/origens
export type ComercialFonte = "erp" | "planilha" | "regras";

// Regra de classificação. A primeira que casar decide; sem nenhuma, vale o tipo
// da ORIGEM (tela de Fontes). É isso que permite "produto X é sempre comercial"
// ou "tudo que vier com utm=black é tráfego".
export interface RegraClassificacao {
  id: string;
  campo: "produto" | "categoria" | "origem" | "utm";
  operador: "igual" | "contem";
  valor: string;
  tipo: FonteTipo;
  ativa: boolean;
}

// ── Peças que a pessoa quer acompanhar ───────────────────────────────────────
// Quais PRODUTOS contar nos cards de peça (hoje o da Vega). É lista ORDENADA:
// a primeira que casar decide, porque os nomes se contêm — "Carimbo de Cera -
// Sinete" e "Carimbo Decorativo" ambos têm "carimbo", então Sinete precisa vir
// antes de Carimbo, e Carimbo precisa excluir "decorativo". Item que não casa
// com nenhuma some da conta (é o que se quer: tinta, almofada, etiqueta…).
export interface PecaCategoria {
  id: string;
  label: string;
  padroes: string[];   // casa se o nome do item CONTÉM qualquer um destes
  exceto?: string[];   // …e não contiver nenhum destes
  ativa: boolean;
  /**
   * Quantas LINHAS do ERP formam UMA unidade vendida. Padrão 1.
   *
   * O "KIT 4 PALAVRAS AFETIVAS" (produto_id 293) não entra como uma linha de
   * quantidade 4: o ERP explode o kit em 4 linhas, uma por palavra escolhida
   * (`opcao_nome` = Fé, Sorte, Sucesso…), cada uma a R$ 9,47 — um quarto dos
   * R$ 37,88 do kit. Contando linha a linha, 2 kits viravam "8 vendidos" no
   * card. Medido em 60 dias de pedidos da Yampi: 14 pedidos com o kit, TODOS
   * com exatamente 4 linhas, nunca outro número.
   */
  linhasPorUnidade?: number;
}

// Padrão medido nos nomes reais do ERP (jul/26). Do mais específico pro mais
// genérico — mexer na ordem muda quem ganha o item.
export const DEFAULT_PECAS: PecaCategoria[] = [
  { id: "sinete", label: "Sinete", padroes: ["sinete"], ativa: true },
  { id: "letreiro3d", label: "Letreiro 3D", padroes: ["letreiro"], ativa: true },
  { id: "tridiclean", label: "TridiClean", padroes: ["tridi clean", "tridiclean"], ativa: true },
  { id: "palavrasafetivas", label: "Kit Palavras Afetivas", padroes: ["palavras afetivas"], ativa: true, linhasPorUnidade: 4 },
  { id: "chancela", label: "Chancelas", padroes: ["chancela"], ativa: true },
  // "decorativo" fora: é complementar/brinde do combo e polui a contagem.
  { id: "carimbo", label: "Carimbos", padroes: ["carimbo"], exceto: ["decorativo"], ativa: true },
];

// Completa `linhasPorUnidade` a partir do padrão de mesmo id (ver leitura).
const comPadraoDeUnidade = (c: PecaCategoria): PecaCategoria =>
  c && c.linhasPorUnidade === undefined
    ? { ...c, linhasPorUnidade: DEFAULT_PECAS.find((d) => d.id === c.id)?.linhasPorUnidade }
    : c;

/** Quantas linhas do ERP formam uma unidade vendida desta peça (mínimo 1). */
export const linhasPorUnidade = (c: PecaCategoria): number =>
  Math.max(1, Math.round(Number(c?.linhasPorUnidade) || 1));

/** Em qual peça este item cai (id), ou null se não é peça que se acompanha. */
export function classificarPeca(nome: string | null | undefined, cats: PecaCategoria[]): string | null {
  const n = normalizarTexto(nome);
  if (!n) return null;
  for (const c of cats) {
    if (!c || c.ativa === false || !Array.isArray(c.padroes)) continue;
    if (c.exceto?.some((e) => e && n.includes(normalizarTexto(e)))) continue;
    if (c.padroes.some((p) => p && n.includes(normalizarTexto(p)))) return c.id;
  }
  return null;
}

// Normaliza pra comparar sem sofrer com acento/caixa/espaço.
export const normalizarTexto = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Decide o tipo de UMA venda pelas regras. `campos` traz o que a venda tem:
// produtos e categorias podem ser vários (um pedido tem N itens).
export function tipoPorRegras(
  regras: RegraClassificacao[] | undefined,
  campos: { produtos?: string[]; categorias?: string[]; origem?: string; utm?: string | null },
): FonteTipo | null {
  for (const r of regras ?? []) {
    if (!r.ativa || !r.valor) continue;
    const alvo = normalizarTexto(r.valor);
    const valores =
      r.campo === "produto" ? (campos.produtos ?? [])
      : r.campo === "categoria" ? (campos.categorias ?? [])
      : r.campo === "origem" ? [campos.origem ?? ""]
      : [campos.utm ?? ""];
    const casou = valores.some((v) => {
      const n = normalizarTexto(v);
      return r.operador === "igual" ? n === alvo : n.includes(alvo);
    });
    if (casou) return r.tipo;
  }
  return null;
}

// Chave de uma origem. A Yampi é por LOJA (a mesma plataforma tem loja de
// tráfego e loja orgânica); as demais plataformas são a própria plataforma.
export const chaveLojaYampi = (loja: string) => `yampi:${(loja || "").trim().toLowerCase()}`;
export const chavePlataforma = (id: number) => `plat:${id}`;

// Loja Yampi de tráfego padrão (o usuário pode trocar na config Fonte das vendas).
export const FONTE_TRAFEGO_PADRAO = "Carimbos Tridi";

export const DEFAULT_MARKETING_CONFIG: MarketingConfig = { teto: 0, contas: {}, tagLabels: {}, custos: { ...DEFAULT_CUSTOS }, metas: { ...DEFAULT_METAS }, regras: [], fonteTrafego: FONTE_TRAFEGO_PADRAO };

/**
 * Um minuto de cache, e uma resposta por requisição.
 *
 * A configuração de marketing é lida pelo Tráfego, pela comissão do gestor e
 * pela folha do Financeiro — várias vezes na mesma tela, para uma linha que
 * muda uma vez por semana. Cada leitura custava uma ida ao Supabase
 * (250–700 ms daqui). Quem escreve chama `esquecerMarketingConfig()`.
 */
export const getMarketingConfig = cache((): Promise<MarketingConfig> =>
  cached("marketing:config", 60_000, lerMarketingConfig));

export function esquecerMarketingConfig() {
  invalidate("marketing:config");
}

async function lerMarketingConfig(): Promise<MarketingConfig> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("marketing_config").select("data").eq("id", 1).maybeSingle();
    const d = (data?.data as Partial<MarketingConfig>) || {};
    const c = (d.custos as Partial<CustosConfig>) || {};
    const m = (d.metas as Partial<MetasConfig>) || {};
    return {
      teto: typeof d.teto === "number" ? d.teto : 0,
      contas: (d.contas as Record<string, ContaTipo>) || {},
      tagLabels: (d.tagLabels as Record<string, string>) || {},
      custos: {
        produtoPct: Number(c.produtoPct) || 0, impostoPct: Number(c.impostoPct) || 0,
        gatewayPct: Number(c.gatewayPct) || 0, custoFixo: Number(c.custoFixo) || 0,
      },
      metas: {
        roas: Number(m.roas) || 0, cpa: Number(m.cpa) || 0,
        faturamento: Number(m.faturamento) || 0, lucro: Number(m.lucro) || 0,
        investimento: Number(m.investimento) || 0, vendas: Number(m.vendas) || 0, margem: Number(m.margem) || 0,
      },
      regras: Array.isArray(d.regras) ? (d.regras as Regra[]) : [],
      // fonteTrafego e fontes ficavam de fora da leitura: o seletor "Fonte das
      // vendas" salvava e a leitura devolvia sempre o padrão, então trocar a
      // loja não mudava número nenhum.
      fonteTrafego: typeof d.fonteTrafego === "string" && d.fonteTrafego ? d.fonteTrafego : FONTE_TRAFEGO_PADRAO,
      fontes: (d.fontes as Record<string, FonteTipo>) || {},
      classificacao: Array.isArray(d.classificacao) ? (d.classificacao as RegraClassificacao[]) : [],
      // "erp" (pedidos.responsavel_id) foi tentado e revertido: o campo marca
      // todo pedido que uma vendedora TOCOU (suporte/ajuste/upsell), não só o
      // que ela ORIGINOU — mediu 743 pedidos/R$190mil em julho/26 contra os
      // R$89mil reais da planilha, mais que o dobro. Até ter um critério
      // melhor (histórico do pedido), a planilha volta a ser o padrão.
      comercialFonte: d.comercialFonte === "regras" ? "regras" : d.comercialFonte === "erp" ? "erp" : "planilha",
      // Só cai no padrão quem NUNCA configurou: lista vazia salva é escolha
      // ("não quero acompanhar peça nenhuma"), não ausência de config.
      // `linhasPorUnidade` nasceu depois das configs já salvas: sem o merge por
      // id, uma config gravada antes dele voltaria a contar o kit de 4 palavras
      // como 4 unidades. Quem gravou o campo manda; quem não gravou herda o
      // padrão da peça de mesmo id.
      pecas: Array.isArray(d.pecas) ? (d.pecas as PecaCategoria[]).map(comPadraoDeUnidade) : DEFAULT_PECAS,
      // `undefined` (nunca configurou) é diferente de lista vazia (configurou
      // que ninguém recebe) — quem decide o que fazer com cada caso é o
      // `comissoesEfetivas`, então a leitura preserva a diferença.
      comissoes: Array.isArray(d.comissoes) ? normalizarComissoes(d.comissoes) : undefined,
      // Ausente = acordo vazio (ninguém recebe). Não há "legado" a preservar.
      marketplaceGestor: normalizarAcordoMarketplace(d.marketplaceGestor),
    };
  } catch {
    return { ...DEFAULT_MARKETING_CONFIG };
  }
}

// Salva o mapa de origens (fonte → tráfego/comercial/orgânico/ignorar).
export async function setFontes(fontes: Record<string, FonteTipo>): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, fontes });
}

// Salva as regras de classificação (produto/categoria/origem/UTM).
export async function setClassificacao(classificacao: RegraClassificacao[]): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, classificacao });
}

// Peças acompanhadas nos cards (ordem importa — ver PecaCategoria).
export async function setPecas(pecas: PecaCategoria[]): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, pecas });
}

// De onde vem o Comercial no total da empresa (planilha × regras).
export async function setComercialFonte(comercialFonte: ComercialFonte): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, comercialFonte });
}

// Como uma origem conta, olhando o que foi configurado e caindo num padrão
// quando ainda não houve configuração. O padrão reproduz o comportamento
// atual — quem nunca abrir a tela de Fontes não vê número mudar.
export function tipoDaFonte(
  chave: string,
  fontes: Record<string, FonteTipo> | undefined,
  lojaTrafego: string,
  nomePlataforma?: string | null,
): FonteTipo {
  // MARKETPLACE É A PLATAFORMA DO PEDIDO, e só ela (pedido do dono, 12/09/2026:
  // "puxando pelos pedidos que têm TikTok, Shopee e Mercado Livre como
  // plataforma"). Nenhuma classificação salva tira uma dessas de lá — antes
  // um clique na tela de Fontes mandava o TikTok inteiro pro Comercial ou pro
  // "não contar", e o bônus de quem cuida das contas ia junto sem ninguém ver.
  if (chave.startsWith("plat:") && ehPlataformaMarketplace(Number(chave.slice(5)), nomePlataforma)) return "marketplace";
  const salvo = fontes?.[chave];
  // …e nenhuma outra origem entra lá. A Yampi SEM LOJA (`yampi:`) já foi salva
  // como marketplace por engano e entrou no faturamento das contas e no bônus
  // sem nunca ter vindo de uma. "marketplace" salvo fora das plataformas de
  // marketplace não vale: cai no padrão, como se ninguém tivesse classificado.
  if (salvo && salvo !== "marketplace") return salvo;
  if (chave === chaveLojaYampi(lojaTrafego)) return "trafego";
  if (chave === chavePlataforma(PLAT_VEGA)) return "trafego";
  if (chave === chaveLojaYampi("Carimbos (Organico)")) return "organico";
  return "ignorar";
}

// O id decide hoje (Shopee 3, Mercado Livre 9, TikTok 10 no catálogo do ERP).
// O nome cobre a conta nova que o ERP criar — "TikTok Shop", "Mercado Livre 2"
// — sem esperar alguém lembrar de acrescentar o id aqui.
const NOME_DE_MARKETPLACE = /tik\s*tok|shopee|mercado\s*livre/i;

/** O pedido é de marketplace? Pela PLATAFORMA dele — nada mais decide isso. */
export function ehPlataformaMarketplace(plataformaId: unknown, nome?: string | null): boolean {
  const id = Number(plataformaId);
  if (plataformaId != null && PLATAFORMAS_MARKETPLACE.includes(id)) return true;
  return !!nome && NOME_DE_MARKETPLACE.test(nome);
}

/**
 * O tipo final de UM pedido, na ordem em que as coisas mandam:
 *
 * 1. Plataforma de marketplace → marketplace, sempre. Desde set/2026 esses
 *    pedidos entram no ERP como qualquer outro — etapa 1 e com responsável (o
 *    dono, em todo ML e TikTok). Com o Comercial lido por `responsavel_id`, ou
 *    com uma regra de produto ("carimbo X é comercial"), a venda do TikTok
 *    virava venda de vendedora e sumia do Marketplace.
 * 2. Regra de classificação (produto/categoria/origem/UTM). Uma regra que diga
 *    "marketplace" não põe pedido de outra plataforma lá: é ignorada.
 * 3. Comercial pelo ERP: o pedido tem vendedora e a fonte do Comercial é "erp".
 * 4. O tipo da origem (`tipoDaFonte`).
 */
export function tipoDoPedido(o: {
  marketplace: boolean;
  porRegra: FonteTipo | null;
  comercialPeloResponsavel: boolean;
  tipoDaOrigem: FonteTipo;
}): FonteTipo {
  if (o.marketplace) return "marketplace";
  if (o.porRegra && o.porRegra !== "marketplace") return o.porRegra;
  if (o.comercialPeloResponsavel) return "comercial";
  return o.tipoDaOrigem === "marketplace" ? "ignorar" : o.tipoDaOrigem;
}

/** As plataformas do catálogo do ERP que são MARKETPLACE — a mesma pergunta
 *  que o snapshot faz pedido a pedido, então a aba Marketplaces lista
 *  exatamente o que o total soma. */
export function plataformasMarketplace<T extends { id: number; nome?: string | null }>(plats: T[]): T[] {
  return plats.filter((p) => ehPlataformaMarketplace(p.id, p.nome));
}

/**
 * O que a VENDA de um pedido de marketplace valeu — produto, sem o frete.
 *
 * `preco_total` no ERP é a nota inteira: produto + frete cobrado do cliente.
 * O painel da Shopee, do Mercado Livre e do TikTok reporta o produto. Em
 * agosto/2026 o ML aparecia como R$ 1.621,97 no ERP contra R$ 1.074 no painel
 * dele, e R$ 508,77 daquilo era frete de correio — 47% a mais. Pagar bônus
 * sobre isso é pagar comissão sobre postagem.
 *
 * Mora aqui, ao lado de `tipoDaFonte` e `plataformasMarketplace`, porque quem
 * usa são DOIS lugares (o snapshot que soma o total e a lista que mostra
 * pedido a pedido) e os dois têm que dar o mesmo número. Duas cópias da mesma
 * conta divergem — foi assim que a rampa de cor mudou sozinha depois do paint.
 */
export function vendaDeMarketplace(precoTotal: unknown, freteVenda: unknown): number {
  const total = Number(precoTotal) || 0;
  const frete = Number(freteVenda) || 0;
  return Math.max(0, total - frete);
}

/** plataformas.id da Yampi e da Vega Checkout no ERP. */
export const PLAT_YAMPI = 6;
export const PLAT_VEGA = 8;
/** plataformas.id dos marketplaces no ERP. Nascem como canal MARKETPLACE. */
export const PLAT_SHOPEE = 3;
export const PLAT_MERCADO_LIVRE = 9;
export const PLAT_TIKTOK = 10;
export const PLATAFORMAS_MARKETPLACE: readonly number[] = [PLAT_SHOPEE, PLAT_MERCADO_LIVRE, PLAT_TIKTOK];

// Salva só as regras, preservando o resto da config.
export async function setRegras(regras: Regra[]): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, regras });
}

// Salva só as metas, preservando o resto da config.
export async function setMetas(metas: MetasConfig): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, metas });
}

// Salva os acordos de comissão dos gestores de tráfego.
export async function setComissoes(comissoes: ComissaoGestor[]): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, comissoes: normalizarComissoes(comissoes) });
}

// Salva o acordo do gerenciador dos marketplaces (uma pessoa, % do bruto).
export async function setMarketplaceGestor(acordo: unknown): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, marketplaceGestor: normalizarAcordoMarketplace(acordo) });
}

// Salva só os custos, preservando o resto da config.
export async function setCustos(custos: CustosConfig): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, custos });
}

// Fonte das vendas do tráfego: qual loja (pedidos.qual_yampi) conta como tráfego.
export async function setFonteVendas(fonteTrafego: string): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, fonteTrafego: fonteTrafego || FONTE_TRAFEGO_PADRAO });
}

export async function setMarketingConfig(cfg: MarketingConfig): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("marketing_config").upsert({ id: 1, data: cfg });
  // A leitura é cacheada por um minuto: quem escreve esquece na hora, senão a
  // tela mostra o valor velho depois de salvar.
  if (!error) esquecerMarketingConfig();
  if (error) throw new Error(error.message);
}

// Salva só os nomes amigáveis das tags, preservando o resto da config.
export async function setTagLabels(tagLabels: Record<string, string>): Promise<void> {
  const cur = await getMarketingConfig();
  await setMarketingConfig({ ...cur, tagLabels });
}
