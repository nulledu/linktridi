// ── Grade responsiva com TETO de colunas ─────────────────────────────────────
//
// O problema: `gridTemplateColumns: "repeat(4, 1fr)"` é fixo — no celular as 4
// colunas viram 70px cada e o conteúdo fica ilegível/cortado.
//
// A troca ingênua por `repeat(auto-fit, minmax(min(100%, 185px), 1fr))` conserta
// o celular mas ESTRAGA o desktop: com 1100px de largura o auto-fit cabe 5 ou 6
// colunas, e a fileira que era de 4 vira outra coisa. (Medido, não suposto.)
//
// A fórmula aqui põe um PISO por coluna que é o próprio 1/N do container:
//   max(minPx, (100% - gaps)/N)
// Em tela larga o 1/N vence → nunca passa de N colunas (o desktop fica idêntico).
// Em tela estreita o minPx vence → quebra sozinho em menos colunas.
// O `min(100%, …)` garante que uma coluna nunca fique maior que o container
// (senão a página ganha rolagem horizontal em telas muito estreitas).
//
// Uso: gridTemplateColumns: grade(185, 4, 12)   // era repeat(4, 1fr) com gap 12
export function grade(minPx: number, colunas: number, gapPx: number): string {
  const gaps = (colunas - 1) * gapPx;
  return `repeat(auto-fit, minmax(min(100%, max(${minPx}px, calc((100% - ${gaps}px) / ${colunas}))), 1fr))`;
}
