package com.tridi.market.ui

import android.app.Application
import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.tridi.market.BuildConfig
import com.tridi.market.data.MarketDatabase
import com.tridi.market.data.ImagensOffline
import com.tridi.market.data.MarketRepository
import com.tridi.market.data.ProductEntity
import com.tridi.market.domain.CartLine
import com.tridi.market.net.Conectividade
import com.tridi.market.net.EmployeeDto
import com.tridi.market.net.MarketApi
import com.tridi.market.net.MarketApiException
import com.tridi.market.net.SessionData
import com.tridi.market.scan.ScanFeedback
import com.tridi.market.scan.ScanResultado
import com.tridi.market.scan.ScanState
import com.tridi.market.scan.chavesDeBusca
import com.tridi.market.scan.liberarRepeticao
import com.tridi.market.scan.reduceScan
import com.tridi.market.security.DeviceSecrets
import com.tridi.market.sync.MarketWorkScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface MarketScreen {
    data object Loading : MarketScreen
    data object Provisioning : MarketScreen
    data object Welcome : MarketScreen
    data object Pin : MarketScreen
    // Depois do código: escolher COMO achar o produto (câmera ou busca).
    // Navegar catálogo por categoria saiu do caminho — com 348 itens, rolar a
    // lista era sempre o percurso mais lento.
    data class Catalog(val session: SessionData) : MarketScreen
    // `apenasSemCodigo`: a busca aberta pelo atalho "Produtos sem código" mostra
    // SÓ os sem código. Antes ela caía na busca comum, que lista os sem código
    // no topo e "Todos os outros produtos" logo abaixo — então o atalho parecia
    // estar cheio de item com código de barras.
    data class Busca(val session: SessionData, val apenasSemCodigo: Boolean = false) : MarketScreen
    data class Cart(val session: SessionData) : MarketScreen
    // Digitar o código na mão: a saída pra embalagem amassada. Era um painel
    // dentro da tela da câmera; com a câmera fora, virou tela própria.
    data class Digitacao(val session: SessionData) : MarketScreen
    data class Receipt(val dados: ReceiptData) : MarketScreen
}

class MarketViewModel(application: Application) : AndroidViewModel(application) {
    private val database = MarketDatabase.get(application)
    private val secrets = DeviceSecrets(application)
    private val repository = MarketRepository(database.marketDao(), MarketApi(BuildConfig.DEFAULT_API_BASE), secrets)
    val products: StateFlow<List<ProductEntity>> = database.marketDao().observeProducts().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val screen = MutableStateFlow<MarketScreen>(MarketScreen.Loading)
    val cart = MutableStateFlow<Map<Long, Int>>(emptyMap())
    val busy = MutableStateFlow(false)
    val online = MutableStateFlow(true)
    val error = MutableStateFlow<String?>(null)
    val pin = MutableStateFlow(PinState())
    private var debugPreviewActive = false
    private var debugPreviewSession: SessionData? = null
    private var debugPreviewPin: String? = null

    init {
        // Começa a decodificar os sons JÁ, não na primeira leitura: o
        // `SoundPool.load` é assíncrono e o bip da primeira bipada saía mudo
        // (ver SomEfeitos). Só tocar no `by lazy` aqui dispara o carregamento.
        runCatching { SomEfeitos.get(application).aquecer() }

        // O indicador de rede segue o SISTEMA, não o resultado da última
        // requisição: uma falha isolada deixava o totem dizendo "sem internet"
        // com o Wi-Fi perfeito, até alguém tentar de novo.
        viewModelScope.launch {
            Conectividade.observar(application).collect { conectado ->
                if (debugPreviewActive) return@collect
                val estavaOffline = !online.value
                online.value = conectado
                // Voltou a rede: sincroniza na hora (catálogo, diretório,
                // fotos) e empurra as compras que ficaram na fila.
                if (conectado && estavaOffline) {
                    refresh()
                    MarketWorkScheduler.enqueueImmediate(getApplication())
                }
            }
        }
        viewModelScope.launch {
            val destination = resolveStartupDestination(
                hasCredentials = runCatching { secrets.load() }.getOrNull() != null,
            )
            if (debugPreviewActive) return@launch
            screen.value = when (destination) {
                StartupDestination.ACTIVATION -> MarketScreen.Provisioning
                StartupDestination.WELCOME -> MarketScreen.Welcome
            }
            if (destination == StartupDestination.WELCOME) refresh()
        }
    }

