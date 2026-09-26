// ── Design › projetos e arquivos, lidos do ERP ──────────────────────────────
//
// Projeto de Design = pedido do ERP nas etapas de arte (ver lib/design-fluxo.ts).
// Uma leitura só alimenta Visão geral, Projetos, Controle agora, Programações e
// a parte "dos projetos" da Biblioteca — as rotas pedem o mesmo `cached()`, então
// abrir as cinco telas custa UMA ida ao ERP por minuto, não cinco.
//
// Tudo com colunas nomeadas e teto: o fluxo tem ~1.500 pedidos vivos.

import { fetchAllErp, asUrlArray } from "./design";
import { cached } from "./cache";
import { tipoItem } from "./logistica";
import {
  ORDEM_PRIORIDADE, STATUS_DESIGN, COLUNAS_DESIGN,
  ETAPAS_DESIGN, ETAPAS_DEPOIS, colunaDoProjeto, eventosDe, horasNaEtapa, prioridadeDe, statusDoPedido,
  type ColunaDesign, type EventoDesign, type Prioridade, type StatusDesign,
} from "./design-fluxo";

export interface ArquivosProjeto { arteCliente: number; vetorizadas: number; reprovadas: number; logo: boolean; drive: string | null }

export interface ProjetoDesign {
  id: number;
  ref: string;
  cliente: string;
  produto: string;
  tipos: string[];
  itens: number;
  thumb: string | null;
  arquivos: ArquivosProjeto;
  etapaId: number;
  status: StatusDesign;
  coluna: ColunaDesign | null;
  prioridade: Prioridade;
  urgente: boolean;
  emAtraso: boolean;
  parado: boolean;
  responsavelId: string | null;
  responsavel: string | null;
  foto: string | null;
  /** Quando entrou na etapa atual (`data_status`). */
  desde: string | null;
  horasNaEtapa: number;
  criadoEm: string | null;
  iniciadoEm: string | null;
  enviadaEm: string | null;
  naoAprovadoEm: string | null;
  aprovadoEm: string | null;
  atualizadoEm: string | null;
  reaprovado: boolean;
}

export type TipoArquivo = "arte" | "vetorizada" | "reprovada" | "logo";

export interface ArquivoProjeto {
  url: string;
  tipo: TipoArquivo;
  projetoId: number;
  ref: string;
  produto: string;
  quando: string | null;
}

export interface Designer { id: string; nome: string; foto: string | null }

export interface LeituraDesign {
  atualizadoEm: string;
  /** Série diária dos últimos 14 dias: demanda que ENTROU e arte que SAIU. */
  entradas: { dia: string; valor: number }[];
  saidas: { dia: string; valor: number }[];
  projetos: ProjetoDesign[];
  arquivos: ArquivoProjeto[];
  designers: Designer[];
  eventos: EventoDesign[];
}

interface LinhaPedido {
  id: number; id_proprio: string | null; etapa_id: number; urgente: boolean | null; em_atraso: boolean | null;
  designer_id: string | null; responsavel_id: string | null; desenvolvendo_arte: boolean | null;
  desenvolvendo_arte_data: string | null; desenvolvendo_arte_responsavel: string | null;
  data_status: string | null; created_at: string | null; data_arte_enviada: string | null;
  data_nao_aprovado: string | null; data_aprovado: string | null; logo_url: string | null; link_drive: string | null;
  pedido_reaprovado: boolean | null;
}
interface LinhaItem {
  pedido_id: number; nome: string | null; opcao_nome: string | null; imagem_url: string | null;
  imagem_vetorizada: string | null; imagens_reprovados: unknown; artes_carimbos: unknown;
  decorativo: boolean | null; almofada: boolean | null; brinde: boolean | null; rede_social: boolean | null;
}
interface Usuario { user_id: string; nome: string | null; apelido: string | null; foto_url: string | null; setor_id: number | null }

const COLS_PEDIDO = "id,id_proprio,etapa_id,urgente,em_atraso,designer_id,responsavel_id,desenvolvendo_arte,desenvolvendo_arte_data,desenvolvendo_arte_responsavel,data_status,created_at,data_arte_enviada,data_nao_aprovado,data_aprovado,logo_url,link_drive,pedido_reaprovado";
const COLS_ITEM = "pedido_id,nome,opcao_nome,imagem_url,imagem_vetorizada,imagens_reprovados,artes_carimbos,decorativo,almofada,brinde,rede_social";
/** Setor do Design no ERP (`usuarios.setor_id`). */
const SETOR_DESIGN = 3;

