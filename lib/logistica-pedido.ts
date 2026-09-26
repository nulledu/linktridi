// Linha do tempo de UM pedido — só para o card aberto.
//
// Nunca entra no snapshot da lista: a lista recarrega a cada 60s e tem até 200
// pedidos por etapa, então embutir isso ali seria uma consulta de histórico por
// pedido por tick — exatamente o padrão de egress que o CLAUDE.md proíbe. Aqui
// é sob demanda, uma vez, quando alguém abre o pedido.
//
// A fonte é `historicos_pedidos`, o log do ERP escrito para humano:
//   "**Fulano** alterou etapa do pedido para **2** (arte enviada)"
//   "**Fulano** adicionou **11** no campo **etapa_id**."
// Por isso tem leitura de texto: é o formato que existe, não uma escolha.

import { tipoItem } from "@/lib/logistica";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON = process.env.LEGACY_ANON_KEY || "";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

export interface MarcoPedido {
  em: string;               // ISO
  titulo: string;
  quem: string | null;
  etapa: number | null;     // quando o marco é uma troca de etapa
}
export interface TimelinePedido {
  pedido: number;
  marcos: MarcoPedido[];
  etapaAtual: number | null;
  desdeEtapaAtual: string | null;  // quando entrou na etapa em que está
  horasNaEtapa: number | null;
}

// Dados do pedido para quem chega pela BUSCA DE CAIXA. Ali o pedido pode já ter
// sido despachado há meses, então ele não está em nenhuma das listas da tela e
// não existe `LogiPedido` para ele — o card precisa se virar só com o id.
export interface DadosPedido {
  id: number;
  idProprio: string | null;
  nome: string | null;
  contato: string | null;
  etapa: number | null;
  etapaNome: string;
  caixa: string | null;
  urgente: boolean;
  criadoEm: string | null;
  dataAprovado: string | null;
  dataEnvio: string | null;
  itens: Array<{ nome: string; tipo: string; imagem: string | null; vetor: string | null }>;
}

export interface DetalhePedido extends TimelinePedido {
  dados: DadosPedido | null;   // null se o ERP não devolveu o pedido
}

const semNegrito = (s: string) => String(s ?? "").replace(/\*\*/g, "");
const quemFez = (t: string): string | null =>
  (t.match(/^(.+?)\s+(?:adicionou|alterou|cadastrou|removeu|definiu)/) ?? [])[1]?.trim() || null;

// Nome legível das etapas do ERP — o número sozinho não diz nada para quem lê.
export const ETAPAS: Record<number, string> = {
  1: "Novo pedido", 2: "Arte enviada", 3: "Arte aprovada", 4: "Em produção",
  5: "Produção concluída", 6: "Conferência", 7: "Acabamento", 8: "Embalagem",
  9: "Aguardando", 10: "Entrada Logística", 11: "Logística", 12: "Enviado",
};
export const nomeEtapa = (n: number | null): string =>
  n == null ? "—" : (ETAPAS[n] ?? `Etapa ${n}`);