    fun showDebugPreview(mode: String?) {
        val preview = debugPreviewData(mode, BuildConfig.PREVIEW_ENABLED) ?: return
        debugPreviewActive = true
        debugPreviewSession = preview.session
        debugPreviewPin = preview.pin
        viewModelScope.launch {
            database.marketDao().upsertProducts(preview.products)
            // O preview mostra a rede REAL do aparelho. Forçar "offline" aqui
            // fazia toda captura de tela sair com o aviso de sem internet.
            online.value = Conectividade.temInternet(getApplication())
            error.value = null
            // O preview precisa exercitar os MESMOS caminhos da tela real —
            // senão ele mostra uma home sem os atalhos e passa a mentir sobre
            // como o app se comporta depois do login.
            carregarAtalhos(preview.session.employee.id)
            screen.value = when (preview.target) {
                DebugPreviewTarget.WELCOME -> MarketScreen.Welcome
                DebugPreviewTarget.PIN -> MarketScreen.Pin
                DebugPreviewTarget.CATALOG -> MarketScreen.Catalog(preview.session)
                DebugPreviewTarget.CART -> {
                    // Carrinho com um item COM estoque e um SEM: é o estado que
                    // mostra o aviso de conferência, que é o difícil de acertar.
                    cart.value = mapOf(9002L to 2, 9005L to 1)
                    MarketScreen.Cart(preview.session)
                }
                DebugPreviewTarget.FOTO -> {
                    origemPendente.value = OrigemProduto.BUSCA
                    ultimoLido.value = preview.products.firstOrNull { it.id == 9005L }
                    exigindoFoto.value = ultimoLido.value != null
                    MarketScreen.Catalog(preview.session)
                }
                DebugPreviewTarget.RECEIPT -> MarketScreen.Receipt(reciboDeExemplo())
            }
        }
    }

    fun provision(code: String) = viewModelScope.launch {
        busy.value = true; error.value = null
        try { repository.provision(code); screen.value = MarketScreen.Welcome; refresh() }
        catch (falha: Exception) {
            val api = falha as? MarketApiException
            error.value = when {
                api?.offline == true -> "Tablet sem internet. Verifique o Wi-Fi e tente de novo."
                api?.message == "market_schema_missing" -> "Mercadinho em manutenção. Chame o administrador."
                api != null && api.statusCode >= 500 -> "Servidor indisponível. Tente novamente em instantes."
                else -> "Código de pareamento inválido ou expirado. Gere um novo no painel."
            }
        }
        finally { busy.value = false }
    }

    val baixandoImagens = MutableStateFlow(false)

    // NÃO mexe em `online`: quem manda nisso é a conectividade do sistema. Uma
    // sincronização que falha com a rede boa significa servidor indisponível —
    // dizer "sem internet" nesse caso é mentira e manda a pessoa olhar o Wi-Fi
    // à toa.
    private suspend fun refresh() {
        // O snapshot é best-effort e NÃO manda no resto: antes ele ficava dentro
        // do try, então qualquer falha dele pulava o download das fotos em
        // silêncio — e o tablet ficava com o catálogo cheio e o cache de imagens
        // praticamente vazio (medido: 6 arquivos para 230 produtos com foto).
        runCatching { repository.refreshSnapshot() }

        // As fotos são do catálogo QUE JÁ ESTÁ NO TABLET. Não dependem de o
        // snapshot ter descido agora — se o servidor está fora, as imagens do
        // que já foi sincronizado continuam valendo a pena baixar.
        //
        // Fora do viewModelScope: esse escopo morre quando a tela é recriada, e
        // baixar 230 fotos leva mais que isso. Cancelado no meio, o cache ficava
        // pela metade e nunca completava.
        baixarImagens()
    }

    private var jobImagens: kotlinx.coroutines.Job? = null

