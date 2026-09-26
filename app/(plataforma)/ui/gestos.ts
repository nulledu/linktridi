"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FÍSICA DE GESTO — o que faz uma folha "seguir o dedo" em vez de só animar.
//
// Mora aqui porque duas peças precisam do mesmo comportamento: o painel lateral
// (`ui/controles.tsx`) e a gaveta de navegação do celular (`Shell.tsx`). Se
// cada uma tivesse a sua cópia, uma ia divergir — e o app passaria a ter dois
// "arrastar pra fechar" com pesos diferentes, que é exatamente o tipo de coisa
// que faz a interface parecer remendada.
// ─────────────────────────────────────────────────────────────────────────────

/** Onde o dedo PARARIA se soltasse agora (projeção de momento do iOS).
 *  Decidir pela posição em que soltou ignora que ele estava voando: um peteleco
 *  curto e rápido tem que fechar, um arrasto longo e lento não. */
export const projetar = (v: number, d = 0.998) => (v / 1000) * d / (1 - d);

/** Resistência progressiva na borda. Parar duro lê como travado; resistir cada
 *  vez mais lê como "responde, mas não tem mais nada pra esse lado". */
export const elastico = (over: number, dim: number, k = 0.55) =>
  (over * dim * k) / (dim + k * Math.abs(over));

/** Mola criticamente amortecida (ζ = 1, sem overshoot). Não há lib de mola no
 *  projeto e não vale uma dependência por 20 linhas.
 *
 *  Anima a partir do valor ATUAL na tela, então pode ser interrompida a
 *  qualquer instante sem salto — que é o ponto todo de usar mola em vez de
 *  `transition`.
 *
 *  `v0` entra em px/SEGUNDO, a mesma unidade de `v` no laço (o `dt` está em
 *  segundos). Converter pra px/ms aqui zera a velocidade do gesto e a folha
 *  passa a escorregar em vez de ser arremessada — já aconteceu. */
export function molar(
  de: number, para: number, v0: number,
  aplicar: (v: number) => void, fim?: () => void,
) {
  const rigidez = 260, amort = 2 * Math.sqrt(rigidez);
  let x = de, v = v0, t = 0, ultimo = 0, vivo = true;
  const passo = (agora: number) => {
    if (!vivo) return;
    if (!ultimo) ultimo = agora;
    let dt = (agora - ultimo) / 1000; ultimo = agora;
    if (dt > 0.064) dt = 0.064; // aba que voltou do segundo plano não teleporta
    t += dt;
    const a = -rigidez * (x - para) - amort * v;
    v += a * dt; x += v * dt;
    if ((Math.abs(x - para) < 0.4 && Math.abs(v) < 12) || t > 1.6) {
      aplicar(para); vivo = false; fim?.(); return;
    }
    aplicar(x);
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  return () => { vivo = false; };
}

/** Teto de velocidade de gesto. Um dedo humano não passa disso; qualquer número
 *  acima é erro de medição, e erro de medição aqui vira folha fechando sozinha. */
const V_MAX = 4000;

/** Janela mínima pra afirmar uma velocidade. Abaixo disso não há evidência —
 *  é ruído de amostragem, não gesto. */
const DT_MIN = 12;

/** Histórico curto de posições pra estimar velocidade no fim do gesto.
 *  Usar só o último par de pontos dá um número instável; uma janela de ~6
 *  amostras suaviza sem atrasar.
 *
 *  Os dois limites acima não são paranoia: dois `pointermove` podem chegar no
 *  MESMO milissegundo (eventos coalescidos, ou um navegador que carimba tudo
 *  com o mesmo relógio). Dividir por essa janela quase-zero produzia dezenas de
 *  milhares de px/s, a projeção de momento estourava, e **15px de arrasto
 *  fechavam a gaveta** — exatamente o toque acidental que a folha deveria
 *  ignorar. */
export function rastro(limite = 6) {
  const pts: { p: number; t: number }[] = [];
  return {
    anota(p: number, t: number) { pts.push({ p, t }); if (pts.length > limite) pts.shift(); },
    /** px/s entre a primeira e a última amostra da janela. 0 quando a janela é
     *  curta demais pra significar alguma coisa. */
    velocidade() {
      if (pts.length < 2) return 0;
      const a = pts[0], b = pts[pts.length - 1];
      const dt = b.t - a.t;
      if (dt < DT_MIN) return 0;
      const v = ((b.p - a.p) / dt) * 1000;
      return Math.max(-V_MAX, Math.min(V_MAX, v));
    },
    zera() { pts.length = 0; },
  };
}
