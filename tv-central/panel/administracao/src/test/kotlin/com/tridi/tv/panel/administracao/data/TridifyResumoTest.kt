package com.tridi.tv.panel.administracao.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * O contrato entre o ERP e a TV.
 *
 * A eficiência do tráfego (ROAS, ROI, CPA, lucro) é calculada UMA vez, no
 * Tridify, e viaja pronta no `/api/sales`. Se a desserialização quebrar em
 * silêncio, a TV volta a mostrar "—" no lugar dos números e ninguém descobre
 * até alguém comparar a parede com o relatório.
 *
 * O JSON abaixo é um recorte REAL da rota em produção.
 */
class TridifyResumoTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val respostaReal = """
    {
      "updatedAt": "2026-08-05T21:47:28.596Z",
      "salespeople": [], "teams": [], "topProducts": [],
      "revenue": { "daily": 1000, "weekly": 5000, "monthly": 44039, "trendPct": 8.4 },
      "tridify": {
        "gasto": 28294, "gastoComImposto": 32207,
        "faturamentoTrafego": 21322, "pedidosTrafego": 116,
        "faturamentoEmpresa": 53656,
        "faturamentoDia": 7470, "faturamentoSemana": 40298,
        "pedidosEmpresa": 288, "projecaoMes": 277221,
        "organico": 3882, "marketplace": 592,
        "roas": 0.6620355868431606, "roi": -0.3379644131568395,
        "mer": 1.377627443314432, "lucro": -10885,
        "margem": -51.04928192280167, "cpa": 277.6470706896552,
        "roasEquilibrio": 1.160496692584426,
        "ticketMedio": 277, "taxaAprovacao": 13.157894736842104,
        "pctAtribuido": 17.738489701064733
      }
    }
    """

    @Test
    fun `le a eficiencia do trafego vinda do Tridify`() {
        val s = json.decodeFromString(SalesSnapshot.serializer(), respostaReal)
        val t = requireNotNull(s.tridify) { "bloco tridify não desserializou" }

        assertEquals(21322.0, t.faturamentoTrafego, 0.01)
        assertEquals(32207.0, t.gastoComImposto, 0.01)
        assertEquals(116, t.pedidosTrafego)
        assertEquals(0.662, t.roas!!, 0.001)
        assertEquals(-10885.0, t.lucro, 0.01)
        assertEquals(277.65, t.cpa!!, 0.01)
    }

    @Test
    fun `o ROAS que chega é receita do trafego sobre gasto COM imposto`() {
        // Trava a régua: se algum dia o servidor mandar ROAS contra a fatura
        // crua (o erro antigo do painel), a conta deixa de fechar aqui.
        val t = json.decodeFromString(SalesSnapshot.serializer(), respostaReal).tridify!!
        assertEquals(t.faturamentoTrafego / t.gastoComImposto, t.roas!!, 0.001)
        assertEquals(t.faturamentoTrafego - t.gastoComImposto, t.lucro, 1.0)
        assertEquals(t.gastoComImposto / t.pedidosTrafego, t.cpa!!, 0.01)
    }

    @Test
    fun `o faturamento do dia e da semana cabem no mes`() {
        // Os três saem da MESMA série da empresa no servidor. Se algum dia
        // voltarem a sair de bases diferentes, o recorte menor passa a poder
        // ultrapassar o maior — e é assim que a parede mostra um dia maior que
        // o mês inteiro sem ninguém entender por quê.
        val t = json.decodeFromString(SalesSnapshot.serializer(), respostaReal).tridify!!
        assertTrue(t.faturamentoDia <= t.faturamentoSemana)
        assertTrue(t.faturamentoSemana <= t.faturamentoEmpresa)
        // Projeção é run-rate: nunca abaixo do que já foi feito no mês.
        assertTrue(t.projecaoMes >= t.faturamentoEmpresa)
        // Marketplace fica FORA do total da empresa, por decisão do painel.
        assertTrue(t.marketplace > 0 && t.marketplace < t.faturamentoEmpresa)
    }

    @Test
    fun `resposta sem o bloco tridify nao quebra a TV`() {
        // ERP mais antigo, ou o Tridify fora do ar: a TV mostra o resto e põe
        // "—" nas métricas de eficiência, em vez de falhar a tela inteira.
        val semTridify = """
        { "updatedAt": "x", "salespeople": [], "teams": [], "topProducts": [],
          "revenue": { "daily": 0, "weekly": 0, "monthly": 0, "trendPct": 0 } }
        """
        val s = json.decodeFromString(SalesSnapshot.serializer(), semTridify)
        assertNull(s.tridify)
    }

    @Test
    fun `campo novo no servidor nao derruba a versao antiga do app`() {
        // `ignoreUnknownKeys`: o web publica um campo novo hoje, as TVs só são
        // atualizadas semana que vem.
        val comExtra = respostaReal.replace(
            "\"gasto\": 28294",
            "\"gasto\": 28294, \"metricaQueAindaNaoExiste\": 42",
        )
        val s = json.decodeFromString(SalesSnapshot.serializer(), comExtra)
        assertTrue(s.tridify!!.gasto > 0)
    }
}