    private fun baixarImagens() {
        if (jobImagens?.isActive == true) return   // já está baixando
        jobImagens = kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
            baixandoImagens.value = true
            val alvo = runCatching { database.marketDao().produtosParaCache() }.getOrDefault(emptyList())
            val n = runCatching { ImagensOffline.baixarTudo(getApplication(), alvo) }.getOrDefault(0)
            android.util.Log.i("TridiMarketPerf", "imagens/cache=$n de ${alvo.size}")
            baixandoImagens.value = false
        }
    }

    fun appendPin(digit: Char) { if (!pin.value.isLocked(System.currentTimeMillis())) pin.value = pin.value.append(digit) }
    fun erasePin() { pin.value = pin.value.erase() }
    fun startEmployeeJourney() {
        pin.value = PinState()
        error.value = null
        screen.value = MarketScreen.Pin
        // NÃO sincroniza aqui. Baixar catálogo + 348 fotos enquanto a pessoa
        // digita era o que fazia o login levar 5,7 s: a requisição de login
        // disputava a rede com centenas de imagens. O que vale a pena adiantar
        // é o custo FIXO da chamada — DNS, TCP e TLS — e isso é o aquecimento.
        if (!debugPreviewActive) viewModelScope.launch { repository.aquecerConexao() }
    }

    private fun sessaoAtual(): SessionData? = when (val atual = screen.value) {
        is MarketScreen.Catalog -> atual.session
        is MarketScreen.Busca -> atual.session
        is MarketScreen.Digitacao -> atual.session
        is MarketScreen.Cart -> atual.session
        else -> null
    }

    fun openCart() { sessaoAtual()?.let { screen.value = MarketScreen.Cart(it) } }
    fun abrirBusca() { sessaoAtual()?.let { screen.value = MarketScreen.Busca(it) } }
    fun abrirSemCodigo() { sessaoAtual()?.let { screen.value = MarketScreen.Busca(it, apenasSemCodigo = true) } }
    fun abrirDigitacao() { sessaoAtual()?.let { scanState = ScanState(); screen.value = MarketScreen.Digitacao(it) } }
    fun voltarParaEscolha() { sessaoAtual()?.let { screen.value = MarketScreen.Catalog(it) } }

    // Escolher um produto na busca ou nos atalhos: sem estoque pergunta antes,
    // igual ao leitor — o contador local atrasa e não pode travar a compra.
    // A origem fica marcada porque é ela que decide se vai pedir a foto de
    // conferência: nada aqui prova que o item na mão é o item da lista.
    fun escolherProduto(produto: ProductEntity) {
        origemPendente.value = OrigemProduto.BUSCA
        ultimoLido.value = produto
        aguardandoConfirmacao.value = true
    }

    // ── Atalhos da home ─────────────────────────────────────────────────────
    // "Você costuma levar": sai do histórico que já está NO TABLET (as compras
    // ficam em pending_operations mesmo depois de sincronizadas), então é
    // personalizado por pessoa e funciona sem internet.
    val maisComprados = MutableStateFlow<List<ProductEntity>>(emptyList())
    val maisCompradosPersonalizado = MutableStateFlow(false)

    private fun carregarAtalhos(employeeId: Long) = viewModelScope.launch {
        val dao = database.marketDao()
        val meus = runCatching { dao.maisCompradosPor(employeeId, 8) }.getOrDefault(emptyList())
        if (meus.isNotEmpty()) {
            maisComprados.value = meus; maisCompradosPersonalizado.value = true
        } else {
            // Primeira compra da pessoa: mostra o mais vendido do tablet em vez
            // de uma seção vazia.
            maisComprados.value = runCatching { dao.maisCompradosNoTablet(8) }.getOrDefault(emptyList())
            maisCompradosPersonalizado.value = false
        }
    }

    // ── Leitor de código de barras ──────────────────────────────────────────
    private var scanState = ScanState()
    val ultimoLido = MutableStateFlow<ProductEntity?>(null)
    val avisoLeitura = MutableStateFlow<String?>(null)
    // Produtos que dividem o código recém-lido. Vazio = leitura sem empate.
    val empateLeitura = MutableStateFlow<List<ProductEntity>>(emptyList())
    // Produto lido/escolhido esperando o "sim" da pessoa.
    val aguardandoConfirmacao = MutableStateFlow(false)
    // Como o produto pendente foi escolhido, e se a foto de conferência já foi
    // pedida. Ver ConferenciaRules.kt e FotoConferencia.kt.
    val origemPendente = MutableStateFlow(OrigemProduto.LEITOR)
    val exigindoFoto = MutableStateFlow(false)
    private val feedback by lazy { ScanFeedback(application) }
    val som by lazy { SomEfeitos.get(application) }

    fun fecharDigitacao() {
        val atual = screen.value as? MarketScreen.Digitacao ?: return
        aguardandoConfirmacao.value = false
        empateLeitura.value = emptyList()
        screen.value = MarketScreen.Catalog(atual.session)
    }

    // Chamado a cada leitura da câmera — dezenas de vezes por segundo. Tudo que
    // decide se vira compra está aqui; a tela só mostra o resultado.
    fun codigoLido(bruto: String) {
        // Enquanto a confirmação está na tela, novas leituras são ignoradas:
        // senão a resposta seria dada para outro item.
        if (aguardandoConfirmacao.value) return
        val transicao = reduceScan(scanState, bruto, System.currentTimeMillis())
        scanState = transicao.estado
        val aceito = transicao.resultado as? ScanResultado.Aceito ?: return
        viewModelScope.launch {
            // Busca no banco LOCAL: funciona sem internet.
            val achados = database.marketDao().productsByBarcode(chavesDeBusca(aceito.codigo))
            if (achados.isEmpty()) {
                feedback.falha()
                ultimoLido.value = null
                avisoLeitura.value = "Esse produto não está cadastrado no sistema (código ${aceito.codigo}). Avise quem cuida do mercadinho."
                return@launch
            }
            // Mais de um produto no mesmo código: não dá pra adivinhar qual está
            // na mão, e chutar cobra o item errado. A pessoa escolhe.
            if (achados.size > 1) {
                origemPendente.value = OrigemProduto.LEITOR
                avisoLeitura.value = null
                empateLeitura.value = achados
                som.bip()
                return@launch
            }
            val produto = achados.first()
            // O produto lido NÃO entra sozinho no carrinho: aparece na hora,
            // com foto e nome, pra pessoa confirmar. Um código parecido lido
            // por engano viraria uma cobrança que ninguém percebeu na hora.
            origemPendente.value = OrigemProduto.LEITOR
            ultimoLido.value = produto
            avisoLeitura.value = null
            // Bip de scanner ao reconhecer o produto (sem estoque ou não — o
            // aviso de estoque é visual, no pop-up).
            som.bip()
            aguardandoConfirmacao.value = true
        }
    }

    // Empate de código: a pessoa toca no produto certo e ele segue pro fluxo
    // normal de confirmação (com foto e preço), como se tivesse sido lido sozinho.
    fun escolherDoEmpate(produto: ProductEntity) {
        empateLeitura.value = emptyList()
        ultimoLido.value = produto
        aguardandoConfirmacao.value = true
    }

    fun limparAviso() { avisoLeitura.value = null }

    fun cancelarEmpate() {
        empateLeitura.value = emptyList()
        ultimoLido.value = null
    }

    fun confirmarProduto() {
        val produto = ultimoLido.value ?: return
        aguardandoConfirmacao.value = false
        // Escolhido na busca: passa pela foto antes de entrar no carrinho.
        if (exigeFotoDeConferencia(origemPendente.value)) {
            exigindoFoto.value = true
            return
        }
        add(produto.id)
        // Libera o código: quem quer DOIS do mesmo item só encosta de novo.
        scanState = liberarRepeticao(scanState)
    }

    // A foto foi tirada (ou a câmera não está disponível): o item entra.
    fun confirmarFoto() {
        val produto = ultimoLido.value
        exigindoFoto.value = false
        ultimoLido.value = null
        produto?.let { add(it.id) }
    }

    fun cancelarFoto() {
        exigindoFoto.value = false
        ultimoLido.value = null
    }

    fun descartarProduto() {
        aguardandoConfirmacao.value = false
        exigindoFoto.value = false
        ultimoLido.value = null
        // Libera o mesmo código: quem disse "não" por engano pode bipar de novo
        // sem esperar a janela de repetição vencer.
        scanState = liberarRepeticao(scanState)
    }

    override fun onCleared() {
        feedback.encerrar()
        super.onCleared()
    }

    fun closeCart() {
        val cartScreen = screen.value as? MarketScreen.Cart ?: return
        screen.value = MarketScreen.Catalog(cartScreen.session)
    }

    fun endEmployeeSession() {
        // Saída normal (sair, expirar por inatividade, fim da compra) descarta o
        // carrinho salvo. É isso que faz "sobrou carrinho no banco" significar
        // "o app morreu sem avisar" — o único caso que vale restaurar.
        viewModelScope.launch { runCatching { repository.limparCarrinho() } }
        empateLeitura.value = emptyList()
        cart.value = emptyMap()
        pin.value = PinState()
        error.value = null
        screen.value = MarketScreen.Welcome
    }

    fun login() = viewModelScope.launch {
        if (pin.value.isLocked(System.currentTimeMillis())) { error.value = "Aguarde um minuto para tentar novamente."; return@launch }
        busy.value = true; error.value = null
        // O modo de preview NÃO intercepta mais o login.
        //
        // Ele comparava o código digitado com um PIN falso e recusava todo o
        // resto — então um tablet que tivesse sido aberto uma vez em preview
        // passava a dizer "Código não reconhecido" para TODO MUNDO. E como o
        // Android reentrega o intent que criou a tarefa (launchMode
        // singleTask), o aparelho ficava presa nesse estado até uma
        // reinstalação. Recurso de depuração não pode ter poder de derrubar o
        // login de verdade: aqui ele só monta telas, nunca autentica.
        val inicio = SystemClock.elapsedRealtime()
        val codigo = pin.value.value
        try {
            // Caminho rápido: o diretório local reconhece o código na hora.
            val rapido = repository.autenticarLocal(codigo)
            val auth = rapido ?: repository.authenticate(codigo)
            pin.value = PinState()
            carregarAtalhos(auth.session.employee.id)
            // Carrinho que sobrou de uma queda (bateria/energia) volta pra pessoa
            // em vez de obrigá-la a catar tudo de novo.
            cart.value = runCatching { repository.carrinhoSalvo(auth.session.employee.id) }.getOrDefault(emptyMap())
            screen.value = MarketScreen.Catalog(auth.session)
            android.util.Log.i("TridiMarketPerf", "login TOTAL=${SystemClock.elapsedRealtime() - inicio}ms local=${rapido != null}")
            // Entrou pelo diretório local: o servidor confirma em segundo plano.
            if (rapido != null) reconciliarSessao(codigo)
        }
        catch (falha: Exception) {
            val recusaDoCodigo = falha is MarketApiException && falha.statusCode == 401 && falha.message == "invalid_pin"
            // Só conta tentativa quando o servidor de fato REJEITOU o código.
            // Antes qualquer falha (Wi-Fi caído, servidor fora) somava tentativa
            // e acabava bloqueando quem digitou o código certo.
            if (recusaDoCodigo) pin.value = pin.value.onFailure(System.currentTimeMillis())
            android.util.Log.i("TridiMarketPerf", "login FALHOU em ${SystemClock.elapsedRealtime() - inicio}ms: ${falha.message}")
            error.value = when {
                recusaDoCodigo && pin.value.isLocked(System.currentTimeMillis()) -> "Muitas tentativas. Aguarde um minuto."
                else -> mensagemDeFalha(falha)
            }
        }
        finally { busy.value = false }
    }

    // Confirmação da sessão em segundo plano, depois de entrar pelo diretório
    // local. Faz duas coisas que importam:
    //
    // 1. Troca a sessão local pela do SERVIDOR — token assinado e saldo fresco,
    //    porque o número do diretório é do último bootstrap e pode estar velho.
    // 2. Obedece a uma recusa DEFINITIVA. Código revogado ou conta bloqueada
    //    derrubam a sessão na hora, com o motivo na tela. É o que mantém o
    //    servidor como autoridade mesmo com o login resolvido aqui.
    //
    // Sem rede ou servidor fora: silêncio. Seguir offline é o projeto do app,
    // não uma falha.
    private fun reconciliarSessao(codigo: String) = viewModelScope.launch {
        val real = try {
            repository.autenticarNoServidor(codigo)
        } catch (falha: Exception) {
            val api = falha as? MarketApiException
            if (api != null && api.statusCode in 400..499) {
                endEmployeeSession()
                error.value = mensagemDeFalha(falha)
                // Conta inativa: apaga o que deixava a pessoa entrar sem o
                // servidor. Da próxima vez a recusa acontece NA TELA DO CÓDIGO,
                // sem aquele entra-e-sai que não explicava nada.
                if (api.message == "conta_inativa") {
                    runCatching { repository.esquecerContaInativa() }
                }
            }
            return@launch
        }
        // A pessoa pode já ter saído (ou o totem ter expirado) enquanto isso.
        if (sessaoAtual() == null) return@launch
        trocarSessao(real.session)
    }

    // Substitui a sessão sem tirar a pessoa de onde ela está.
    private fun trocarSessao(nova: SessionData) {
        screen.value = when (val atual = screen.value) {
            is MarketScreen.Catalog -> atual.copy(session = nova)
            is MarketScreen.Busca -> atual.copy(session = nova)
            is MarketScreen.Digitacao -> atual.copy(session = nova)
            is MarketScreen.Cart -> atual.copy(session = nova)
            else -> atual
        }
    }

    // Sem teto por estoque: o contador local atrasa (compra offline, reposição
    // não lançada) e impedia a compra de produto que estava na prateleira. O
    // aviso de "sem estoque" fica na confirmação; a diferença o gestor concilia.
    fun add(productId: Long) { val current = cart.value[productId] ?: 0; if (products.value.any { it.id == productId }) { cart.value = cart.value + (productId to current + 1); guardarCarrinho() } }
    fun remove(productId: Long) { val current = cart.value[productId] ?: return; cart.value = if (current <= 1) cart.value - productId else cart.value + (productId to current - 1); guardarCarrinho() }
    // Tira o item inteiro, qualquer que seja a quantidade.
    fun removeAll(productId: Long) { cart.value = cart.value - productId; guardarCarrinho() }

    // Espelha o carrinho no banco a cada mexida, pra bateria acabando no meio da
    // escolha não apagar o que a pessoa já juntou. Escrita minúscula (uma linha
    // chave/valor) e fora do caminho da tela.
    private fun guardarCarrinho() {
        val funcionario = sessaoAtual()?.employee?.id ?: return
        val itens = cart.value
        viewModelScope.launch { runCatching { repository.salvarCarrinho(funcionario, itens) } }
    }

    fun checkout() = viewModelScope.launch {
        val session = when (val current = screen.value) {
            is MarketScreen.Catalog -> current.session
            is MarketScreen.Cart -> current.session
            else -> return@launch
        }
        val lines = cart.value.mapNotNull { (id, quantity) -> products.value.firstOrNull { it.id == id }?.let { CartLine(id, quantity, it.price) } }
        if (lines.isEmpty()) return@launch
        busy.value = true
        try {
            // O recibo é montado ANTES de esvaziar o carrinho: é dele que sai a
            // lista de itens que a pessoa confere no fim.
            val recibo = { naFila: Boolean ->
                montarRecibo(products.value, cart.value, session.employee, naFila, session.empresa.takeIf { session.visitante })
            }
            if (debugPreviewActive) {
                val dados = recibo(false); cart.value = emptyMap(); screen.value = MarketScreen.Receipt(dados)
                som.pagamento()
                return@launch
            }
            repository.queuePurchase(session.employee.id, session.token, lines)
            // A compra já está gravada em disco; o rascunho não serve mais.
            runCatching { repository.limparCarrinho() }
            val dados = recibo(true); cart.value = emptyMap(); screen.value = MarketScreen.Receipt(dados)
            // Som do Apple Pay ao registrar a compra.
            som.pagamento()
            MarketWorkScheduler.enqueueImmediate(getApplication())
        } catch (_: Exception) { error.value = "Não foi possível guardar a compra neste tablet." }
        finally { busy.value = false }
    }

    fun finishReceipt() = endEmployeeSession()
}

