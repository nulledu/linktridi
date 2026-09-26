package com.tridi.estoque.ui

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.tridi.estoque.BuildConfig
import com.tridi.estoque.catalogo.ItemConsultado
import com.tridi.estoque.catalogo.vazioDaConsulta
import com.tridi.estoque.conferencia.DestinoDaConferencia
import com.tridi.estoque.conferencia.RascunhoConferencia
import com.tridi.estoque.conferencia.comAsImpressas
import com.tridi.estoque.conferencia.pendentesDeImpressao
import com.tridi.estoque.data.EstoqueDatabase
import com.tridi.estoque.data.EstoqueRepository
import com.tridi.estoque.data.OperadorEntity
import com.tridi.estoque.data.SyncFeedbackEntity
import com.tridi.estoque.data.autenticarOperador
import com.tridi.estoque.net.AtividadeConferenciaDto
import com.tridi.estoque.net.AvisoDePreparoDto
import com.tridi.estoque.net.BaixaItemResultado
import com.tridi.estoque.net.ItemDaSaidaDto
import com.tridi.estoque.net.CompraDto
import com.tridi.estoque.net.EtiquetaDto
import com.tridi.estoque.net.Conectividade
import com.tridi.estoque.net.EstoqueApi
import com.tridi.estoque.net.EstoqueApiException
import com.tridi.estoque.impressora.ConfigImpressora
import com.tridi.estoque.impressora.DadosEtiqueta
import com.tridi.estoque.impressora.ImpressoraPareada
import com.tridi.estoque.impressora.ProgressoImpressao
import com.tridi.estoque.impressora.ResultadoImpressao
import com.tridi.estoque.impressora.ServicoDeImpressao
import com.tridi.estoque.impressora.frasePosImpressao
import com.tridi.estoque.impressora.paraImpressao
import com.tridi.estoque.net.MotivoDto
import com.tridi.estoque.scan.LeituraResultado
import com.tridi.estoque.scan.PilhaBipagem
import com.tridi.estoque.scan.ScanFeedback
import com.tridi.estoque.scan.ScanResultado
import com.tridi.estoque.scan.ScanState
import com.tridi.estoque.scan.avisoDaLeitura
import com.tridi.estoque.scan.destinoDoRascunho
import com.tridi.estoque.scan.liberarRepeticao
import com.tridi.estoque.scan.reduceScan
import com.tridi.estoque.scan.registrarLeitura
import com.tridi.estoque.scan.EntradaResultado
import com.tridi.estoque.scan.LinhaDeEntrada
import com.tridi.estoque.scan.TETO_DE_LINHAS_DA_ENTRADA
import com.tridi.estoque.scan.removerLinha
import com.tridi.estoque.scan.somarLeitura
import com.tridi.estoque.scan.tirarUma
import com.tridi.estoque.scan.removerLeitura
import com.tridi.estoque.security.DeviceSecrets
import com.tridi.estoque.sync.AvisoDeTrabalho
import com.tridi.estoque.sync.EstoqueWorkScheduler
import com.tridi.estoque.sync.ResumoDaFila
import com.tridi.estoque.sync.TIPO_AVISO_DE_PREPARO
import com.tridi.estoque.sync.TIPO_SAIDA_POR_ITEM
import com.tridi.estoque.sync.avisoDoTrabalho
import com.tridi.estoque.sync.juntarFeedback
import com.tridi.estoque.sync.somarSaidaPorItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

// O catálogo, o carrinho e o recibo do TridiMarket saíram na poda do domínio
// de venda (ver docs/superpowers/plans/2026-08-11-estoque-fundacao-catalogo.md
// e o commit "chore(estoque-app): remove o domínio de venda do mercadinho").
// O que fica — e o que a App E3 constrói em cima — é: ativação do tablet,
// código de acesso (agora contra o diretório de operadores em cache, sem
// depender de rede), e as duas telas de trabalho do galpão: Bipar e Receber.
sealed interface EstoqueScreen {
    data object Loading : EstoqueScreen
    data object Provisioning : EstoqueScreen
    data object Welcome : EstoqueScreen
    data object Pin : EstoqueScreen
    /** Escolha entre Bipar e Receber — o que era a Home de espera virou isto. */
    data object Escolha : EstoqueScreen
    data object Bipar : EstoqueScreen
    data object Entrada : EstoqueScreen
    data object Receber : EstoqueScreen
    /** Conferência de qualidade: aprovar o trabalho pronto e admitir as peças no estoque. */
    data object Conferir : EstoqueScreen
    /** "Quantos temos disso?" — a única tela que não é fila de trabalho. */
    data object Consultar : EstoqueScreen
    /** Ajustes da impressora Bluetooth + impressão de teste. */
    data object Impressora : EstoqueScreen
}

class EstoqueViewModel(application: Application) : AndroidViewModel(application) {
    private val secrets = DeviceSecrets(application)
    private val repository = EstoqueRepository(
        EstoqueDatabase.get(application).estoqueDao(),
        EstoqueApi(BuildConfig.DEFAULT_API_BASE),
        secrets,
    )
    private val json = Json { ignoreUnknownKeys = true }

    val screen = MutableStateFlow<EstoqueScreen>(EstoqueScreen.Loading)
    val busy = MutableStateFlow(false)
    val error = MutableStateFlow<String?>(null)
    val pin = MutableStateFlow(PinState())

    /** Quem se identificou na tela de código — a "porta" antes de Bipar/Receber. */
    val operadorAtual = MutableStateFlow<OperadorEntity?>(null)

