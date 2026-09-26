// ── O quadro das máquinas: a régua ──────────────────────────────────────────
//
// A tela de controle (`MaquinasControle`) mostra um CARTÃO por máquina, com a
// fila dentro. O quadro mostra a mesma fábrica como um kanban de verdade:
//
//   · uma RAIA por máquina (Laser P1, P2, M1, G1…);
//   · três COLUNAS de status — Pendente · Em andamento · Concluído;
//   · o cartão anda nos dois eixos: de status (o trabalho andou) e de raia
//     (a peça mudou de máquina).
//
// Duas fontes caem no mesmo quadro, e é de propósito (pedido do dono):
//
//   · PROGRAMAÇÃO (`maquina_programacoes`) — o corte. Borracha e acrílico nos
//     lasers P, MDF nos G.
//   · ATIVIDADE (`atividades`, faixa "maquinas") — o trabalho de pessoa que
//     roda junto. Vive nas M e nas G.
//
// Ter as duas no mesmo lugar é o que sincroniza: com listas separadas, a
// parede mostrava a máquina livre enquanto a pessoa estava trabalhando nela.
//
// Puro, sem banco: a mesma régua vale na tela e na rota. Se as duas
// divergissem, a tela deixaria arrastar o que o servidor recusa.

export type TipoCartao = "programacao" | "atividade";

/** As três colunas do quadro — o vocabulário da tela, não o do banco. */
export type StatusQuadro = "pendente" | "andamento" | "concluida";

export const STATUS_QUADRO: { chave: StatusQuadro; nome: string; icone: string; cor: string }[] = [
  { chave: "pendente", nome: "Pendente", icone: "hourglass-high", cor: "var(--atencao)" },
  { chave: "andamento", nome: "Em andamento", icone: "player-play", cor: "var(--ok)" },
  { chave: "concluida", nome: "Concluído", icone: "circle-check", cor: "var(--info)" },
];

export interface CartaoQuadro {
  /** Chave do quadro: `programacao:<id>` ou `atividade:<id>` — os ids das duas
   *  tabelas são independentes e poderiam colidir numa lista só. */
  chave: string;
  id: string;
  tipo: TipoCartao;
  titulo: string;
  /** Segunda linha: material do corte, ou a categoria da atividade. */
  detalhe: string | null;
  status: StatusQuadro;
  /** Minutos estimados (0 quando ninguém estimou). */
  minutos: number;
  /** Quem faz — só atividade tem dono. */
  responsavel: string | null;
  urgente: boolean;
  posicao: number;
  /** ISO do início real, quando já começou. */
  iniciadaAt: string | null;
  /** ISO do fim, quando fechou. */
  concluidaAt: string | null;
  /** Minutos já rodando (só faz sentido em andamento). */
  rodandoHaMin: number;
  /** 0–99 enquanto roda: relógio contra estimativa. Nunca 100 — quem diz que
   *  acabou é o operador, não o cronômetro (mesma regra da parede). */
  progressoPct: number;
  /** `false` quando este cartão não combina com o porte da raia em que está
   *  (ver `combinaComPorte`). Não impede nada — só marca. */
  combina: boolean;
}

export interface RaiaQuadro {
  maquinaId: string;
  nome: string;
  porte: string;
  materiais: string | null;
  /** Motivo da parada — `null` quando roda normal. */
  paradaMotivo: string | null;
  pendentes: CartaoQuadro[];
  andamento: CartaoQuadro[];
  concluidas: CartaoQuadro[];
  /** Minutos ainda por rodar nesta raia (pendente + em andamento). */
  minutosPendentes: number;
  /** Minutos que já rodaram hoje (o que fechou). */
  minutosHoje: number;
  feitasHoje: number;
}

export interface Quadro {
  atualizadoEm: string;
  raias: RaiaQuadro[];
  /** O trabalho que ainda não tem máquina: uma raia como as outras. */
  semMaquina: RaiaQuadro;
}

