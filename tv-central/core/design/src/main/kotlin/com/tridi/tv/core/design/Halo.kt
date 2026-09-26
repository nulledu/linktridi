package com.tridi.tv.core.design

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle

/**
 * O brilho por trás do número — a assinatura visual do painel web (`/painel`),
 * que a versão de TV tinha perdido.
 *
 * No web isso é um `text-shadow` largo e colorido; aqui é a `Shadow` do
 * `TextStyle`, que o Compose desenha no mesmo passo do texto (nada de uma
 * segunda camada desalinhando quando a fonte muda de tamanho).
 *
 * Por que não é enfeite: numa TV vista de longe, em sala clara, o número
 * grande em branco puro sobre preto puro fica com a borda dura e "recortada".
 * O halo dá ao dígito uma zona de transição, e é ela que o faz parecer
 * aceso em vez de colado. É o mesmo motivo pelo qual a Apple pede materiais
 * com profundidade em vez de blocos chapados: a tela ganha camadas.
 *
 * A cor sai do PRÓPRIO texto, com alfa baixo. Halo de outra cor viraria
 * decoração; nesta cor ele lê como a luz que o número emite.
 *
 * @param intensidade quanto do brilho aparece. Acima de ~0,45 vira borrão.
 */
fun halo(cor: Color, raio: Float = 44f, intensidade: Float = 0.38f) = Shadow(
    color = cor.copy(alpha = intensidade),
    blurRadius = raio,
)

/** Atalho: o estilo de um número grande já com o halo da própria cor. */
fun estiloComHalo(cor: Color, raio: Float = 44f) = TextStyle(shadow = halo(cor, raio))
