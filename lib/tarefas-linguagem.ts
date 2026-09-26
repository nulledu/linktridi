// ── O que você escreveu já É a tarefa ────────────────────────────────────────
//
// Medido no caminho mais comum da Central — "ligar pro fornecedor amanhã às 14h,
// urgente" — criar essa tarefa custava SETE interações: digitar, Enter, abrir o
// campo de prazo, abrir o calendário, escolher o dia, escolher a hora, abrir a
// prioridade, escolher. Quatro delas dentro de seletores, depois de a tarefa já
// existir. A pessoa já tinha dito tudo na primeira frase; a interface é que não
// escutou.
//
// Este módulo escuta. Ele lê a frase, tira dela o prazo, a prioridade, a lista e
// as etiquetas, e devolve o título limpo — o que sobra depois de remover o que
// virou campo. Uma interação: Enter.
//
// Duas regras de projeto que valem mais que a cobertura:
//
// 1. **Só reconhece o que é inequívoco.** Não adivinha. "Ver o pedido 15" não
//    vira dia 15 — número solto nunca é data. Errar um prazo em silêncio é pior
//    do que não achar nenhum, porque a pessoa não conferiu o que não pediu.
// 2. **É reversível de graça.** Quem digita vê as fichas do que foi entendido
//    ANTES de apertar Enter (ver a pré-visualização na Central). Um sistema que
//    interpreta sem mostrar o que entendeu não é conveniente, é assustador.
//
// Fuso: o ERP inteiro trabalha na hora de São Paulo (UTC-3) — a hora escrita é
// hora de parede daqui, e o ISO gravado é ela mais 3h.

import type { TarefaPrioridade } from "./tarefas";

export interface Entendido {
  /** O que sobrou depois de tirar o que virou campo. Nunca vazio se havia texto. */
  titulo: string;
  prazo: string | null;
  prioridade: TarefaPrioridade | null;
  lista: string | null;
  tags: string[];
  /** Trechos consumidos, na ordem — a interface mostra o que entendeu. */
  marcas: { campo: "prazo" | "prioridade" | "lista" | "tag"; texto: string }[];
}

const MS_DIA = 86400e3;
const SP = 3 * 3600e3;

/** Dia de parede em SP (YYYY-MM-DD) de um instante. */
function diaSP(ms: number) { return new Date(ms - SP).toISOString().slice(0, 10); }
/** ISO UTC a partir de dia+hora de parede em SP. */
function isoSP(dia: string, hora: string) { return new Date(Date.parse(`${dia}T${hora}:00Z`) + SP).toISOString(); }

const SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
/** Sem acento e em minúscula — "terça" e "TERCA" têm que casar igual. */
const cru = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const PRIOR: Record<string, TarefaPrioridade> = {
  urgente: "urgente", urgencia: "urgente", alta: "alta", media: "media", normal: "media", baixa: "baixa",
};

/**
 * Lê a frase e separa o que é campo do que é título.
 *
 * @param agora instante de referência — parâmetro, e não `Date.now()` direto,
 *   porque "amanhã" só é testável se o hoje puder ser fixado.
 */
