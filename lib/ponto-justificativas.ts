// ── Vocabulário da justificativa de ponto ────────────────────────────────────
// Puro: atravessa a fronteira servidor→cliente (não importa `next/*` nem
// Supabase), porque a tela do colaborador, a do gestor e o cálculo do banco de
// horas precisam falar a MESMA língua sobre o mesmo registro.
//
// O que existia antes: uma linha por dia, com um `abona` booleano. Ou a empresa
// perdoava o dia inteiro, ou não perdoava nada. Isso cobria "faltou" e mais
// nada — e a vida real do RH é quase toda o contrário disso: o atestado que
// cobre só a manhã, a consulta de 1h no meio da tarde, a pessoa que sai 14h e
// volta 16h. Todos esses viravam "parcial" com dívida, sem motivo registrado.
//
// Três eixos independentes, e é a combinação deles que descreve o caso:
//
//   TIPO ...... o que aconteceu (atestado, consulta, a serviço da empresa…).
//   EFEITO .... o que isso faz com as horas (perdoa / conta como trabalhada /
//               só registra e a pessoa compensa).
//   RECORTE ... quanto do dia (o dia inteiro, uma janela de horário, ou uma
//               quantidade de minutos).
//
// Separar tipo de efeito é o que impede a tabela de virar um beco: quando um
// tipo novo aparecer (licença-paternidade, greve de ônibus), ele entra sem
// mexer em cálculo nenhum — só escolhe um dos três efeitos que já existem.

// ── Efeito: o que a justificativa faz com a conta ────────────────────────────
export const EFEITOS_JUSTIFICATIVA = ["abona", "trabalhada", "compensar"] as const;
export type EfeitoJustificativa = (typeof EFEITOS_JUSTIFICATIVA)[number];

export const ehEfeitoJustificativa = (v: unknown): v is EfeitoJustificativa =>
  typeof v === "string" && (EFEITOS_JUSTIFICATIVA as readonly string[]).includes(v);

export const ROTULO_EFEITO: Record<EfeitoJustificativa, { label: string; descricao: string; cor: string }> = {
  abona: {
    label: "Abona as horas",
    descricao: "A empresa perdoa. Não vira dívida e não precisa compensar.",
    cor: "var(--info)",
  },
  trabalhada: {
    label: "Conta como trabalhada",
    descricao: "A pessoa estava fora, mas a serviço da empresa. As horas entram como trabalho.",
    cor: "var(--ok)",
  },
  compensar: {
    label: "Registra, mas compensa",
    descricao: "Fica o motivo do dia; as horas continuam devidas e voltam pelo banco.",
    cor: "var(--atencao)",
  },
};

// ── Status: só o APROVADO mexe em conta ──────────────────────────────────────
// É a trava do caminho do colaborador. Ele pede, sobe a foto do atestado, e o
// pedido nasce `pendente`: aparece na tela dos dois lados, mas não perdoa um
// minuto sequer até alguém do RH decidir. Sem isso, "justificar" seria um
// botão de apagar a própria dívida.
export const STATUS_JUSTIFICATIVA = ["pendente", "aprovada", "recusada"] as const;
export type StatusJustificativa = (typeof STATUS_JUSTIFICATIVA)[number];

export const ehStatusJustificativa = (v: unknown): v is StatusJustificativa =>
  typeof v === "string" && (STATUS_JUSTIFICATIVA as readonly string[]).includes(v);

export const SELO_STATUS: Record<StatusJustificativa, { label: string; cor: string; icone: string }> = {
  pendente: { label: "Aguardando aprovação", cor: "var(--atencao)", icone: "hourglass-high" },
  aprovada: { label: "Aprovada", cor: "var(--ok)", icone: "circle-check" },
  recusada: { label: "Recusada", cor: "var(--perigo)", icone: "circle-x" },
};

/** Só a aprovada entra na conta. Registro antigo (sem status) já valia. */
export const justificativaVale = (j: { status?: StatusJustificativa | null }) =>
  (j.status ?? "aprovada") === "aprovada";

