/**
 * Quais períodos o snapshot da parede ainda cobre.
 *
 * Pedido do dono em 14/09/2026: a TV sem internet continua no ar com o último
 * dado salvo, mas "Hoje" de ONTEM não pode aparecer como hoje. A régua é a hora
 * em que o servidor montou o número (`updatedAt`), no fuso de São Paulo:
 *
 * - mesmo dia → Hoje, Semana e Mês (é o último dado do dia, e vale);
 * - outro dia, mesma semana (segunda→domingo) → Semana e Mês;
 * - outra semana, mesmo mês → só Mês;
 * - nada mais bate → só Mês (a tarja de "atualizado há…" diz desde quando).
 *
 * Carimbo ausente, ilegível ou no futuro (relógio da TV errado) não esconde
 * nada: na dúvida, a tela se comporta como sempre.
 *
 * Espelho Kotlin: `Frescor` em tv-central/.../data/Blindagem.kt.
 */
export type PeriodoParede = "daily" | "weekly" | "monthly";
const TODOS: PeriodoParede[] = ["daily", "weekly", "monthly"];

function diaSP(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function inicioDaSemana(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return new Date(Date.UTC(y, m - 1, d - ((dow + 6) % 7), 12)).toISOString().slice(0, 10);
}

export function periodosValidos(updatedAt: string | null | undefined, agora = Date.now()): PeriodoParede[] {
  const em = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(em) || em > agora + 5 * 60_000) return TODOS;
  const hoje = diaSP(agora);
  const dele = diaSP(em);
  if (hoje === dele) return TODOS;
  const out: PeriodoParede[] = [];
  if (inicioDaSemana(hoje) === inicioDaSemana(dele)) out.push("weekly");
  if (hoje.slice(0, 7) === dele.slice(0, 7)) out.push("monthly");
  return out.length ? out : ["monthly"];
}
