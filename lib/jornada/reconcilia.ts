// ── Reconciliação das batidas do dia ─────────────────────────────────────────
// Parear por posição (1ª abre, 2ª fecha…) só funciona com a sequência perfeita.
// Com uma batida a menos, 07:00 → 12:00 → 17:00 virava "dia em aberto": sem
// conta nenhuma, como se a pessoa não tivesse fechado o dia — sendo que o 17:00
// é claramente a saída e o que faltou foi o retorno do almoço.
//
// Aqui o dia é lido INTEIRO contra a escala da pessoa, e sai em quatro níveis:
//
//   consistente   — sequência par e plausível; conta como sempre contou.
//   inconsistente — falta uma batida do meio, mas a última é compatível com a
//                   saída. A jornada é reconstruída (o almoço sai com a duração
//                   prevista) e o dia conta — com a marca pra alguém conferir.
//   incompleta    — não há batida que possa ser a saída. Pendência de verdade.
//   revisar       — batidas demais, horários incompatíveis ou sequência que não
//                   dá pra decidir. Não se inventa jornada: fica neutro.
//
// Duas regras que valem mais que o resto: nunca se supõe que a pessoa ficou
// trabalhando durante o buraco (o almoço previsto é descontado), e nunca se
// chama de "não concluído" um dia só porque falta uma batida do meio.

export type NivelJornada = "consistente" | "inconsistente" | "incompleta" | "revisar";

export interface EscalaDoDia {
  entradaPrevista?: string | null;
  almocoInicio?: string | null;
  almocoFim?: string | null;
  saidaPrevista?: string | null;
  /** Dia sem almoço na regra (sábado): três batidas não têm leitura segura. */
  semAlmoco?: boolean;
}

export interface Reconciliacao {
  nivel: NivelJornada;
  /** Minutos trabalhados na leitura escolhida (0 quando não dá pra contar). */
  trabMin: number;
  /** O que faltou, em palavras ("retorno do almoço"). Vazio quando nada. */
  faltando: string[];
  /** Frase curta pra tela explicar o veredito. */
  explicacao: string;
  /** Batidas batidas duas vezes em ≤ 2 min, descartadas da conta. */
  duplicadas: number;
}

/** Batida repetida dentro disto é toque duplo, não duas marcações. */
export const DUPLICADA_MIN = 2;
/** A última batida vale como saída se vier até isto antes da saída prevista. */
export const SAIDA_ANTECIPADA_MAX_MIN = 180;
/** Sem saída prevista: a última batida precisa estar a isto da entrada. */
export const JORNADA_MINIMA_SEM_ESCALA_MIN = 6 * 60;
/** Almoço assumido quando a escala não diz. */
export const ALMOCO_PADRAO_MIN = 60;
/** Primeira batida a mais disto depois da entrada prevista: a entrada é que faltou. */
export const ENTRADA_TARDIA_MAX_MIN = 180;
/** Retorno do almoço: até isto a mais que o almoço previsto depois da saída pro almoço. */
export const FOLGA_DO_ALMOCO_MIN = 30;
/** Um trecho contínuo maior que isto não é trabalho plausível. */
export const TRECHO_MAXIMO_MIN = 12 * 60;
/** Acima disto o dia tem batidas demais pra ler sem ninguém olhar. */
export const BATIDAS_MAXIMAS = 8;