// ── Tipo: o que aconteceu ────────────────────────────────────────────────────
export const TIPOS_JUSTIFICATIVA = [
  "atestado",
  "consulta",
  "acompanhamento",
  "empresa",
  "atraso",
  "saida_antecipada",
  "luto",
  "casamento",
  "doacao_sangue",
  "convocacao",
  "particular",
  "outro",
] as const;
export type TipoJustificativa = (typeof TIPOS_JUSTIFICATIVA)[number];

export const ehTipoJustificativa = (v: unknown): v is TipoJustificativa =>
  typeof v === "string" && (TIPOS_JUSTIFICATIVA as readonly string[]).includes(v);

export interface RotuloTipo {
  label: string;
  /** SEMPRE do Tabler (mapa `ICONS` em `Icon.tsx`). */
  icone: string;
  /** O efeito que a tela já vem marcando. A pessoa pode trocar. */
  efeito: EfeitoJustificativa;
  /** A tela sugere anexar comprovante neste tipo (nunca obriga). */
  pedeAnexo: boolean;
  /** Uma linha, mostrada embaixo da opção escolhida. */
  ajuda: string;
}

// A ordem desta lista é a ordem em que a tela mostra. Os casos do dia a dia
// primeiro; os da CLT art. 473 (que são raros e sempre abonados por lei)
// depois. "Outro" fecha a fila de propósito: quem chega nele é porque nenhum
// dos outros serviu, e aí o texto livre é que conta.
export const ROTULO_TIPO: Record<TipoJustificativa, RotuloTipo> = {
  atestado: {
    label: "Atestado médico",
    icone: "stethoscope",
    efeito: "abona",
    pedeAnexo: true,
    ajuda: "Atestado do próprio colaborador. Vale pro dia inteiro ou só pro período que o médico marcou.",
  },
  consulta: {
    label: "Consulta ou exame",
    icone: "first-aid-kit",
    efeito: "abona",
    pedeAnexo: true,
    ajuda: "Saiu pra consulta, exame ou sessão e voltou. Marque a janela de horário.",
  },
  acompanhamento: {
    label: "Acompanhar familiar",
    icone: "users",
    efeito: "abona",
    pedeAnexo: true,
    ajuda: "Declaração de acompanhamento — filho, pai, mãe ou cônjuge em consulta.",
  },
  empresa: {
    label: "A serviço da empresa",
    icone: "briefcase",
    efeito: "trabalhada",
    pedeAnexo: false,
    ajuda: "Banco, cartório, entrega, visita a cliente. Está fora, mas está trabalhando.",
  },
  atraso: {
    label: "Atraso justificado",
    icone: "clock",
    efeito: "compensar",
    pedeAnexo: false,
    ajuda: "Chegou depois da hora com motivo. Por padrão as horas voltam pelo banco.",
  },
  saida_antecipada: {
    label: "Saída antecipada",
    icone: "door-exit",
    efeito: "compensar",
    pedeAnexo: false,
    ajuda: "Foi embora antes do fim do expediente com motivo.",
  },
  luto: {
    label: "Falecimento na família",
    icone: "heart",
    efeito: "abona",
    pedeAnexo: false,
    ajuda: "Licença-nojo (CLT art. 473): até 2 dias, abonados por lei.",
  },
  casamento: {
    label: "Casamento",
    icone: "cake",
    efeito: "abona",
    pedeAnexo: false,
    ajuda: "Licença-gala (CLT art. 473): até 3 dias, abonados por lei.",
  },
  doacao_sangue: {
    label: "Doação de sangue",
    icone: "droplet",
    efeito: "abona",
    pedeAnexo: true,
    ajuda: "1 dia por ano, abonado por lei (CLT art. 473).",
  },
  convocacao: {
    label: "Convocação oficial",
    icone: "gavel",
    efeito: "abona",
    pedeAnexo: true,
    ajuda: "Justiça, serviço eleitoral, militar ou júri. Abonado por lei.",
  },
  particular: {
    label: "Assunto pessoal",
    icone: "user",
    efeito: "compensar",
    pedeAnexo: false,
    ajuda: "Combinado com a liderança. As horas voltam pelo banco, salvo decisão em contrário.",
  },
  outro: {
    label: "Outro motivo",
    icone: "file-text",
    efeito: "compensar",
    pedeAnexo: false,
    ajuda: "Nenhum dos anteriores. Escreva o que houve no campo de motivo.",
  },
};