// Traduz a falha para a pessoa que está na frente do tablet. Cada motivo tem
// uma saída diferente: chamar o administrador, esperar, ou olhar o Wi-Fi. Dizer
// "código não reconhecido" para tudo mandava a pessoa tentar de novo — a única
// coisa que nunca resolvia.
internal fun mensagemDeFalha(falha: Exception): String {
    val api = falha as? MarketApiException ?: return "Não foi possível entrar. Chame o administrador."
    // Só chega aqui quando nem o diretório offline resolveu (tablet nunca
    // sincronizou). Com diretório baixado, sem rede o login funciona igual.
    if (api.offline) return "Tablet ainda não sincronizou. Chame o administrador."
    return when (api.message) {
        "invalid_pin" -> "Código não reconhecido."
        // Conta desativada tem mensagem PRÓPRIA: a pessoa não digitou errado, e
        // mandá-la tentar de novo só gera fila no totem.
        "conta_inativa" -> "Sua conta está inativa. Fale com o responsável."
        "pin_ambiguous" -> "Seu código está repetido em outra pessoa. Chame o administrador."
        "employee_blocked" -> "Sua conta está bloqueada. Fale com o administrador."
        "pin_temporarily_locked" -> "Muitas tentativas neste tablet. Aguarde alguns minutos."
        "employee_not_available" -> "Seu cadastro não está liberado para comprar."
        "invalid_device" -> "Este tablet perdeu o pareamento. Chame o administrador."
        "market_schema_missing" -> "Mercadinho em manutenção. Chame o administrador."
        else -> if (api.statusCode >= 500) "Servidor indisponível. Tente novamente em instantes."
        else "Não foi possível entrar. Chame o administrador."
    }
}

