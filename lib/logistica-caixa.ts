// Histórico de uma CAIXA SEPARADORA.
//
// As caixas são reaproveitadas: quando o pedido é despachado, o campo
// `caixa_separadora` volta a "Não definido" e a caixa some do pedido. Ou seja,
// olhar os pedidos de hoje responde "o que está na caixa agora", nunca "por
// onde essa caixa andou" — e é essa segunda pergunta que aparece quando um
// pedido some ou dois pedidos se misturam.
//
// A memória disso está em `historicos_pedidos`, o log de alterações do ERP, em
// FRASES escritas para humano:
//   "**Fulano** adicionou **138** no campo **caixa_separadora**."
//   "**Fulano** alterou o campo **caixa_separadora** de **138** para **Não definido**."
//   "Usuário definiu caixa separadora: 138"
// Por isso aqui tem leitura de texto: é o formato que existe, não uma escolha.

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON = process.env.LEGACY_ANON_KEY || "";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

export interface EstadiaCaixa {
  pedido: number;
  pedidoIdProprio: string | null;
  de: string | null;          // quando entrou na caixa
  ate: string | null;         // null = ainda está lá
  dias: number | null;
  colocou: string | null;
  tirou: string | null;
}

export interface HistoricoCaixa {
  numero: string;
  estadias: EstadiaCaixa[];
  ocupadaAgora: EstadiaCaixa | null;
  registros: number;
}

// Fase 1 da busca: "quem está com a caixa AGORA".
//
// A pergunta urgente ("cadê o pedido?") quase sempre se resolve aqui, e esta
// resposta sai de `pedidos.caixa_separadora`, que é consulta indexada e volta em
// milissegundos. O log de texto (fase 2) é que demora — separar as duas é o que
// tira a tela de "espera 8s ou toma timeout" para "responde na hora".
export interface OcupacaoAtual {
  numero: string;
  pedidos: Array<{
    id: number; idProprio: string | null; nome: string | null;
    etapa: number | null; dataAprovado: string | null;
  }>;
}

export async function ocupacaoDaCaixa(numero: string): Promise<OcupacaoAtual> {
  const res = await fetch(
    `${LEGACY_URL}/rest/v1/pedidos?select=id,id_proprio,nome,etapa_id,data_aprovado`
    + `&caixa_separadora=eq.${numero}&arquivado=eq.false&limit=50`,
    { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`pedidos ${res.status}`);
  const dados = await res.json() as Array<{
    id: number; id_proprio: string | null; nome: string | null;
    etapa_id: number | null; data_aprovado: string | null;
  }>;
  return {
    numero,
    pedidos: (Array.isArray(dados) ? dados : []).map((p) => ({
      id: Number(p.id),
      idProprio: p.id_proprio ? String(p.id_proprio).trim() : null,
      nome: p.nome ? String(p.nome).trim() : null,
      etapa: p.etapa_id ?? null,
      dataAprovado: p.data_aprovado ?? null,
    })),
  };
}

type LinhaHistorico = { id: number; created_at: string; pedido_id: number; conteudo: string };

const semNegrito = (s: string) => String(s ?? "").replace(/\*\*/g, "");

// O número precisa estar SOZINHO: sem isso, procurar a caixa 13 casaria com
// 138, 130 e 213 — e o histórico viria com pedidos que nunca estiveram nela.
const mencionaNumero = (texto: string, numero: string) =>
  new RegExp(`(?:^|\\D)${numero}(?:\\D|$)`).test(texto);

const quemFez = (texto: string): string | null =>
  (texto.match(/^(.+?)\s+(?:adicionou|alterou|cadastrou|removeu)/) ?? [])[1]?.trim() || null;

export async function historicoDaCaixa(numero: string): Promise<HistoricoCaixa> {
  // Achar QUAIS pedidos passaram pela caixa, sem varrer a tabela de histórico
  // inteira. Procurar o texto direto (`ilike *138*caixa*`) tem curinga no
  // início, não usa índice nenhum e estoura o statement timeout do ERP — 500
  // em 8s, medido várias vezes. Então: duas listas baratas de CANDIDATOS…
  const [porTexto, ocupandoAgora] = await Promise.all([
    // …o log com a palavra antes do número (esse padrão o índice aguenta), que
    // pega as saídas e os cadastros de caixa;
    candidatosPorTexto(numero),
    // …e quem está com a caixa neste momento, que sai do próprio pedido e é
    // instantâneo. Sem esta segunda, um pedido que entrou e ainda não saiu
    // ficaria de fora do histórico.
    candidatosOcupando(numero),
  ]);

  const pedidos = [...new Set([...porTexto, ...ocupandoAgora])];
  // …e então o histórico COMPLETO de cada candidato, que é consulta por
  // pedido_id: indexada, ~200ms cada, em lotes pra não abrir 60 conexões.
  const linhas = (await emLotes(pedidos, 6, historicoDoPedido))
    .flat()
    .filter((h) => mencionaNumero(semNegrito(h.conteudo), numero) && /caixa/i.test(h.conteudo))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Emparelha entrada e saída por pedido, na ordem do tempo.
  const dentro = new Map<number, { de: string; quem: string | null }>();
  const estadias: EstadiaCaixa[] = [];
  for (const h of linhas) {
    const t = semNegrito(h.conteudo);
    const saiu = new RegExp(`alterou o campo caixa_separadora de\\s*${numero}\\s*para`, "i").test(t);
    const entrou = new RegExp(
      `(adicionou\\s*${numero}\\s*no campo caixa_separadora`
      + `|definiu caixa separadora:\\s*${numero}`
      + `|cadastrou a caixa de separação\\s*"?${numero})`, "i").test(t);

    if (entrou && !dentro.has(h.pedido_id)) {
      dentro.set(h.pedido_id, { de: h.created_at, quem: quemFez(t) });
    } else if (saiu) {
      const abertura = dentro.get(h.pedido_id);
      estadias.push(montar(h.pedido_id, abertura?.de ?? null, h.created_at, abertura?.quem ?? null, quemFez(t)));
      dentro.delete(h.pedido_id);
    }
  }
  // Quem entrou e nunca saiu ainda está na caixa.
  for (const [pedido, aberta] of dentro) {
    estadias.push(montar(pedido, aberta.de, null, aberta.quem, null));
  }

  estadias.sort((a, b) => String(b.de ?? "").localeCompare(String(a.de ?? "")));
  await enriquecerComIdProprio(estadias);

  return {
    numero,
    estadias,
    ocupadaAgora: estadias.find((e) => e.ate === null) ?? null,
    registros: linhas.length,
  };
}

// Categoria 2 = alteração de campo do pedido (é onde caem as frases de caixa).
// Filtrar por ela corta a maior parte da tabela antes do ilike.
const CAT_ALTERACAO = 2;

// Janela de busca. O ERP tem statement timeout de 8s e esta consulta varre
// texto; sem recorte de data ela oscila entre 4s e o timeout, dependendo da
// carga do banco. Um ano cobre a pergunta real ("por onde essa caixa andou")
// e volta em ~3s; se ainda assim estourar, tenta metade.
const JANELAS_DIAS = [365, 180, 90];

async function candidatosPorTexto(numero: string): Promise<number[]> {
  let ultimoErro: unknown = null;
  for (const dias of JANELAS_DIAS) {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
    const url = `${LEGACY_URL}/rest/v1/historicos_pedidos`
      + `?select=pedido_id,conteudo&cat_historico=eq.${CAT_ALTERACAO}`
      + `&created_at=gte.${desde}&conteudo=ilike.*caixa*${numero}*&limit=1000`;
    try {
      const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) { ultimoErro = new Error(`historicos_pedidos ${res.status}`); continue; }
      const dados = await res.json() as Array<{ pedido_id: number; conteudo: string }>;
      // O ilike casa 13 dentro de 130, 138, 1300… Filtrar aqui, antes de abrir
      // uma consulta por pedido, evita dezenas de idas ao banco à toa.
      return [...new Set((Array.isArray(dados) ? dados : [])
        .filter((h) => mencionaNumero(semNegrito(h.conteudo), numero))
        .map((h) => Number(h.pedido_id)))];
    } catch (e) { ultimoErro = e; }
  }
  throw ultimoErro ?? new Error("historicos_pedidos indisponível");
}

