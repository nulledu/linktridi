package com.tridi.tv.core.panelapi

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * O registro é o contrato inteiro: é ele que faz um painel novo aparecer sem
 * ninguém tocar no núcleo. Estes testes trancam as três regras que, quebradas,
 * só apareceriam numa TV pendurada na parede.
 */
class PanelRegistryTest {

    private fun painel(
        id: String,
        titulo: String = id,
        areas: Set<String> = emptySet(),
    ) = object : PanelPlugin {
        override val descriptor = PanelDescriptor(
            id = PanelId(id),
            title = titulo,
            subtitle = "",
            iconPath = "",
            accentHex = "#0A84FF",
            requiredAreas = areas,
        )

        @Composable
        override fun Content(modifier: Modifier) = Unit
    }

    @Test
    fun `registro vazio nao quebra`() {
        // O app precisa subir e dizer "nenhum painel" em vez de estourar: é o
        // estado de um APK montado sem nenhum :panel:*.
        val registry = PanelRegistry(emptySet())
        assertTrue(registry.isEmpty)
        assertTrue(registry.all.isEmpty())
        assertNull(registry.find(PanelId("administracao")))
    }

    @Test
    fun `ordem e estavel entre boots`() {
        // O Hilt monta um Set — a ordem de iteração não é garantida. Sem
        // ordenação, os cards do seletor trocariam de lugar a cada reinício da
        // TV, e quem escolhe pelo controle erraria o painel.
        val a = painel("vendas", "Vendas")
        val b = painel("administracao", "Administração")
        val c = painel("logistica", "Logística")

        val umaOrdem = PanelRegistry(setOf(a, b, c)).all.map { it.descriptor.title }
        val outraOrdem = PanelRegistry(setOf(c, a, b)).all.map { it.descriptor.title }

        assertEquals(listOf("Administração", "Logística", "Vendas"), umaOrdem)
        assertEquals(umaOrdem, outraOrdem)
    }

    @Test
    fun `find devolve o painel salvo e nulo quando ele sumiu do APK`() {
        val registry = PanelRegistry(setOf(painel("administracao"), painel("logistica")))

        assertEquals("administracao", registry.find(PanelId("administracao"))?.descriptor?.id?.value)
        // Painel removido num update: o núcleo tem que devolver null para a tela
        // cair no seletor COM aviso, em vez de abrir outro painel qualquer.
        assertNull(registry.find(PanelId("producao")))
        assertNull(registry.find(null))
    }

    @Test
    fun `areas filtram o que este aparelho pode exibir`() {
        val livre = painel("recepcao", "Recepção")
        val admin = painel("administracao", "Administração", areas = setOf("administracao"))
        val logi = painel("logistica", "Logística", areas = setOf("logistica"))
        val registry = PanelRegistry(setOf(livre, admin, logi))

        // Painel sem exigência aparece para todo mundo.
        assertEquals(
            listOf("Recepção"),
            registry.visibleFor(emptySet()).map { it.descriptor.title },
        )
        assertEquals(
            listOf("Logística", "Recepção"),
            registry.visibleFor(setOf("logistica")).map { it.descriptor.title },
        )
        assertEquals(3, registry.visibleFor(setOf("administracao", "logistica")).size)
    }

    @Test
    fun `exigencia de varias areas so passa com todas`() {
        val diretoria = painel("diretoria", "Diretoria", areas = setOf("administracao", "financeiro"))
        val registry = PanelRegistry(setOf(diretoria))

        assertTrue(registry.visibleFor(setOf("administracao")).isEmpty())
        assertEquals(1, registry.visibleFor(setOf("administracao", "financeiro")).size)
    }
}
