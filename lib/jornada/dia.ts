// ── O dia da pessoa (puro) ───────────────────────────────────────────────────
// A ÚNICA função que decide quanto uma pessoa deve num dia — e, quando a
// resposta é "nada", por quê.
//
// Antes disso a pergunta estava espalhada: `jornadaDoDia()` sabia de domingo,
// sábado e feriado; o RH sabia de férias e atestado numa tabela que ninguém
// lia; e a compensação simplesmente não existia. O banco de horas via um dia
// sem batida e concluía "falta" — inclusive nos 30 dias de férias.
//
// Pura de propósito: recebe tudo pronto (feriados, afastamentos, pares) e não
// fala com o Supabase. Quem busca é `afastamentos.ts` e `compensacoes.ts`.

import {
  dowDia, jornadaDoDia, tipoFeriado,
  META_DIARIA_MIN_PADRAO, type MapaFeriados, type TipoFeriado,
} from "@/lib/jornada-calendario";
import type { Esfera } from "@/lib/rh/calendario/tipos";
import {
  compensacaoVale,
  type Afastamento, type Compensacao, type DiaDaPessoa, type RefCompensacao,
} from "./tipos";

/** Mapa vazio — "nenhum feriado". Existe pra não espalhar `new Map()` por aí. */
export const SEM_FERIADOS: MapaFeriados = new Map<string, TipoFeriado>();

export interface PessoaDaJornada {
  jornadaMin?: number | null;
  trabalhaSabado?: boolean | null;
  sabadoMin?: number | null;
}

export interface ContextoDoDia {
  /** Os feriados que VALEM no Ponto, com o tipo global da empresa. */
  feriados: MapaFeriados;
  /** Nome e esfera de cada feriado, quando a fonte os conhece. O
   *  `ponto_feriados` legado não guarda esfera — ali fica null, e a tela diz
   *  só "Feriado" em vez de inventar uma esfera. */
  detalheFeriado?: Map<string, { nome: string; esfera: Esfera }>;
  /** Férias e atestados DESTA pessoa que tocam o período. */
  afastamentos?: Afastamento[];
  /** Pares de compensação DESTA pessoa que tocam o período. */
  compensacoes?: Compensacao[];
  metaPadrao?: number;
}

const dentro = (a: Afastamento, dia: string) => dia >= a.de && dia <= a.ate;

/** A folga vem ANTES do dia trabalhado? Aí a hora ainda não existe. */
export const parAdiantado = (c: Pick<Compensacao, "diaOrigem" | "diaFolga">) => c.diaFolga < c.diaOrigem;

const ref = (c: Compensacao, papel: "origem" | "folga"): RefCompensacao => ({
  id: c.id, tipo: c.tipo, papel, minutos: c.minutos, status: c.status,
  outroDia: papel === "folga" ? c.diaOrigem : c.diaFolga,
  adiantada: parAdiantado(c),
});

/** O par aprovado que toca este dia. Ser FOLGA vence ser ORIGEM: é o lado que
 *  muda a jornada devida, e é o que a pessoa precisa ver ao abrir o dia. */
function parDoDia(dia: string, lista: Compensacao[]): RefCompensacao | null {
  let origem: RefCompensacao | null = null;
  for (const c of lista) {
    if (!compensacaoVale(c)) continue;
    if (c.diaFolga === dia) return ref(c, "folga");
    if (c.diaOrigem === dia && !origem) origem = ref(c, "origem");
  }
  return origem;
}

/**
 * Quanto esta pessoa deve neste dia, e por quê.
 *
 * A PRECEDÊNCIA (mexer nela muda a folha — ver `jornada-dia.test.ts`):
 *
 *   1. Férias .................. jornada 0
 *   2. Atestado aceito ......... jornada 0
 *   3. Feriado que vale ........ jornada 0
 *   4. Folga compensatória ..... a escala menos os minutos do par
 *   5. Domingo ................. 0
 *   6. Sábado fora da escala ... 0
 *   7. Seg–sex ................. a jornada da pessoa
 *
 * Férias acima de feriado porque feriado dentro das férias não prorroga nada
 * (CLT art. 130) — o dia é de férias, e o feriado continua visível no rótulo
 * porque é o que o RH precisa enxergar ao programar o período.
 */
