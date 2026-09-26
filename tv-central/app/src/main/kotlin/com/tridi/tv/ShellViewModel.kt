package com.tridi.tv

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tridi.tv.core.network.ApiClient
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.panelapi.PanelPlugin
import com.tridi.tv.core.panelapi.PanelRegistry
import com.tridi.tv.core.sinal.Evento
import com.tridi.tv.core.sinal.SinalDaParede
import com.tridi.tv.core.storage.DeviceStore
import kotlinx.coroutines.flow.filterIsInstance
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** O que a tela raiz está mostrando. */
sealed interface Destino {
    /** Ainda lendo o disco — não pisca o seletor antes de saber. */
    data object Carregando : Destino
    data object Seletor : Destino
    data class Painel(val plugin: PanelPlugin) : Destino

    /**
     * O painel do ERP, aberto como página — a mesma que abre no navegador.
     *
     * É o destino de um PERFIL. Antes um perfil virava a grade nativa, que
     * redesenhava em Compose o que a web já desenha; as duas divergiam a cada
     * mudança feita no site, e o que a parede mostrava nunca era o que a pessoa
     * tinha aprovado na tela do computador.
     */
    data class Web(val url: String, val titulo: String) : Destino
}

data class ShellState(
    val destino: Destino = Destino.Carregando,
    val disponiveis: List<PanelPlugin> = emptyList(),
    /**
     * Os PERFIS publicados no ERP. Quando existem, são eles que a tela de
     * escolha oferece — o painel virou detalhe de implementação, e quem escolhe
     * escolhe um DESENHO, não um módulo do aplicativo.
     *
     * `null` = ainda não sei (sem rede, ou ERP sem perfis): aí a escolha antiga,
     * por painel, continua valendo. Uma TV instalada não pode parar de
     * funcionar porque o servidor demorou a responder.
     */
    val perfis: List<PerfilResumo>? = null,
    /** Painel salvo sumiu do APK (removido num update). Avisa em vez de sumir calado. */
    val painelSumiu: Boolean = false,
    /** Tela de configuração por cima de tudo. Não é um destino salvo em disco. */
    val setupAberto: Boolean = false,
    /**
     * A tela de escolha, aberta por cima do painel — sem apagar o que está
     * escolhido. É uma visita: sair sem escolher devolve a TV ao painel.
     */
    val seletorAberto: Boolean = false,
    /** Quiosque pedido pela configuração; só tem efeito com Device Owner. */
    val kiosk: Boolean = false,
    /** O id do perfil que está no ar — o que decide o formato da tela. */
    val perfilEmUso: String? = null,
    /**
     * Quanto esta TV desenha girado (0/90/180/270). Vive no Shell, e não no
     * painel, porque envolve TUDO — inclusive a configuração: numa TV em pé, a
     * tela de ajustes deitada seria ilegível justo para quem foi consertá-la.
     */
    val giro: Int = 0,
    /**
     * O perfil escolhido foi desenhado para tela EM PÉ (`paraTela: "9:16"`).
     *
     * Existe porque o giro do aparelho era uma configuração manual e o formato
     * do perfil não mandava em nada: quem escolhia a Logística — que é 9:16 —
     * via a parede continuar deitada, com o desenho em pé espremido no meio.
     * Um perfil 9:16 numa saída 16:9 quer dizer exatamente uma coisa: esta TV
     * está pendurada em pé. Ver `giroEfetivo`.
     */
    val perfilRetrato: Boolean = false,
)

