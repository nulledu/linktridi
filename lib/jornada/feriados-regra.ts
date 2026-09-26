// ── Qual feriado vale no Ponto (puro) ────────────────────────────────────────
// O Calendário do RH conhece feriado de quatro origens (piso calculado,
// BrasilAPI, `ponto_feriados` e cadastro manual). O Ponto conhecia UMA:
// `ponto_feriados`, marcado à mão. Resultado: 7 de Setembro estava no
// calendário e virava falta no banco de horas.
//
// A decisão do usuário (17/09/2026) foi "automático COM janela de revisão":
//
//   · Feriado NACIONAL e não-facultativo entra sozinho. Ninguém precisa
//     confirmar todo ano que Natal é feriado.
//   · Estadual, municipal e ponto FACULTATIVO (Carnaval, Corpus Christi)
//     nascem PENDENTES. Facultativo é dia normal até o RH dizer o contrário —
//     é decisão de empresa, não de lei.
//   · A decisão do RH, quando existe, vence sempre.
//
// O status é DERIVADO, não duplicado: o banco guarda só a decisão tomada
// (`rh_feriados_ponto`). Um feriado sem linha não é "não decidido gravado" —
// é a ausência de linha, e a regra abaixo diz o que isso significa.

import type { FeriadoRh } from "@/lib/rh/calendario/tipos";
import type { TipoFeriado } from "@/lib/jornada-calendario";

/** O que o RH decidiu sobre um dia (`rh_feriados_ponto`). */
export interface DecisaoFeriado {
  dia: string;
  /** É folga da empresa nesse dia? */
  vale: boolean;
  /** "folga" = feriado de verdade (hora com adicional) · "troca" = a empresa
   *  inteira trocou por outro dia (hora comum, pra ser gasta na folga). */
  tipo: TipoFeriado;
  decididoPor: string | null;
  decididoEm: string | null;
}

export const STATUS_NO_PONTO = ["vale", "nao_vale", "pendente"] as const;
export type StatusNoPonto = (typeof STATUS_NO_PONTO)[number];

export const SELO_STATUS_PONTO: Record<StatusNoPonto, { label: string; cor: string; icone: string }> = {
  vale:     { label: "Folga da empresa", cor: "var(--ok)",      icone: "circle-check" },
  nao_vale: { label: "Dia normal",       cor: "var(--texto-3)", icone: "circle-minus" },
  pendente: { label: "Decidir",          cor: "var(--atencao)", icone: "help-circle" },
};

/** Entra sozinho? Nacional e não-facultativo — só isso. */
export function entraSozinho(f: Pick<FeriadoRh, "esfera" | "facultativo">): boolean {
  return f.esfera === "nacional" && !f.facultativo;
}

/** O status de um feriado no Ponto. `decisao` ausente = ninguém decidiu ainda. */
export function statusNoPonto(
  f: Pick<FeriadoRh, "esfera" | "facultativo">,
  decisao?: DecisaoFeriado | null,
): StatusNoPonto {
  if (decisao) return decisao.vale ? "vale" : "nao_vale";
  return entraSozinho(f) ? "vale" : "pendente";
}

/** Um feriado do calendário com o que o Ponto precisa saber dele. */
export interface FeriadoNoPonto extends FeriadoRh {
  status: StatusNoPonto;
  tipo: TipoFeriado;
  decidido: boolean;
  decididoPor: string | null;
}

/** O que a fusão devolve: os mapas que o cálculo usa e a lista pra tela. */
export interface FeriadosDoPonto {
  /** Só os que VALEM: `dia → tipo`. É o `MapaFeriados` do banco de horas. */
  mapa: Map<string, TipoFeriado>;
  /** `dia → {nome, esfera}` de todo feriado que vale, pra rotular a tela. */
  detalhe: Map<string, { nome: string; esfera: FeriadoRh["esfera"] }>;
  /** Todos os do calendário, com status — inclusive os que não valem. */
  lista: FeriadoNoPonto[];
  /** Os que esperam decisão do RH. É a faixa "N feriados esperando você". */
  pendentes: FeriadoNoPonto[];
}

/**
 * Funde calendário + decisões + `ponto_feriados` legado.
 *
 * O legado NÃO passa pela janela de revisão: o que já está lá foi marcado à
 * mão por alguém, uma decisão já tomada. Ele sempre vale, e carrega o `tipo`
 * global (folga/troca) que a empresa escolheu. Uma decisão explícita em
 * `rh_feriados_ponto` vence o legado — é a mais recente e a mais visível.
 *
 * Dia que só existe no legado (fechamento próprio da empresa, emenda) entra no
 * mapa mesmo sem estar no calendário: ele é folga de verdade pro cálculo.
 */
export function fundirFeriadosDoPonto(
  doCalendario: FeriadoRh[],
  decisoes: DecisaoFeriado[],
  legado: { dia: string; descricao: string | null; tipo: TipoFeriado }[] = [],
): FeriadosDoPonto {
  const porDia = new Map(decisoes.map((d) => [d.dia, d]));
  const legadoPorDia = new Map(legado.map((l) => [l.dia, l]));

  const mapa = new Map<string, TipoFeriado>();
  const detalhe = new Map<string, { nome: string; esfera: FeriadoRh["esfera"] }>();
  const lista: FeriadoNoPonto[] = [];
  const pendentes: FeriadoNoPonto[] = [];
  const vistos = new Set<string>();

  for (const f of doCalendario) {
    const d = porDia.get(f.dia);
    const noLegado = legadoPorDia.get(f.dia);
    // Sem decisão explícita, o legado responde por este dia: está lá porque
    // alguém já marcou à mão, e re-perguntar seria desfazer trabalho feito.
    const status: StatusNoPonto = d ? statusNoPonto(f, d) : noLegado ? "vale" : statusNoPonto(f, null);
    const tipo: TipoFeriado = d?.tipo ?? noLegado?.tipo ?? "folga";
    const item: FeriadoNoPonto = {
      ...f, status, tipo, decidido: !!d || !!noLegado, decididoPor: d?.decididoPor ?? null,
    };
    lista.push(item);
    if (status === "pendente") pendentes.push(item);
    if (status === "vale" && !vistos.has(f.dia)) {
      vistos.add(f.dia);
      mapa.set(f.dia, tipo);
      detalhe.set(f.dia, { nome: f.nome, esfera: f.esfera });
    }
  }

  // Fechamento próprio da empresa: existe no Ponto e em lugar nenhum mais.
  for (const l of legado) {
    if (vistos.has(l.dia)) continue;
    // Uma decisão explícita de "não vale" desliga até o dia marcado à mão —
    // é como o RH desfaz uma marcação antiga sem ter de apagar a linha.
    const d = porDia.get(l.dia);
    if (d && !d.vale) continue;
    vistos.add(l.dia);
    mapa.set(l.dia, d?.tipo ?? l.tipo);
  }

  return { mapa, detalhe, lista, pendentes };
}
