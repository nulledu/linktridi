package com.tridi.tv.panel.administracao.data

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * O Comercial de fábrica vira Ranking do mês + Batalha na leitura; o perfil
 * que alguém mexeu fica como está. Mesmo critério do web
 * (`painel-classico.test.ts`, "comercial enxuto").
 */
class ComercialEnxutoTest {
    private fun cheia(id: String, tipo: String) = SlideLayout(
        id = id, nome = id, ativo = true,
        widgets = pecasDaTelaCheia(tipo, "w-$id"),
    )

    private val cinco = listOf(
        cheia("s-c-rank", "classico-ranking"), cheia("s-c-bat", "classico-batalha"),
        cheia("s-c-fin", "classico-financeiro"), cheia("s-c-traf", "classico-trafego"),
        cheia("s-c-prod", "classico-produtos"),
    )

    @Test
    fun `comercial de fabrica com 5 telas vira 2`() {
        val novo = comercialAtualizado(cinco)
        assertEquals(listOf("Ranking", "Batalha"), novo.map { it.nome })
        assertEquals(
            listOf("texto", "relogio", "podio", "kpi", "kpi", "kpi", "kpi", "equipe"),
            novo[0].widgets.map { it.tipo },
        )
        assertEquals(
            listOf("faturamento_mes", "meta_pct", "pedidos_dia", "ticket_medio"),
            novo[0].widgets.filter { it.tipo == "kpi" }.map { it.texto("metrica") },
        )
    }

    @Test
    fun `sem a tela de produtos (aposentada antes) ainda e de fabrica`() {
        assertEquals(listOf("Ranking", "Batalha"), comercialAtualizado(cinco.take(4)).map { it.nome })
    }

    @Test
    fun `comercial mexido fica como esta`() {
        assertEquals(3, comercialAtualizado(cinco.take(3)).size)
        val movido = cinco.mapIndexed { i, s ->
            if (i != 2) s else s.copy(widgets = s.widgets.mapIndexed { j, w -> if (j == 0) w.copy(x = w.x + 1) else w })
        }
        // A tela de produtos de fábrica é aposentada na leitura, como sempre: sobram 4.
        assertEquals(4, comercialAtualizado(movido).size)
    }

    @Test
    fun `a receita nova bate com a do web, peca por peca`() {
        val pecas = pecasDaTelaCheia("comercial-simples", "x")
        assertEquals("texto:0,0,8,1|relogio:8,0,4,1|podio:2,1,8,4|kpi:0,5,3,2|kpi:3,5,3,2|kpi:6,5,3,2|kpi:9,5,3,2|equipe:0,7,12,1",
            pecas.joinToString("|") { "${it.tipo}:${it.x},${it.y},${it.w},${it.h}" })
    }
}