export function diaDaPessoa(dia: string, pessoa: PessoaDaJornada, ctx: ContextoDoDia): DiaDaPessoa {
  const { feriados, detalheFeriado, afastamentos = [], compensacoes = [], metaPadrao = META_DIARIA_MIN_PADRAO } = ctx;

  // A escala crua: o que a pessoa deveria neste dia se nada tivesse acontecido.
  // Passar SEM_FERIADOS aqui é intencional — o feriado entra como MOTIVO logo
  // abaixo, e misturar os dois é o que faz "0" perder a explicação.
  const escalaMin = jornadaDoDia(dia, pessoa, SEM_FERIADOS, metaPadrao);
  const dow = dowDia(dia);

  const fer = tipoFeriado(dia, feriados);
  const detalhe = detalheFeriado?.get(dia);
  const feriado = fer
    ? { nome: detalhe?.nome ?? "Feriado", esfera: (detalhe?.esfera ?? null) as Esfera | null, tipo: fer }
    : null;

  const compensacao = parDoDia(dia, compensacoes);

  // Hora trabalhada aqui vale adicional? Domingo e feriado "folga" valem.
  //
  // O par pessoal NÃO desliga isso, e é de propósito: os minutos trocados são
  // RESERVADOS no banco de horas (saem do crédito antes de virar saldo), então
  // eles nunca chegam a ser hora extra de espécie nenhuma. O que sobra depois
  // da reserva é hora de feriado de verdade — quem trabalhou 10h num feriado e
  // trocou 8 por uma folga ainda fez 2h com adicional, e zerar o dia inteiro
  // tiraria dinheiro de quem trabalhou a mais.
  const extraEspecial = fer ? fer === "folga" : dow === 0;

  const base = { dia, feriado, compensacao };

  // 1 e 2 — férias vence atestado (a lista é varrida na ordem da precedência).
  for (const tipo of ["ferias", "atestado"] as const) {
    const af = afastamentos.find((a) => a.tipo === tipo && dentro(a, dia));
    // Ninguém trabalha afastado: não há hora especial a prometer neste dia.
    if (af) return { ...base, jornadaMin: 0, motivo: tipo, afastamento: af, extraEspecial: false };
  }

  // 3 — feriado.
  if (fer) return { ...base, jornadaMin: 0, motivo: "feriado", afastamento: null, extraEspecial };

  // 5 e 6 antes do 4 na ORDEM DO CÓDIGO, não na precedência: um dia que já não
  // tem escala (domingo, sábado de quem não trabalha) não vira "folga
  // compensatória" só porque alguém marcou o par ali — não havia jornada pra
  // compensar. A validação bloqueia esse cadastro; aqui é a segunda linha.
  if (escalaMin === 0) {
    return {
      ...base, jornadaMin: 0, afastamento: null, extraEspecial,
      motivo: dow === 0 ? "domingo" : "sabado_fora_escala",
    };
  }

  // 4 — folga compensatória. A DIREÇÃO do par decide o que acontece aqui:
  //
  //  · folga DEPOIS do trabalho (feriado trocado, folga compensatória): a hora
  //    já foi feita. A escala cai pelos minutos reservados — compensou meio
  //    período, o resto continua devido, e o motivo explica o corte.
  //  · folga ANTES (compensação de jornada): a hora ainda não existe. A jornada
  //    continua INTEIRA devida — é dívida combinada, não presente. O motivo
  //    tira o dia de "falta" na tela, e quem quita é o trabalho futuro, pelo
  //    motor de débito que já existe (quitar dívida não tem teto de 2h).
  if (compensacao?.papel === "folga") {
    return {
      ...base, motivo: "folga_compensatoria", afastamento: null, extraEspecial,
      jornadaMin: compensacao.adiantada ? escalaMin : Math.max(0, escalaMin - compensacao.minutos),
    };
  }

  // 7 — dia comum.
  return { ...base, jornadaMin: escalaMin, motivo: null, afastamento: null, extraEspecial };
}

/** O mesmo, para uma lista de dias. Ordem preservada. */
export function diasDaPessoa(dias: string[], pessoa: PessoaDaJornada, ctx: ContextoDoDia): DiaDaPessoa[] {
  return dias.map((d) => diaDaPessoa(d, pessoa, ctx));
}
