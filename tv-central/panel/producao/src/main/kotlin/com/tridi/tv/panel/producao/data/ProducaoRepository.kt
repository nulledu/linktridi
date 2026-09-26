package com.tridi.tv.panel.producao.data

import com.tridi.tv.core.network.ApiClient
import com.tridi.tv.core.network.Leitura
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.storage.DeviceStore
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Produção — lê `/api/producao/painel`, a rota pública que já alimenta o widget
 * de produção do painel de Administração.
 *
 * O modelo é declarado AQUI, e não importado do outro painel, de propósito: a
 * regra da arquitetura é que um painel nunca depende de outro (o
 * `verificarArquitetura` quebra o build se isso acontecer). O que os dois
 * compartilham é o CONTRATO da rota, não código — é o que permite mexer num
 * painel sem medo do outro.
 */
@Serializable
data class OperadorProducao(
    val id: String = "",
    val nome: String = "",
    val fotoUrl: String? = null,
    val concluidas: Int = 0,
    val emAndamento: Int = 0,
    val pendentes: Int = 0,
    val pecas: Int = 0,
    /** `null` quando nenhuma ordem tinha alvo — "0%" se leria como "não produziu". */
    val produtividade: Int? = null,
    val tmaMin: Int? = null,
)

@Serializable
data class TurnoProducao(
    val disponivel: Boolean = false,
    val atualizadoEm: String = "",
    /** Dia que os números representam; `ehHoje = false` quando o turno não começou. */
    val dia: String = "",
    val ehHoje: Boolean = true,
    val pecasHoje: Int = 0,
    val emAndamento: Int = 0,
    val pendentes: Int = 0,
    val urgentes: Int = 0,
    val impedidas: Int = 0,
    val concluidasHoje: Int = 0,
    val tmaMin: Int? = null,
    val operadoresAtivos: Int = 0,
    val operadores: List<OperadorProducao> = emptyList(),
)

@Singleton
class ProducaoRepository @Inject constructor(
    private val api: ApiClient,
    private val store: DeviceStore,
) {
    private val painel = PanelId("producao")

    /**
     * Sem rede, devolve o último turno salvo em vez de apagar a tela: numa
     * fábrica, tela vazia é lida como "o setor parou", não como "a rede caiu".
     */
    suspend fun carregar(): Leitura<TurnoProducao>? = try {
        val t: TurnoProducao = api.get("/api/producao/painel")
        val agora = System.currentTimeMillis()
        store.savePanelCache(painel, CHAVE, api.json.encodeToString(TurnoProducao.serializer(), t), em = agora)
        Leitura.daRede(t, agora)
    } catch (e: Exception) {
            // `runCatching` e não decode cru: o cache foi gravado por uma
            // VERSÃO ANTERIOR do app. Campo que mudou de tipo ou saiu do
            // modelo faz o decode lançar de dentro do catch — a exceção sobe,
            // a leitura inteira morre, e o painel fica sem dado justamente
            // depois de uma atualização. Cache que não abre é cache que não
            // existe.
            store.panelCache(painel, CHAVE)?.let { json ->
                runCatching { api.json.decodeFromString(TurnoProducao.serializer(), json) }.getOrNull()
            }?.let { dado ->
                Leitura.doCache(dado, em = store.panelCacheEm(painel, CHAVE) ?: 0L)
            }
    }

    private companion object {
        const val CHAVE = "turno"
    }
}