@HiltViewModel
class ShellViewModel @Inject constructor(
    private val registry: PanelRegistry,
    private val store: DeviceStore,
    private val perfisRepo: PerfisRepository,
    private val api: ApiClient,
    private val sinal: SinalDaParede,
) : ViewModel() {

    init {
        // Perfis salvos no ERP: a lista (e o formato 9:16 do perfil em uso)
        // muda na hora, sem reiniciar a TV.
        viewModelScope.launch {
            sinal.eventos.filterIsInstance<Evento.Config>().collect {
                val lista = perfisRepo.listar()
                _state.update { it.copy(perfis = lista, perfilRetrato = ehRetrato(lista, it.perfilEmUso)) }
            }
        }
    }

    private val _state = MutableStateFlow(ShellState())
    val state: StateFlow<ShellState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(store.selectedPanel, store.areas, store.selectedPerfil) { salvo, areas, perfil ->
                Triple(salvo, areas, perfil)
            }.collect { (salvo, areas, perfil) -> resolver(salvo, areas, perfil) }
        }
        viewModelScope.launch {
            store.kioskLocked.collect { travado -> _state.update { it.copy(kiosk = travado) } }
        }
        viewModelScope.launch {
            store.giroTela.collect { g -> _state.update { it.copy(giro = g) } }
        }
        // Uma leitura só, ao abrir: a lista de perfis muda quando alguém edita
        // no ERP, não de minuto em minuto. Quem está com um perfil escolhido nem
        // vê esta tela — então isto não é custo recorrente de TV instalada.
        viewModelScope.launch {
            // A lista chega DEPOIS do primeiro `resolver` (uma leitura de rede
            // contra uma de disco). Sem recalcular aqui, a TV que abre já num
            // perfil 9:16 nasceria deitada e só endireitaria no próximo reinício.
            val lista = perfisRepo.listar()
            _state.update { it.copy(perfis = lista, perfilRetrato = ehRetrato(lista, it.perfilEmUso)) }
        }
    }

    /**
     * A regra do requisito 3: escolha salva → abre direto, sem passar pelo seletor.
     * Se o painel salvo não existe mais, cai no seletor COM aviso.
     */
    private suspend fun resolver(salvo: PanelId?, areas: Set<String>, perfil: String?) {
        // Sem pareamento ainda, o aparelho vê tudo — senão a TV nova nasce vazia
        // e ninguém consegue nem escolher o primeiro painel.
        val visiveis = if (areas.isEmpty()) registry.all else registry.visibleFor(areas)

        // NATIVO: a parede é desenhada em Compose, não num WebView. Nessa TV box
        // de 2016 (WebView 55) a página web não renderiza; o Compose desenha
        // direto na GPU e sai idêntico. Um PERFIL é desenhado pelo painel de
        // grade (administracao), que lê o perfil escolhido do store.
        val plugin = when {
            !perfil.isNullOrBlank() -> registry.find(PanelId(PAINEL_DE_GRADE))
            else -> registry.find(salvo)
        }?.takeIf { it in visiveis }

        _state.update {
            it.copy(
                disponiveis = visiveis,
                destino = if (plugin != null) Destino.Painel(plugin) else Destino.Seletor,
                // Só é "sumiu" quando havia um painel salvo (não perfil) e ele não existe mais.
                painelSumiu = salvo != null && perfil.isNullOrBlank() && registry.find(salvo) == null,
                perfilEmUso = perfil,
                perfilRetrato = ehRetrato(it.perfis, perfil),
            )
        }
    }

    /**
     * O perfil pede tela em pé? Só quando o ERP diz `9:16` — sem lista de
     * perfis (TV recém-ligada, ou sem rede) a resposta é NÃO, que deixa a
     * parede como sempre esteve em vez de girar por um palpite.
     */
    private fun ehRetrato(perfis: List<PerfilResumo>?, perfilId: String?): Boolean {
        if (perfilId.isNullOrBlank()) return false
        val p = perfis?.firstOrNull { it.id.equals(perfilId, ignoreCase = true) } ?: return false
        return p.paraTela.contains("9:16")
    }

    fun escolher(plugin: PanelPlugin) = viewModelScope.launch {
        // Escolher um painel "cru" limpa o perfil: são dois modos de decidir o
        // que vai na tela, e manter os dois salvos deixaria a TV mostrando um
        // desenho que ninguém pediu na próxima vez que o ERP publicasse algo.
        store.clearPerfil()
        store.selectPanel(plugin.descriptor.id)
        _state.update { it.copy(destino = Destino.Painel(plugin), seletorAberto = false) }
    }

    /**
     * Escolher um PERFIL — o desenho publicado no ERP. Quem desenha em Compose
     * é o painel de grade (`administracao`), que lê o perfil do store.
     */
    fun escolherPerfil(perfil: PerfilResumo) = viewModelScope.launch {
        store.selectPerfil(perfil.id)
        store.selectPanel(PanelId(PAINEL_DE_GRADE))
        val plugin = registry.find(PanelId(PAINEL_DE_GRADE))
        _state.update {
            it.copy(
                destino = if (plugin != null) Destino.Painel(plugin) else it.destino,
                seletorAberto = false,
            )
        }
    }

    /**
     * Mostra a tela de escolha SEM esquecer o que está escolhido.
     *
     * Antes isto apagava a escolha salva, e o efeito era pior do que parece:
     * quem só queria espiar as opções — ou chegar na configuração, que se
     * alcança por aqui — perdia o painel da parede. Na próxima vez que a TV
     * ligasse, ela abriria na tela de escolha, esperando alguém.
     *
     * A escolha é do APARELHO e continua em disco; esta visita é da pessoa que
     * está com o controle na mão. Sair sem escolher nada devolve a TV ao painel
     * de sempre (ver `fecharSeletor`); escolher outra coisa é o que troca.
     */
    fun voltarAoSeletor() = _state.update { it.copy(seletorAberto = true) }

    /** Desiste de trocar: a TV volta ao que já estava escolhido. */
    fun fecharSeletor() = _state.update { it.copy(seletorAberto = false) }

    fun abrirSetup() = _state.update { it.copy(setupAberto = true) }

    fun fecharSetup() = _state.update { it.copy(setupAberto = false) }

    private companion object {
        /**
         * Quem desenha um perfil. É o painel que sabe montar a grade 12×8 de
         * widgets — os outros módulos são telas de assunto próprio, não
         * renderizadores.
         */
        const val PAINEL_DE_GRADE = "administracao"
    }
}
