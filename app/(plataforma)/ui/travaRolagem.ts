// ── Trava de rolagem do fundo (com CONTAGEM) ─────────────────────────────────
// Quem abre uma camada (painel lateral, modal, lightbox) pede a trava e recebe
// uma função de soltar. A rolagem só volta quando o ÚLTIMO soltar.
//
// Antes cada camada salvava o `overflow` do body na entrada e restaurava na
// saída, por conta própria. Isso depende da ORDEM de desmonte — e quando o React
// remove uma árvore inteira ele roda o cleanup do PAI antes do FILHO. Fechar a
// gaveta da pessoa com um painel aberto dentro dela (o Esc fecha os dois: os
// dois escutam o `keydown` no document) desmontava tudo de uma vez, a gaveta
// restaurava "" e o painel de dentro restaurava "hidden" DEPOIS. Resultado: a
// página ficava travada até trocar de tela — o bug de "não consigo mais rolar".
//
// Com contagem a ordem deixa de importar: 2 pedidos, 2 solturas, e o valor
// original volta uma vez só, no fim.

let pedidos = 0;
let anterior = "";

/** Trava a rolagem do fundo. Devolve a função de soltar (idempotente). */
export function travarRolagem(): () => void {
  if (typeof document === "undefined") return () => {};
  if (pedidos === 0) {
    anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  pedidos++;
  let soltou = false;
  return () => {
    // Idempotente: em desenvolvimento o React monta/desmonta duas vezes, e um
    // cleanup chamado em dobro derrubaria a contagem de outra camada.
    if (soltou) return;
    soltou = true;
    pedidos = Math.max(0, pedidos - 1);
    if (pedidos === 0) document.body.style.overflow = anterior;
  };
}

/** Só para teste: quantas camadas estão segurando a trava agora. */
export const travasAbertas = () => pedidos;
