// ── Visão geral de Atividades: as contas puras ───────────────────────────────
//
// A área Atividades (11/09/2026) tem três abas — Visão geral, Tarefas e
// Calendário — e tudo que elas mostram além do quadro é conta sobre a
// lista que a página já tem. Sem banco, testável.
import { prioridadeDe, type Atividade, type Colaborador, type Prioridade } from "@/lib/atividades-catalog";

const DIA = 86_400_000;
const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const aberta = (a: Pick<Atividade, "status">) => a.status === "pendente" || a.status === "em_andamento";
const fimDe = (a: Pick<Atividade, "concluida_at">) => (a.concluida_at ? Date.parse(a.concluida_at) : NaN);
const concluidaDesde = (a: Pick<Atividade, "status" | "concluida_at">, desde: number) =>
  a.status === "concluida" && fimDe(a) >= desde;

/** A janela da visão: o que está aberto agora + o que fechou nos últimos 7 dias. */
export const naJanela = (a: Atividade, agora = Date.now()) => aberta(a) || concluidaDesde(a, agora - 7 * DIA);

// ── Os quatro números do topo ───────────────────────────────────────────────

export interface Retrato { total: number; concluidas: number; emAndamento: number; pendentes: number }
export interface PainelSemana { agora: Retrato; antes: Retrato }

/**
 * Total = aberto agora + concluído na semana. O "antes" é o MESMO recorte uma
 * semana atrás, remontado pelos carimbos (criada, iniciada, concluída): o que
 * já existia, ainda não tinha fechado e já tinha começado estava "em
 * andamento" naquele instante. Sem isso só dava pra comparar o que é fluxo
 * (concluídas), e "em andamento" e "pendentes" ficariam sem o "vs. semana
 * anterior".
 */
export function painelDaSemana(lista: Atividade[], agora = Date.now()): PainelSemana {
  const t0 = agora - 7 * DIA;
  const ag: Retrato = { total: 0, concluidas: 0, emAndamento: 0, pendentes: 0 };
  const an: Retrato = { total: 0, concluidas: 0, emAndamento: 0, pendentes: 0 };
  for (const a of lista) {
    if (a.status === "em_andamento") ag.emAndamento++;
    else if (a.status === "pendente") ag.pendentes++;
    else if (concluidaDesde(a, t0)) ag.concluidas++;

    if (!(Date.parse(a.created_at) <= t0)) continue;       // não existia ainda
    if (a.status === "concluida") {
      const fim = fimDe(a);
      if (Number.isNaN(fim)) continue;                       // sem carimbo: não dá pra saber
      if (fim <= t0) { if (fim > t0 - 7 * DIA) an.concluidas++; continue; }
    }
    const ini = a.iniciada_at ? Date.parse(a.iniciada_at) : NaN;
    if (ini <= t0) an.emAndamento++; else an.pendentes++;
  }
  ag.total = ag.concluidas + ag.emAndamento + ag.pendentes;
  an.total = an.concluidas + an.emAndamento + an.pendentes;
  return { agora: ag, antes: an };
}

/** Variação em % contra a semana anterior. `null` quando não há base: "+100%"
 *  sobre zero é número que não diz nada. */
export function variacao(atual: number, antes: number): number | null {
  if (antes <= 0) return null;
  return Math.round(((atual - antes) / antes) * 100);
}

/** A mesma janela, por prioridade. */
export function porPrioridade(lista: Atividade[], agora = Date.now()): Record<Prioridade, number> {
  const r: Record<Prioridade, number> = { alta: 0, media: 0, baixa: 0 };
  for (const a of lista) if (naJanela(a, agora)) r[prioridadeDe(a)]++;
  return r;
}

/** A mesma janela, por setor — maior primeiro. */
export function porSetor(lista: Atividade[], setorDe: (a: Atividade) => string | null, agora = Date.now()) {
  const m = new Map<string, number>();
  for (const a of lista) {
    if (!naJanela(a, agora)) continue;
    const s = setorDe(a)?.trim() || "Sem setor";
    m.set(s, (m.get(s) ?? 0) + 1);
  }
  return [...m].map(([setor, n]) => ({ setor, n })).sort((x, y) => y.n - x.n || x.setor.localeCompare(y.setor, "pt-BR"));
}

// ── Atividades recentes ─────────────────────────────────────────────────────

export type FiltroRecentes = "todas" | "em_andamento" | "concluida" | "pendente";

/** Mais nova primeiro, com o filtro de status e a busca (tarefa, detalhe,
 *  pessoa, categoria, produto — sem caixa nem acento). */