export function entender(frase: string, agora: Date = new Date()): Entendido {
  const marcas: Entendido["marcas"] = [];
  let resto = frase;
  const comer = (re: RegExp, campo: Entendido["marcas"][number]["campo"]) => {
    const m = resto.match(re);
    if (!m) return null;
    marcas.push({ campo, texto: m[0].trim() });
    resto = resto.slice(0, m.index).concat(resto.slice(m.index! + m[0].length));
    return m;
  };

  // ── Lista (#) e etiquetas (@) ─────────────────────────────────────────────
  // Convenção do Todoist/Things, que é o que a pessoa já conhece. Familiaridade
  // vale mais que uma sintaxe própria "melhor".
  let lista: string | null = null;
  const mLista = comer(/(?:^|\s)#([\p{L}\p{N}_-]+)/u, "lista");
  if (mLista) lista = mLista[1];

  const tags: string[] = [];
  for (;;) {
    const m = comer(/(?:^|\s)@([\p{L}\p{N}_-]+)/u, "tag");
    if (!m) break;
    tags.push(m[1]);
  }

  // ── Prioridade ────────────────────────────────────────────────────────────
  // `!urgente` é explícito; `!!!` é o atalho de quem digita rápido. Um `!` no
  // fim de uma frase normal ("consertar isso!") NÃO conta — daí o \b e a exigência
  // de que o `!` esteja colado num marcador, nunca solto depois de letra.
  let prioridade: TarefaPrioridade | null = null;
  const mP = comer(new RegExp(`(?:^|\\s)!(${Object.keys(PRIOR).join("|")})\\b`, "i"), "prioridade");
  if (mP) prioridade = PRIOR[cru(mP[1])];
  else {
    const mB = comer(/(?:^|\s)(!{1,3})(?=\s|$)/, "prioridade");
    if (mB) prioridade = mB[1].length === 3 ? "urgente" : mB[1].length === 2 ? "alta" : "media";
  }

  // ── Hora ──────────────────────────────────────────────────────────────────
  // Achada antes do dia: "amanhã às 14h" tem os dois, e consumir a hora primeiro
  // impede que "14" seja lido como dia 14.
  let hora: string | null = null;
  const mH = comer(/(?:^|\s)(?:[àa]s?\s+)?([01]?\d|2[0-3])(?:[h:]([0-5]\d)|h)(?=\s|$)/i, "prazo");
  if (mH) hora = `${mH[1].padStart(2, "0")}:${(mH[2] ?? "00").padStart(2, "0")}`;

  // ── Dia ───────────────────────────────────────────────────────────────────
  const hoje = diaSP(agora.getTime());
  const maisDias = (n: number) => diaSP(agora.getTime() + n * MS_DIA);
  let dia: string | null = null;

  const mRel = comer(/(?:^|\s)(depois de amanh[aã]|amanh[aã]|hoje|hj)(?=\s|$)/i, "prazo");
  if (mRel) {
    const k = cru(mRel[1]);
    dia = k === "hoje" || k === "hj" ? hoje : k === "amanha" ? maisDias(1) : maisDias(2);
  }

  if (!dia) {
    const mEm = comer(/(?:^|\s)em\s+(\d{1,3})\s+(dias?|semanas?|m[eê]s(?:es)?)(?=\s|$)/i, "prazo");
    if (mEm) {
      const n = Number(mEm[1]), u = cru(mEm[2]);
      dia = maisDias(u.startsWith("semana") ? n * 7 : u.startsWith("mes") ? n * 30 : n);
    }
  }

  if (!dia) {
    // "segunda" = a próxima segunda; hoje nunca conta, porque quem escreve o
    // nome do dia está marcando OUTRO dia.
    // "próxima segunda" e "segunda" são a mesma coisa pra quem escreve — as duas
    // querem a segunda que vem. Tratar diferente seria uma sutileza que ninguém
    // pediu e que erraria em silêncio.
    const mSem = comer(/(?:^|\s)(?:pr[oó]xim[ao]\s+)?(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:-feira)?(?=\s|$)/i, "prazo");
    if (mSem) {
      const alvo = SEMANA.indexOf(cru(mSem[1]));
      const atual = new Date(agora.getTime() - SP).getUTCDay();
      dia = maisDias(((alvo - atual + 6) % 7) + 1);   // 1..7: hoje nunca conta
    }
  }

  if (!dia) {
    // Data explícita. Exige a barra: "15" sozinho nunca vira dia 15 — "ver o
    // pedido 15" é uma tarefa sem prazo, e inventar um prazo aqui seria pior do
    // que não achar nenhum. Valida ANTES de consumir: 45/99 continua sendo
    // título, não vira um prazo silenciosamente errado.
    const cand = resto.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$)/);
    const dd = cand ? Number(cand[1]) : 0, mm = cand ? Number(cand[2]) : 0;
    if (cand && dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      comer(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$)/, "prazo");
      const anoHoje = Number(hoje.slice(0, 4));
      const ano = cand[3] ? (cand[3].length === 2 ? 2000 + Number(cand[3]) : Number(cand[3])) : anoHoje;
      const iso = `${ano}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      // Sem ano e já passou → é do ano que vem. Ninguém agenda pro passado.
      dia = !cand[3] && iso < hoje ? `${ano + 1}${iso.slice(4)}` : iso;
    }
  }
  // Só hora, sem dia: é hoje — a menos que a hora já tenha passado, e aí é amanhã.
  if (!dia && hora) dia = hora <= new Date(agora.getTime() - SP).toISOString().slice(11, 16) ? maisDias(1) : hoje;

  const prazo = dia ? isoSP(dia, hora ?? "00:00") : null;
  if (!prazo) for (let i = marcas.length - 1; i >= 0; i--) if (marcas[i].campo === "prazo") marcas.splice(i, 1);

  const titulo = resto.replace(/\s{2,}/g, " ").trim();
  return { titulo: titulo || frase.trim(), prazo, prioridade, lista, tags, marcas };
}
