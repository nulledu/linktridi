// ── Marketing · Geral · Desempenho dos criativos no tráfego ──────────────────
// De onde vem o número: do ARMAZÉM local (`meta_ad_insights_daily`), o mesmo que
// alimenta o Tridify. A Meta não é banco — esta tela NUNCA chama o Graph, ela lê
// o que o job já sincronizou (ver [[tridify-warehouse]]).
//
// Agrupamento: por NOME do anúncio normalizado (`normalizarNome` de
// lib/criativos.ts), a mesma identidade que o Tridify usa — o mesmo vídeo roda
// em várias campanhas e ganha um ad_id novo a cada duplicação, então ad_id não
// serve como identidade do criativo.
//
// O elo com a produção é o CÓDIGO: se o nome do anúncio contém "JL-001", a linha
// é atribuída àquele criativo cadastrado. É isso que responde "o criativo que o
// Jonathan fez semana passada vendeu quanto?".
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizarNome } from "@/lib/criativos";
import { linhaDoAnuncio, linhaDominante, type LinhaProduto } from "@/lib/marketing-produto";

// Teto de linhas lido do armazém por consulta. Uma linha = anúncio × dia.
const TETO = 20_000;

// `codigoNoNome` e `formatarCodigo` moraram aqui; foram pro módulo de
// constantes (sem next/headers) porque o navegador também precisa ligar nome
// de anúncio a código — o Tridify faz isso na lista, sem ida ao servidor.
// Re-exportados pra quem já importava daqui.
import { codigoNoNome, formatarCodigo } from "@/lib/marketing-criativos-const";
export { codigoNoNome, formatarCodigo };

export interface CriativoDesempenho {
  chave: string;              // nome normalizado
  nome: string;               // nome de exibição (o mais comprido do grupo)
  codigo: string | null;      // código do criativo cadastrado, quando o nome traz
  criativoId: string | null;  // id em marketing_criativos, quando existe cadastro
  editor: string | null;      // editor do cadastro (não da Meta)
  campanhas: string[];
  linha: LinhaProduto | null;   // carimbo · chancela · outro (null = sem marca)
  contaId: string | null;       // conta de anúncios onde mais gastou (a "BM")
  anuncios: number;
  adIds: string[];            // ids na Meta (pros primeiros; a prévia usa o 1º)
  spend: number; impressions: number; clicks: number;
  purchases: number; revenue: number;
  ctr: number;                // %
  cpm: number; cpc: number;
  cpa: number | null;
  roas: number | null;
  // Só o detalhe de UM criativo usa a série; a rota do ranking a descarta pra
  // não mandar 200 × 90 pontos que a tela não desenha.
  serie?: { dia: string; revenue: number; spend: number; impressions: number; clicks: number }[];
}

export interface TotaisDesempenho {
  spend: number; revenue: number; impressions: number; clicks: number; purchases: number;
  ctr: number; cpm: number; cpa: number | null; roas: number | null;
  criativos: number;
}

export interface Desempenho {
  de: string; ate: string;
  totais: TotaisDesempenho;
  criativos: CriativoDesempenho[];
  // Totais e curva POR LINHA DE PRODUTO, somados sobre TODOS os grupos do
  // período — não sobre os N do ranking. É o que deixa o filtro "Chancela"
  // mostrar o número certo mesmo quando o criativo de chancela não entrou no
  // top do ranking.
  porLinha: { linha: LinhaProduto | "sem"; totais: TotaisDesempenho; serie: { dia: string; revenue: number; spend: number; ctr: number }[] }[];
  serie: { dia: string; revenue: number; spend: number; ctr: number }[];
  indisponivel: boolean;      // sem armazém sincronizado no período
}

const div = (a: number, b: number) => (b > 0 ? a / b : 0);

interface Acc {
  chave: string; nome: string; campanhas: Set<string>; ads: Set<string>;
  spend: number; impressions: number; clicks: number; purchases: number; revenue: number;
  dias: Map<string, { revenue: number; spend: number; impressions: number; clicks: number }>;
  linhas: Map<LinhaProduto, number>;   // gasto por linha de produto
  contas: Map<string, number>;         // gasto por conta de anúncios
}