export interface ResumoQuadro {
  pendentes: number;
  andamento: number;
  concluidasHoje: number;
  minutosPendentes: number;
  maquinasParadas: number;
  semMaquina: number;
  foraDoPorte: number;
}

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Este cartão combina com este porte de máquina?
 *
 * A régua veio do dono, e é sobre O QUE cada porte faz:
 *
 *   P → programação de BORRACHA e ACRÍLICO
 *   M → atividade
 *   G → programação de MDF, e atividade
 *
 * É CONSELHO, não trava. O quadro deixa mover pra qualquer raia e marca o
 * cartão que saiu da régua — porque a exceção existe (o laser G corta acrílico
 * numa segunda-feira em que o P quebrou), e um quadro que recusa o gesto na
 * hora do aperto é um quadro que ninguém usa. Quem decide é quem está lá.
 */
export function combinaComPorte(
  porte: string | null | undefined,
  tipo: TipoCartao,
  material: string | null | undefined,
): boolean {
  const p = norm(porte).toUpperCase() || "P";
  const m = norm(material);
  if (tipo === "atividade") return p === "M" || p === "G";
  // Programação sem material declarado não é "fora do lugar": é falta de dado.
  // Marcar em vermelho o que ninguém preencheu ensina a ignorar a marca.
  if (!m) return true;
  const mdf = /mdf|madeir/.test(m);
  const borrachaOuAcrilico = /borrach|acrilic/.test(m);
  if (p === "P") return borrachaOuAcrilico;
  if (p === "G") return mdf;
  return false;              // M é de atividade; corte ali é sempre exceção
}

/** Onde este cartão CABE, na ordem em que a tela deve sugerir. */
export function destinosRecomendados<T extends { maquinaId: string; porte: string }>(
  raias: T[],
  tipo: TipoCartao,
  material: string | null | undefined,
): { combina: T[]; resto: T[] } {
  const combina: T[] = [];
  const resto: T[] = [];
  for (const c of raias) (combinaComPorte(c.porte, tipo, material) ? combina : resto).push(c);
  return { combina, resto };
}

/**
 * A posição de um cartão que chega numa raia: o FIM da fila dela.
 *
 * `max + 1` sobre as posições vivas, nunca `count` — mover um do meio pra fora
 * deixaria o count menor que a última posição, e o próximo nasceria EMPATADO
 * com um existente. Duas posições iguais fazem a coluna embaralhar a cada
 * leitura, porque o desempate vira a ordem de retorno do banco.
 */
export function fimDaColuna(posicoesVivas: Array<number | null | undefined>): number {
  let maior = 0;
  for (const p of posicoesVivas) {
    const n = Math.trunc(Number(p) || 0);
    if (n > maior) maior = n;
  }
  return maior + 1;
}

// ── Mover de status ─────────────────────────────────────────────────────────

/**
 * O que gravar quando o cartão muda de coluna — e a FRASE quando não dá.
 *
 * Pura, e é o coração do gesto: arrastar pra "Em andamento" é o "iniciar" do
 * operador, pra "Concluído" é o "feita", e voltar pra "Pendente" é o desfazer
 * de quem clicou errado. Desfazer existe de propósito: num quadro que só anda
 * pra frente, o erro de arrasto vira dado errado pra sempre — e a pessoa passa
 * a ter medo de tocar no quadro.
 *
 * Concluir direto de "Pendente" é PERMITIDO (carimba início e fim juntos): o
 * operador esquece de marcar o começo o dia inteiro, e exigir a ordem
 * transformaria o esquecimento num trabalho que nunca fecha.
 */