/** Conta por dia de São Paulo, nos últimos `dias` (mais antigo primeiro). */
export function serieDiaria(isos: (string | null)[], agora: Date, dias: number): { dia: string; valor: number }[] {
  const chave = (t: number) => new Date(t - 3 * 3_600_000).toISOString().slice(0, 10);
  const mapa = new Map<string, number>();
  for (let i = dias - 1; i >= 0; i--) mapa.set(chave(agora.getTime() - i * 86_400_000), 0);
  for (const iso of isos) {
    if (!iso) continue;
    const k = chave(Date.parse(iso));
    if (mapa.has(k)) mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()].map(([dia, valor]) => ({ dia, valor }));
}

const maisRecente = (...d: (string | null)[]) => d.filter(Boolean).sort().at(-1) ?? null;

export async function lerDesign(agora = new Date()): Promise<LeituraDesign> {
  const tres = new Date(agora.getTime() - 3 * 86_400_000).toISOString();
  const quatorze = new Date(agora.getTime() - 14 * 86_400_000).toISOString();
  const [vivos, saidos, users, entradasRaw, saidasRaw] = await Promise.all([
    fetchAllErp<LinhaPedido>("pedidos",
      `select=${COLS_PEDIDO}&etapa_id=in.(${ETAPAS_DESIGN.join(",")})&arquivado=eq.false&concluido=eq.false&excluido=eq.false&order=data_status.desc.nullslast`, 3000),
    // Finalizado = saiu do Design nos últimos 3 dias (a arte virou produção).
    fetchAllErp<LinhaPedido>("pedidos",
      `select=${COLS_PEDIDO}&etapa_id=in.(${ETAPAS_DEPOIS.join(",")})&data_aprovado=gte.${tres}&order=data_aprovado.desc&limit=400`, 400),
    fetchAllErp<Usuario>("usuarios", "select=user_id,nome,apelido,foto_url,setor_id&atividade=eq.true"),
    // Duas colunas soltas, 14 dias: é o que responde "a fila está crescendo?".
    // Sem elas a conta sairia só dos pedidos VIVOS e esqueceria tudo que já
    // passou — uma entrada por dia que nunca bate com a saída.
    fetchAllErp<{ created_at: string }>("pedidos", `select=created_at&created_at=gte.${quatorze}&excluido=eq.false`, 20000),
    fetchAllErp<{ data_aprovado: string }>("pedidos", `select=data_aprovado&data_aprovado=gte.${quatorze}`, 20000),
  ]);
  const pedidos = [...vivos, ...saidos];

  // Itens em lotes: `in.(…)` com 1.500 ids passa do tamanho de URL.
  const ids = pedidos.map((p) => p.id);
  const lotes: number[][] = [];
  for (let i = 0; i < ids.length; i += 180) lotes.push(ids.slice(i, i + 180));
  const itens = (await Promise.all(lotes.map((l) => fetchAllErp<LinhaItem>("itens_pedidos", `select=${COLS_ITEM}&pedido_id=in.(${l.join(",")})`, 5000)))).flat();
  const itensDe = new Map<number, LinhaItem[]>();
  for (const it of itens) (itensDe.get(it.pedido_id) ?? itensDe.set(it.pedido_id, []).get(it.pedido_id)!).push(it);

  const byId = new Map(users.map((u) => [u.user_id, u]));
  const nome = (id: string | null) => (id ? byId.get(id)?.apelido || byId.get(id)?.nome || null : null);

  const arquivos: ArquivoProjeto[] = [];
  const projetos: ProjetoDesign[] = pedidos.map((p) => {
    const its = itensDe.get(p.id) ?? [];
    const ref = (p.id_proprio || `#${p.id}`).trim();
    const cliente = ref.includes(" - ") ? ref.split(" - ")[0].trim() : ref;
    const tipos = [...new Set(its.map((i) => tipoItem(i)))];
    const produto = its[0] ? (its[0].opcao_nome || its[0].nome || "Item").trim() : "Sem itens";
    let arte = 0, vet = 0, rep = 0, thumb: string | null = null;
    for (const it of its) {
      const nomeIt = (it.opcao_nome || it.nome || "Item").trim();
      const cli = asUrlArray(it.artes_carimbos);
      const artes = cli.length ? cli : it.imagem_url ? [it.imagem_url] : [];
      for (const u of artes) arquivos.push({ url: u, tipo: "arte", projetoId: p.id, ref, produto: nomeIt, quando: p.created_at });
      if (it.imagem_vetorizada) arquivos.push({ url: it.imagem_vetorizada, tipo: "vetorizada", projetoId: p.id, ref, produto: nomeIt, quando: p.data_arte_enviada });
      const reps = asUrlArray(it.imagens_reprovados);
      for (const u of reps) arquivos.push({ url: u, tipo: "reprovada", projetoId: p.id, ref, produto: nomeIt, quando: p.data_nao_aprovado });
      arte += artes.length; vet += it.imagem_vetorizada ? 1 : 0; rep += reps.length;
      thumb ??= it.imagem_vetorizada || artes[0] || null;
    }
    if (p.logo_url) arquivos.push({ url: p.logo_url, tipo: "logo", projetoId: p.id, ref, produto, quando: p.created_at });

    const status = statusDoPedido(p.etapa_id, !!p.desenvolvendo_arte);
    const respId = p.designer_id || p.desenvolvendo_arte_responsavel || null;
    const base = { status, urgente: !!p.urgente, emAtraso: !!p.em_atraso, desde: p.data_status, reaprovado: !!p.pedido_reaprovado };
    const h = horasNaEtapa(p.data_status, agora);
    return {
      id: p.id, ref, cliente, produto, tipos, itens: its.length, thumb,
      arquivos: { arteCliente: arte, vetorizadas: vet, reprovadas: rep, logo: !!p.logo_url, drive: p.link_drive || null },
      etapaId: p.etapa_id, status,
      coluna: colunaDoProjeto(base),
      prioridade: prioridadeDe(base, agora),
      urgente: base.urgente, emAtraso: base.emAtraso,
      parado: prioridadeDe({ ...base, urgente: false, emAtraso: false, reaprovado: false }, agora) === "media",
      responsavelId: respId, responsavel: nome(respId), foto: respId ? byId.get(respId)?.foto_url ?? null : null,
      desde: p.data_status, horasNaEtapa: h,
      criadoEm: p.created_at, iniciadoEm: p.desenvolvendo_arte_data, enviadaEm: p.data_arte_enviada,
      naoAprovadoEm: p.data_nao_aprovado, aprovadoEm: p.data_aprovado,
      atualizadoEm: maisRecente(p.data_status, p.desenvolvendo_arte_data, p.data_arte_enviada, p.data_nao_aprovado, p.data_aprovado),
      reaprovado: base.reaprovado,
    };
  });

  const designers = users.filter((u) => u.setor_id === SETOR_DESIGN)
    .map((u) => ({ id: u.user_id, nome: u.apelido || u.nome || u.user_id.slice(0, 8), foto: u.foto_url }));

  return {
    atualizadoEm: agora.toISOString(),
    entradas: serieDiaria(entradasRaw.map((x) => x.created_at), agora, 14),
    saidas: serieDiaria(saidasRaw.map((x) => x.data_aprovado), agora, 14),
    projetos,
    arquivos: arquivos.sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? "")),
    designers,
    eventos: eventosDe(projetos, new Date(agora.getTime() - 2 * 86_400_000)).slice(0, 200),
  };
}