/**
 * Ranking dos criativos por desempenho no período, lido do armazém local.
 * Devolve `indisponivel` quando não há nada sincronizado — a tela avisa em vez
 * de mostrar zero como se fosse resultado real.
 */
export async function desempenhoCriativos(de: string, ate: string, limite = 50): Promise<Desempenho> {
  const vazio: Desempenho = {
    de, ate, criativos: [], serie: [], porLinha: [], indisponivel: true,
    totais: { spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0, ctr: 0, cpm: 0, cpa: null, roas: null, criativos: 0 },
  };

  let linhas: Record<string, unknown>[];
  try {
    const db = createSupabaseAdminClient();
    // Colunas nomeadas e `.limit()` — regra de dados do CLAUDE.md. `ad_name` é o
    // que identifica o criativo; nada de `select("*")` puxando jsonb de actions.
    const { data, error } = await db
      .from("meta_ad_insights_daily")
      .select("date,ad_id,ad_name,campaign_name,ad_account_id,spend,impressions,clicks,purchases_meta,purchase_value_meta")
      .gte("date", de).lte("date", ate)
      .limit(TETO);
    if (error || !data?.length) return vazio;
    linhas = data as Record<string, unknown>[];
    if (linhas.length >= TETO) console.warn(`[marketing-desempenho] leitura truncada em ${TETO} linhas (${de}..${ate}).`);
  } catch { return vazio; }

  const num = (r: Record<string, unknown>, k: string) => Number(r[k]) || 0;
  const grupos = new Map<string, Acc>();
  const linhaDaConta = new Map<string, Map<LinhaProduto, number>>();
  const porDia = new Map<string, { revenue: number; spend: number; impressions: number; clicks: number }>();

  for (const r of linhas) {
    const nome = String(r.ad_name || "").trim();
    if (!nome) continue;
    const chave = normalizarNome(nome);
    if (!chave) continue;
    const dia = String(r.date || "").slice(0, 10);

    let g = grupos.get(chave);
    if (!g) { g = { chave, nome, campanhas: new Set(), ads: new Set(), spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, dias: new Map(), linhas: new Map(), contas: new Map() }; grupos.set(chave, g); }
    // Nome de exibição: o mais completo do grupo (o curto costuma ser corte).
    if (nome.length > g.nome.length) g.nome = nome;
    if (r.campaign_name) g.campanhas.add(String(r.campaign_name));
    if (r.ad_id) g.ads.add(String(r.ad_id));

    const spend = num(r, "spend"), revenue = num(r, "purchase_value_meta");
    const impressions = num(r, "impressions"), clicks = num(r, "clicks");
    g.spend += spend; g.revenue += revenue;
    g.impressions += impressions; g.clicks += clicks;
    g.purchases += num(r, "purchases_meta");
    const d = g.dias.get(dia) || { revenue: 0, spend: 0, impressions: 0, clicks: 0 };
    d.revenue += revenue; d.spend += spend; d.impressions += impressions; d.clicks += clicks;
    g.dias.set(dia, d);

    // Peso da classificação é o GASTO, não a contagem de linhas: um criativo que
    // rodou 30 dias numa campanha {CH} e um dia numa {CRB} é de chancela. O piso
    // de 1 centavo evita que linha zerada decida no empate.
    const peso = spend > 0 ? spend : 0.01;
    const linha = linhaDoAnuncio(r.campaign_name as string, nome);
    if (linha) g.linhas.set(linha, (g.linhas.get(linha) ?? 0) + peso);
    const conta = String(r.ad_account_id || "");
    if (conta) {
      g.contas.set(conta, (g.contas.get(conta) ?? 0) + peso);
      if (linha) {
        let mapaLinha = linhaDaConta.get(conta);
        if (!mapaLinha) { mapaLinha = new Map(); linhaDaConta.set(conta, mapaLinha); }
        mapaLinha.set(linha, (mapaLinha.get(linha) ?? 0) + peso);
      }
    }

    const t = porDia.get(dia) || { revenue: 0, spend: 0, impressions: 0, clicks: 0 };
    t.revenue += revenue; t.spend += spend; t.impressions += impressions; t.clicks += clicks;
    porDia.set(dia, t);
  }
  if (!grupos.size) return vazio;

  // Cadastro: o código dentro do nome do anúncio liga o resultado ao criativo
  // que a equipe registrou. Uma consulta só, filtrada pelos códigos vistos.
  const codigos = new Map<string, string>();     // chave do grupo → "JL-001"
  for (const g of grupos.values()) {
    const c = codigoNoNome(g.nome);
    if (c) codigos.set(g.chave, formatarCodigo(c.prefixo, c.numero));
  }
  const cadastro = await buscarCadastro([...new Set(codigos.values())]);

  // A linha de produto é decidida uma vez por GRUPO e reaproveitada: o ranking
  // mostra só os N maiores, mas o filtro precisa dos totais de TODO mundo.
  const linhaDoGrupo = new Map<string, LinhaProduto | null>();
  for (const g of grupos.values()) linhaDoGrupo.set(g.chave, linhaDominante(g.linhas) ?? herdadaDaConta(g, linhaDaConta));

  const criativos: CriativoDesempenho[] = [...grupos.values()].map((g) => {
    const codigo = codigos.get(g.chave) ?? null;
    const cad = codigo ? cadastro.get(codigo) : undefined;
    return {
      chave: g.chave, nome: g.nome,
      codigo: cad ? codigo : null,               // só marca o código que EXISTE no cadastro
      criativoId: cad?.id ?? null,
      editor: cad?.editorNome ?? null,
      campanhas: [...g.campanhas].slice(0, 6),
      linha: linhaDoGrupo.get(g.chave) ?? null,
      contaId: contaPrincipal(g),
      anuncios: g.ads.size,
      adIds: [...g.ads].slice(0, 5),
      spend: g.spend, impressions: g.impressions, clicks: g.clicks,
      purchases: g.purchases, revenue: g.revenue,
      ctr: div(g.clicks, g.impressions) * 100,
      cpm: div(g.spend, g.impressions) * 1000,
      cpc: div(g.spend, g.clicks),
      cpa: g.purchases > 0 ? g.spend / g.purchases : null,
      roas: g.spend > 0 ? g.revenue / g.spend : null,
      serie: [...g.dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, v]) => ({ dia, ...v })),
    };
  })
    .filter((c) => c.spend > 0 || c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue || b.spend - a.spend)
    .slice(0, limite);

  let spend = 0, revenue = 0, impressions = 0, clicks = 0, purchases = 0;
  for (const g of grupos.values()) { spend += g.spend; revenue += g.revenue; impressions += g.impressions; clicks += g.clicks; purchases += g.purchases; }

  return {
    de, ate,
    criativos,
    porLinha: totaisPorLinha(grupos, linhaDoGrupo),
    indisponivel: false,
    totais: {
      spend, revenue, impressions, clicks, purchases,
      ctr: div(clicks, impressions) * 100,
      cpm: div(spend, impressions) * 1000,
      cpa: purchases > 0 ? spend / purchases : null,
      roas: spend > 0 ? revenue / spend : null,
      criativos: grupos.size,
    },
    serie: [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, v]) => ({
      dia, revenue: v.revenue, spend: v.spend, ctr: div(v.clicks, v.impressions) * 100,
    })),
  };
}

