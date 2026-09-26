package com.tridi.market.sync

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Trava do crash de 03/08/2026 no totem.
 *
 * O manifesto REMOVE o `WorkManagerInitializer` padrão. Removido ele, quem
 * inicializa o WorkManager precisa ser a Application, via `Configuration.Provider`.
 * Sem esse par, o WorkManager só existe depois que o código do app roda — e quem
 * inicia o `SystemJobService` é o SISTEMA, sozinho: quando o sync periódico
 * dispara com o totem fora da tela, logo depois de instalar ou ao reiniciar o
 * tablet. Nesses momentos o serviço subia sem WorkManager e o Android matava o
 * processo:
 *
 *   FATAL EXCEPTION: Unable to create service SystemJobService:
 *   WorkManager needs to be initialized via a ContentProvider#onCreate()
 *
 * O totem crashava sozinho, sem ninguém tocar nele. É um teste de TEXTO porque a
 * outra ponta é o manifesto: as duas peças só fazem sentido juntas, e quem
 * remover uma precisa ser avisado da outra na hora, não pela fatura do suporte.
 */
class WorkManagerConfiguradoTest {

    private fun ler(caminho: String): String {
        val arquivo = File(caminho)
        assertTrue("não achei $caminho (rodando de ${File(".").absolutePath})", arquivo.exists())
        return arquivo.readText()
    }

    @Test
    fun `removendo o inicializador padrao, a Application precisa fornecer a configuracao`() {
        val manifesto = ler("src/main/AndroidManifest.xml")
        val application = ler("src/main/java/com/tridi/market/MarketApplication.kt")

        val removeOInicializador = manifesto.contains("androidx.work.WorkManagerInitializer") &&
            manifesto.contains("tools:node=\"remove\"")

        if (removeOInicializador) {
            assertTrue(
                "O manifesto remove o WorkManagerInitializer mas a MarketApplication não " +
                    "implementa Configuration.Provider — o SystemJobService iniciado pelo " +
                    "sistema vai derrubar o app.",
                application.contains("Configuration.Provider"),
            )
            assertTrue(
                "Falta a configuração que o Configuration.Provider exige.",
                application.contains("workManagerConfiguration"),
            )
        }
    }

    @Test
    fun `ninguem volta a inicializar o WorkManager na mao`() {
        // `WorkManager.initialize` dentro do agendador foi o que mascarou o
        // problema: funcionava para quem entrava pelo app e deixava o caminho do
        // sistema quebrado. Com Configuration.Provider isso não é mais preciso.
        val agendador = ler("src/main/java/com/tridi/market/sync/MarketWorkScheduler.kt")
        assertTrue(
            "MarketWorkScheduler voltou a chamar WorkManager.initialize — isso só cobre " +
                "quem passa pelo app e deixa o SystemJobService do sistema sem inicialização.",
            !agendador.contains("WorkManager.initialize"),
        )
    }
}