// ── O que as telas recebem ──────────────────────────────────────────────────
//
// A leitura inteira passa de 1 MB (1.300 projetos com 9 mil arquivos). Nenhuma
// tela precisa disso: a Visão geral quer contagens e as primeiras linhas de
// cada bloco; Projetos quer uma PÁGINA já filtrada. Filtrar e contar acontece
// no servidor, sobre a leitura em cache.

/** O projeto como a lista mostra — sem as datas de cada passo (essas viram eventos). */
export type ProjetoLinha = Omit<ProjetoDesign, "iniciadoEm" | "enviadaEm" | "naoAprovadoEm" | "aprovadoEm" | "criadoEm" | "etapaId" | "responsavelId" | "reaprovado">;

export function linha(p: ProjetoDesign): ProjetoLinha {
  const { iniciadoEm: _a, enviadaEm: _b, naoAprovadoEm: _c, aprovadoEm: _d, criadoEm: _e, etapaId: _f, responsavelId: _g, reaprovado: _h, ...resto } = p;
  return resto;
}

export interface FiltroProjetos { status?: StatusDesign | null; coluna?: ColunaDesign | null; busca?: string | null; responsavel?: string | null; prioridade?: Prioridade | null }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function filtrarProjetos(ps: ProjetoDesign[], f: FiltroProjetos): ProjetoDesign[] {
  const q = f.busca?.trim() ? norm(f.busca.trim()) : null;
  return ps.filter((p) =>
    (!f.status || p.status === f.status) &&
    (!f.coluna || p.coluna === f.coluna) &&
    (!f.prioridade || p.prioridade === f.prioridade) &&
    (!f.responsavel || (f.responsavel === "sem" ? !p.responsavel : p.responsavel === f.responsavel)) &&
    (!q || [p.ref, p.produto, p.responsavel ?? "", ...p.tipos].some((x) => norm(x).includes(q))));
}

/** Mais urgente primeiro; dentro da mesma prioridade, quem está há mais tempo na etapa. */
export function ordenarProjetos(ps: ProjetoDesign[]): ProjetoDesign[] {
  return [...ps].sort((a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade] || b.horasNaEtapa - a.horasNaEtapa);
}

