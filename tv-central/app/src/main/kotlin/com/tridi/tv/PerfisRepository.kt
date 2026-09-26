package com.tridi.tv

import com.tridi.tv.core.network.ApiClient
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Os PERFIS publicados no ERP — os modelos de tela que esta TV pode rodar.
 *
 * Só o cabeçalho de cada perfil (nome, formato, polegadas) é lido aqui: quem
 * desenha os widgets é o painel, e a tela de escolha não precisa carregar o
 * layout inteiro de todos os perfis para mostrar três cartões.
 *
 * Isto mora no `:app` e não num painel porque a ESCOLHA é do aparelho, não de
 * um painel específico — é a mesma natureza do endereço do servidor.
 */
@Serializable
data class PerfilResumo(
    val id: String = "",
    val nome: String = "",
    val descricao: String = "",
    val paraTela: String = "16:9",
    val polegadas: Int = 50,
    /**
     * As telas do perfil. Só a QUANTIDADE interessa aqui — o cartão mostra
     * "5 telas", e quem desenha os widgets é a página do ERP.
     *
     * É `JsonArray` de propósito. Antes era uma lista de uma classe vazia, e
     * bastava o ERP acrescentar um campo dentro de um slide para a leitura
     * inteira falhar — a TV então caía nos painéis nativos, sem dizer nada,
     * como se nenhum perfil existisse. Um formato que só precisa ser CONTADO
     * não deve ter opinião sobre o conteúdo.
     */
    val slides: JsonArray = JsonArray(emptyList()),
)

@Serializable
private data class ConfigComPerfis(val perfis: List<PerfilResumo>? = null)

@Singleton
class PerfisRepository @Inject constructor(
    private val api: ApiClient,
) {
    /**
     * `null` quando não deu para saber (sem rede, ERP antigo sem perfis). É
     * DIFERENTE de lista vazia: vazio significa "o ERP respondeu e não há perfil
     * montado", e a tela diz isso; `null` mantém a escolha antiga funcionando em
     * vez de acusar o instalador de não ter configurado nada.
     */
    suspend fun listar(): List<PerfilResumo>? = try {
        api.get<ConfigComPerfis>("/api/config").perfis
    } catch (e: Exception) {
        // Com o catch mudo, um erro de leitura aparecia como "este ERP não tem
        // perfis" — a TV mostrava os painéis nativos e ninguém tinha por onde
        // começar a procurar. O log não muda o comportamento; muda o tempo até
        // alguém descobrir o motivo.
        android.util.Log.w("TridiTV", "não consegui ler os perfis do ERP", e)
        null
    }
}