export function patchDeStatus(
  tipo: TipoCartao,
  atual: { status: string | null | undefined; iniciada_at: string | null },
  para: StatusQuadro,
  agora = new Date(),
): { ok: true; patch: Record<string, unknown> } | { ok: false; frase: string } {
  const de = String(atual.status ?? "");
  if (de === "cancelada") {
    return { ok: false, frase: "Este trabalho foi cancelado. Se ele voltou, crie um novo." };
  }
  if (de === "aguardando_material") {
    return { ok: false, frase: "Esta atividade está esperando material — libere o material antes de tocá-la aqui." };
  }
  const iso = agora.toISOString();
  const inicio = atual.iniciada_at ?? iso;

  if (tipo === "programacao") {
    if (para === "pendente") return { ok: true, patch: { status: "fila", iniciada_at: null, concluida_at: null } };
    if (para === "andamento") return { ok: true, patch: { status: "executando", iniciada_at: de === "concluida" ? iso : inicio, concluida_at: null } };
    return { ok: true, patch: { status: "concluida", iniciada_at: inicio, concluida_at: iso } };
  }

  if (para === "pendente") return { ok: true, patch: { status: "pendente", iniciada_at: null, concluida_at: null } };
  if (para === "andamento") return { ok: true, patch: { status: "em_andamento", iniciada_at: de === "concluida" ? iso : inicio, concluida_at: null } };
  return { ok: true, patch: { status: "concluida", iniciada_at: inicio, concluida_at: iso } };
}

/** O status de quadro que uma linha crua tem hoje. `null` = fora do quadro. */
export function statusDaLinha(tipo: TipoCartao, cru: string | null | undefined): StatusQuadro | null {
  const s = String(cru ?? "");
  if (s === "cancelada" || s === "aguardando_material") return null;
  if (s === "concluida") return "concluida";
  if (tipo === "programacao") return s === "executando" ? "andamento" : "pendente";
  return s === "em_andamento" ? "andamento" : "pendente";
}

// ── Montagem ────────────────────────────────────────────────────────────────

export interface LinhaMaquinaQuadro {
  id: string; nome: string; porte: string | null; materiais: string | null;
  parada_motivo: string | null;
}

export interface LinhaProgQuadro {
  id: string; maquina_id: string; referencia: string; material: string | null;
  minutos_estimados: number | null; posicao: number | null; status: string | null;
  iniciada_at: string | null; concluida_at: string | null;
}

export interface LinhaAtividadeQuadro {
  id: string; tarefa: string; categoria: string | null; para_nome: string | null;
  status: string | null; urgente?: boolean | null; tempo_estimado_min: number | null;
  iniciada_at: string | null; concluida_at: string | null;
  maquina_id?: string | null; quadro_posicao?: number | null;
}

