// ── Física de soltura (conta PURA, sem DOM) ─────────────────────────────────
// As duas metades do que a Apple chama de interface fluida na hora de SOLTAR
// (Designing Fluid Interfaces, WWDC 2018), traduzidas pra número testável:
//
//   1. PROJEÇÃO — pra onde o gesto ia. Um peteleco não solta o card onde o
//      dedo largou: solta onde ele PARARIA se deslizasse com o atrito de uma
//      rolagem. É a mesma desaceleração exponencial do scroll.
//   2. MOLA COM VELOCIDADE — a animação de assentar começa na velocidade em
//      que o dedo largou, senão há uma emenda visível entre "arrastando" e
//      "animando" (o card congela um instante e só então parte).
//
// Mora em lib/ e não no componente pelo mesmo motivo do trafego-eficiencia:
// conta pura entra aqui, onde o teste alcança sem montar DOM.

/**
 * Distância (px) que o gesto ainda percorreria ao desacelerar, dado a
 * velocidade de soltura em px/s.
 *
 * É a fórmula que a Apple USA (decaimento exponencial por quadro), não a de
 * livro de física (v²/2a) — as duas divergem bastante e o toque foi calibrado
 * na primeira. `taxa` 0.998 é o atrito de rolagem normal; 0.99 pararia antes.
 */
export function projetarParada(velocidade: number, taxa = 0.998): number {
  return ((velocidade / 1000) * taxa) / (1 - taxa);
}

/** Amostra de posição do ponteiro, pra estimar a velocidade de soltura. */
export interface AmostraDePonteiro { t: number; x: number; y: number }

/**
 * Velocidade de soltura (px/s) a partir das últimas amostras do ponteiro.
 *
 * Janela de 100ms, não "as duas últimas": o pointermove chega em rajadas
 * irregulares, e derivar de um intervalo de 4ms transforma ruído de um pixel
 * em 250 px/s fantasmas. Dedo parado no fim do gesto (amostras velhas demais)
 * = velocidade zero — soltar parado não é um peteleco.
 */
export function velocidadeDaSoltura(historico: AmostraDePonteiro[], agora: number, janelaMs = 100): { x: number; y: number } {
  const dentro = historico.filter((a) => agora - a.t <= janelaMs);
  if (dentro.length < 2) return { x: 0, y: 0 };
  const a = dentro[0], b = dentro[dentro.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
}

/**
 * Curva de mola como easing `linear()` do WAAPI, partindo da velocidade dada.
 *
 * `v0` é RELATIVO (fração do percurso por segundo), como a Apple pede: a
 * velocidade do dedo dividida pela distância que falta. `amortecimento` e
 * `resposta` são os dois parâmetros de designer da Apple — 1.0 não passa do
 * ponto; ~0.8 passa e volta, e só se usa quando o gesto TROUXE momento (que é
 * exatamente o caso da soltura). A curva é integrada numericamente porque o
 * caso com v0 ≠ 0 não tem forma fechada amigável, e 60 amostras por segundo
 * são indistinguíveis da solução exata na tela.
 */
export function curvaDeMola({ v0 = 0, amortecimento = 0.82, resposta = 0.4 }: {
  v0?: number; amortecimento?: number; resposta?: number;
} = {}): { easing: string; duration: number } {
  // Mapeamento da Apple: response é o período do sistema sem amortecimento.
  const omega = (2 * Math.PI) / resposta;
  const k = omega * omega;
  const c = 2 * amortecimento * omega;
  // Integração até assentar (posição E velocidade perto do alvo), com teto.
  const dt = 1 / 240;
  let x = 0, v = v0, t = 0;
  const pontos: number[] = [0];
  const passoDeAmostra = 1 / 60;
  let proximaAmostra = passoDeAmostra;
  while (t < 1.2) {
    v += (-k * (x - 1) - c * v) * dt;
    x += v * dt;
    t += dt;
    if (t >= proximaAmostra) { pontos.push(x); proximaAmostra += passoDeAmostra; }
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break;
  }
  pontos.push(1);
  // linear() aceita valores fora de [0,1] — é o que desenha o passar do ponto.
  return { easing: `linear(${pontos.map((p) => p.toFixed(4)).join(", ")})`, duration: Math.max(150, Math.round(t * 1000)) };
}