// As frases que o ERP usa para trocar de etapa. Repare que em duas delas o
// NÚMERO VEM ANTES do nome do campo ("adicionou 11 no campo etapa_id") e numa
// vem depois ("alterou etapa do pedido para 2") — procurar sempre depois não
// acha nada. Este é o único lugar que lê esse formato; quem precisar da etapa
// de uma linha do log chama aqui.
export function etapaDaLinha(texto: string): number | null {
  const m = texto.match(/alterou etapa do pedido para\s*(\d+)/i)
    ?? texto.match(/adicionou\s*(\d+)\s*no campo etapa_id/i)
    ?? texto.match(/alterou o campo etapa_id de\s*\d+\s*para\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

// Campos cujo preenchimento vale como marco na vida do pedido. O log tem
// centenas de linhas por pedido (cada campo do cadastro vira uma); listar tudo
// seria o "bagulho gigante" que já existe na busca de caixa.
const CAMPOS_MARCO: Array<[RegExp, string]> = [
  [/no campo caixa_separadora|definiu caixa separadora|cadastrou a caixa de separação/i, "Caixa separadora definida"],
  [/no campo formulario_copiado/i, "Formulário copiado"],
  [/no campo data_envio/i, "Enviado"],
  [/no campo data_aprovado/i, "Aprovado"],
  [/no campo link_etiqueta|no campo etiqueta_envio/i, "Etiqueta emitida"],
  [/no campo tem_item_faltante_logistica/i, "Conferência de itens da logística"],
  [/no campo imagem_vetorizada|arte vetorizada/i, "Arte vetorizada"],
];

// Caixa liberada volta a "Não definido" — texto, não nulo (mesma regra do
// lib/logistica.ts).
const caixaValida = (v: string | null) =>
  !["", "não definido", "nao definido", "null", "0"].includes(String(v ?? "").trim().toLowerCase());

// Pedido + itens, para o card aberto pela busca de caixa. Colunas nomeadas e
// `.limit()`: `select=*` em `pedidos` arrastaria 120 colunas (CLAUDE.md).
async function dadosDoPedido(pedido: number): Promise<DadosPedido | null> {
  const [pedRes, cliRes, itensRes] = await Promise.all([
    fetch(`${LEGACY_URL}/rest/v1/pedidos?select=id,id_proprio,etapa_id,caixa_separadora,urgente,created_at,data_aprovado,data_envio&id=eq.${pedido}&limit=1`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch(`${LEGACY_URL}/rest/v1/clientes_pedidos?select=nome,first_name,last_name,contato,whatsapp&pedido_id=eq.${pedido}&limit=1`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch(`${LEGACY_URL}/rest/v1/itens_pedidos?select=nome,opcao_nome,imagem_url,imagem_vetorizada,decorativo,almofada,brinde,rede_social&pedido_id=eq.${pedido}&limit=60`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);

  const p = (Array.isArray(pedRes) ? pedRes : [])[0] as {
    id: number; id_proprio: string | null; etapa_id: number | null; caixa_separadora: string | null;
    urgente: boolean | null; created_at: string | null; data_aprovado: string | null; data_envio: string | null;
  } | undefined;
  if (!p) return null;

  const c = (Array.isArray(cliRes) ? cliRes : [])[0] as {
    nome: string | null; first_name: string | null; last_name: string | null;
    contato: string | null; whatsapp: string | null;
  } | undefined;
  const nomeCompleto = (c?.nome || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "").trim();

  type It = { nome: string | null; opcao_nome: string | null; imagem_url: string | null; imagem_vetorizada: string | null;
    decorativo: boolean | null; almofada: boolean | null; brinde: boolean | null; rede_social: boolean | null };

  return {
    id: Number(p.id),
    idProprio: p.id_proprio ? String(p.id_proprio).trim() : null,
    nome: nomeCompleto || null,
    contato: (c?.contato || c?.whatsapp || "").trim() || null,
    etapa: p.etapa_id ?? null,
    etapaNome: nomeEtapa(p.etapa_id ?? null),
    caixa: caixaValida(p.caixa_separadora) ? String(p.caixa_separadora).trim() : null,
    urgente: !!p.urgente,
    criadoEm: p.created_at, dataAprovado: p.data_aprovado, dataEnvio: p.data_envio,
    itens: (Array.isArray(itensRes) ? itensRes : []).map((it: It) => ({
      nome: [it.nome, it.opcao_nome].filter(Boolean).join(" ").trim() || "Item",
      tipo: tipoItem(it),
      imagem: it.imagem_url ? String(it.imagem_url) : null,
      vetor: it.imagem_vetorizada ? String(it.imagem_vetorizada) : null,
    })),
  };
}

// Pedido completo: dados + itens + linha do tempo. É o que a busca de caixa
// abre ao clicar numa passagem.
export async function detalheDoPedido(pedido: number): Promise<DetalhePedido> {
  const [linha, dados] = await Promise.all([
    timelineDoPedido(pedido),
    dadosDoPedido(pedido).catch(() => null),
  ]);
  return { ...linha, dados };
}

export async function timelineDoPedido(pedido: number): Promise<TimelinePedido> {
  const res = await fetch(
    `${LEGACY_URL}/rest/v1/historicos_pedidos?select=created_at,conteudo&pedido_id=eq.${pedido}`
    + `&order=created_at.asc&limit=500`,
    { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`historicos_pedidos ${res.status}`);
  const linhas = (await res.json()) as Array<{ created_at: string; conteudo: string }>;

  const marcos: MarcoPedido[] = [];
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const t = semNegrito(l.conteudo);
    const etapa = etapaDaLinha(t);
    if (etapa != null) {
      // Repetição da mesma etapa (o ERP grava a troca duas vezes, em frases
      // diferentes) não vira dois marcos.
      const ultimo = [...marcos].reverse().find((m) => m.etapa != null);
      if (ultimo?.etapa === etapa) continue;
      marcos.push({ em: l.created_at, titulo: nomeEtapa(etapa), quem: quemFez(t), etapa });
      continue;
    }
    const campo = CAMPOS_MARCO.find(([re]) => re.test(t));
    if (campo) marcos.push({ em: l.created_at, titulo: campo[1], quem: quemFez(t), etapa: null });
  }

  const ultimaEtapa = [...marcos].reverse().find((m) => m.etapa != null) ?? null;
  const desde = ultimaEtapa?.em ?? null;
  return {
    pedido,
    marcos,
    etapaAtual: ultimaEtapa?.etapa ?? null,
    desdeEtapaAtual: desde,
    horasNaEtapa: desde ? Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 36e5)) : null,
  };
}
