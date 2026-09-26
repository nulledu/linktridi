package com.tridi.tv.panel.maquinas.data

import com.tridi.tv.core.network.ApiClient
import com.tridi.tv.core.network.Leitura
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.storage.DeviceStore
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * As lasers — lê `/api/maquinas/painel`, rota pública que devolve só contagens
 * e o estado de cada máquina. A rota do ERP exige sessão e traz o arquivo do
 * corte; a TV não tem login e não precisa desse dado.
 */
@Serializable
data class PainelMaquinas(
    /** `false` quando o ERP ainda não publicou a rota — a tela DIZ isso. */
    val disponivel: Boolean = true,
    val atualizadoEm: String = "",
    val minutosTrabalhados: Int = 0,
    val minutosPendentes: Int = 0,
    val programacoesFeitas: Int = 0,
    val programacoesPendentes: Int = 0,
    val porMaterial: List<PorMaterial> = emptyList(),
    /** OEE do setor (o mesmo `ResultadoOEE` da web). */
    val oee: Oee? = null,
    val maquinas: List<Maquina> = emptyList(),
)

@Serializable
data class PorMaterial(
    val material: String = "",
    val minutos: Int = 0,
    val programacoes: Int = 0,
)

/**
 * Uma laser, no formato de `MaquinaPainel` (lib/painel-maquinas.ts).
 * `porte` é P/M/G. Campos que a rota manda como `null` são anuláveis aqui:
 * `String` não-anulável com `null` no JSON derruba a leitura inteira.
 */
@Serializable
data class Maquina(
    val id: String = "",
    val nome: String = "",
    val porte: String = "",
    val materiais: String? = null,
    /** `produzindo`, `aguardando`, `parada` — a base do estado da parede. */
    val estado: String = "",
    val minutosHoje: Int = 0,
    val atual: Programacao? = null,
    val paradaMotivo: String? = null,
    val paradaPrevisao: String? = null,
    val proximas: List<Programacao> = emptyList(),
    val oee: Oee? = null,
)

/**
 * Uma programação. A rota da web manda `referencia`, `minutosEstimados`,
 * `previsaoTermino`, `progressoPct` e `minutosRestantes`; os nomes antigos
 * (`titulo`, `minutos`, `fim`, `progresso`) ficam para o cache de versões
 * anteriores. A tela lê só pelos acessores abaixo.
 */
@Serializable
data class Programacao(
    val id: String = "",
    val referencia: String = "",
    val titulo: String = "",
    val material: String? = null,
    val minutosEstimados: Double = 0.0,
    val minutos: Int = 0,
    val inicio: String? = null,
    val previsaoTermino: String? = null,
    val fim: String? = null,
    val progressoPct: Double? = null,
    val progresso: Double? = null,
    val minutosRestantes: Double? = null,
    val pedidos: Int = 0,
) {
    val nome: String get() = referencia.ifBlank { titulo }
    val duracaoMin: Int get() = if (minutosEstimados > 0) minutosEstimados.toInt() else minutos
    val termino: String? get() = previsaoTermino ?: fim
    /** 0..1 */
    val fracao: Double get() = (progressoPct?.div(100.0) ?: progresso ?: 0.0).coerceIn(0.0, 1.0)
}

/** `ResultadoOEE` de lib/oee.ts. Tudo em Double: a web manda uma casa decimal. */
@Serializable
data class Oee(
    val disponibilidade: Double = 0.0,
    val desempenho: Double = 0.0,
    val qualidade: Double = 0.0,
    val oee: Double = 0.0,
    val faixa: String = "",
    val qualidadeApontada: Boolean = false,
    val minutosPerdidos: Double = 0.0,
    val pecas: Double = 0.0,
    val refugos: Double = 0.0,
)

@Singleton
class MaquinasRepository @Inject constructor(
    private val api: ApiClient,
    private val store: DeviceStore,
) {
    private val painel = PanelId("maquinas")

    suspend fun carregar(): Leitura<PainelMaquinas>? = try {
        val p: PainelMaquinas = api.get("/api/maquinas/painel")
        val agora = System.currentTimeMillis()
        store.savePanelCache(painel, CHAVE, api.json.encodeToString(PainelMaquinas.serializer(), p), em = agora)
        Leitura.daRede(p, agora)
    } catch (e: Exception) {
        // Sem rede, o último bom: melhor um número de minutos atrás — assinado
        // com a idade na tela — do que a oficina sem informação nenhuma.
            // `runCatching` e não decode cru: o cache foi gravado por uma
            // VERSÃO ANTERIOR do app. Campo que mudou de tipo ou saiu do
            // modelo faz o decode lançar de dentro do catch — a exceção sobe,
            // a leitura inteira morre, e o painel fica sem dado justamente
            // depois de uma atualização. Cache que não abre é cache que não
            // existe.
            store.panelCache(painel, CHAVE)?.let { json ->
                runCatching { api.json.decodeFromString(PainelMaquinas.serializer(), json) }.getOrNull()
            }?.let { dado ->
                Leitura.doCache(dado, em = store.panelCacheEm(painel, CHAVE) ?: 0L)
            }
    }

    private companion object {
        const val CHAVE = "painel"
    }
}