const minDe = (hhmm: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec((hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};

/** Tira o toque duplo (mesma batida repetida em ≤ 2 min). Mantém a primeira. */
export function semDuplicadas<T extends { iso: string }>(batidas: T[]): T[] {
  const out: T[] = [];
  for (const b of batidas) {
    const ant = out[out.length - 1];
    if (ant && (Date.parse(b.iso) - Date.parse(ant.iso)) / 60000 <= DUPLICADA_MIN) continue;
    out.push(b);
  }
  return out;
}

export function reconciliarDia(batidasOrdenadas: { hora: string; iso: string }[], escala: EscalaDoDia = {}): Reconciliacao {
  // Toque duplo só é descartado quando isso FECHA a conta (ímpar → par): duas
  // batidas no mesmo minuto num dia par são pausa de verdade (a do Davi às
  // 09:38/09:38) e tirar uma delas quebrava um dia que estava certo.
  const semDup = semDuplicadas(batidasOrdenadas);
  const limpas = batidasOrdenadas.length % 2 === 1 && semDup.length % 2 === 0 ? semDup : batidasOrdenadas;
  const duplicadas = batidasOrdenadas.length - limpas.length;
  const t = limpas.map((b) => Date.parse(b.iso) / 60000);
  const n = t.length;
  const r = (nivel: NivelJornada, trabMin: number, explicacao: string, faltando: string[] = []): Reconciliacao =>
    ({ nivel, trabMin: Math.max(0, Math.round(trabMin)), faltando, explicacao, duplicadas });

  if (n === 0) return r("consistente", 0, "Sem batidas.");
  if (n > BATIDAS_MAXIMAS) return r("revisar", 0, `${n} batidas no dia — mais do que dá pra ler com segurança.`);

  // Par: a leitura por posição continua valendo, desde que cada trecho seja
  // trabalho plausível. Um trecho de 14h é batida trocada, não expediente.
  if (n % 2 === 0) {
    let soma = 0;
    for (let i = 0; i < n; i += 2) {
      const trecho = t[i + 1] - t[i];
      if (trecho > TRECHO_MAXIMO_MIN) return r("revisar", 0, "Um trecho entre batidas passa de 12h — alguma batida está trocada.");
      soma += trecho;
    }
    return r("consistente", soma, "Sequência completa.");
  }

  if (n === 1) return r("incompleta", 0, "Só uma batida no dia — não há saída.", ["saída"]);

  // Ímpar a partir de 5: falta uma entre várias pausas. Qual delas é chute.
  if (n >= 5) return r("revisar", 0, `${n} batidas (número ímpar) — não dá pra saber qual falta.`);

  // n === 3: A, B, C. Quem falta — a entrada, o retorno, a saída pro almoço, ou a saída?
  const [a, b, c] = t;
  const horaC = minDe(limpas[2].hora)!, horaB = minDe(limpas[1].hora)!, horaA = minDe(limpas[0].hora)!;
  if (escala.semAlmoco) return r("revisar", 0, "Três batidas num dia sem almoço na escala — não dá pra saber qual é a saída.");
  const saidaPrev = minDe(escala.saidaPrevista);
  const entradaPrev = minDe(escala.entradaPrevista);
  const ai = minDe(escala.almocoInicio), af = minDe(escala.almocoFim);
  const almoco = ai != null && af != null && af > ai ? af - ai : ALMOCO_PADRAO_MIN;

  // A primeira batida longe da entrada prevista é o almoço, não a entrada:
  // 11:38 → 12:39 → 14:00 é almoço, retorno e saída. Contar desde 11:38
  // inventaria uma manhã inteira de falta; a hora de chegada ninguém sabe.
  if (entradaPrev != null && horaA - entradaPrev > ENTRADA_TARDIA_MAX_MIN) {
    return r("revisar", 0, `A primeira batida é às ${limpas[0].hora}, longe da entrada prevista (${escala.entradaPrevista!.slice(0, 5)}) — a entrada pode ter faltado.`, ["entrada"]);
  }

  // B perto do começo do almoço e C a um almoço de distância: C é o RETORNO, e
  // quem falta é a saída. Numa escala que termina às 14h, 11:33 → 12:38 é
  // almoço e volta, não almoço e saída.
  const bNoAlmoco = ai != null ? Math.abs(horaB - ai) <= 60 : false;
  if (bNoAlmoco && c - b <= almoco + FOLGA_DO_ALMOCO_MIN) {
    return r("incompleta", b - a, "Saiu pro almoço e voltou, mas não há batida de saída.", ["saída"]);
  }

  // A última batida pode ser a saída? Perto da saída prevista (até 3h antes ou
  // qualquer hora depois), ou — sem escala — longe o bastante da entrada.
  const cEhSaida = saidaPrev != null
    ? horaC >= saidaPrev - SAIDA_ANTECIPADA_MAX_MIN
    : horaC - horaA >= JORNADA_MINIMA_SEM_ESCALA_MIN;
  if (!cEhSaida) return r("incompleta", b - a, "Saiu pro almoço e voltou, mas não há batida de saída.", ["saída"]);

  // Qual batida do meio faltou: B está mais perto do começo ou do fim do
  // almoço previsto? Sem escala, compara com o meio do dia.
  const faltaRetorno = ai != null && af != null
    ? Math.abs(horaB - ai) <= Math.abs(horaB - af)
    : horaB - horaA <= horaC - horaB;

  if (faltaRetorno) {
    // A → B trabalhou; o almoço previsto começa em B; volta em B+almoço até C.
    const volta = b + almoco;
    if (volta >= c) return r("revisar", 0, "Faltou o retorno do almoço, e o almoço previsto não cabe antes da última batida.", ["retorno do almoço"]);
    if (b - a > TRECHO_MAXIMO_MIN || c - volta > TRECHO_MAXIMO_MIN) return r("revisar", 0, "Os horários não formam uma jornada plausível.", ["retorno do almoço"]);
    return r("inconsistente", (b - a) + (c - volta), `Faltou o retorno do almoço. Contado com ${almoco} min de almoço a partir de ${limpas[1].hora}, até a saída às ${limpas[2].hora}.`, ["retorno do almoço"]);
  }
  // Faltou a saída pro almoço: B é o retorno; o almoço previsto termina em B.
  const saiu = b - almoco;
  if (saiu <= a) return r("revisar", 0, "Faltou a saída pro almoço, e o almoço previsto não cabe depois da entrada.", ["saída pro almoço"]);
  if (saiu - a > TRECHO_MAXIMO_MIN || c - b > TRECHO_MAXIMO_MIN) return r("revisar", 0, "Os horários não formam uma jornada plausível.", ["saída pro almoço"]);
  return r("inconsistente", (saiu - a) + (c - b), `Faltou a saída pro almoço. Contado com ${almoco} min de almoço até o retorno às ${limpas[1].hora}.`, ["saída pro almoço"]);
}