/** Dia no fuso de São Paulo (UTC-3), `YYYY-MM-DD`. */
function diaSP(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

const ordenar = (a: CartaoQuadro, b: CartaoQuadro) =>
  // Urgente primeiro, depois a ordem da fila. O id só entra pra não embaralhar
  // quando duas posições empatam.
  Number(b.urgente) - Number(a.urgente) || a.posicao - b.posicao || a.id.localeCompare(b.id);

const maisNovoPrimeiro = (a: CartaoQuadro, b: CartaoQuadro) =>
  String(b.concluidaAt ?? "").localeCompare(String(a.concluidaAt ?? ""));

function medirCorrida(iniciadaAt: string | null, minutos: number, agora: Date) {
  if (!iniciadaAt) return { rodandoHaMin: 0, progressoPct: 0 };
  const rodandoHaMin = Math.max(0, Math.round((agora.getTime() - new Date(iniciadaAt).getTime()) / 60000));
  // Satura em 99: 100% na tela se lê como "acabou", e quem fecha é o operador.
  const progressoPct = minutos > 0 ? Math.min(99, Math.round((rodandoHaMin / minutos) * 100)) : 0;
  return { rodandoHaMin, progressoPct };
}

function daProgramacao(p: LinhaProgQuadro, porte: string | null, agora: Date): CartaoQuadro | null {
  const status = statusDaLinha("programacao", p.status);
  if (!status) return null;
  const minutos = Math.max(0, Math.trunc(Number(p.minutos_estimados) || 0));
  return {
    chave: `programacao:${p.id}`,
    id: p.id,
    tipo: "programacao",
    titulo: p.referencia,
    detalhe: p.material,
    status,
    minutos,
    responsavel: null,
    urgente: false,
    posicao: Math.trunc(Number(p.posicao) || 0),
    iniciadaAt: p.iniciada_at,
    concluidaAt: p.concluida_at,
    ...(status === "andamento" ? medirCorrida(p.iniciada_at, minutos, agora) : { rodandoHaMin: 0, progressoPct: 0 }),
    // Sem raia não há porte pra contrariar: no monte "sem máquina" nada está
    // fora do lugar — está justamente esperando um.
    combina: porte === null || combinaComPorte(porte, "programacao", p.material),
  };
}

function daAtividade(a: LinhaAtividadeQuadro, porte: string | null, agora: Date): CartaoQuadro | null {
  const status = statusDaLinha("atividade", a.status);
  if (!status) return null;
  const minutos = Math.max(0, Math.trunc(Number(a.tempo_estimado_min) || 0));
  return {
    chave: `atividade:${a.id}`,
    id: a.id,
    tipo: "atividade",
    titulo: a.tarefa,
    detalhe: a.categoria,
    status,
    minutos,
    responsavel: a.para_nome,
    urgente: a.urgente === true,
    posicao: Math.trunc(Number(a.quadro_posicao) || 0),
    iniciadaAt: a.iniciada_at,
    concluidaAt: a.concluida_at,
    ...(status === "andamento" ? medirCorrida(a.iniciada_at, minutos, agora) : { rodandoHaMin: 0, progressoPct: 0 }),
    combina: porte === null || combinaComPorte(porte, "atividade", null),
  };
}

/** A raia "sem máquina" é uma raia como as outras — só não tem máquina. */
export const SEM_MAQUINA = "__sem__";

function montarRaia(
  id: string, nome: string, porte: string, materiais: string | null, paradaMotivo: string | null,
  cartoes: CartaoQuadro[], hoje: string,
): RaiaQuadro {
  const pendentes = cartoes.filter((c) => c.status === "pendente").sort(ordenar);
  const andamento = cartoes.filter((c) => c.status === "andamento").sort(ordenar);
  // Concluído mostra só o DIA. Um quadro que acumula o feito vira arquivo
  // morto antes do almoço — e a coluna some de tão longa.
  const concluidas = cartoes
    .filter((c) => c.status === "concluida" && c.concluidaAt && diaSP(c.concluidaAt) === hoje)
    .sort(maisNovoPrimeiro);
  return {
    maquinaId: id, nome, porte, materiais, paradaMotivo,
    pendentes, andamento, concluidas,
    minutosPendentes: [...pendentes, ...andamento].reduce((s, c) => s + c.minutos, 0),
    minutosHoje: concluidas.reduce((s, c) => s + c.minutos, 0),
    feitasHoje: concluidas.length,
  };
}

/**
 * O quadro inteiro. Recebe as linhas cruas das TRÊS tabelas e devolve as raias
 * prontas, cada uma já separada nas três colunas de status.
 */
export function montarQuadro(
  maquinas: LinhaMaquinaQuadro[],
  programacoes: LinhaProgQuadro[],
  atividades: LinhaAtividadeQuadro[],
  agora = new Date(),
): Quadro {
  const hoje = diaSP(agora);

  const raias = maquinas.map((m) => {
    const porte = (m.porte || "P").toUpperCase();
    const cartoes = [
      ...programacoes.filter((p) => p.maquina_id === m.id).map((p) => daProgramacao(p, porte, agora)),
      ...atividades.filter((a) => a.maquina_id === m.id).map((a) => daAtividade(a, porte, agora)),
    ].filter((c): c is CartaoQuadro => !!c);
    return montarRaia(m.id, m.nome, porte, m.materiais, m.parada_motivo, cartoes, hoje);
  });

  const conhecidas = new Set(maquinas.map((m) => m.id));
  const soltos = [
    // Programação órfã (a máquina foi desativada) volta pro monte em vez de
    // sumir: trabalho que some é trabalho que ninguém faz.
    ...programacoes.filter((p) => !conhecidas.has(p.maquina_id)).map((p) => daProgramacao(p, null, agora)),
    ...atividades.filter((a) => !a.maquina_id).map((a) => daAtividade(a, null, agora)),
  ].filter((c): c is CartaoQuadro => !!c);

  return {
    atualizadoEm: agora.toISOString(),
    raias,
    semMaquina: montarRaia(SEM_MAQUINA, "Sem máquina", "—", "Trabalho que ainda não tem lugar", null, soltos, hoje),
  };
}

/** Os números do topo do quadro. */
export function resumoDoQuadro(q: Quadro): ResumoQuadro {
  const todas = [...q.raias, q.semMaquina];
  const conta = (f: (r: RaiaQuadro) => number) => todas.reduce((s, r) => s + f(r), 0);
  return {
    pendentes: conta((r) => r.pendentes.length),
    andamento: conta((r) => r.andamento.length),
    concluidasHoje: conta((r) => r.concluidas.length),
    minutosPendentes: conta((r) => r.minutosPendentes),
    maquinasParadas: q.raias.filter((r) => !!r.paradaMotivo).length,
    semMaquina: q.semMaquina.pendentes.length + q.semMaquina.andamento.length,
    foraDoPorte: conta((r) => [...r.pendentes, ...r.andamento].filter((c) => !c.combina).length),
  };
}

/** Os cartões de uma raia numa coluna. */
export function cartoesDa(raia: RaiaQuadro, status: StatusQuadro): CartaoQuadro[] {
  return status === "pendente" ? raia.pendentes : status === "andamento" ? raia.andamento : raia.concluidas;
}

/** Frase curta de minutos, pro rodapé do cartão. */
export function duracao(min: number): string {
  const m = Math.max(0, Math.trunc(min));
  if (!m) return "sem estimativa";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

/** Hora local (SP) de um ISO — `14:32`. */
export function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ── Filtros ─────────────────────────────────────────────────────────────────

export interface FiltroQuadro {
  /** "todos" ou o porte da máquina (P / M / G / …). */
  porte: string;
  /** "todos" | "programacao" | "atividade". */
  tipo: string;
  /** Texto livre: casa com título, detalhe e responsável. */
  busca: string;
  /** Só o que fura a fila. */
  soUrgentes: boolean;
}

export const FILTRO_VAZIO: FiltroQuadro = { porte: "todos", tipo: "todos", busca: "", soUrgentes: false };

/**
 * O quadro filtrado. A raia SOME quando o porte não bate; quando some por
 * busca, ela fica — vazia — porque um quadro que muda de tamanho a cada letra
 * digitada faz o cartão fugir de baixo do cursor.
 */
export function filtrarQuadro(q: Quadro, f: FiltroQuadro): Quadro {
  const busca = norm(f.busca);
  const passa = (c: CartaoQuadro) => {
    if (f.tipo !== "todos" && c.tipo !== f.tipo) return false;
    if (f.soUrgentes && !c.urgente) return false;
    if (!busca) return true;
    return norm(`${c.titulo} ${c.detalhe ?? ""} ${c.responsavel ?? ""}`).includes(busca);
  };
  const raia = (r: RaiaQuadro): RaiaQuadro => ({
    ...r,
    pendentes: r.pendentes.filter(passa),
    andamento: r.andamento.filter(passa),
    concluidas: r.concluidas.filter(passa),
  });
  const porPorte = (r: RaiaQuadro) => f.porte === "todos" || r.porte.toUpperCase() === f.porte.toUpperCase();
  return {
    atualizadoEm: q.atualizadoEm,
    raias: q.raias.filter(porPorte).map(raia),
    semMaquina: raia(q.semMaquina),
  };
}
