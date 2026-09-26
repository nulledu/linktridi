package com.tridi.tv.panel.administracao.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tridi.tv.core.network.pollComRecuo
import com.tridi.tv.core.sinal.Evento
import com.tridi.tv.core.sinal.SinalDaParede
import com.tridi.tv.core.storage.DeviceStore
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map
import com.tridi.tv.panel.administracao.data.AdminRepository
import com.tridi.tv.panel.administracao.data.DadosComemoracao
import com.tridi.tv.panel.administracao.data.MetaDoMes
import com.tridi.tv.panel.administracao.data.PanelConfig
import com.tridi.tv.panel.administracao.data.ResumoEstoque
import com.tridi.tv.panel.administracao.data.ResumoProducao
import com.tridi.tv.panel.administracao.data.SalesSnapshot
import com.tridi.tv.panel.administracao.data.StatusExpedicao
import com.tridi.tv.panel.administracao.data.slidesDoPerfil
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AdminUiState(
    val carregando: Boolean = true,
    val vendas: SalesSnapshot? = null,
    val config: PanelConfig = PanelConfig(),
    /** Meta do mês batida agora: o pop-up mostra isto e some sozinho. */
    val comemorando: DadosComemoracao? = null,
    /** O que está na tela veio do cache, não do servidor. */
    val semRede: Boolean = false,
    /** Quando este número foi verdade. `null` enquanto nada carregou. */
    val dadoDe: Long? = null,
    /** Chão de fábrica. `null` enquanto não foi buscado — ou quando não é usado. */
    val producao: ResumoProducao? = null,
    /** Expedição. `null` enquanto não foi buscada — ou quando não é usada. */
    val expedicao: StatusExpedicao? = null,
    val estoque: ResumoEstoque? = null,
    /** O perfil que este aparelho escolheu rodar. `null` = TV sem perfil. */
    val perfilId: String? = null,
)