export interface PessoaCarga { nome: string; foto: string | null; criacao: number; ajustes: number; revisao: number; total: number; hoje: number }

export interface ResumoDesign {
  porStatus: Record<StatusDesign, number>;
  porColuna: Record<ColunaDesign, number>;
  urgentes: number;
  parados: number;
  semResponsavel: number;
  aguardandoAprovacao: number;
  artesProntas: number;
  hoje: { enviadas: number; aprovadas: number; ajustes: number; novas: number; iniciadas: number };
  ontem: { enviadas: number; aprovadas: number };
  /** Horas médias entre a demanda chegar e a arte ir pro cliente (artes enviadas hoje). */
  tempoMedioH: number | null;
  /** % aprovadas sobre (aprovadas + ajustes) nos últimos 2 dias. */
  taxaAprovacao: number | null;
  equipe: PessoaCarga[];
  designersAtivos: number;
}

const diaSP = (iso: string) => new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10);

export function resumir(l: LeituraDesign, agora = new Date()): ResumoDesign {
  const ps = l.projetos;
  const porStatus = Object.fromEntries(STATUS_DESIGN.map((s) => [s.chave, 0])) as Record<StatusDesign, number>;
  const porColuna = Object.fromEntries(COLUNAS_DESIGN.map((c) => [c.chave, 0])) as Record<ColunaDesign, number>;
  for (const p of ps) { porStatus[p.status]++; if (p.coluna) porColuna[p.coluna]++; }

  const hojeK = diaSP(agora.toISOString());
  const ontemK = diaSP(new Date(agora.getTime() - 86_400_000).toISOString());
  const conta = (tipo: string, dia: string) => l.eventos.filter((e) => e.tipo === tipo && diaSP(e.quando) === dia).length;

  const enviadasHoje = ps.filter((p) => p.enviadaEm && diaSP(p.enviadaEm) === hojeK && p.criadoEm);
  const tempos = enviadasHoje.map((p) => (Date.parse(p.enviadaEm!) - Date.parse(p.criadoEm!)) / 3_600_000).filter((h) => h >= 0 && h < 24 * 30);
  const apr2 = l.eventos.filter((e) => e.tipo === "aprovado").length;
  const rep2 = l.eventos.filter((e) => e.tipo === "revisao").length;

  const carga = new Map<string, PessoaCarga>();
  for (const p of ps) {
    if (!p.responsavel || !["criacao", "ajustes", "revisao", "nova"].includes(p.status)) continue;
    const c = carga.get(p.responsavel) ?? { nome: p.responsavel, foto: p.foto, criacao: 0, ajustes: 0, revisao: 0, total: 0, hoje: 0 };
    if (p.status === "criacao" || p.status === "nova") c.criacao++;
    else if (p.status === "ajustes") c.ajustes++;
    else c.revisao++;
    c.total++;
    carga.set(p.responsavel, c);
  }
  for (const e of l.eventos) {
    if (e.quem && diaSP(e.quando) === hojeK && (e.tipo === "enviada" || e.tipo === "aprovado")) {
      const c = carga.get(e.quem); if (c) c.hoje++;
    }
  }
  const equipe = [...carga.values()].sort((a, b) => (b.criacao + b.ajustes) - (a.criacao + a.ajustes) || b.total - a.total);

  return {
    porStatus, porColuna,
    urgentes: porColuna.urgentes,
    parados: ps.filter((p) => p.parado).length,
    semResponsavel: ps.filter((p) => !p.responsavel && (p.status === "criacao" || p.status === "ajustes")).length,
    aguardandoAprovacao: porStatus.revisao,
    artesProntas: porStatus.aprovado,
    hoje: { enviadas: conta("enviada", hojeK), aprovadas: conta("aprovado", hojeK), ajustes: conta("revisao", hojeK), novas: conta("criado", hojeK), iniciadas: conta("iniciado", hojeK) },
    ontem: { enviadas: conta("enviada", ontemK), aprovadas: conta("aprovado", ontemK) },
    tempoMedioH: tempos.length ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : null,
    taxaAprovacao: apr2 + rep2 ? Math.round((apr2 / (apr2 + rep2)) * 100) : null,
    equipe,
    designersAtivos: equipe.filter((p) => p.criacao + p.ajustes > 0 || p.hoje > 0).length,
  };
}

/** Uma leitura do ERP por minuto, dividida por todas as telas do Design. */
export const lerDesignEmCache = () => cached("design:projetos", 60_000, () => lerDesign());

/** Tarefa do módulo Atividades lançada pro setor Design (o planejamento). */
export interface TarefaDesign { id: string; tarefa: string; para: string; status: string; prazo: string | null; urgente: boolean; iniciadaAt: string | null; concluidaAt: string | null }