@Composable
fun MarketApp(viewModel: MarketViewModel) {
    val context = LocalContext.current.applicationContext
    val screen by viewModel.screen.collectAsStateWithLifecycle()
    val products by viewModel.products.collectAsStateWithLifecycle()
    val cart by viewModel.cart.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val online by viewModel.online.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val pin by viewModel.pin.collectAsStateWithLifecycle()
    val atalhosCrus by viewModel.maisComprados.collectAsStateWithLifecycle()
    // Os atalhos vêm de uma consulta feita UMA vez, no login, e carregam o
    // estoque daquele instante. Vender a última unidade não os atualizava, e o
    // produto zerado continuava sendo oferecido na tela inicial — a mesma regra
    // que a busca aplica não valia aqui.
    //
    // Reamarrar cada atalho ao produto vivo (`products`, que é um Flow do Room)
    // resolve as duas coisas: o estoque fica atual e a regra passa a valer.
    val atalhos = remember(atalhosCrus, products) {
        val vivos = products.associateBy { it.id }
        visiveisNaBusca(atalhosCrus.mapNotNull { vivos[it.id] })
    }
    val atalhosPersonalizados by viewModel.maisCompradosPersonalizado.collectAsStateWithLifecycle()
    val tracksIdle = screen == MarketScreen.Pin ||
        screen is MarketScreen.Catalog ||
        screen is MarketScreen.Cart
    var lastInteractionMs by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    var nowMs by remember { mutableLongStateOf(lastInteractionMs) }

    LaunchedEffect(Unit) {
        withFrameNanos { }
        withContext(Dispatchers.Default) {
            MarketWorkScheduler.ensureScheduled(context)
        }
    }

    // A câmera saiu do caminho de identificar produto: não há mais o que
    // aquecer nem lente pra segurar aberta. A única câmera que resta é a da
    // foto de conferência, que abre e fecha na hora, uma vez por compra.

    LaunchedEffect(screen) {
        val currentTime = SystemClock.elapsedRealtime()
        lastInteractionMs = currentTime
        nowMs = currentTime
    }
    LaunchedEffect(tracksIdle) {
        while (tracksIdle) {
            nowMs = SystemClock.elapsedRealtime()
            delay(1_000L)
        }
    }

    val idlePhase = if (tracksIdle) {
        resolveIdlePhase(nowMs = nowMs, lastInteractionMs = lastInteractionMs)
    } else {
        IdlePhase.ACTIVE
    }
    LaunchedEffect(idlePhase) {
        if (idlePhase == IdlePhase.EXPIRED) viewModel.endEmployeeSession()
    }

    val interactionModifier = if (tracksIdle && idlePhase == IdlePhase.ACTIVE) {
        Modifier.pointerInput(screen) {
            awaitPointerEventScope {
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    if (event.changes.any { it.pressed }) {
                        val currentTime = SystemClock.elapsedRealtime()
                        lastInteractionMs = currentTime
                        nowMs = currentTime
                    }
                }
            }
        }
    } else {
        Modifier
    }

    Box(Modifier.fillMaxSize().then(interactionModifier)) {
        when (val current = screen) {
            MarketScreen.Loading -> LoadingScreen()
            MarketScreen.Provisioning -> ProvisioningScreen(busy, error, viewModel::provision)
            MarketScreen.Welcome -> WelcomeScreen(viewModel::startEmployeeJourney)
            // A tela do código também é a porta de manutenção: a sequência
            // secreta abre o pareamento do leitor sem sair do totem.
            MarketScreen.Pin -> PinComPortaDeManutencao(
                state = pin,
                busy = busy,
                error = error,
                online = online,
                onDigit = viewModel::appendPin,
                onErase = viewModel::erasePin,
                onSubmit = viewModel::login,
                onBack = viewModel::endEmployeeSession,
            )
            is MarketScreen.Catalog -> {
                val resumo = summarizeCart(products, cart)
                val confirmando by viewModel.aguardandoConfirmacao.collectAsStateWithLifecycle()
                val fotografando by viewModel.exigindoFoto.collectAsStateWithLifecycle()
                val origem by viewModel.origemPendente.collectAsStateWithLifecycle()
                val pendente by viewModel.ultimoLido.collectAsStateWithLifecycle()
                val avisoDaLeitura by viewModel.avisoLeitura.collectAsStateWithLifecycle()
                val empateDaHome by viewModel.empateLeitura.collectAsStateWithLifecycle()
                // Sem câmera, leitor ausente = totem mudo. A home avisa.
                val leitorConectado = lembrarLeitorConectado()
                // O aviso some sozinho: preso na tela ele passaria a acusar um
                // produto que já foi resolvido, e ninguém o fecharia.
                LaunchedEffect(avisoDaLeitura) {
                    if (avisoDaLeitura != null) { delay(6_000); viewModel.limparAviso() }
                }
                Box {
                    EscolhaScreen(
                        employee = current.session.employee,
                        online = online,
                        visitante = current.session.visitante,
                        empresa = current.session.empresa,
                        maisComprados = atalhos,
                        linhasCarrinho = remember(products, cart) { linhasDoCarrinho(products, cart) },
                        produtosBusca = products,
                        aviso = avisoDaLeitura,
                        leitorConectado = leitorConectado,
                        maisCompradosPersonalizado = atalhosPersonalizados,
                        itensNoCarrinho = resumo.itemCount,
                        totalCarrinho = resumo.total,
                        temSemCodigo = products.any { it.semCodigo },
                        // A lista de "sem código" fica no topo da tela de busca
                        // (campo vazio) — o botão só encurta o caminho até ela.
                        onSemCodigo = viewModel::abrirSemCodigo,
                        onLerCodigo = viewModel::abrirDigitacao,
                        onPesquisar = viewModel::abrirBusca,
                        onEscolherProduto = viewModel::escolherProduto,
                        onAbrirCarrinho = viewModel::openCart,
                        onSair = viewModel::endEmployeeSession,
                    )
                    if (confirmando && pendente != null) {
                        ConfirmarProduto(
                            produto = pendente!!,
                            onConfirmar = viewModel::confirmarProduto,
                            onCancelar = viewModel::descartarProduto,
                            pedeFoto = exigeFotoDeConferencia(origem),
                        )
                    }
                    if (fotografando && pendente != null) {
                        FotoDeConferencia(pendente!!, viewModel::confirmarFoto, viewModel::cancelarFoto)
                    }
                    // Código repetido na própria home: o leitor funciona em
                    // qualquer tela, então é aqui que a escolha precisa
                    // aparecer.
                    if (empateDaHome.size > 1) {
                        EscolherDoEmpate(
                            produtos = empateDaHome,
                            onEscolher = viewModel::escolherDoEmpate,
                            onCancelar = viewModel::cancelarEmpate,
                            titulo = "Qual destes você pegou?",
                            subtitulo = "Estes produtos têm o mesmo código de barras.",
                        )
                    }
                }
            }
            is MarketScreen.Busca -> {
                val resumo = summarizeCart(products, cart)
                val confirmando by viewModel.aguardandoConfirmacao.collectAsStateWithLifecycle()
                val fotografando by viewModel.exigindoFoto.collectAsStateWithLifecycle()
                val origem by viewModel.origemPendente.collectAsStateWithLifecycle()
                val pendente by viewModel.ultimoLido.collectAsStateWithLifecycle()
                Box {
                    BuscaScreen(
                        employee = current.session.employee,
                        online = online,
                        visitante = current.session.visitante,
                        empresa = current.session.empresa,
                        produtos = products,
                        apenasSemCodigo = current.apenasSemCodigo,
                        itensNoCarrinho = resumo.itemCount,
                        totalCarrinho = resumo.total,
                        onEscolher = viewModel::escolherProduto,
                        onAbrirCarrinho = viewModel::openCart,
                        onVoltar = viewModel::voltarParaEscolha,
                    )
                    if (confirmando && pendente != null) {
                        ConfirmarProduto(
                            produto = pendente!!,
                            onConfirmar = viewModel::confirmarProduto,
                            onCancelar = viewModel::descartarProduto,
                            pedeFoto = exigeFotoDeConferencia(origem),
                        )
                    }
                    if (fotografando && pendente != null) {
                        FotoDeConferencia(pendente!!, viewModel::confirmarFoto, viewModel::cancelarFoto)
                    }
                }
            }
            is MarketScreen.Digitacao -> {
                val ultimo by viewModel.ultimoLido.collectAsStateWithLifecycle()
                val avisoLeitura by viewModel.avisoLeitura.collectAsStateWithLifecycle()
                val confirmando by viewModel.aguardandoConfirmacao.collectAsStateWithLifecycle()
                val empate by viewModel.empateLeitura.collectAsStateWithLifecycle()
                val resumo = summarizeCart(products, cart)
                DigitarCodigoScreen(
                    aviso = avisoLeitura,
                    itensNoCarrinho = resumo.itemCount,
                    totalCarrinho = resumo.total,
                    onCodigo = viewModel::codigoLido,
                    onAbrirCarrinho = viewModel::openCart,
                    onVoltar = viewModel::fecharDigitacao,
                )
                // Mesma confirmação de sempre: o produto aparece com foto e
                // nome, e só entra no carrinho depois do "sim".
                if (confirmando && ultimo != null) {
                    ConfirmarProduto(ultimo!!, viewModel::confirmarProduto, viewModel::descartarProduto)
                }
                // Código dividido por mais de um produto: escolher é o único
                // jeito de não cobrar o item errado.
                if (empate.size > 1) {
                    EscolherDoEmpate(
                        produtos = empate,
                        onEscolher = viewModel::escolherDoEmpate,
                        onCancelar = viewModel::cancelarEmpate,
                        titulo = "Qual destes você pegou?",
                        subtitulo = "Estes produtos têm o mesmo código de barras.",
                    )
                }
            }
            is MarketScreen.Cart -> CartScreen(
                products = products,
                cart = cart,
                available = current.session.employee.available,
                busy = busy,
                error = error,
                onBack = viewModel::closeCart,
                onAdd = viewModel::add,
                onRemove = viewModel::remove,
                onRemoveAll = viewModel::removeAll,
                onCheckout = viewModel::checkout,
            )
            // A contagem para voltar ao início vive DENTRO da tela: assim a
            // barra que a pessoa vê e o retorno automático são o mesmo relógio.
            is MarketScreen.Receipt -> ReceiptScreen(current.dados, viewModel::finishReceipt)
        }

        if (idlePhase == IdlePhase.WARNING) {
            IdleWarningOverlay(
                remainingMs = DEFAULT_IDLE_EXPIRE_MS - (nowMs - lastInteractionMs),
                onContinue = {
                    val currentTime = SystemClock.elapsedRealtime()
                    lastInteractionMs = currentTime
                    nowMs = currentTime
                },
                onEnd = viewModel::endEmployeeSession,
            )
        }
    }
}