    /**
     * O retrato das filas — é dele que sai a frase da faixa do topo.
     *
     * Agregado, nunca a lista: o que a tela precisa saber é quanto tem
     * esperando, há quanto tempo e com que erro, e um lote traz até 200 códigos
     * serializados que ninguém vai ler aqui.
     *
     * O relógio da frase ("nada sobe há 45 min") anda porque este flow
     * REEMITE: cada ciclo do worker que falha grava `tentativas + 1` na linha
     * mais antiga, e a gravação empurra uma emissão nova. Sem isso a faixa
     * precisaria de um timer só pra se atualizar sozinha.
     */
    val resumoDaFila = repository.resumoDaFilaFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ResumoDaFila())

    // ── Diretório offline (motivos/compras) ──────────────────────────────────
    val motivos = MutableStateFlow<List<MotivoDto>>(emptyList())
    val compras = MutableStateFlow<List<CompraDto>>(emptyList())

    // ── Bipagem ────────────────────────────────────────────────────────────
    val pilha = MutableStateFlow(PilhaBipagem())
    val avisoBipagem = MutableStateFlow<String?>(null)

    // ── Entrada por bipagem ───────────────────────────────────────────────
    // Pilha própria, com QUANTIDADE por código (a repetição soma — ver
    // scan/PilhaDeEntrada.kt). Separada da pilha de saída de propósito: as
    // duas telas podem ter trabalho pendurado ao mesmo tempo, e uma pilha
    // compartilhada faria a baixa engolir o que era entrada.
    val pilhaEntrada = MutableStateFlow<List<LinhaDeEntrada>>(emptyList())
    val avisoEntrada = MutableStateFlow<String?>(null)
    val motivoEntrada = MutableStateFlow<String?>(null)
    val enviandoEntrada = MutableStateFlow(false)
    val motivoSelecionado = MutableStateFlow<String?>(null)
    val enviandoBaixa = MutableStateFlow(false)
    val feedbackBaixa = repository.feedbackDeBaixaFlow()
        .map { linhas -> juntarFeedback(lotesDe<BaixaItemResultado>(linhas)) { it.codigo } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /**
     * O que SAIU, por item — o número que a pessoa consegue conferir.
     *
     * `somarSaidaPorItem`, e não `juntarFeedback`: dois lotes do mesmo item são
     * duas saídas de verdade e as peças SOMAM. Deduplicar por nome, que é o que
     * o outro faz, esconderia metade do material que deixou a prateleira.
     */
    val saidaPorItem = repository.saidaPorItemFlow()
        .map { linhas -> somarSaidaPorItem(lotesDe<ItemDaSaidaDto>(linhas)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** Lotes que o servidor recusou de vez. Sem isto morriam calados no SQLite. */
    val baixasRecusadas = repository.baixasRecusadasFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** As frases que o servidor devolveu quando a fila de ENTRADA subiu. */
    val feedbackEntrada = repository.feedbackDeEntradaFlow()
        .map { linhas -> lotesDe<String>(linhas).flatten() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val entradasRecusadas = repository.entradasRecusadasFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    // ── Recebimento ───────────────────────────────────────────────────────
    val enviandoRecebimento = MutableStateFlow(false)
    val feedbackRecebimento = repository.feedbackDeRecebimentoFlow()
        .map { linhas -> juntarFeedback(lotesDe<String>(linhas)) { it } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val recebimentosRecusados = repository.recebimentosRecusadosFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    // ── Consulta de estoque ("quantos temos disso?") ──────────────────────
    //
    // A busca acontece no DISCO deste tablet, não na rede: quem está no meio do
    // galpão perde o Wi-Fi, e uma consulta que depende de rede é uma consulta
    // que não responde. A sincronização do catálogo é à parte, disparada por
    // gente (login e abrir a tela), e quase sempre não traz nada — o aparelho
    // manda a assinatura que tem e o servidor responde "não mudou".
    val termoConsulta = MutableStateFlow("")
    val resultadosConsulta = MutableStateFlow<List<ItemConsultado>>(emptyList())
    val itensNoCatalogo = MutableStateFlow(0)
    val catalogoAtualizadoEm = MutableStateFlow<Long?>(null)
    val catalogoTruncado = MutableStateFlow(false)
    val sincronizandoCatalogo = MutableStateFlow(false)

    // Uma busca por vez. Sem isto, digitar rápido dispara uma corrotina por
    // tecla e a que terminar por último vence — a lista pode acabar mostrando
    // o resultado de "mdf" depois de a pessoa já ter digitado "mdf 6".
    private var buscaEmCurso: kotlinx.coroutines.Job? = null

    // ── Conferência de qualidade ──────────────────────────────────────────
    val atividadesParaConferir = MutableStateFlow<List<AtividadeConferenciaDto>>(emptyList())
    val carregandoAtividades = MutableStateFlow(false)
    val enviandoConferencia = MutableStateFlow(false)

    /** A conferência ainda não foi instalada no servidor — a fila vem vazia por isso. */
    val qcDesligado = MutableStateFlow(false)

    // ── O destino da conferência ("em qual item isto entra?") ──────────────
    //
    // A busca acontece no MESMO catálogo local da tela de consulta — no disco,
    // sem rede. É o que faz a escolha funcionar no meio do galpão, onde o
    // Wi-Fi cai, e evita uma rota nova sendo chamada a cada tecla digitada.
    //
    // Os três palpites por caixa NÃO vêm daqui: descem prontos na lista de
    // pendentes (o servidor os calcula da tarefa). Baixar os 231 itens pra
    // pontuar no aparelho seria pagar o catálogo inteiro a cada abertura de
    // ficha — o padrão de consumo que já derrubou este projeto duas vezes.
    val termoDestino = MutableStateFlow("")
    val achadosDestino = MutableStateFlow<List<DestinoDaConferencia>>(emptyList())

    /** Mesma disciplina de `buscaEmCurso`: a corrotina anterior é cancelada. */
    private var buscaDestinoEmCurso: kotlinx.coroutines.Job? = null

    /** Conferências gravadas cujo estoque NÃO entrou: pede alguém no ERP. */
    val conferenciasTravadas = MutableStateFlow(0)
    /** Caixas atras da janela da fila — ver `vazioDaConferencia`. */
    val conferenciasAnteriores = MutableStateFlow(0)
    val conferenciasDias = MutableStateFlow(0)

    /** As etiquetas que o servidor montou — é com elas que a impressão sai certa. */
    val etiquetasDaConferencia = repository.feedbackDeConferenciaFlow()
        .map { linhas -> juntarFeedback(lotesDe<EtiquetaDto>(linhas)) { it.codigo } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val conferenciasRecusadas = repository.conferenciasRecusadasFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /**
     * As caixas que entraram no estoque SEM etiqueta, com o motivo.
     *
     * A chave da junção é a caixa + o estado: a mesma atividade reenviada (o
     * `operationId` repetido responde o resultado já gravado) não vira dois
     * avisos iguais empilhados na tela.
     */
    val avisosDePreparo = repository.avisosDePreparoFlow()
        .map { linhas -> juntarFeedback(lotesDe<AvisoDePreparoDto>(linhas)) { "${it.atividade}|${it.estado}" } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /**
     * As linhas de `sync_feedback` viradas em lotes prontos pra juntar.
     *
     * `asReversed()` porque a consulta vem do mais NOVO pro mais velho (é a
     * ordem certa pro `LIMIT` guardar o recente) e a tela quer o contrário: a
     * primeira caixa conferida é a primeira etiqueta a sair da impressora.
     *
     * Linha que não decodifica vira lote vazio em vez de derrubar as outras —
     * um JSON de uma versão anterior do app não pode levar junto a etiqueta da
     * caixa que está ali na frente esperando papel.
     */
    private inline fun <reified T> lotesDe(linhas: List<SyncFeedbackEntity>): List<List<T>> =
        linhas.asReversed().map { linha ->
            runCatching { json.decodeFromString<List<T>>(linha.resumoJson) }.getOrDefault(emptyList())
        }

    init {
        viewModelScope.launch {
            val destino = resolveStartupDestination(hasCredentials = runCatching { secrets.load() }.getOrNull() != null)
            screen.value = when (destino) {
                StartupDestination.ACTIVATION -> EstoqueScreen.Provisioning
                StartupDestination.WELCOME -> EstoqueScreen.Welcome
            }
        }
    }

    fun provision(code: String) = viewModelScope.launch {
        busy.value = true; error.value = null
        try {
            repository.provision(code)
            screen.value = EstoqueScreen.Welcome
        } catch (falha: Exception) {
            val api = falha as? EstoqueApiException
            error.value = when {
                api?.offline == true -> "Tablet sem internet. Verifique o Wi-Fi e tente de novo."
                api?.statusCode == 429 -> "Muitas tentativas. Aguarde alguns minutos e tente de novo."
                api != null && api.statusCode >= 500 -> "Servidor indisponível. Tente novamente em instantes."
                else -> "Código de ativação inválido ou expirado. Gere um novo no painel."
            }
        } finally {
            busy.value = false
        }
    }

    fun appendPin(digit: Char) { if (!pin.value.isLocked(System.currentTimeMillis())) pin.value = pin.value.append(digit) }
    fun erasePin() { pin.value = pin.value.erase() }

    fun startJourney() {
        pin.value = PinState()
        error.value = null
        screen.value = EstoqueScreen.Pin
        viewModelScope.launch {
            // O diretório offline (operadores/motivos/compras) precisa estar
            // pronto ANTES de a pessoa digitar o código — é o que deixa o
            // login funcionar sem rede. Cache primeiro (instantâneo), depois
            // tenta atualizar em segundo plano.
            motivos.value = repository.motivosCache()
            compras.value = repository.comprasCache()
            runCatching { repository.aquecerConexao() }
            atualizarDiretorio()
            // O catálogo entra aqui junto, e não num timer: quem chega pra
            // trabalhar costuma estar perto do escritório (onde tem Wi-Fi), e é
            // o momento de deixar a consulta pronta pra funcionar lá dentro, no
            // meio do galpão. Quase sempre não baixa nada — a assinatura bate e
            // a resposta é "não mudou".
            sincronizarCatalogo()
        }
    }

    private suspend fun atualizarDiretorio() {
        val dados = runCatching { repository.sincronizarBootstrap() }.getOrNull() ?: return
        motivos.value = dados.motivos
        compras.value = dados.compras
        // A altura da etiqueta e as vias que o escritório decidiu, gravadas no
        // aparelho pra valerem OFFLINE — no meio do galpão não há Wi-Fi, e a
        // etiqueta tem que sair mesmo assim. `definida = false` (ninguém
        // decidiu ainda) não grava nada: ver ImpressoraPrefs.aplicarDoEscritorio.
        dados.impressao?.let { i ->
            runCatching {
                impressao.prefs.aplicarDoEscritorio(
                    i.definida, i.alturaMm, i.larguraMm, i.copias, i.caixas, i.ocultos,
                )
            }
        }
    }

    // Confere o código contra o diretório de operadores EM CACHE — sem rede.
    // Ver data/OperadorAuth.kt: o código nunca é comparado em claro, só o hash
    // com sal contra o `verificador` de cada operador.
    fun login() = viewModelScope.launch {
        if (pin.value.isLocked(System.currentTimeMillis())) return@launch
        busy.value = true; error.value = null
        val salt = repository.saltCache()
        val operadores = repository.operadoresCache()
        val encontrado = if (salt.isNullOrBlank() || operadores.isEmpty()) {
            null
        } else {
            autenticarOperador(pin.value.value, salt, operadores)
        }
        busy.value = false
        when {
            encontrado != null -> {
                operadorAtual.value = encontrado
                pin.value = PinState()
                restaurarRascunho(encontrado.id)
                screen.value = EstoqueScreen.Escolha
            }
            salt.isNullOrBlank() || operadores.isEmpty() -> {
                error.value = "Sem operadores cadastrados neste tablet. Conecte à internet e tente de novo."
                pin.value = pin.value.clear()
            }
            else -> {
                error.value = "Código não reconhecido."
                pin.value = pin.value.onFailure(System.currentTimeMillis())
            }
        }
    }

    /**
     * A pilha que ficou no disco volta pra tela — se for desta pessoa e de agora.
     *
     * Roda no login, e não no `init` do ViewModel, porque antes do código
     * digitado não existe "quem": restaurar cedo demais mostraria a pilha de
     * outra pessoa pra quem chegasse no tablet.
     *
     * Nenhuma tela nova precisa dizer o que aconteceu: o cartão do hub já conta
     * a pilha em andamento ("40 etiquetas bipadas esperando você confirmar"), e
     * é exatamente essa linha que sumia junto com o lote.
     */
    private suspend fun restaurarRascunho(operadorId: String) {
        val destino = runCatching {
            destinoDoRascunho(repository.rascunhoDeBipagem(), operadorId, System.currentTimeMillis())
        }.getOrNull() ?: return
        runCatching { repository.esquecerLeituras(destino.descartar) }
        pilha.value = PilhaBipagem(destino.restaurar)
        motivoSelecionado.value = null
        avisoBipagem.value = null
    }

    fun endJourney() {
        // Sair apaga o rascunho DE QUEM ESTAVA — não o dos outros. Quem foi
        // almoçar e deixou o tablet na mesa reencontra a pilha ao voltar.
        operadorAtual.value?.let { operador ->
            viewModelScope.launch { repository.limparRascunhoDe(operador.id) }
        }
        pin.value = PinState()
        error.value = null
        operadorAtual.value = null
        // Sair é o fim do turno de quem estava com o tablet: a pilha não pode
        // atravessar pro código da próxima pessoa, que assinaria uma baixa que
        // não bipou. É por aqui que ela é zerada, não mais no abrirBipar.
        pilha.value = PilhaBipagem()
        motivoSelecionado.value = null
        avisoBipagem.value = null
        screen.value = EstoqueScreen.Welcome
    }

    // ── Navegação Escolha ↔ Bipar/Receber ────────────────────────────────────
    // Abrir Bipar NÃO apaga a pilha.
    //
    // Zerar aqui significava que "Voltar" (o botão fica no canto onde a mão
    // segura o tablet) destruía as leituras no instante em que a pessoa
    // reentrasse: 40 peças bipadas, uma ida à outra tela, e a volta mostrava
    // "Aponte a pistola" — ou ela re-bipa tudo, ou pior, conclui que o lote
    // subiu e vai embora. A pilha some quando o lote é confirmado
    // (`confirmarBaixa`) ou quando a pessoa sai do turno (`endJourney`), que
    // são os dois momentos em que ela realmente acabou.
    //
    // O aviso da última leitura, esse sim, some: ele é sobre uma peça que a
    // pessoa já resolveu lá atrás.
    fun abrirBipar() {
        avisoBipagem.value = null
        screen.value = EstoqueScreen.Bipar
    }

    fun abrirEntrada() {
        avisoEntrada.value = null
        screen.value = EstoqueScreen.Entrada
    }

    fun tirarUmaDaEntrada(codigo: String) {
        pilhaEntrada.value = tirarUma(pilhaEntrada.value, codigo)
    }

    fun removerLinhaDaEntrada(codigo: String) {
        pilhaEntrada.value = removerLinha(pilhaEntrada.value, codigo)
    }

    fun escolherMotivoDeEntrada(key: String) {
        motivoEntrada.value = key
    }

    fun descartarEntradaRecusada(operationId: String) {
        viewModelScope.launch { repository.descartarEntradaRecusada(operationId) }
    }

    fun descartarFeedbackEntrada() {
        viewModelScope.launch { repository.descartarFeedbacksDoTipo("entrada") }
    }

    /**
     * Confirma o lote: cada LINHA vira uma operação na fila (o endpoint
     * trabalha por código). A pilha esvazia NA HORA — quem sobe é o worker.
     */
    fun confirmarEntrada() {
        val motivo = motivoEntrada.value ?: return
        val operador = operadorAtual.value ?: return
        val linhas = pilhaEntrada.value
        if (linhas.isEmpty()) return
        viewModelScope.launch {
            enviandoEntrada.value = true
            linhas.forEach { linha ->
                repository.enfileirarEntrada(linha.codigo, linha.quantidade, motivo, obs = null, operadorId = operador.id)
            }
            pilhaEntrada.value = emptyList()
            motivoEntrada.value = null
            avisoEntrada.value = null
            enviandoEntrada.value = false
            EstoqueWorkScheduler.enqueueImmediate(getApplication<Application>())
        }
    }

    fun abrirReceber() {
        viewModelScope.launch { compras.value = repository.comprasCache() }
        screen.value = EstoqueScreen.Receber
    }

    fun abrirConferir() {
        screen.value = EstoqueScreen.Conferir
        // A busca da caixa anterior não atravessa: a próxima é outra peça, e
        // uma lista reaberta com "eva" responde a pergunta de ninguém.
        limparBuscaDeDestino()
        atualizarAtividades()
        // O catálogo local é o que sustenta a escolha do destino quando nenhuma
        // das três sugestões serve. Sem isto, um tablet em que ninguém abriu a
        // tela de consulta chegaria na busca com ZERO itens — e a única saída
        // seria reprovar uma caixa que estava certa.
        //
        // Não é poll: quem chama é o toque em "Conferir", e a resposta comum é
        // `{ mudou: false }` (o aparelho manda a assinatura que já tem).
        viewModelScope.launch {
            lerEstadoDoCatalogo()
            sincronizarCatalogo()
        }
    }

    fun digitarDestino(texto: String) {
        termoDestino.value = texto
        buscaDestinoEmCurso?.cancel()
        buscaDestinoEmCurso = viewModelScope.launch {
            achadosDestino.value = repository.buscarNoCatalogo(termoDestino.value).map(::paraDestino)
        }
    }

    private fun limparBuscaDeDestino() {
        buscaDestinoEmCurso?.cancel()
        termoDestino.value = ""
        achadosDestino.value = emptyList()
    }

    /**
     * O item do catálogo local virando destino.
     *
     * `serializado` fica no padrão (`true`) porque a cópia local não guarda a
     * coluna — o catálogo do aparelho existe pra responder "quantos temos
     * disso", e essa pergunta não precisa dela. O efeito é só na FRASE do
     * rodapé ("sai uma etiqueta"), que é o que o tablet já dizia pra todo item
     * antes disto; quem decide de verdade se nasce etiqueta é o servidor, lendo
     * `estoque_itens.serializado` na hora de gravar. As sugestões, que descem
     * do servidor, trazem o valor verdadeiro.
     */
    private fun paraDestino(linha: com.tridi.estoque.data.ItemCatalogoEntity) =
        DestinoDaConferencia(id = linha.id, nome = linha.nome)

    // ── Consulta de estoque ──────────────────────────────────────────────────
    //
    // Abre com o campo LIMPO: a busca anterior era sobre outra peça, e uma tela
    // que reabre com "mdf 6" mostra números que não são a resposta da pergunta
    // que a pessoa acabou de fazer.
    fun abrirConsulta() {
        // A busca da visita anterior é cancelada junto: uma corrotina em voo
        // repovoaria a lista que acabou de ser esvaziada, e a tela abriria
        // mostrando o resultado de uma pergunta que ninguém está fazendo.
        buscaEmCurso?.cancel()
        termoConsulta.value = ""
        resultadosConsulta.value = emptyList()
        screen.value = EstoqueScreen.Consultar
        viewModelScope.launch {
            lerEstadoDoCatalogo()
            // Campo limpo abre com o CATÁLOGO na tela, não com o vazio. Esvaziar
            // a lista acima continua certo (a busca de ontem não é a pergunta de
            // hoje), mas ficar assim era o que fazia a tela dizer "221 itens
            // neste tablet" e não mostrar nenhum. `rebuscar()` com termo vazio
            // agora devolve o catálogo (ver EstoqueRepository.buscarNoCatalogo).
            rebuscar()
            sincronizarCatalogo()
        }
    }

    fun atualizarCatalogo() = viewModelScope.launch {
        sincronizarCatalogo()
        rebuscar()
    }

    private suspend fun lerEstadoDoCatalogo() {
        itensNoCatalogo.value = repository.quantosItensNoCatalogo()
        catalogoAtualizadoEm.value = repository.catalogoAtualizadoEm()
        catalogoTruncado.value = repository.catalogoTruncado()
    }

    /**
     * Best-effort SEMPRE: sem rede (ou com o token recusado) o catálogo que já
     * está no tablet continua valendo e a tela continua respondendo. Uma falha
     * aqui não pode limpar nada — foi pra isso que o cache existe.
     */
    private suspend fun sincronizarCatalogo() {
        if (sincronizandoCatalogo.value) return
        sincronizandoCatalogo.value = true
        runCatching { repository.sincronizarCatalogo() }
        lerEstadoDoCatalogo()
        sincronizandoCatalogo.value = false
    }

    fun digitarConsulta(texto: String) {
        termoConsulta.value = texto
        rebuscar()
    }

    private fun rebuscar() {
        val termo = termoConsulta.value
        buscaEmCurso?.cancel()
        buscaEmCurso = viewModelScope.launch {
            resultadosConsulta.value = repository.buscarNoCatalogo(termo).map(::paraConsulta)
        }
    }

    private fun paraConsulta(linha: com.tridi.estoque.data.ItemCatalogoEntity) = ItemConsultado(
        id = linha.id, nome = linha.nome, sku = linha.sku, categoria = linha.categoria,
        unidade = linha.unidade, quantidade = linha.quantidade, local = linha.local,
    )

    fun voltarParaEscolha() {
        screen.value = EstoqueScreen.Escolha
    }

    // ── Conferência de qualidade ─────────────────────────────────────────────
    //
    // Cache primeiro, rede depois: a tela abre CHEIA mesmo sem Wi-Fi, e se a
    // busca falhar continua mostrando o que já sabia. A lista não fica em poll
    // nenhum — ela muda quando alguém termina uma atividade, e quem quer ver
    // agora aperta o botão de atualizar.
    fun atualizarAtividades() = viewModelScope.launch {
        atividadesParaConferir.value = repository.atividadesCache()
        lerEstadoDaConferencia()
        carregandoAtividades.value = true
        runCatching { repository.sincronizarConferencias() }
            .onSuccess { atividadesParaConferir.value = it }
        // Depois da busca também: é a resposta NOVA que diz se a conferência
        // segue desligada no servidor. Sem reler, o gestor apertaria atualizar,
        // veria a lista vazia de novo e continuaria sem saber por quê.
        lerEstadoDaConferencia()
        carregandoAtividades.value = false
    }

    private suspend fun lerEstadoDaConferencia() {
        qcDesligado.value = repository.qcDesligadoCache()
        conferenciasTravadas.value = repository.conferenciasTravadasCache()
        conferenciasAnteriores.value = repository.conferenciasAnterioresCache()
        conferenciasDias.value = repository.conferenciasDiasCache()
    }

    /**
     * Enfileira a conferência e devolve a tela NA HORA.
     *
     * O `operationId` nasce lá no repositório, uma vez só, e nunca é
     * regenerado numa nova tentativa — é isso que impede as mesmas 50 peças de
     * entrarem no estoque duas vezes quando o Wi-Fi do galpão oscila.
     */
    fun confirmarConferencia(atividade: AtividadeConferenciaDto, rascunho: RascunhoConferencia) {
        val operador = operadorAtual.value ?: return
        val resultado = rascunho.resultado ?: return
        // A regra da casa também mora aqui, não só na tela: ninguém aprova o
        // próprio trabalho. O servidor recusaria com `conferente_e_executor` —
        // mas aí a caixa já teria sido dada por conferida na cabeça de quem
        // apertou o botão.
        if (atividade.executorId == operador.id) return
        viewModelScope.launch {
            enviandoConferencia.value = true
            repository.enfileirarConferencia(
                atividadeId = atividade.id,
                produtoNome = atividade.produtoNome,
                resultado = resultado.chave,
                // Em qual item do catálogo as peças entram. Só na aprovação, e
                // só quando o gestor escolheu — ver `destinoParaEnviar`.
                destinoId = rascunho.destinoParaEnviar(),
                defeitos = rascunho.chavesDeDefeito(),
                obs = rascunho.obs,
                conferidoPorId = operador.id,
            )
            atividadesParaConferir.value = repository.atividadesCache()
            enviandoConferencia.value = false
            EstoqueWorkScheduler.enqueueImmediate(getApplication<Application>())
        }
    }

    fun descartarEtiquetasDaConferencia() = viewModelScope.launch {
        repository.descartarFeedbacksDoTipo("conferencia")
    }

    fun descartarConferenciaRecusada(operationId: String) = viewModelScope.launch {
        repository.descartarConferenciaRecusada(operationId)
    }

    fun descartarAvisosDePreparo() = viewModelScope.launch {
        repository.descartarFeedbacksDoTipo(TIPO_AVISO_DE_PREPARO)
    }

    // ── Leitor de código de barras ───────────────────────────────────────────
    // Mesma máquina de estados do TridiMarket (scan/ScanRules): decide
    // repetição e janela de leitura antes de a leitura chegar na tela. Fora da
    // tela de Bipar a leitura não tem pra onde ir — não existe mais Home de
    // demonstração.
    private var scanState = ScanState()
    private val feedback by lazy { ScanFeedback(application) }
    val som by lazy { SomEfeitos.get(application) }

    fun codigoLido(bruto: String) {
        val transicao = reduceScan(scanState, bruto, System.currentTimeMillis())
        scanState = transicao.estado
        val aceito = transicao.resultado as? ScanResultado.Aceito ?: return
        scanState = liberarRepeticao(scanState)
        when (screen.value) {
            EstoqueScreen.Bipar -> registrarNaPilha(aceito.codigo)
            // Na entrada, o MESMO código repetido é o gesto normal: soma uma
            // peça. O bip confirma; a pilha cheia explica em vez de calar.
            EstoqueScreen.Entrada -> when (val r = somarLeitura(pilhaEntrada.value, aceito.codigo)) {
                is EntradaResultado.Aceita -> {
                    pilhaEntrada.value = r.pilha
                    avisoEntrada.value = null
                    som.bip()
                }
                EntradaResultado.Cheia -> {
                    avisoEntrada.value = "A lista chegou a $TETO_DE_LINHAS_DA_ENTRADA itens diferentes. " +
                        "Confirme este lote antes de bipar mais — lista que não cabe na tela é lista que ninguém confere."
                    feedback.falha()
                }
            }
            // Na consulta a pistola é ATALHO DE BUSCA, não baixa: apontar pra
            // etiqueta e ver quanto tem daquele item é mais rápido — e mais
            // seguro — do que digitar o nome de luva. Nada sai do estoque aqui.
            EstoqueScreen.Consultar -> digitarConsulta(aceito.codigo)
            else -> Unit
        }
    }

    private fun registrarNaPilha(codigo: String) {
        val resultado = registrarLeitura(pilha.value, codigo)
        when (resultado) {
            is LeituraResultado.Aceita -> {
                pilha.value = resultado.pilha
                avisoBipagem.value = null
                som.bip()
                // A tela responde NA HORA (o bip já saiu); o disco vem logo
                // atrás, sem segurar a próxima leitura. É uma linha por peça
                // bipada — o custo é o fsync do `synchronous = FULL`, que é
                // exatamente o que se está comprando aqui.
                operadorAtual.value?.let { operador ->
                    viewModelScope.launch { repository.guardarLeitura(resultado.codigo, operador.id) }
                }
            }
            is LeituraResultado.Duplicada -> {
                // Já está na pilha — vibra pra confirmar que a leitura chegou,
                // sem duplicar a contagem nem soar como erro.
                som.vibrar(30)
            }
            // Malformada ou pilha no teto do servidor: as duas param a leitura,
            // e a frase (avisoDaLeitura) diz qual das duas foi — jogar a peça
            // fora e confirmar o lote são respostas bem diferentes.
            is LeituraResultado.Malformada, is LeituraResultado.Cheia -> {
                avisoBipagem.value = avisoDaLeitura(resultado)
                feedback.falha()
            }
        }
    }

    fun removerDaPilha(codigo: String) {
        pilha.value = removerLeitura(pilha.value, codigo)
        viewModelScope.launch { repository.esquecerLeitura(codigo) }
    }

    fun escolherMotivo(key: String) {
        motivoSelecionado.value = key
    }

    // Confirmar enfileira UM lote com operationId próprio e devolve a pilha
    // vazia NA HORA — a sincronização acontece em segundo plano
    // (EstoqueWorkScheduler + EstoqueSyncWorker). Ninguém espera rede pra
    // bipar a próxima peça.
    fun confirmarBaixa() {
        val motivo = motivoSelecionado.value ?: return
        val operador = operadorAtual.value ?: return
        val codigos = pilha.value.codigos
        if (codigos.isEmpty()) return
        viewModelScope.launch {
            enviandoBaixa.value = true
            // A ORDEM importa: o lote entra na fila ANTES de o rascunho sair.
            // Morrer entre os dois faz a pilha reaparecer no próximo login com
            // o lote também enfileirado — e aí o pior desfecho é o servidor
            // responder `ja_baixada` para os códigos repetidos, que a tela
            // mostra. O contrário (limpar primeiro) perderia o lote inteiro.
            repository.enfileirarBaixa(codigos, motivo, obs = null, operadorId = operador.id)
            repository.limparRascunhoDe(operador.id)
            pilha.value = PilhaBipagem()
            motivoSelecionado.value = null
            avisoBipagem.value = null
            enviandoBaixa.value = false
            EstoqueWorkScheduler.enqueueImmediate(getApplication<Application>())
        }
    }

    // Dispensar apaga o TIPO inteiro, nunca "a linha de id 'baixa'".
    //
    // Era `descartarFeedback("baixa")`, que caía num DELETE por `id` — e o id
    // é o UUID que o worker sorteia (EstoqueSyncWorker), nunca a palavra
    // "baixa". O DELETE não casava com linha nenhuma: a pessoa tocava no
    // balão, ouvia o clique, e o aviso continuava ali na semana seguinte.
    // Dois canais, um gesto. Limpar só "baixa" deixaria o resumo por item na tela
    // para sempre — a pessoa toca no balão, ele encolhe pela metade e volta a
    // aparecer inteiro no próximo feedback.
    fun descartarFeedbackBaixa() = viewModelScope.launch {
        repository.descartarFeedbacksDoTipo("baixa")
        repository.descartarFeedbacksDoTipo(TIPO_SAIDA_POR_ITEM)
    }

    fun descartarBaixaRecusada(operationId: String) = viewModelScope.launch {
        repository.descartarBaixaRecusada(operationId)
    }

    // ── Recebimento ───────────────────────────────────────────────────────
    fun confirmarRecebimento(compraId: String, quantidade: Int) {
        val operador = operadorAtual.value ?: return
        if (quantidade <= 0) return
        viewModelScope.launch {
            enviandoRecebimento.value = true
            repository.enfileirarRecebimento(compraId, quantidade, operador.id)
            compras.value = repository.comprasCache()
            enviandoRecebimento.value = false
            EstoqueWorkScheduler.enqueueImmediate(getApplication<Application>())
        }
    }

    fun descartarFeedbackRecebimento() = viewModelScope.launch { repository.descartarFeedbacksDoTipo("recebimento") }

    fun descartarRecebimentoRecusado(operationId: String) = viewModelScope.launch {
        repository.descartarRecebimentoRecusado(operationId)
    }

    // ── Impressora Bluetooth ─────────────────────────────────────────────────
    //
    // A impressão NUNCA bloqueia a operação do galpão. Bipar e Receber
    // continuam enfileirando e devolvendo a tela na hora; imprimir é um passo
    // à parte, que a pessoa dispara quando quer e que falha sem levar nada
    // junto. Impressora sem papel não pode travar um recebimento.
    private val impressao by lazy { ServicoDeImpressao(application) }

    val configImpressora = impressao.prefs.fluxo
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ConfigImpressora())
    val impressorasPareadas = MutableStateFlow<List<ImpressoraPareada>>(emptyList())
    val imprimindo = MutableStateFlow(false)
    val mensagemImpressora = MutableStateFlow<MensagemImpressora?>(null)

    /** Só existe durante um lote longo (a conferência). `null` = nada saindo. */
    val progressoImpressao = MutableStateFlow<ProgressoImpressao?>(null)

    // Bandeira, não cancelamento de corrotina: o envio é bloqueante dentro de
    // um `withContext(IO)`, e cancelar a corrotina pararia NO MEIO de uma
    // etiqueta — meia tira de papel, com meio código de barras. A bandeira é
    // lida ENTRE etiquetas, que é o único ponto em que parar é seguro.
    private val pedidoDeParar = java.util.concurrent.atomic.AtomicBoolean(false)

    fun abrirImpressora() {
        mensagemImpressora.value = null
        atualizarImpressoras()
        screen.value = EstoqueScreen.Impressora
    }

    fun atualizarImpressoras() = viewModelScope.launch {
        val lista = withContext(Dispatchers.IO) { impressao.pareadas() }
        impressorasPareadas.value = lista

        // Uma pareada e nenhuma escolhida → escolhe sozinho.
        //
        // Parear no Android e ESCOLHER no app são dois passos que a pessoa lê
        // como um só: ela pareia, abre esta tela, aperta "Imprimir teste" e
        // nada acontece — porque o botão está desabilitado esperando uma
        // escolha que ninguém sabia que faltava. Foi exatamente o relato do
        // galpão ("clico em imprimir e ele não faz nada").
        //
        // Com uma impressora só não há ambiguidade a resolver. Com duas ou
        // mais, a escolha é de gente e a tela pede — mas aí o botão explica
        // por que está apagado.
        if (lista.size == 1 && !configImpressora.value.temImpressora) {
            val u = lista.single()
            withContext(Dispatchers.IO) { impressao.prefs.escolherImpressora(u.endereco, u.nome) }
        }
        // Problema de rádio (desligado, sem permissão) aparece ANTES de a
        // pessoa tentar imprimir — descobrir isso só ao apertar o botão faz
        // parecer que a impressora é que está com defeito.
        impressao.problemaDeAmbiente()?.let { mensagemImpressora.value = MensagemImpressora(it.mensagem, erro = true) }
    }

    fun escolherImpressora(impressora: ImpressoraPareada) = viewModelScope.launch {
        impressao.prefs.escolherImpressora(impressora.endereco, impressora.nome)
        mensagemImpressora.value = MensagemImpressora("Impressora: ${impressora.rotulo}", erro = false)
    }

    fun definirAlturaEtiqueta(mm: Int) = viewModelScope.launch { impressao.prefs.definirAltura(mm) }
    fun definirLarguraEtiqueta(mm: Int) = viewModelScope.launch { impressao.prefs.definirLargura(mm) }
    fun definirFolgaGuilhotina(mm: Int) = viewModelScope.launch { impressao.prefs.definirFolga(mm) }

    /**
     * Liga/desliga o botão de imprimir DA TELA DE BIPAR. Do aparelho e
     * persistido: quem trabalha na expedição religa uma vez e pronto, e quem
     * bipa consumo no meio do galpão nunca mais vê o botão.
     */
    fun definirImpressaoNaSaida(ligado: Boolean) = viewModelScope.launch {
        impressao.prefs.definirImprimirNaSaida(ligado)
    }

    fun imprimirTeste(duas: Boolean = true) = viewModelScope.launch {
        val aviso = if (duas) "Teste enviado. Confira o corte entre as duas tiras."
                    else "Tira única enviada."
        executarImpressao(aviso) { impressao.imprimirTeste(duas) }
    }

    /**
     * A etiqueta que alguém escreveu NO PRÓPRIO TABLET — sai agora.
     *
     * É o irmão imediato da fila que vem do escritório: aquela custa até um
     * ciclo do worker e serve pra quem está longe da impressora; esta serve
     * pra quem está de pé na frente dela.
     *
     * Não passa pela tabela `trabalhos_impressao` de propósito. Aquela tabela
     * é a trava contra a REPETIÇÃO de um trabalho que o servidor reoferece; uma
     * etiqueta composta aqui não tem servidor por trás, não é reoferecida por
     * ninguém, e gravá-la só criaria uma linha pra podar depois.
     */
    fun imprimirEtiquetaLivre(trabalho: com.tridi.estoque.impressora.EtiquetaLivreLayout.TrabalhoLivre) =
        viewModelScope.launch {
            executarImpressao("Etiqueta enviada para a impressora.") { impressao.imprimirLivre(trabalho) }
        }

    // ── Placas do galpão ─────────────────────────────────────────────────────
    // Repasses diretos pro repositório: a tela chama na abertura e no pós-criar
    // (gente, nunca relógio), e o estado mora na própria seção — nada disso
    // sobrevive a sair da tela, de propósito: a lista tem de nascer fresca.
    suspend fun locaisDoGalpao() = repository.locaisDoGalpao()

    suspend fun criarLocal(pedido: com.tridi.estoque.net.CriarLocalRequest) = repository.criarLocal(pedido)

    /** Etiquetas de um lote de unidades — o botão do recebimento. */
    fun imprimirEtiquetas(codigos: List<String>) = viewModelScope.launch {
        if (codigos.isEmpty()) return@launch
        val quantas = if (codigos.size == 1) "1 etiqueta enviada" else "${codigos.size} etiquetas enviadas"
        executarImpressao("$quantas para a impressora.") {
            impressao.imprimir(codigos.map { etiquetaDe(it) })
        }
    }

    /**
     * As etiquetas da conferência — as ÚNICAS que saem com nome e local reais.
     *
     * Vêm prontas do servidor (ver `EtiquetaDto.paraImpressao`); aqui não se
     * recalcula nada, só se manda imprimir.
     *
     * Uma conferência CERTA devolve UMA etiqueta: a caixa lacrada, valendo as N
     * peças que a pessoa fez — ninguém etiqueta 50 folhas uma a uma. A série
     * com contador e botão de parar continua porque a lista pode juntar VÁRIAS
     * caixas: o gestor confere o galpão inteiro sem Wi-Fi e a fila sobe junta
     * quando ele volta pro sinal.
     */
    fun imprimirEtiquetasDaConferencia(etiquetas: List<EtiquetaDto>) {
        if (etiquetas.isEmpty() || imprimindo.value) return
        pedidoDeParar.set(false)
        viewModelScope.launch {
            imprimindo.value = true
            mensagemImpressora.value = null
            // ── O que JÁ saiu não sai de novo ─────────────────────────────────
            // O aviso verde junta as caixas e fica na tela até alguém dispensar;
            // mandar a lista inteira fazia a segunda conferência reimprimir a
            // etiqueta da primeira — duas caixas na prateleira com o MESMO
            // código, e bipar uma dá baixa na outra. Ver EtiquetasJaImpressas.kt.
            val jaImpressas = repository.etiquetasJaImpressas()
            val novas = pendentesDeImpressao(etiquetas, jaImpressas.toSet()) { it.codigo }
            if (novas.isEmpty()) {
                mensagemImpressora.value = MensagemImpressora(
                    "Estas etiquetas já saíram. Pra tirar outra via, use a ficha do item no ERP.",
                    erro = false,
                )
                imprimindo.value = false
                return@launch
            }
            val dados = novas.map { it.paraImpressao(operadorAtual.value?.nome) }
            progressoImpressao.value = ProgressoImpressao(enviadas = 0, total = dados.size)

            val resultado = runCatching {
                impressao.imprimirEmSerie(
                    etiquetas = dados,
                    cancelou = { pedidoDeParar.get() },
                    aoEnviar = { quantas ->
                        progressoImpressao.value = ProgressoImpressao(quantas, dados.size, pedidoDeParar.get())
                    },
                )
            }.getOrElse {
                ResultadoImpressao.Falha(com.tridi.estoque.impressora.MotivoFalha.DESCONHECIDO, it.message)
            }

            val enviadas = progressoImpressao.value?.enviadas ?: 0
            val parado = pedidoDeParar.get()
            // Só o que DE FATO saiu entra na memória. Parar no meio tem de
            // deixar o resto ainda imprimível — senão um toque em "parar" por
            // engano perde a etiqueta da caixa pra sempre.
            if (enviadas > 0) {
                repository.guardarEtiquetasImpressas(
                    comAsImpressas(jaImpressas, novas.take(enviadas).map { it.codigo }),
                )
            }
            progressoImpressao.value = null
            mensagemImpressora.value = when (resultado) {
                is ResultadoImpressao.Falha -> MensagemImpressora(resultado.mensagem, erro = true)
                is ResultadoImpressao.Ok -> MensagemImpressora(
                    frasePosImpressao(enviadas, dados.size, parado),
                    erro = false,
                )
            }
            imprimindo.value = false
        }
    }

    /**
     * Parar a impressão NÃO desfaz a entrada no estoque.
     *
     * As peças foram admitidas quando a conferência foi confirmada, muito
     * antes de a primeira tira sair. Aqui só o papel para — e a frase que
     * aparece depois diz exatamente isso, porque o gestor que parou por engano
     * não pode sair achando que precisa conferir a caixa de novo.
     */
    fun pararImpressao() {
        pedidoDeParar.set(true)
        progressoImpressao.value = progressoImpressao.value?.copy(parando = true)
    }

    /** Uma etiqueta só — a reimpressão da tela de Bipar. */
    fun reimprimirEtiqueta(codigo: String) = viewModelScope.launch {
        executarImpressao("Etiqueta de $codigo enviada.") { impressao.imprimir(listOf(etiquetaDe(codigo))) }
    }

    private fun etiquetaDe(codigo: String): DadosEtiqueta =
        impressao.etiquetaDaUnidade(codigo, operadorAtual.value?.nome)

    private suspend fun executarImpressao(sucesso: String, bloco: suspend () -> ResultadoImpressao) {
        if (imprimindo.value) return
        imprimindo.value = true
        mensagemImpressora.value = null
        val resultado = runCatching { bloco() }.getOrElse {
            ResultadoImpressao.Falha(com.tridi.estoque.impressora.MotivoFalha.DESCONHECIDO, it.message)
        }
        mensagemImpressora.value = when (resultado) {
            is ResultadoImpressao.Ok -> MensagemImpressora(sucesso, erro = false)
            is ResultadoImpressao.Falha -> MensagemImpressora(resultado.mensagem, erro = true)
        }
        imprimindo.value = false
    }

    fun descartarMensagemImpressora() { mensagemImpressora.value = null }

    override fun onCleared() {
        feedback.encerrar()
        super.onCleared()
    }
}

@Composable
fun EstoqueApp(viewModel: EstoqueViewModel) {
    val context = LocalContext.current.applicationContext
    val screen by viewModel.screen.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val pin by viewModel.pin.collectAsStateWithLifecycle()
    val operador by viewModel.operadorAtual.collectAsStateWithLifecycle()
    val online by remember(context) { Conectividade.observar(context) }.collectAsStateWithLifecycle(initialValue = true)
    val resumoDaFila by viewModel.resumoDaFila.collectAsStateWithLifecycle()
    // Um só cálculo pras quatro telas de trabalho. Antes o `online` só chegava
    // na tela de código: Escolha, Bipar, Receber e Conferir não sabiam se o
    // tablet estava na rede, e ninguém em lugar nenhum via a fila.
    //
    // O relógio é lido AQUI DENTRO, e não fora, porque `remember` refaz a conta
    // a cada emissão do resumo — que é justamente quando o worker acabou de
    // tentar e falhar. Um `System.currentTimeMillis()` capturado uma vez daria
    // uma faixa que envelhece sem nunca perceber.
    val avisoDeTrabalho = remember(online, resumoDaFila) {
        avisoDoTrabalho(online, resumoDaFila, System.currentTimeMillis())
    }

    LaunchedEffect(Unit) {
        withFrameNanos { }
        withContext(Dispatchers.Default) {
            EstoqueWorkScheduler.ensureScheduled(context)
        }
    }

    when (screen) {
        EstoqueScreen.Loading -> LoadingScreen()
        EstoqueScreen.Provisioning -> ProvisioningScreen(busy, error, viewModel::provision)
        EstoqueScreen.Welcome -> WelcomeScreen(viewModel::startJourney)
        EstoqueScreen.Pin -> PinComPortaDeManutencao(
            state = pin,
            busy = busy,
            error = error,
            online = online,
            onDigit = viewModel::appendPin,
            onErase = viewModel::erasePin,
            onSubmit = viewModel::login,
            onBack = viewModel::endJourney,
        )
        EstoqueScreen.Escolha -> EscolhaScreen(
            nomeOperador = operador?.nome,
            avisoDeTrabalho = avisoDeTrabalho,
            etiquetasNaPilha = viewModel.pilha.collectAsStateWithLifecycle().value.codigos.size,
            itensNoCatalogo = viewModel.itensNoCatalogo.collectAsStateWithLifecycle().value,
            onBipar = viewModel::abrirBipar,
            onEntrada = viewModel::abrirEntrada,
            onReceber = viewModel::abrirReceber,
            onConferir = viewModel::abrirConferir,
            onConsultar = viewModel::abrirConsulta,
            onImpressora = viewModel::abrirImpressora,
            onSair = viewModel::endJourney,
        )
        EstoqueScreen.Consultar -> {
            val termo by viewModel.termoConsulta.collectAsStateWithLifecycle()
            val resultados by viewModel.resultadosConsulta.collectAsStateWithLifecycle()
            val noTablet by viewModel.itensNoCatalogo.collectAsStateWithLifecycle()
            val atualizadoEm by viewModel.catalogoAtualizadoEm.collectAsStateWithLifecycle()
            val truncado by viewModel.catalogoTruncado.collectAsStateWithLifecycle()
            val sincronizando by viewModel.sincronizandoCatalogo.collectAsStateWithLifecycle()
            // O relógio é lido AQUI DENTRO, como na faixa de trabalho: `remember`
            // refaz a conta a cada mudança de estado, e a frase "atualizado há N
            // min" precisa envelhecer junto.
            val vazio = remember(termo, resultados, noTablet, sincronizando, online, atualizadoEm) {
                vazioDaConsulta(
                    termo = termo, resultados = resultados.size, itensNoTablet = noTablet,
                    sincronizando = sincronizando, online = online,
                    atualizadoEm = atualizadoEm, agora = System.currentTimeMillis(),
                )
            }
            ConsultarScreen(
                termo = termo,
                resultados = resultados,
                vazio = vazio,
                truncado = truncado,
                sincronizando = sincronizando,
                avisoDeTrabalho = avisoDeTrabalho,
                onTermo = viewModel::digitarConsulta,
                onAtualizar = viewModel::atualizarCatalogo,
                onVoltar = viewModel::voltarParaEscolha,
            )
        }
        EstoqueScreen.Conferir -> {
            val atividades by viewModel.atividadesParaConferir.collectAsStateWithLifecycle()
            val carregando by viewModel.carregandoAtividades.collectAsStateWithLifecycle()
            val enviando by viewModel.enviandoConferencia.collectAsStateWithLifecycle()
            val etiquetas by viewModel.etiquetasDaConferencia.collectAsStateWithLifecycle()
            val recusadas by viewModel.conferenciasRecusadas.collectAsStateWithLifecycle()
            val avisosDePreparo by viewModel.avisosDePreparo.collectAsStateWithLifecycle()
            val configImpressora by viewModel.configImpressora.collectAsStateWithLifecycle()
            val imprimindo by viewModel.imprimindo.collectAsStateWithLifecycle()
            val mensagemImpressora by viewModel.mensagemImpressora.collectAsStateWithLifecycle()
            val progresso by viewModel.progressoImpressao.collectAsStateWithLifecycle()
            val qcDesligado by viewModel.qcDesligado.collectAsStateWithLifecycle()
            val travadas by viewModel.conferenciasTravadas.collectAsStateWithLifecycle()
            val anteriores by viewModel.conferenciasAnteriores.collectAsStateWithLifecycle()
            val diasDaFila by viewModel.conferenciasDias.collectAsStateWithLifecycle()
            val termoDestino by viewModel.termoDestino.collectAsStateWithLifecycle()
            val achadosDestino by viewModel.achadosDestino.collectAsStateWithLifecycle()
            val itensNoCatalogo by viewModel.itensNoCatalogo.collectAsStateWithLifecycle()
            val sincronizandoCatalogo by viewModel.sincronizandoCatalogo.collectAsStateWithLifecycle()
            ConferirScreen(
                atividades = atividades,
                operadorId = operador?.id,
                qcDesligado = qcDesligado,
                travadas = travadas,
                anteriores = anteriores,
                diasDaFila = diasDaFila,
                termoDestino = termoDestino,
                achadosDestino = achadosDestino,
                itensNoCatalogo = itensNoCatalogo,
                sincronizandoCatalogo = sincronizandoCatalogo,
                onTermoDestino = viewModel::digitarDestino,
                avisoDeTrabalho = avisoDeTrabalho,
                carregando = carregando,
                enviando = enviando,
                etiquetas = etiquetas,
                recusadas = recusadas,
                avisosDePreparo = avisosDePreparo,
                onDescartarPreparo = viewModel::descartarAvisosDePreparo,
                podeImprimir = configImpressora.temImpressora,
                imprimindo = imprimindo,
                progresso = progresso,
                onPararImpressao = viewModel::pararImpressao,
                mensagemImpressora = mensagemImpressora,
                onAtualizar = viewModel::atualizarAtividades,
                onImprimirEtiquetas = viewModel::imprimirEtiquetasDaConferencia,
                onDescartarMensagemImpressora = viewModel::descartarMensagemImpressora,
                onDescartarEtiquetas = viewModel::descartarEtiquetasDaConferencia,
                onDescartarRecusada = viewModel::descartarConferenciaRecusada,
                onConfirmar = viewModel::confirmarConferencia,
                onVoltar = viewModel::voltarParaEscolha,
            )
        }
        EstoqueScreen.Impressora -> {
            val config by viewModel.configImpressora.collectAsStateWithLifecycle()
            val pareadas by viewModel.impressorasPareadas.collectAsStateWithLifecycle()
            val imprimindo by viewModel.imprimindo.collectAsStateWithLifecycle()
            val mensagem by viewModel.mensagemImpressora.collectAsStateWithLifecycle()
            ImpressoraScreen(
                config = config,
                pareadas = pareadas,
                ocupado = imprimindo,
                mensagem = mensagem,
                onEscolher = viewModel::escolherImpressora,
                onAltura = viewModel::definirAlturaEtiqueta,
                onLargura = viewModel::definirLarguraEtiqueta,
                onFolga = viewModel::definirFolgaGuilhotina,
                onTestar = viewModel::imprimirTeste,
                onImprimirLivre = viewModel::imprimirEtiquetaLivre,
                carregarLocais = viewModel::locaisDoGalpao,
                criarLocal = viewModel::criarLocal,
                onAtualizarLista = viewModel::atualizarImpressoras,
                onVoltar = viewModel::voltarParaEscolha,
            )
        }
        EstoqueScreen.Bipar -> {
            val pilha by viewModel.pilha.collectAsStateWithLifecycle()
            val aviso by viewModel.avisoBipagem.collectAsStateWithLifecycle()
            val motivos by viewModel.motivos.collectAsStateWithLifecycle()
            val motivoSelecionado by viewModel.motivoSelecionado.collectAsStateWithLifecycle()
            val enviando by viewModel.enviandoBaixa.collectAsStateWithLifecycle()
            val feedback by viewModel.feedbackBaixa.collectAsStateWithLifecycle()
            val saida by viewModel.saidaPorItem.collectAsStateWithLifecycle()
            val recusadas by viewModel.baixasRecusadas.collectAsStateWithLifecycle()
            val configImpressora by viewModel.configImpressora.collectAsStateWithLifecycle()
            val imprimindo by viewModel.imprimindo.collectAsStateWithLifecycle()
            val mensagemImpressora by viewModel.mensagemImpressora.collectAsStateWithLifecycle()
            BiparScreen(
                pilha = pilha,
                aviso = aviso,
                avisoDeTrabalho = avisoDeTrabalho,
                motivos = motivos,
                motivoSelecionado = motivoSelecionado,
                enviando = enviando,
                feedback = feedback,
                saida = saida,
                recusadas = recusadas,
                onDescartarRecusada = viewModel::descartarBaixaRecusada,
                // A chave manda no botão, e ela nasce DESLIGADA: bipar saída é
                // contar o que saiu, não emitir papel.
                podeImprimir = configImpressora.podeImprimirNaSaida,
                temImpressora = configImpressora.temImpressora,
                impressaoLigada = configImpressora.imprimirNaSaida,
                onAlternarImpressao = viewModel::definirImpressaoNaSaida,
                imprimindo = imprimindo,
                mensagemImpressora = mensagemImpressora,
                onReimprimir = viewModel::reimprimirEtiqueta,
                onDescartarMensagemImpressora = viewModel::descartarMensagemImpressora,
                onRemover = viewModel::removerDaPilha,
                onEscolherMotivo = viewModel::escolherMotivo,
                onConfirmar = viewModel::confirmarBaixa,
                onDescartarFeedback = viewModel::descartarFeedbackBaixa,
                onVoltar = viewModel::voltarParaEscolha,
            )
        }
        EstoqueScreen.Entrada -> {
            val pilhaE by viewModel.pilhaEntrada.collectAsStateWithLifecycle()
            val avisoE by viewModel.avisoEntrada.collectAsStateWithLifecycle()
            val motivoE by viewModel.motivoEntrada.collectAsStateWithLifecycle()
            val enviandoE by viewModel.enviandoEntrada.collectAsStateWithLifecycle()
            val feedbackE by viewModel.feedbackEntrada.collectAsStateWithLifecycle()
            val recusadasE by viewModel.entradasRecusadas.collectAsStateWithLifecycle()
            EntradaScreen(
                pilha = pilhaE,
                aviso = avisoE,
                avisoDeTrabalho = avisoDeTrabalho,
                motivoSelecionado = motivoE,
                enviando = enviandoE,
                feedback = feedbackE,
                recusadas = recusadasE,
                onDescartarRecusada = viewModel::descartarEntradaRecusada,
                onTirarUma = viewModel::tirarUmaDaEntrada,
                onRemoverLinha = viewModel::removerLinhaDaEntrada,
                onEscolherMotivo = viewModel::escolherMotivoDeEntrada,
                onConfirmar = viewModel::confirmarEntrada,
                onDescartarFeedback = viewModel::descartarFeedbackEntrada,
                onVoltar = viewModel::voltarParaEscolha,
            )
        }
        EstoqueScreen.Receber -> {
            val compras by viewModel.compras.collectAsStateWithLifecycle()
            val enviando by viewModel.enviandoRecebimento.collectAsStateWithLifecycle()
            val feedback by viewModel.feedbackRecebimento.collectAsStateWithLifecycle()
            val recusados by viewModel.recebimentosRecusados.collectAsStateWithLifecycle()
            val configImpressora by viewModel.configImpressora.collectAsStateWithLifecycle()
            val imprimindo by viewModel.imprimindo.collectAsStateWithLifecycle()
            val mensagemImpressora by viewModel.mensagemImpressora.collectAsStateWithLifecycle()
            ReceberScreen(
                compras = compras,
                enviando = enviando,
                avisoDeTrabalho = avisoDeTrabalho,
                feedback = feedback,
                recusados = recusados,
                onDescartarRecusado = viewModel::descartarRecebimentoRecusado,
                podeImprimir = configImpressora.temImpressora,
                imprimindo = imprimindo,
                mensagemImpressora = mensagemImpressora,
                onImprimirEtiquetas = viewModel::imprimirEtiquetas,
                onDescartarMensagemImpressora = viewModel::descartarMensagemImpressora,
                onConfirmar = viewModel::confirmarRecebimento,
                onDescartarFeedback = viewModel::descartarFeedbackRecebimento,
                onVoltar = viewModel::voltarParaEscolha,
            )
        }
    }
}

// Escolha entre Bipar e Receber. Duas operações, dois cartões grandes — e cada
// um diz o que FAZ embaixo do nome. "Bipar" e "Receber" sozinhos são jargão de
// quem escreveu o app; quem chega no primeiro dia não sabe qual dos dois usar
// pra material que está voltando pro estoque.
//
// Só um dos dois leva o acento: bipar é o que acontece dezenas de vezes por
// turno, receber é o que acontece quando o caminhão chega.
@Composable
private fun EscolhaScreen(
    nomeOperador: String?,
    avisoDeTrabalho: AvisoDeTrabalho?,
    /**
     * Lote em andamento — quantas ETIQUETAS ainda não viraram baixa. 0 quando
     * não há nenhuma.
     *
     * Etiqueta e não peça: `PilhaBipagem` guarda só os códigos, e desde a caixa
     * lacrada uma etiqueta pode valer 50 folhas. Chamar de "peça" o que é caixa
     * é errar o tamanho do que está pendurado — e este número existe justamente
     * pra alguém não ir embora com o galpão pendurado.
     */
    etiquetasNaPilha: Int,
    /** Itens do catálogo guardados neste tablet. 0 = nunca sincronizou. */
    itensNoCatalogo: Int,
    onBipar: () -> Unit,
    onEntrada: () -> Unit,
    onReceber: () -> Unit,
    onConferir: () -> Unit,
    onConsultar: () -> Unit,
    onImpressora: () -> Unit,
    onSair: () -> Unit,
) {
    Column(Modifier.fillMaxSize().background(GalpaoFundo)) {
        // No hub a faixa fica no topo absoluto: aqui não há cabeçalho, e é o
        // lugar por onde a pessoa passa entre uma operação e outra.
        FaixaDeTrabalho(avisoDeTrabalho)
        Column(
            // Rola porque agora são TRÊS operações mais dois botões: num tablet
            // de tela curta (ou com a fonte do sistema aumentada) o "Sair"
            // nasceria abaixo da dobra, e é ele que a pessoa procura quando
            // termina o turno.
            // `weight(1f)`, não `fillMaxSize()`: agora existe uma faixa acima, e
            // um filho que pede a altura toda dentro de uma Column empurraria o
            // "Sair" pra fora da tela.
            modifier = Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp, vertical = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            if (nomeOperador != null) {
                Text(
                    text = nomeOperador,
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 20.sp,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }
            Text(
                text = "O que você vai fazer?",
                color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 34.sp, fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )

            CartaoDeOperacao(
                testTag = "escolha_bipar",
                icone = KioskIconName.Barcode,
                titulo = "Bipar saída",
                // A pilha sobrevive a um "Voltar", então é AQUI que a pessoa
                // precisa saber que ela existe: sem esta linha, um lote de 40
                // peças esperando confirmação fica invisível no hub, e quem
                // vai embora leva o galpão junto.
                explicacao = when {
                    etiquetasNaPilha == 1 -> "1 etiqueta bipada esperando você confirmar"
                    etiquetasNaPilha > 1 -> "$etiquetasNaPilha etiquetas bipadas esperando você confirmar"
                    else -> "Dar baixa no material que sai do galpão"
                },
                destaque = true,
                onClick = onBipar,
                modifier = Modifier.padding(top = 30.dp),
            )
            // A entrada avulsa: a peça está na mão, o sistema não sabe dela e
            // não há compra nem atividade atrás. As outras duas portas de
            // entrada (Receber, Conferir) exigem papel antes; esta é a do dia a
            // dia, e era a que faltava no aparelho — existia só no site.
            CartaoDeOperacao(
                testTag = "escolha_entrada",
                icone = KioskIconName.Plus,
                titulo = "Entrada por leitura",
                explicacao = "Somar peça no estoque bipando o código do produto",
                destaque = false,
                onClick = onEntrada,
                modifier = Modifier.padding(top = 14.dp),
            )
            CartaoDeOperacao(
                testTag = "escolha_receber",
                icone = KioskIconName.Package,
                titulo = "Receber entrega",
                explicacao = "Conferir o que chegou e gerar as etiquetas",
                destaque = false,
                onClick = onReceber,
                modifier = Modifier.padding(top = 14.dp),
            )
            // Conferir aparece pra todo mundo que entrou com código.
            //
            // O tablet NÃO sabe cargo: o diretório offline traz id, nome e
            // verificador, e nada mais (ver OperadorDto). Esconder o cartão de
            // quem talvez não possa conferir exigiria um campo que não existe —
            // e esconder por engano seria pior, porque o gestor ficaria na
            // frente da caixa sem entender por que o botão sumiu. Quem decide é
            // o servidor, que recusa e devolve o motivo em português; a única
            // regra que o app já sabe aplicar sozinho é a de não conferir o
            // próprio trabalho.
            CartaoDeOperacao(
                testTag = "escolha_conferir",
                icone = KioskIconName.Check,
                titulo = "Conferir trabalho",
                explicacao = "Aprovar o que ficou pronto e pôr as peças no estoque",
                destaque = false,
                onClick = onConferir,
                modifier = Modifier.padding(top = 14.dp),
            )
            // A quarta porta, e a única que NÃO é fila de trabalho.
            //
            // As três de cima só têm o que mostrar depois que alguém recebeu
            // mercadoria, concluiu atividade ou etiquetou peça — no galpão de
            // hoje, as três estão vazias, e quem liga o tablet conclui que ele
            // está quebrado. Esta responde com o catálogo, que já existe.
            //
            // Fica por último de propósito: consultar não movimenta nada, e as
            // operações que mudam o estoque continuam sendo o que a mão procura
            // primeiro. Mas ela aparece SEMPRE, mesmo sem catálogo baixado —
            // esconder faria a tela de "leve o tablet perto do Wi-Fi" nunca ser
            // vista por quem precisa dela.
            CartaoDeOperacao(
                testTag = "escolha_consultar",
                icone = KioskIconName.Search,
                titulo = "Consultar estoque",
                explicacao = if (itensNoCatalogo > 0) {
                    "Quanto temos de cada item, e onde fica · $itensNoCatalogo itens neste tablet"
                } else {
                    "Quanto temos de cada item, e onde fica"
                },
                destaque = false,
                onClick = onConsultar,
                modifier = Modifier.padding(top = 14.dp),
            )
            // A impressora não é uma OPERAÇÃO — é um ajuste do aparelho. Por
            // isso não ganha cartão grande ao lado de Bipar e Receber: entra
            // discreta, do tamanho de "Sair". Quem precisa dela é quem vai
            // acertar a folga da guilhotina, não quem está bipando peça.
            OutlinedButton(
                onClick = onImpressora,
                modifier = Modifier.testTag("escolha_impressora").padding(top = 26.dp).fillMaxWidth(0.6f).height(ALVO_MINIMO),
                shape = RoundedCornerShape(16.dp),
                colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = GalpaoTextoFraco),
                border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda),
            ) {
                KioskIcon(KioskIconName.Printer, null, size = 22.dp, color = GalpaoTextoFraco)
                Text(
                    "Impressora", fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 10.dp),
                )
            }
            OutlinedButton(
                onClick = onSair,
                modifier = Modifier.testTag("escolha_sair").padding(top = 12.dp).fillMaxWidth(0.6f).height(ALVO_MINIMO),
                shape = RoundedCornerShape(16.dp),
                colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = GalpaoTextoFraco),
                border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda),
            ) { Text("Sair", fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
        }
    }
}

@Composable
private fun CartaoDeOperacao(
    testTag: String,
    icone: KioskIconName,
    titulo: String,
    explicacao: String,
    destaque: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    androidx.compose.material3.Surface(
        color = if (destaque) GalpaoAcento else GalpaoSuperficie,
        shape = RoundedCornerShape(22.dp),
        border = if (destaque) null else androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda),
        modifier = modifier.testTag(testTag).fillMaxWidth(0.9f).cliqueSonoro(onClick = onClick),
    ) {
        androidx.compose.foundation.layout.Row(
            Modifier.padding(horizontal = 26.dp, vertical = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KioskIcon(
                icone, null, size = 40.dp,
                color = if (destaque) GalpaoSobreAcento else GalpaoAcento,
                strokeWidth = 2.2f,
            )
            Column(Modifier.padding(start = 20.dp).weight(1f)) {
                Text(
                    titulo,
                    color = if (destaque) GalpaoSobreAcento else GalpaoTexto,
                    fontFamily = FonteTitulo, fontSize = 28.sp, fontWeight = FontWeight.Bold,
                )
                Text(
                    explicacao,
                    color = if (destaque) GalpaoSobreAcento.copy(alpha = 0.8f) else GalpaoTextoFraco,
                    fontFamily = FonteTexto, fontSize = 17.sp, lineHeight = 23.sp,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
            KioskIcon(
                KioskIconName.ChevronRight, null, size = 26.dp,
                color = if (destaque) GalpaoSobreAcento else GalpaoTextoFraco,
            )
        }
    }
}

@Composable private fun LoadingScreen() {
    Box(Modifier.fillMaxSize().background(GalpaoFundo), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
            MarcaEstoque(tamanho = 84.dp)
            Text(
                "ESTOQUE TRIDI", color = GalpaoTextoFraco, fontFamily = FonteTitulo,
                fontSize = 16.sp, fontWeight = FontWeight.Bold, letterSpacing = 3.sp,
            )
        }
    }
}

@Composable private fun ProvisioningScreen(busy: Boolean, error: String?, onProvision: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(GalpaoFundo), contentAlignment = Alignment.Center) {
        Column(
            Modifier.width(460.dp).background(GalpaoSuperficie, RoundedCornerShape(22.dp)).padding(30.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            MarcaEstoque(tamanho = 64.dp)
            Text("Ativar este aparelho", color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
            Text(
                "No sistema, em Administração, gere o código de 6 dígitos deste tablet.",
                color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 18.sp, textAlign = TextAlign.Center,
            )
            // ── Teclado NUMÉRICO do app, o mesmo do PIN ───────────────────
            // Esta era a pior das três telas que ainda apostavam no teclado do
            // sistema: sem digitar o código não se ativa aparelho nenhum, e em
            // lock task o IME não é composto. Provisionar dependia de ter um
            // computador com adb ao lado — o que só não apareceu como defeito
            // porque quem provisiona até hoje fui eu.
            Text(
                if (code.isEmpty()) "------" else code.padEnd(6, '-'),
                color = if (code.isEmpty()) GalpaoTextoFraco else GalpaoTexto,
                fontFamily = FonteTitulo, fontSize = 34.sp, fontWeight = FontWeight.ExtraBold,
                letterSpacing = 10.sp,
                modifier = Modifier.testTag("ativar_codigo"),
            )
            TecladoNumerico(
                onDigito = { d -> if (code.length < 6) code += d },
                onApagar = { code = code.dropLast(1) },
                acaoLabel = "Ativar tablet",
                acaoAtiva = code.length == 6 && !busy,
                onAcao = { onProvision(code) },
            )
            if (error != null) {
                Text(error, color = GalpaoErro, fontFamily = FonteTexto, fontSize = 17.sp, textAlign = TextAlign.Center)
            }
        }
    }
}
