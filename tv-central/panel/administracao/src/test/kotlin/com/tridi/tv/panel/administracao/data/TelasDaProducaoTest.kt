package com.tridi.tv.panel.administracao.data

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * O perfil de Produção do ERP tem que virar a tela nova — e a de Estoque tem
 * que ficar EXATAMENTE onde estava.
 *
 * Este teste existe porque o mapeamento é uma string: um dígito trocado numa
 * coordenada e o slide simplesmente não casa, o upgrade não acontece e a parede
 * continua mostrando o desenho antigo. Nada quebra, nada avisa — só fica igual,
 * que é o defeito mais difícil de enxergar olhando a TV.
 *
 * As assinaturas abaixo são as do `/api/config` de produção, copiadas do perfil
 * `p-producao` como ele está hoje.
 */
class TelasDaProducaoTest {

    private fun slide(nome: String, vararg w: String) = SlideLayout(
        id = "s-$nome",
        nome = nome,
        ativo = true,
        widgets = w.map { spec ->
            val (tipo, caixa) = spec.split(":")
            val (x, y, cw, ch) = caixa.split(",").map { it.toInt() }
            WidgetLayout(id = "w-$tipo-$x-$y", tipo = tipo, x = x, y = y, w = cw, h = ch)
        },
    )

    private operator fun <T> List<T>.component4(): T = this[3]

    private val perfilDeProducao = listOf(
        slide(
            "Turno",
            "texto:0,0,8,1", "relogio:8,0,4,1",
            "kpi:0,1,4,2", "kpi:4,1,4,2", "kpi:8,1,4,2",
            "kpi:0,3,4,2", "kpi:4,3,4,2", "kpi:8,3,4,2",
            "pessoas:0,5,12,3",
        ),
        slide("Quem está produzindo", "texto:0,0,8,1", "relogio:8,0,4,1", "pessoas:0,1,12,7"),
        slide(
            "Estoque e avisos",
            "texto:0,0,8,1", "relogio:8,0,4,1",
            "kpi:0,1,4,2", "kpi:4,1,4,2", "kpi:8,1,4,2",
            "estoque:0,3,7,5", "alertas:7,3,5,5",
        ),
    )

    @Test
    fun `as duas telas de gente viram UMA tela nova`() {
        val telas = perfilDeProducao.comTelasAtualizadas()

        // Três slides viram dois: "Turno" e "Quem está produzindo" falavam da
        // mesma coisa e agora são o mesmo desenho, então colapsam.
        assertEquals(2, telas.size)
        assertEquals(listOf("classico-producao-equipe"), telas[0].widgets.map { it.tipo })
    }

    @Test
    fun `a tela de estoque continua intacta`() {
        val telas = perfilDeProducao.comTelasAtualizadas()

        // É outro assunto e o pedido foi explícito: não mexer nas outras telas.
        // Se um dia alguém mapear esta assinatura por engano, o teste avisa
        // antes de a parede perder o estoque.
        assertEquals("Estoque e avisos", telas[1].nome)
        assertEquals(
            listOf("texto", "relogio", "kpi", "kpi", "kpi", "estoque", "alertas"),
            telas[1].widgets.map { it.tipo },
        )
    }

    @Test
    fun `a tela nova ocupa a grade inteira`() {
        val bloco = perfilDeProducao.comTelasAtualizadas()[0].widgets.single()

        // Tela cheia é UM bloco que se desenha sozinho: se sair menor que a
        // grade, ela nasce numa caixinha no canto.
        assertEquals(0, bloco.x)
        assertEquals(0, bloco.y)
        assertEquals(12, bloco.w)
        assertEquals(8, bloco.h)
    }
}