/** Tipos que pedem comprovante — é o que liga o botão de anexar em destaque. */
export const tipoPedeAnexo = (t: TipoJustificativa) => ROTULO_TIPO[t]?.pedeAnexo ?? false;

// ── Recorte: quanto do dia ───────────────────────────────────────────────────
// `null` em minutos E sem janela = O DIA INTEIRO. É o comportamento de sempre,
// e continua sendo o que um registro antigo (só `abona`) significa.

/** "HH:MM" ou "HH:MM:SS" → minutos desde a meia-noite. `null` se não for hora. */
export function horaEmMin(h: string | null | undefined): number | null {
  if (typeof h !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(h.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

/** Minutos desde a meia-noite → "HH:MM". */
export function minEmHora(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutos de sobreposição entre dois intervalos abertos. */
const sobreposicao = (a1: number, a2: number, b1: number | null, b2: number | null): number => {
  if (b1 == null || b2 == null || b2 <= b1) return 0;
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
};

export interface JanelaDaJornada {
  entradaPrevista?: string | null;
  saidaPrevista?: string | null;
  almocoInicio?: string | null;
  almocoFim?: string | null;
  /** Jornada devida no dia, em minutos. É o teto e o plano B. */
  jornadaMin: number;
}

/**
 * Quantos minutos DE JORNADA a janela `de → ate` cobre.
 *
 * Não é o relógio de parede: "atestado das 08:00 às 13:00" numa escala 08:00–18:00
 * com almoço 12:00–13:00 cobre 4h de trabalho, não 5h. Descontar o almoço aqui é
 * o que impede o abono de perdoar hora que a pessoa nunca deveu — e perdoar hora
 * inexistente vira crédito, que vira dinheiro na folha.
 *
 * Sem escala cadastrada não dá pra cruzar nada: aí vale o relógio mesmo, limitado
 * à jornada do dia. Conservador de propósito, e a tela diz o número que achou.
 */
export function minutosDaJanela(
  de: string | null | undefined,
  ate: string | null | undefined,
  jornada: JanelaDaJornada,
): number | null {
  const d = horaEmMin(de);
  const a = horaEmMin(ate);
  if (d == null || a == null || a <= d) return null;

  const ent = horaEmMin(jornada.entradaPrevista);
  const sai = horaEmMin(jornada.saidaPrevista);
  const bruto = a - d;

  if (ent == null || sai == null || sai <= ent) {
    return Math.min(bruto, Math.max(0, jornada.jornadaMin));
  }
  const dentro = sobreposicao(d, a, ent, sai);
  const almoco = sobreposicao(d, a, horaEmMin(jornada.almocoInicio), horaEmMin(jornada.almocoFim));
  return Math.max(0, Math.min(dentro - almoco, Math.max(0, jornada.jornadaMin)));
}

/** A forma mínima que o cálculo precisa enxergar de uma justificativa. */
export interface RecorteJustificativa {
  abona?: boolean;
  efeito?: EfeitoJustificativa | null;
  status?: StatusJustificativa | null;
  horaDe?: string | null;
  horaAte?: string | null;
  minutos?: number | null;
}

/** Registro antigo (só `abona`) fala a língua nova sem migração de dado. */
export const efeitoDa = (j: RecorteJustificativa): EfeitoJustificativa =>
  j.efeito ?? (j.abona === false ? "compensar" : "abona");

/**
 * Quantos minutos esta justificativa recorta do dia. `null` = O DIA INTEIRO.
 *
 * Precedência: minutos explícitos > janela de horário > dia inteiro. Os minutos
 * vêm na frente porque é o que o gestor digitou ("2h fora"); a janela é só a
 * forma mais fácil de chegar no mesmo número.
 */
export function minutosDoRecorte(j: RecorteJustificativa, jornada: JanelaDaJornada): number | null {
  if (typeof j.minutos === "number" && Number.isFinite(j.minutos) && j.minutos > 0) {
    return Math.min(Math.round(j.minutos), Math.max(0, jornada.jornadaMin));
  }
  if (j.horaDe && j.horaAte) return minutosDaJanela(j.horaDe, j.horaAte, jornada);
  return null;
}

// ── O veredito do dia ────────────────────────────────────────────────────────
export interface ResumoDoDia {
  /** Alguma justificativa aprovada perdoa o dia INTEIRO. */
  abonaTudo: boolean;
  /** Minutos de perdão somados (só quando não é o dia inteiro). */
  abonaMin: number;
  /** Minutos que contam como TRABALHO (a serviço da empresa). */
  trabalhadaMin: number;
  /** Tem alguma justificativa aprovada neste dia (qualquer efeito). */
  temAprovada: boolean;
  /** Quantas ainda esperam decisão. A tela mostra; a conta ignora. */
  pendentes: number;
}

export const RESUMO_VAZIO: ResumoDoDia = {
  abonaTudo: false, abonaMin: 0, trabalhadaMin: 0, temAprovada: false, pendentes: 0,
};

/**
 * Junta TODAS as justificativas de um dia num veredito só.
 *
 * Várias por dia é o caso comum, não a exceção: a pessoa sai 1h de manhã pro
 * dentista e 1h à tarde pro banco. Eram dois motivos diferentes, com efeitos
 * diferentes, no mesmo dia — e o modelo antigo (uma linha por dia) obrigava a
 * escolher qual dos dois registrar.
 */
export function resumirJustificativas(
  lista: readonly RecorteJustificativa[],
  jornada: JanelaDaJornada,
): ResumoDoDia {
  const out: ResumoDoDia = { ...RESUMO_VAZIO };
  for (const j of lista) {
    if ((j.status ?? "aprovada") === "pendente") { out.pendentes += 1; continue; }
    if (!justificativaVale(j)) continue;          // recusada não conta nem aparece na soma
    out.temAprovada = true;
    const efeito = efeitoDa(j);
    if (efeito === "compensar") continue;         // só registra o motivo
    const min = minutosDoRecorte(j, jornada);
    if (efeito === "abona") {
      if (min == null) out.abonaTudo = true;
      else out.abonaMin += min;
    } else {
      // "trabalhada" sem recorte = o dia inteiro fora, a serviço da empresa.
      out.trabalhadaMin += min ?? Math.max(0, jornada.jornadaMin);
    }
  }
  // Perdão somado não pode passar da jornada do dia: duas janelas que se
  // encavalam por engano criariam crédito do nada.
  out.abonaMin = Math.min(out.abonaMin, Math.max(0, jornada.jornadaMin));
  return out;
}

// ── Como a linha se lê na tela ───────────────────────────────────────────────
const fmtMin = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}min`;
};

/** "Atestado médico · 08:00–13:00 (4h) · abona" — o que o card mostra. */
export function descreverJustificativa(
  j: RecorteJustificativa & { tipo?: TipoJustificativa | null; motivo?: string | null },
  jornada: JanelaDaJornada,
): string {
  const tipo = j.tipo && ehTipoJustificativa(j.tipo) ? ROTULO_TIPO[j.tipo].label : "Justificativa";
  const min = minutosDoRecorte(j, jornada);
  const quando = j.horaDe && j.horaAte
    ? `${j.horaDe.slice(0, 5)}–${j.horaAte.slice(0, 5)}${min != null ? ` (${fmtMin(min)})` : ""}`
    : min != null ? fmtMin(min) : "dia inteiro";
  return `${tipo} · ${quando} · ${ROTULO_EFEITO[efeitoDa(j)].label.toLowerCase()}`;
}

export { fmtMin as formatarMinutos };
