// ── Design › as contas de GESTÃO do setor ───────────────────────────────────
//
// O painel do Design é de gestão, não de trabalho: ninguém vai desenhar a
// partir dele. Então ele responde as mesmas perguntas com que se gerencia uma
// linha de produção — e nenhuma outra:
//
//   1. Entrou mais do que saiu? (a fila cresce ou encolhe)
//   2. Onde está parado o trabalho? (WIP por etapa)
//   3. Qual é o gargalo? (a etapa que prende mais trabalho por mais tempo)
//   4. O que está envelhecendo? (as peças mais velhas da fila)
//   5. Quanto tempo leva? (tempo de ciclo: demanda → arte → aprovação)
//   6. Quanto volta? (retrabalho: reprovação do cliente)
//   7. Quem está com o quê? (carga por pessoa)
//
// Tudo puro e sobre o que o ERP REALMENTE guarda. Nada de prazo inventado:
// prazo de arte não existe no banco, então "atrasado" aqui é o que o ERP marca
// e "parado" é tempo na mesma etapa.

import type { ProjetoDesign } from "./design-projetos";
import { HORAS_PARADO, type StatusDesign } from "./design-fluxo";

/** Etapas que são trabalho DO DESIGN (o resto espera terceiros). */
export const ETAPAS_DO_SETOR: StatusDesign[] = ["nova", "criacao", "ajustes"];
/** Etapas em que a bola está com o cliente ou o comercial. */
export const ETAPAS_DE_ESPERA: StatusDesign[] = ["revisao", "aguardando"];

export interface EtapaGestao {
  status: StatusDesign;
  /** Trabalho parado nesta etapa agora. */
  wip: number;
  /** Horas médias que as peças estão nesta etapa. */
  idadeMediaH: number;
  /** A peça mais velha da etapa, em horas. */
  maisVelhaH: number;
  /** Quantas passaram do limite da etapa (só nas etapas do setor). */
  estouradas: number;
  /** A bola está com o Design? */
  doSetor: boolean;
}

export const mediana = (ns: number[]): number | null => {
  if (ns.length === 0) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function etapasDeGestao(ps: ProjetoDesign[]): EtapaGestao[] {
  const ordem: StatusDesign[] = ["nova", "criacao", "ajustes", "revisao", "aguardando", "aprovado"];
  return ordem.map((status) => {
    const nela = ps.filter((p) => p.status === status);
    const horas = nela.map((p) => p.horasNaEtapa);
    const lim = HORAS_PARADO[status];
    return {
      status,
      wip: nela.length,
      idadeMediaH: horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : 0,
      maisVelhaH: horas.length ? Math.round(Math.max(...horas)) : 0,
      estouradas: lim == null ? 0 : nela.filter((p) => p.horasNaEtapa > lim).length,
      doSetor: ETAPAS_DO_SETOR.includes(status),
    };
  });
}

/**
 * O gargalo: a etapa DO SETOR que prende mais trabalho por mais tempo
 * (fila × espera, a conta de sempre numa linha). Etapa que depende do cliente
 * fica de fora — ela pode estar cheia sem que o Design possa fazer nada, e
 * apontá-la como gargalo mandaria o gestor cobrar a pessoa errada.
 */
export function gargalo(etapas: EtapaGestao[]): EtapaGestao | null {
  const candidatas = etapas.filter((e) => e.doSetor && e.wip > 0);
  if (candidatas.length === 0) return null;
  return candidatas.reduce((a, b) => (b.wip * b.idadeMediaH > a.wip * a.idadeMediaH ? b : a));
}

export interface FluxoPeriodo {
  entrou: number;
  saiu: number;
  /** Positivo = a fila cresceu no período. */
  saldo: number;
  /** Dias até a fila atual vazar no ritmo de saída do período. `null` sem saída. */
  diasDeFila: number | null;
}

export function fluxoDoPeriodo(entradas: { valor: number }[], saidas: { valor: number }[], wipDoSetor: number, dias: number): FluxoPeriodo {
  const ult = <T,>(xs: T[]) => xs.slice(-dias);
  const entrou = ult(entradas).reduce((a, b) => a + b.valor, 0);
  const saiu = ult(saidas).reduce((a, b) => a + b.valor, 0);
  const porDia = saiu / Math.max(1, dias);
  return { entrou, saiu, saldo: entrou - saiu, diasDeFila: porDia > 0 ? Math.round((wipDoSetor / porDia) * 10) / 10 : null };
}

export interface Ciclo {
  /** Mediana de horas entre a demanda entrar e a arte ir pro cliente. */
  ateArteH: number | null;
  /** Mediana de horas entre a arte ir e o cliente responder. */
  ateAprovacaoH: number | null;
  /** Quantas peças entraram na conta. */
  base: number;
}

/** Tempo de ciclo pela mediana, não pela média: um pedido esquecido há 40 dias
 *  puxa a média do setor inteiro e faz o número mentir. */
export function ciclo(ps: ProjetoDesign[], agora: Date, dias = 7): Ciclo {
  const corte = agora.getTime() - dias * 86_400_000;
  const h = (de: string | null, ate: string | null) => (de && ate ? (Date.parse(ate) - Date.parse(de)) / 3_600_000 : null);
  const recentes = ps.filter((p) => p.enviadaEm && Date.parse(p.enviadaEm) >= corte);
  const ate = recentes.map((p) => h(p.criadoEm, p.enviadaEm)).filter((x): x is number => x != null && x >= 0 && x < 24 * 60);
  const apr = ps.filter((p) => p.aprovadoEm && Date.parse(p.aprovadoEm) >= corte)
    .map((p) => h(p.enviadaEm, p.aprovadoEm)).filter((x): x is number => x != null && x >= 0 && x < 24 * 60);
  const arred = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
  return { ateArteH: arred(mediana(ate)), ateAprovacaoH: arred(mediana(apr)), base: recentes.length };
}

export interface Retrabalho {
  /** Artes que o cliente devolveu pedindo ajuste (no período). */
  devolvidas: number;
  aprovadas: number;
  /** % aprovado sem voltar. `null` quando nada foi decidido no período. */
  taxaPrimeira: number | null;
  /** Peças que já voltaram mais de uma vez. */
  reincidentes: number;
}

export function retrabalho(ps: ProjetoDesign[], agora: Date, dias = 7): Retrabalho {
  const corte = agora.getTime() - dias * 86_400_000;
  const devolvidas = ps.filter((p) => p.naoAprovadoEm && Date.parse(p.naoAprovadoEm) >= corte).length;
  const aprovadas = ps.filter((p) => p.aprovadoEm && Date.parse(p.aprovadoEm) >= corte).length;
  return {
    devolvidas, aprovadas,
    taxaPrimeira: devolvidas + aprovadas > 0 ? Math.round((aprovadas / (devolvidas + aprovadas)) * 100) : null,
    reincidentes: ps.filter((p) => p.reaprovado).length,
  };
}

/** As peças mais velhas da fila do SETOR — o que envelhece sem ninguém olhar. */
export function envelhecendo(ps: ProjetoDesign[], quantos = 6): ProjetoDesign[] {
  return ps.filter((p) => ETAPAS_DO_SETOR.includes(p.status))
    .sort((a, b) => b.horasNaEtapa - a.horasNaEtapa).slice(0, quantos);
}