export function filtrarRecentes(lista: Atividade[], filtro: FiltroRecentes, busca = ""): Atividade[] {
  const q = norm(busca);
  return lista
    .filter((a) => (filtro === "todas" || a.status === filtro) &&
      (!q || norm(`${a.tarefa} ${a.detalhe ?? ""} ${a.para_nome ?? ""} ${a.categoria} ${a.produto_nome ?? ""}`).includes(q)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

// ── Prazo e calendário ──────────────────────────────────────────────────────

/** Hoje em São Paulo, AAAA-MM-DD. O `prazo` é data sem hora: comparar com o
 *  dia UTC virava "amanhã" às 21h. */
export function hojeSP(agora = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}
export const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** "Hoje", "Amanhã", "Ontem", "Qui, 17/09" ou "17/09/2027"; `atrasado` quando
 *  o dia já passou (quem decide se isso importa é o status). */
export function rotuloDoPrazo(prazo: string | null, hoje: string): { texto: string; atrasado: boolean } | null {
  const p = (prazo || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return null;
  if (p === hoje) return { texto: "Hoje", atrasado: false };
  if (p === somaDias(hoje, 1)) return { texto: "Amanhã", atrasado: false };
  if (p === somaDias(hoje, -1)) return { texto: "Ontem", atrasado: true };
  const dm = `${p.slice(8, 10)}/${p.slice(5, 7)}`;
  const texto = p.slice(0, 4) === hoje.slice(0, 4)
    ? `${SEMANA[new Date(`${p}T12:00:00Z`).getUTCDay()]}, ${dm}`
    : `${dm}/${p.slice(0, 4)}`;
  return { texto, atrasado: p < hoje };
}

export interface DiaDoMes { iso: string; dia: number; doMes: boolean }

/** As semanas do mês (domingo a sábado), completadas com os dias vizinhos. */
export function semanasDoMes(ano: number, mes: number): DiaDoMes[][] {
  const cur = new Date(Date.UTC(ano, mes, 1, 12));
  cur.setUTCDate(1 - cur.getUTCDay());
  const semanas: DiaDoMes[][] = [];
  do {
    const s: DiaDoMes[] = [];
    for (let i = 0; i < 7; i++) {
      s.push({ iso: cur.toISOString().slice(0, 10), dia: cur.getUTCDate(), doMes: cur.getUTCMonth() === mes });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    semanas.push(s);
  } while (cur.getUTCMonth() === mes);
  return semanas;
}

const PESO_PRIORIDADE: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };

/** Atividades por dia de prazo: aberto antes de concluído, Alta antes de Baixa. */
export function porDiaDoPrazo(lista: Atividade[]): Map<string, Atividade[]> {
  const m = new Map<string, Atividade[]>();
  for (const a of lista) {
    const p = (a.prazo || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) continue;
    const g = m.get(p);
    if (g) g.push(a); else m.set(p, [a]);
  }
  for (const g of m.values()) {
    g.sort((x, y) => Number(x.status === "concluida") - Number(y.status === "concluida")
      || PESO_PRIORIDADE[prioridadeDe(x)] - PESO_PRIORIDADE[prioridadeDe(y)]);
  }
  return m;
}

// ── Quem está disponível agora ──────────────────────────────────────────────

/** Pedido do dono (12/09/2026): bolinha ao lado de cada pessoa na Visão
 *  geral. Verde = na empresa e livre; amarelo = com atividade em andamento;
 *  vermelho = não está na empresa (o ponto diz que saiu, foi almoçar ou não
 *  chegou). */
export type Disponibilidade = "disponivel" | "ocupado" | "ausente";
/** O que o ponto sabe agora (lib/ponto.ts › presencaAgora), em listas pra
 *  atravessar a fronteira servidor→cliente. */
export interface PresencaDaEquipe { registrados: string[]; presentes: string[] }
export interface PessoaAgora { id: string; nome: string; fotoUrl: string | null; estado: Disponibilidade; fazendo: string | null; semPonto: boolean }

/** A primeira atividade EM ANDAMENTO de cada pessoa (id → tarefa). */
export function emAndamentoPorPessoa(lista: Atividade[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of lista) if (a.status === "em_andamento" && a.para_id && !m.has(a.para_id)) m.set(a.para_id, a.tarefa);
  return m;
}

/** O estado de uma pessoa. O ponto manda: quem ele diz que está fora é
 *  vermelho mesmo com atividade aberta (ela não está lá pra fazer). Quem não
 *  usa o ponto conta como presente — é o que o sistema inteiro faz (o envio de
 *  atividade só pergunta de quem tem ponto) — e a tela diz "sem ponto". */
export function disponibilidade(id: string, emAndamento: Map<string, string>, presenca: PresencaDaEquipe | null) {
  const semPonto = !presenca || !presenca.registrados.includes(id);
  const presente = semPonto || presenca!.presentes.includes(id);
  const fazendo = emAndamento.get(id) ?? null;
  const estado: Disponibilidade = !presente ? "ausente" : fazendo ? "ocupado" : "disponivel";
  return { estado, fazendo, semPonto };
}

/** As três colunas, nesta ordem — pedido do dono (12/09/2026): "só da
 *  produção, máquinas e logística". Escritório, vendas e sem setor ficam fora. */
export const COLUNAS_DA_EQUIPE = ["Produção", "Máquinas", "Logística"] as const;
export type ColunaDaEquipe = (typeof COLUNAS_DA_EQUIPE)[number];
const ORDEM_ESTADO: Record<Disponibilidade, number> = { disponivel: 0, ocupado: 1, ausente: 2 };

/** A coluna da pessoa, ou null quando ela não é do chão de fábrica. A
 *  Logística vem do setor OU do departamento — a equipe dela está cadastrada
 *  como setor "Produção" / departamento "Logística" (ver setoresDoColaborador).
 *  Máquinas é a especialidade (a faixa do pool); o Preparo fica na Produção. */
export function colunaDaPessoa(c: Colaborador): ColunaDaEquipe | null {
  const s = norm(c.setor), d = norm(c.departamento);
  if (/logist|expedi/.test(s) || /logist|expedi/.test(d)) return "Logística";
  if (!s.includes("produc")) return null;
  if (norm(c.especialidade).includes("maquina") || d.includes("maquina")) return "Máquinas";
  return "Produção";
}

/** A equipe agora: as três colunas sempre (a grade não pula quando uma fica
 *  vazia). Dentro da coluna, livre primeiro — é quem dá pra chamar —, depois
 *  ocupado, depois fora. */
export function equipeAgora(colaboradores: Colaborador[], lista: Atividade[], presenca: PresencaDaEquipe | null) {
  const emAndamento = emAndamentoPorPessoa(lista);
  const grupos = new Map<ColunaDaEquipe, PessoaAgora[]>(COLUNAS_DA_EQUIPE.map((g) => [g, []]));
  for (const c of colaboradores) {
    const g = colunaDaPessoa(c);
    if (g) grupos.get(g)!.push({ id: c.id, nome: c.nome, fotoUrl: c.fotoUrl ?? null, ...disponibilidade(c.id, emAndamento, presenca) });
  }
  return [...grupos].map(([grupo, pessoas]) => {
    pessoas.sort((a, b) => ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado] || a.nome.localeCompare(b.nome, "pt-BR"));
    const contagem: Record<Disponibilidade, number> = { disponivel: 0, ocupado: 0, ausente: 0 };
    for (const p of pessoas) contagem[p.estado]++;
    return { grupo, pessoas, contagem };
  });
}

// ── Ícones ──────────────────────────────────────────────────────────────────

const ICONE_DA_TAREFA: [RegExp, string][] = [
  [/cort/, "scissors"], [/mont|encaix|alavanc/, "tools"], [/limp/, "droplet"], [/pint|tint/, "palette"],
  [/embal|separ|pedido|caixa/, "package"], [/confer|revis|qualid/, "checklist"], [/imprim|etiquet/, "printer"],
  [/grav|laser/, "flame"], [/estoq|repor|insumo/, "building-warehouse"], [/entreg|envi|logist/, "truck"],
  [/post|rede|market/, "speakerphone"], [/manuten|maquin/, "settings"], [/planilh|venda|financ/, "file-text"],
];
export function iconeDaTarefa(tarefa: string): string {
  const t = norm(tarefa);
  return ICONE_DA_TAREFA.find(([re]) => re.test(t))?.[1] ?? "checklist";
}

const ICONE_DA_EQUIPE: [RegExp, string][] = [
  [/produ|maquin/, "building-warehouse"], [/market|trafeg/, "speakerphone"], [/comerc|venda/, "briefcase"],
  [/admin|financ|rh/, "file-text"], [/logist|expedi/, "truck"], [/design|arte/, "palette"], [/estoq|almox/, "package"],
];
export function iconeDaEquipe(setor: string): string {
  const s = norm(setor);
  return ICONE_DA_EQUIPE.find(([re]) => re.test(s))?.[1] ?? "users";
}

// ── Modelos de produção e itens do estoque ──────────────────────────────────

export interface LinhaDeModelo { produto: string; fase: number; tarefa: string; ordem?: number | null }

export interface ItemDaVisao {
  id: string; nome: string; categoria: string | null; hierarquia: string | null;
  imagem_url: string | null; quantidade: number; qtd_minima: number; unidade: string | null;
  /** "Quem faz" do item (Máquinas/Produção/Preparo) — o setor sugerido do "Produzir X". */
  setor_responsavel?: string | null;
}
export type SituacaoDoItem = "sem_estoque" | "no_minimo" | "em_estoque";

/** O selo do cartão: zerado, no mínimo (ou abaixo) ou em estoque. */
export function situacaoDoItem(i: Pick<ItemDaVisao, "quantidade" | "qtd_minima">): SituacaoDoItem {
  if (i.quantidade <= 0) return "sem_estoque";
  if (i.qtd_minima > 0 && i.quantidade <= i.qtd_minima) return "no_minimo";
  return "em_estoque";
}

/** Atividades ABERTAS por item (nome sem caixa nem acento): as que produzem o
 *  item e as da categoria dele — a mesma ligação do pop-up
 *  (lib/atividades-lancador.ts › relacionadasAoItem). Uma atividade conta uma
 *  vez por item, mesmo quando produto e categoria são o mesmo nome. */
export function abertasPorItem(lista: Atividade[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of lista) {
    if (!aberta(a)) continue;
    for (const k of new Set([norm(a.produto_nome), norm(a.categoria)])) {
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return m;
}
export const chaveDoItem = (nome: string) => norm(nome);
