// ── A que DIA um pedido pertence ─────────────────────────────────────────────
//
// O ERP guarda DOIS tipos de carimbo na mesma coluna `created_at`:
//
// · instante de verdade — "2026-08-13T18:31:31.826446+00:00". O dia dele é o
//   dia em São Paulo, três horas atrás do UTC.
// · DATA sem hora, gravada como meia-noite UTC — "2026-09-01T00:00:00+00:00".
//   São 96 dos 299 pedidos de marketplace de 2026: um terço deles.
//
// Lida como instante, a segunda vira 21h do dia ANTERIOR em São Paulo. O
// pedido do dia 1º cai no dia 31 — e na virada do mês, no mês passado. Foi
// exatamente isso que fez agosto/2026 do Mercado Livre nascer com 24 pedidos
// no ERP onde o painel do ML mostra 23: um pedido de 1º/set carimbado
// 2026-09-01T00:00:00Z caiu em agosto.
//
// Meia-noite UTC cravada — zero de minuto, de segundo e de microssegundo — não
// acontece por acaso num timestamp real: é a assinatura de data sem hora. Um
// pedido feito de fato às 21h de São Paulo carrega os segundos do relógio.

/** Meia-noite UTC exata: `T00:00:00Z`, `T00:00:00+00:00`, `T00:00:00.000000Z`… */
const SEM_HORA = /T00:00:00(\.0+)?(Z|\+00:?00)$/;
/** `2026-08-13` puro — data sem hora escrita como data, e cai na mesma regra:
 *  `Date.parse` a lê como meia-noite UTC e o desconto do fuso a jogaria pro
 *  dia 12. */
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

const MS_SP = 3 * 60 * 60 * 1000;

/**
 * O dia (YYYY-MM-DD, fuso de São Paulo) a que o pedido pertence, ou `null`
 * quando não dá pra saber.
 */
export function diaDoPedido(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // Data sem hora É a data: não se desconta fuso de quem não tem hora.
  if (SO_DATA.test(iso) || SEM_HORA.test(iso)) return iso.slice(0, 10);
  const t = Date.parse(iso);
  // Carimbo que o `Date` não entende: só aproveita se os 10 primeiros
  // caracteres forem mesmo uma data (texto qualquer de 10 letras não é).
  if (Number.isNaN(t)) return SO_DATA.test(iso.slice(0, 10)) ? iso.slice(0, 10) : null;
  return new Date(t - MS_SP).toISOString().slice(0, 10);
}

/** O pedido cai dentro de [de, ate] (datas YYYY-MM-DD em SP, inclusivas)? */
export function noPeriodo(iso: string | null | undefined, de: string, ate: string): boolean {
  const d = diaDoPedido(iso);
  return !!d && d >= de && d <= ate;
}

/**
 * A janela que a CONSULTA precisa pedir para não perder pedido nenhum.
 *
 * A consulta continua sendo por instante (é o que o PostgREST sabe filtrar),
 * então ela abre um dia de folga de cada lado: uma data sem hora do dia
 * seguinte ao fim cai antes do fim em SP, e um pedido do começo do período
 * feito de madrugada cai depois. Quem decide de verdade é o `noPeriodo`
 * rodando em cima do resultado.
 */
export function janelaFolgada(de: string, ate: string): { de: string; ate: string } {
  return { de: somaDias(de, -1), ate: somaDias(ate, 1) };
}

export function somaDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
