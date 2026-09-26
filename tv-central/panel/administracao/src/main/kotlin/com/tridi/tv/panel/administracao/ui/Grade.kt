package com.tridi.tv.panel.administracao.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.tv.panel.administracao.data.PanelConfig
import com.tridi.tv.panel.administracao.data.ResumoEstoque
import com.tridi.tv.panel.administracao.data.ResumoProducao
import com.tridi.tv.panel.administracao.data.StatusExpedicao
import com.tridi.tv.panel.administracao.data.SalesSnapshot
import com.tridi.tv.panel.administracao.data.SlideLayout
import com.tridi.tv.panel.administracao.data.WidgetLayout
import com.tridi.tv.panel.administracao.ui.widgets.RenderWidget

/** A mesma grade do web: 12 colunas × 8 linhas. */
private const val COLUNAS = 12
private const val LINHAS = 8

/** Tudo que um widget precisa saber: os dados e o tamanho da própria caixa. */
data class CaixaWidget(
    val largura: Dp,
    val altura: Dp,
    /**
     * Ajuste de leitura vindo das POLEGADAS da TV, definidas no perfil.
     *
     * Não é resolução: 55" e 24" podem ter os mesmos 1920×1080 e pedem
     * tamanhos diferentes, porque o que muda é a distância de leitura. E não é
     * proporcional à diagonal — quem instala tela maior instala mais longe, e
     * as duas coisas quase se cancelam. Ver `escalaPorPolegadas` no web, que é
     * de onde este número sai (1.0 = 50", a referência).
     */
    val escala: Float = 1f,
    /** A tela inteira abrevia valores ("R$ 59,9 mil")? Decisão do perfil. */
    val curtos: Boolean = false,
) {
    /**
     * Fonte que respeita as DUAS dimensões da caixa — o equivalente do
     * `min(cqh, cqi)` que o web resolve com container queries.
     *
     * Sem a parte da largura, um bloco largo e baixo produzia um número enorme
     * que atravessava o widget vizinho; sem a da altura, um bloco alto e
     * estreito virava letra minúscula. Foi exatamente o defeito que apareceu no
     * editor antes de existir esta função.
     */
    fun fonte(pctAltura: Float, pctLargura: Float, min: Float = 10f, max: Float = 120f): TextUnit {
        val porAltura = altura.value * pctAltura
        val porLargura = largura.value * pctLargura
        // A escala entra DEPOIS do min(altura, largura) e ANTES do teto: numa
        // TV grande o texto cresce, mas continua proibido de estourar a caixa —
        // o limite é geometria, e geometria não negocia com polegada.
        return (minOf(porAltura, porLargura) * escala).coerceIn(min, max).sp
    }
}

/**
 * Desenha um slide montado no ERP.
 *
 * Posicionamento por `offset` + `size` calculados da célula, e não por uma
 * biblioteca de grid: a grade é fixa (12×8) e cada widget já vem com x/y/w/h,
 * então a conta é direta e o resultado bate ao pixel com o editor.
 */
@Composable
fun GradeSlide(
    slide: SlideLayout,
    sales: SalesSnapshot,
    config: PanelConfig,
    modifier: Modifier = Modifier,
    producao: ResumoProducao? = null,
    expedicao: StatusExpedicao? = null,
    /**
     * Ajuste por POLEGADAS do perfil (1.0 = a TV de 50" de referência).
     *
     * Sem isto o campo "Tela: 55 pol" do editor era decoração: o número era
     * salvo, aparecia com o percentual ao lado e não mudava um pixel na parede.
     */
    escala: Float = 1f,
    /** Números curtos na tela inteira (decisão do perfil). */
    curtos: Boolean = false,
    estoque: ResumoEstoque? = null,
    /** Procedência do dado, para os blocos que a escrevem na tela. */
    semRede: Boolean = false,
    dadoDe: Long? = null,
) {
    BoxWithConstraints(modifier.fillMaxSize()) {
        val vao = 6.dp                                   // o mesmo respiro do web
        val celulaL = (maxWidth - vao * (COLUNAS - 1)) / COLUNAS
        val celulaA = (maxHeight - vao * (LINHAS - 1)) / LINHAS

        slide.widgets.forEach { w ->
            val larg = celulaL * w.larguraSegura + vao * (w.larguraSegura - 1)
            val alt = celulaA * w.alturaSegura + vao * (w.alturaSegura - 1)
            Box(
                Modifier
                    .offset(
                        x = (celulaL + vao) * w.xSeguro,
                        y = (celulaA + vao) * w.ySeguro,
                    )
                    .size(width = larg, height = alt),
            ) {
                RenderWidget(w, CaixaWidget(larg, alt, escala, curtos), sales, config, producao, expedicao, estoque, semRede, dadoDe)
            }
        }
    }
}