async function candidatosOcupando(numero: string): Promise<number[]> {
  try {
    const res = await fetch(
      `${LEGACY_URL}/rest/v1/pedidos?select=id&caixa_separadora=eq.${numero}&limit=200`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    const dados = await res.json() as Array<{ id: number }>;
    return (Array.isArray(dados) ? dados : []).map((p) => Number(p.id));
  } catch { return []; }
}

async function historicoDoPedido(pedido: number): Promise<LinhaHistorico[]> {
  const res = await fetch(
    `${LEGACY_URL}/rest/v1/historicos_pedidos?select=id,created_at,pedido_id,conteudo&pedido_id=eq.${pedido}&limit=500`,
    { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return [];
  const dados = await res.json() as LinhaHistorico[];
  return Array.isArray(dados) ? dados : [];
}

async function emLotes<T, R>(itens: T[], tamanho: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...await Promise.all(itens.slice(i, i + tamanho).map(fn)));
  }
  return saida;
}

function montar(pedido: number, de: string | null, ate: string | null, colocou: string | null, tirou: string | null): EstadiaCaixa {
  const dias = de && ate ? Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 86_400_000) : null;
  return { pedido, pedidoIdProprio: null, de, ate, dias, colocou, tirou };
}

// O número do pedido no marketplace (id_proprio) é como a equipe se refere a
// ele — o id interno não diz nada pra quem procura o pacote.
async function enriquecerComIdProprio(estadias: EstadiaCaixa[]): Promise<void> {
  const ids = [...new Set(estadias.map((e) => e.pedido))];
  if (!ids.length) return;
  try {
    const res = await fetch(
      `${LEGACY_URL}/rest/v1/pedidos?select=id,id_proprio&id=in.(${ids.join(",")})`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return;   // sem o nome bonito o histórico ainda serve
    const pedidos = await res.json() as Array<{ id: number; id_proprio: string | null }>;
    const porId = new Map(pedidos.map((p) => [Number(p.id), p.id_proprio]));
    for (const e of estadias) e.pedidoIdProprio = porId.get(e.pedido) ?? null;
  } catch { /* idem */ }
}