@Composable private fun LoadingScreen() {
    Box(Modifier.fillMaxSize().background(MarketCanvas), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            androidx.compose.foundation.Image(
                painter = androidx.compose.ui.res.painterResource(com.tridi.market.R.drawable.ic_tridimarket_logo),
                contentDescription = "TridiMarket",
                modifier = Modifier.width(64.dp),
                colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(MarketBrand),
            )
            Text("TRIDI MARKET", color = MarketPurple, fontWeight = FontWeight.ExtraBold, letterSpacing = 3.sp)
        }
    }
}

@Composable private fun ProvisioningScreen(busy: Boolean, error: String?, onProvision: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(MarketCanvas), contentAlignment = Alignment.Center) {
        Column(Modifier.width(420.dp).background(Color.White, RoundedCornerShape(22.dp)).padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Ativar TridiMarket", color = MarketInk, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
            Text("No painel de Administração, gere o código para este tablet.", color = Color(0xFF6F7180))
            OutlinedTextField(value = code, onValueChange = { code = it.filter(Char::isDigit).take(6) }, label = { Text("Código de 6 dígitos") }, singleLine = true)
            Button(onClick = { onProvision(code) }, enabled = code.length == 6 && !busy) { Text("Ativar tablet", modifier = Modifier.padding(8.dp), fontWeight = FontWeight.Bold) }
            if (error != null) Text(error, color = MarketRed)
        }
    }
}
