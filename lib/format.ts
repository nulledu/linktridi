export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

// Com centavos (valores exatos — pedidos, produtos, frete).
export const fmtBRL2 = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtNum = (n: number) => n.toLocaleString("pt-BR");

/**
 * Número grande e curto: "R$ 59,9 mil" no lugar de "R$ 59.925".
 *
 * Numa parede lida a três metros, o dígito da unidade não é informação — é
 * ruído que rouba tamanho de fonte do que importa. É prática corrente de
 * wallboard encurtar a escala e deixar o valor exato para o relatório. Quem
 * confere número contra relatório na tela desliga no perfil.
 *
 * Mora aqui, e não no painel, porque os dois desenhos da TV usam — a grade de
 * blocos e as telas clássicas. Duas cópias divergiriam na primeira correção.
 */
export function fmtCurto(n: number, dinheiro: boolean): string {
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const p = dinheiro ? "R$ " : "";
  const num = (v: number) => v.toFixed(v < 10 ? 1 : 0).replace(".", ",").replace(/,0$/, "");
  if (a >= 1_000_000) return `${s}${p}${num(a / 1_000_000)} mi`;
  if (a >= 1_000) return `${s}${p}${num(a / 1_000)} mil`;
  return dinheiro ? fmtBRL(n) : fmtNum(n);
}