/**
 * Totais + curva de cada linha de produto, sobre TODOS os grupos do período.
 * Sai vazio quando a linha não teve nada — a tela só desenha o chip do que
 * existe.
 */
function totaisPorLinha(
  grupos: Map<string, Acc>,
  linhaDoGrupo: Map<string, LinhaProduto | null>,
): Desempenho["porLinha"] {
  interface B { spend: number; revenue: number; impressions: number; clicks: number; purchases: number; criativos: number; dias: Map<string, { revenue: number; spend: number; impressions: number; clicks: number }> }
  const baldes = new Map<LinhaProduto | "sem", B>();
  for (const g of grupos.values()) {
    if (g.spend <= 0 && g.revenue <= 0) continue;   // mesmo corte do ranking
    const k = linhaDoGrupo.get(g.chave) ?? "sem";
    let b = baldes.get(k);
    if (!b) { b = { spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0, criativos: 0, dias: new Map() }; baldes.set(k, b); }
    b.spend += g.spend; b.revenue += g.revenue; b.impressions += g.impressions;
    b.clicks += g.clicks; b.purchases += g.purchases; b.criativos++;
    for (const [dia, v] of g.dias) {
      const d = b.dias.get(dia) || { revenue: 0, spend: 0, impressions: 0, clicks: 0 };
      d.revenue += v.revenue; d.spend += v.spend; d.impressions += v.impressions; d.clicks += v.clicks;
      b.dias.set(dia, d);
    }
  }
  const ordem: (LinhaProduto | "sem")[] = ["carimbo", "chancela", "outro", "sem"];
  return [...baldes.entries()]
    .sort(([a], [b]) => ordem.indexOf(a) - ordem.indexOf(b))
    .map(([linha, b]) => ({
      linha,
      totais: {
        spend: b.spend, revenue: b.revenue, impressions: b.impressions, clicks: b.clicks, purchases: b.purchases,
        ctr: div(b.clicks, b.impressions) * 100,
        cpm: div(b.spend, b.impressions) * 1000,
        cpa: b.purchases > 0 ? b.spend / b.purchases : null,
        roas: b.spend > 0 ? b.revenue / b.spend : null,
        criativos: b.criativos,
      },
      serie: [...b.dias.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([dia, v]) => ({
        dia, revenue: v.revenue, spend: v.spend, ctr: div(v.clicks, v.impressions) * 100,
      })),
    }));
}