@HiltViewModel
class AdminViewModel @Inject constructor(
    private val repo: AdminRepository,
    private val store: DeviceStore,
    private val sinal: SinalDaParede,
    @ApplicationContext private val contexto: Context,
) : ViewModel() {

    /** Onde a festa do mês fica lembrada (espelho do localStorage do web). */
    private val lembranca by lazy { contexto.getSharedPreferences("tridi_meta_do_mes", Context.MODE_PRIVATE) }

    private val _state = MutableStateFlow(AdminUiState())
    val state: StateFlow<AdminUiState> = _state.asStateFlow()

    init {
        // O perfil é escolhido no aparelho e pode mudar sem reiniciar o app.
        viewModelScope.launch {
            store.selectedPerfil.collect { id -> _state.update { it.copy(perfilId = id) } }
        }
    }

    private var ciclosDesdeConfig = Int.MAX_VALUE

    init {
        // O cutucão de "Painéis salvos": recarrega a config AGORA. Sem isto a
        // parede só via um perfil novo a cada CICLOS_POR_CONFIG voltas do poll
        // — com o recuo, até ~50 minutos depois de alguém clicar Salvar.
        viewModelScope.launch {
            sinal.eventos.filterIsInstance<Evento.Config>().collect {
                repo.carregarConfig()?.let { nova -> _state.update { it.copy(config = nova) } }
                ciclosDesdeConfig = 0
            }
        }
    }

    init {
        viewModelScope.launch {
            // COFRE PRIMEIRO. A tela nasce do disco em milissegundos — config,
            // vendas, produção, estoque, expedição, com o carimbo de quando
            // foram verdade. A rede, logo abaixo, é sincronização em segundo
            // plano; nunca condição para desenhar. Sem isto a TV que ligava
            // sem internet ficava em "Sincronizando…" esperando um timeout.
            val cofre = repo.doCofre()
            if (cofre.vendas != null || cofre.config != null) {
                _state.update {
                    it.copy(
                        carregando = cofre.vendas == null,
                        config = cofre.config ?: it.config,
                        vendas = cofre.vendas?.dado ?: it.vendas,
                        dadoDe = cofre.vendas?.em?.takeIf { em -> em > 0 } ?: it.dadoDe,
                        producao = cofre.producao ?: it.producao,
                        estoque = cofre.estoque ?: it.estoque,
                        expedicao = cofre.expedicao ?: it.expedicao,
                    )
                }
            }
            // Ritmo base = o `refreshIntervalMs` do backend; cada ciclo sem
            // novidade dobra o intervalo, e um snapshot diferente devolve o
            // ritmo base na hora. Fora do expediente o Ritmo já segura em 10min.
            pollComRecuo(
                baseMs = _state.value.config.refreshIntervalMs.coerceAtLeast(5_000),
                aindaVazio = { _state.value.vendas == null },
                // Config mudou → as vendas também são refeitas agora (meta nova
                // muda o percentual) e o ritmo volta ao base.
                acordar = sinal.eventos.filterIsInstance<Evento.Config>().map { },
            ) { ciclo() }
        }
    }

    /** Devolve `true` quando algo mudou — é o que impede o recuo de engolir novidade. */
    private suspend fun ciclo(): Boolean {
        // `/api/config` é meta, cor e intervalo: muda quando alguém mexe nas
        // configurações, o que não acontece de hora em hora. Buscar a cada ciclo
        // DOBRAVA as invocações da TV sem trazer nada — e invocação é a conta
        // que pausou o projeto na Vercel (ver CLAUDE.md). Agora vai junto uma
        // vez a cada CICLOS_POR_CONFIG voltas.
        if (ciclosDesdeConfig >= CICLOS_POR_CONFIG) {
            // Só troca quando VEIO alguma coisa. Sem rede e sem cache, o que
            // está na memória continua valendo — ver a nota em `carregarConfig`.
            repo.carregarConfig()?.let { nova -> _state.update { it.copy(config = nova) } }
            ciclosDesdeConfig = 0
        }
        ciclosDesdeConfig++

        /*
         * As VENDAS primeiro, e as auxiliares EM PARALELO com elas.
         *
         * Antes isto era uma fila: produção, estoque e expedição, uma depois da
         * outra, e só no fim as vendas. Cada leitura tem teto de 45s, e a da
         * expedição consulta o ERP LEGADO, que na primeira leitura do dia
         * demora dezenas de segundos. Numa TV com perfil de Logística, o
         * snapshot de vendas — o único dado sem o qual a tela não existe —
         * ficava atrás de até três minutos de espera alheia, e a parede exibia
         * "Sem dados ainda / não consegui falar com o servidor" enquanto o
         * servidor respondia normalmente. A frase era falsa: ninguém tinha
         * perguntado nada a ele ainda.
         *
         * Em paralelo, o ciclo inteiro passa a durar o que durar a leitura MAIS
         * LENTA, e não a soma de todas. A tela nasce assim que as vendas
         * chegam; produção, estoque e expedição preenchem seus blocos quando
         * chegarem. Continua valendo a regra do orçamento: só busca o que os
         * slides no ar realmente usam.
         */
        val cfg = _state.value.config
        val perfil = _state.value.perfilId
        val leitura = coroutineScope {
            val vendas = async { repo.carregarVendas() }
            val producao = if (usaProducao(cfg, perfil)) async { repo.carregarProducao() } else null
            val estoque = if (usaEstoque(cfg, perfil)) async { repo.carregarEstoque() } else null
            val expedicao = if (usaExpedicao(cfg, perfil)) async { repo.carregarExpedicao() } else null

            // As auxiliares entram na tela assim que voltam — cada uma no seu
            // tempo, sem segurar as vendas nem uma à outra.
            producao?.let { d -> launch { val r = d.await(); _state.update { it.copy(producao = r) } } }
            estoque?.let { d -> launch { val r = d.await(); _state.update { it.copy(estoque = r) } } }
            expedicao?.let { d -> launch { val r = d.await(); _state.update { it.copy(expedicao = r) } } }

            vendas.await()
        }
        val anterior = _state.value.vendas

        if (leitura == null) {
            // Nem rede nem cache: não há o que mostrar. `semRede` fica falso de
            // propósito — o aviso "último dado salvo" só faz sentido quando HÁ
            // um dado salvo na tela.
            _state.update { it.copy(carregando = false) }
            return false
        }

        val vendas = leitura.dado
        // Meta do MÊS do comercial: uma festa por mês, só na parede do
        // comercial, nunca com dado de cache (web: `slides/comemoracao.ts`).
        val festa = if (leitura.daRede && MetaDoMes.ehParedeComercial(_state.value.config.perfis, _state.value.perfilId)) {
            val com = vendas.teams.find { it.id == "comercial" }
            val ym = MetaDoMes.mesAtualSP()
            val chave = MetaDoMes.chave(ym, "comercial")
            val lembrado = runCatching { lembranca.getBoolean(chave, false) }.getOrDefault(false)
            if (com != null && MetaDoMes.deveComemorar(com, lembrado)) {
                runCatching { lembranca.edit().putBoolean(chave, true).apply() }
                DadosComemoracao(
                    time = com.name.ifBlank { "Comercial" },
                    mes = MetaDoMes.nomeDoMes(ym),
                    valor = com.current,
                    pct = if (com.goal > 0) com.current / com.goal * 100.0 else 0.0,
                )
            } else null
        } else null

        val mudou = anterior?.updatedAt != vendas.updatedAt
        _state.update {
            it.copy(
                carregando = false,
                vendas = vendas,
                // Aqui morava um bug: `semRede = vendas == null`. Com cache o
                // dado nunca era nulo, então o aviso NUNCA aparecia — justamente
                // no caso para o qual foi feito. Quem decide é a procedência.
                semRede = !leitura.daRede,
                // Cache sem carimbo (formato antigo) não apaga a hora que a
                // tela já tinha: a tarja continua dizendo "dado das 14:32".
                dadoDe = leitura.em.takeIf { em -> em > 0 } ?: it.dadoDe,
                comemorando = it.comemorando ?: festa,
            )
        }
        return mudou
    }

    fun encerrarComemoracao() = _state.update { it.copy(comemorando = null) }

    /**
     * Algum slide DO QUE ESTÁ NO AR usa o widget de produção?
     *
     * Tem de olhar o mesmo lugar de onde a tela sai — o perfil escolhido, e só
     * então o layout solto. Olhando apenas o `layout`, uma TV rodando o perfil
     * de Produção nunca buscava o dado: a tela montava e ficava eternamente em
     * "carregando produção", porque o widget existia no perfil e a verificação
     * procurava no lugar errado.
     */
    private fun usaProducao(c: PanelConfig, perfilId: String?): Boolean =
        slidesDoPerfil(c.perfis, perfilId, c.layout).any { s ->
            s.widgets.any { w ->
                // A MESMA armadilha da doca: o perfil de Produção deixou de ter
                // widget "pessoas" (as duas telas viraram a tela cheia nova), e
                // sem este nome aqui a busca nunca sairia — a parede diria "sem
                // dados da produção" para sempre, com o ERP saudável.
                w.tipo == "classico-producao-equipe" ||
                w.tipo == "producao" || w.tipo == "pessoas" ||
                    // Um KPI de produção conta tanto quanto o bloco: a parede do
                    // galpão montada com a grade 3×2 é feita de KPIs, e sem isto
                    // ela mostraria traços para sempre. Mesma armadilha que a
                    // expedição já tinha resolvido abaixo.
                    (w.tipo == "kpi" && w.texto("metrica").startsWith("producao_"))
            }
        }

    /**
     * Estoque entra pelo bloco `estoque`, por um KPI de estoque ou pelo bloco
     * de ALERTAS — é lá que "item zerado" e "esperando conferência" aparecem
     * para quem não montou a tela inteira do galpão.
     */
    private fun usaEstoque(c: PanelConfig, perfilId: String?): Boolean =
        slidesDoPerfil(c.perfis, perfilId, c.layout).any { s ->
            s.widgets.any { w ->
                w.tipo == "estoque" || w.tipo == "alertas" ||
                    (w.tipo == "kpi" && w.texto("metrica").startsWith("estoque_"))
            }
        }

    /**
     * Expedição entra pelo widget de fila OU por um KPI de expedição — a grade
     * 3×2 da doca é feita de KPIs, então olhar só o tipo do bloco deixaria a TV
     * com cinco traços na tela.
     */
    private fun usaExpedicao(c: PanelConfig, perfilId: String?): Boolean =
        slidesDoPerfil(c.perfis, perfilId, c.layout).any { s ->
            s.widgets.any { w ->
                w.tipo == "expedicao" ||
                    // A tela cheia da doca É expedição inteira: sem esta linha
                    // ela montava e ficava em "sem dados da expedição" para
                    // sempre, porque ninguém chegava a buscar o dado dela.
                    w.tipo == "classico-logistica" ||
                    w.tipo == "falta" ||
                    (w.tipo == "kpi" && w.texto("metrica").startsWith("expedicao_"))
            }
        }

    private companion object {
        /**
         * A cada quantas buscas de venda se busca a configuração. Com o ritmo
         * padrão de 30s, dá uma leitura de config a cada 5 minutos.
         */
        // 30, e não 10: a config chega pelo sinal; o poll dela é só garantia.
        const val CICLOS_POR_CONFIG = 30
    }
}
