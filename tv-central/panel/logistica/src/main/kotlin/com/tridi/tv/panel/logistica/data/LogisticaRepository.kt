package com.tridi.tv.panel.logistica.data

import com.tridi.tv.core.network.ApiClient
import com.tridi.tv.core.network.Leitura
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.storage.DeviceStore
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Logística — lê `/api/logistica/painel`, uma rota pública que devolve SÓ
 * contagens. A rota do ERP (`/api/logistica`) exige sessão e traz nome e
 * telefone de cliente; a TV não tem login e não precisa desse dado.
 *
 * O ritmo é segurado no servidor (`cached` + `ritmoAtual`), porque numa TV não
 * existe `document.hidden` nem alguém para fechar a aba.
 */
@Serializable
data class StatusExpedicao(
    val atualizadoEm: String = "",
    /** Etapa 10 — entrada da logística, ainda em separação. */
    val entrada: Int = 0,
    /** Etapa 11 — em logística. */
    val logistica: Int = 0,
    val total: Int = 0,
    val enviadosHoje: Int = 0,
    val categorias: List<CategoriaLogistica> = emptyList(),
    val faltaProducao: List<FaltaProducao> = emptyList(),
    /** Etiqueta a emitir — a etiqueta que ninguém imprimiu ainda. */
    val etiquetasPendentes: Int = 0,
    /** Prontos, podem sair hoje. */
    val prontosParaEnvio: Int = 0,
    /** Prontos mas travados por item que falta. */
    val prontosFaltandoEstoque: Int = 0,
    /** Pedidos parados/urgentes, pela CAIXA (a rota é pública: sem cliente). */
    val criticos: List<CriticoLogistica> = emptyList(),
    /** A semana de envios do gráfico; null em servidor antigo. */
    val semana: SemanaEnvios? = null,
)

@Serializable
data class CriticoLogistica(
    val etapa: String = "",
    val caixa: String? = null,
    val dias: Int = 0,
    val urgente: Boolean = false,
    val bloqueado: Boolean = false,
    val pendencias: List<String> = emptyList(),
    val faltam: Int = 0,
    val itens: Int = 0,
)

@Serializable
data class DiaEnvio(
    val dia: String = "",
    val rotulo: String = "",
    val valor: Int = 0,
)

@Serializable
data class SemanaEnvios(
    val dias: List<DiaEnvio> = emptyList(),
    val mediaMovel: List<Double> = emptyList(),
    val total: Int = 0,
    val totalAnterior: Int = 0,
    val variacaoPct: Int = 0,
    val periodo: String = "",
)

@Serializable
data class CategoriaLogistica(
    val chave: String = "",
    val rotulo: String = "",
    val valor: Int = 0,
    /** Contagem do snapshot anterior; null quando ainda não há histórico. */
    val anterior: Int? = null,
    val cor: String = "",
)

@Serializable
data class FaltaProducao(
    val categoria: String = "",
    val total: Int = 0,
    val pedidos: Int = 0,
)

@Singleton
class LogisticaRepository @Inject constructor(
    private val api: ApiClient,
    private val store: DeviceStore,
) {
    private val painel = PanelId("logistica")

    suspend fun carregar(): Leitura<StatusExpedicao>? = try {
        val s: StatusExpedicao = api.get("/api/logistica/painel")
        val agora = System.currentTimeMillis()
        store.savePanelCache(
            painel, CHAVE,
            api.json.encodeToString(StatusExpedicao.serializer(), s),
            em = agora,
        )
        Leitura.daRede(s, agora)
    } catch (e: Exception) {
        // Sem rede, o último bom: melhor um número de minutos atrás — assinado
        // com a idade na tela — do que a doca sem informação nenhuma.
            // `runCatching` e não decode cru: o cache foi gravado por uma
            // VERSÃO ANTERIOR do app. Campo que mudou de tipo ou saiu do
            // modelo faz o decode lançar de dentro do catch — a exceção sobe,
            // a leitura inteira morre, e o painel fica sem dado justamente
            // depois de uma atualização. Cache que não abre é cache que não
            // existe.
            store.panelCache(painel, CHAVE)?.let { json ->
                runCatching { api.json.decodeFromString(StatusExpedicao.serializer(), json) }.getOrNull()
            }?.let { dado ->
                Leitura.doCache(dado, em = store.panelCacheEm(painel, CHAVE) ?: 0L)
            }
    }

    private companion object {
        const val CHAVE = "status"
    }
}