/** Conta onde o criativo mais gastou — é o que a equipe chama de "a BM dele". */
function contaPrincipal(g: Acc): string | null {
  let melhor: string | null = null, maior = 0;
  for (const [conta, peso] of g.contas) if (peso > maior) { maior = peso; melhor = conta; }
  return melhor;
}

/**
 * Anúncio sem tag nenhuma herda a linha da CONTA — mas só quando a conta é
 * homogênea (70% do gasto marcado numa linha só). Conta misturada devolve
 * `null` e o criativo aparece em "Sem marca", que é a verdade.
 */
function herdadaDaConta(g: Acc, porConta: Map<string, Map<LinhaProduto, number>>): LinhaProduto | null {
  const conta = contaPrincipal(g);
  if (!conta) return null;
  const pesos = porConta.get(conta);
  return pesos ? linhaDominante(pesos, 0.7) : null;
}

interface CadastroLeve { id: string; editorNome: string | null }

async function buscarCadastro(codigos: string[]): Promise<Map<string, CadastroLeve>> {
  const out = new Map<string, CadastroLeve>();
  if (!codigos.length) return out;
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db
      .from("marketing_criativos")
      .select("id,codigo,editor_nome")
      .in("codigo", codigos.slice(0, 200))
      .order("created_at", { ascending: false })
      .limit(400);
    if (error || !data) return out;
    // Código repetido (outro ano, variação): fica o mais recente, o primeiro.
    for (const r of data as Record<string, unknown>[]) {
      if (out.has(String(r.codigo))) continue;
      out.set(String(r.codigo), { id: String(r.id), editorNome: (r.editor_nome as string) ?? null });
    }
  } catch { /* sem tabela ainda → sem vínculo, o ranking continua valendo */ }
  return out;
}

/**
 * O anúncio mais RECENTE cujo nome traz o código — é dele que sai a prévia do
 * vídeo. Consulta direta e minúscula (uma coluna, uma linha), em vez de montar
 * o ranking inteiro só pra descobrir um id.
 */
export async function adIdDoCodigo(codigo: string, desde: string): Promise<string | null> {
  const limpo = (codigo || "").replace(/[%,()]/g, "").trim();
  if (!limpo) return null;
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db
      .from("meta_ad_insights_daily")
      .select("ad_id,date")
      .ilike("ad_name", `%${limpo}%`)
      .gte("date", desde)
      .order("date", { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    const id = String(data[0].ad_id ?? "");
    return /^\d{6,}$/.test(id) ? id : null;
  } catch { return null; }
}

/** Desempenho de UM criativo cadastrado (usado na página de detalhe). */
export async function desempenhoDoCodigo(codigo: string, de: string, ate: string): Promise<CriativoDesempenho | null> {
  const d = await desempenhoCriativos(de, ate, 500);
  if (d.indisponivel) return null;
  return d.criativos.find((c) => c.codigo === codigo) ?? null;
}
