package com.tridi.tv

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tridi.tv.core.network.ApiClient
import com.tridi.tv.BuildConfig
import com.tridi.tv.core.session.DeviceSession
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.tridi.tv.core.storage.DeviceStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SetupState(
    val urlBase: String = "",
    val nome: String = "",
    val kiosk: Boolean = false,
    val testando: Boolean = false,
    /** null = ainda não testou nesta sessão. */
    val conexaoOk: Boolean? = null,
    val detalhe: String = "",
    val salvo: Boolean = false,
    // Ativação na frota (gestão remota):
    val codigo: String = "",
    val ativando: Boolean = false,
    /** null = não tentou nesta sessão. */
    val ativado: Boolean? = null,
    val ativacaoMsg: String = "",
    /**
     * A TV pode instalar a atualizacao que a frota mandar?
     *
     * `true` quando ela e device owner (instala calada) OU quando a permissao
     * de "instalar apps desconhecidos" ja foi concedida a este app. `false`
     * significa que a atualizacao remota vai chegar e parar numa tela que
     * ninguem aperta.
     */
    val podeAtualizar: Boolean = true,
    /** Quanto esta TV desenha girado: 0, 90, 180 ou 270. */
    val giro: Int = 0,
    /** Modelo + Android + API, como o runtime informa. Mostrado no rodapé. */
    val aparelho: String = "",
    /**
     * Se esta TV já instala atualização sozinha e, quando não, o que fazer.
     * Ver [PortaDeEntrada] — a resposta termina no comando pronto.
     */
    val automacao: String = "",
    /** true quando já é device owner: a linha vira boa notícia, não tarefa. */
    val automatica: Boolean = false,
)

/**
 * Configuração do APARELHO. Tudo aqui é por TV, não por pessoa: para onde ela
 * aponta, como ela se chama e se está travada em quiosque.
 */
@HiltViewModel
class SetupViewModel @Inject constructor(
    private val app: Application,
    private val store: DeviceStore,
    private val api: ApiClient,
    private val session: DeviceSession,
) : ViewModel() {

    /**
     * Se a atualizacao remota tem caminho ate o fim NESTA TV.
     *
     * Duas portas, e basta uma: device owner instala sem perguntar; sem ele o
     * Android abre a tela de confirmacao, mas so depois que este app ganhou a
     * permissao especial de instalar apps de fonte desconhecida. Sem nenhuma
     * das duas, o update baixa, abre um aviso de seguranca e morre ali.
     *
     * Abaixo do Android 8 nao existe essa permissao por app — a antiga era
     * global, e o instalador simplesmente abre.
     */
    private fun podeInstalar(): Boolean {
        val dpm = app.getSystemService(android.app.admin.DevicePolicyManager::class.java)
        if (dpm?.isDeviceOwnerApp(app.packageName) == true) return true
        if (Build.VERSION.SDK_INT < 26) return true
        return app.packageManager.canRequestPackageInstalls()
    }

    /** Reavalia o que a pessoa pode ter ligado em Ajustes e voltado. */
    fun reconferirPermissao() = _state.update {
        it.copy(
            podeAtualizar = podeInstalar(),
            automacao = PortaDeEntrada.diagnostico(app),
            automatica = PortaDeEntrada.jaEhAutomatica(app),
        )
    }

    /** Leva a Ajustes → Acessibilidade para ligar a atualização automática. */
    fun ligarAtualizacaoAutomatica() = PortaDeEntrada.abrirAcessibilidade(app)

    /**
     * Leva direto a tela onde se concede a permissao, ja filtrada neste app.
     *
     * Mandar alguem "procurar em Ajustes > Apps > Acesso especial" num controle
     * remoto de TV box e o mesmo que nao pedir: sao seis niveis de menu com o
     * nome diferente em cada ROM.
     */
    fun abrirPermissaoDeInstalacao() {
        if (Build.VERSION.SDK_INT < 26) return
        val i = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
            .setData(Uri.parse("package:" + app.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            app.startActivity(i)
        } catch (e: Exception) {
            // Ha ROM de TV box sem essa tela. Cai na lista geral de ajustes, que
            // pelo menos existe em todas.
            try {
                app.startActivity(
                    Intent(android.provider.Settings.ACTION_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            } catch (_: Exception) {
                _state.update { it.copy(ativacaoMsg = "esta TV não abre a tela de permissão") }
            }
        }
    }

    private val _state = MutableStateFlow(SetupState())
    val state: StateFlow<SetupState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.update {
                it.copy(
                    urlBase = api.baseAtual(),
                    nome = store.deviceName.first().orEmpty(),
                    kiosk = store.kioskLocked.first(),
                    podeAtualizar = podeInstalar(),
                    giro = store.giroTela.first(),
                    aparelho = modeloEVersao() + " · app " + BuildConfig.VERSION_NAME,
                    automacao = PortaDeEntrada.diagnostico(app),
                    automatica = PortaDeEntrada.jaEhAutomatica(app),
                )
            }
        }
    }

    fun editarUrl(v: String) = _state.update { it.copy(urlBase = v, conexaoOk = null, salvo = false) }
    fun editarNome(v: String) = _state.update { it.copy(nome = v, salvo = false) }
    fun alternarKiosk(v: Boolean) = _state.update { it.copy(kiosk = v, salvo = false) }

    /**
     * Salva e JÁ TESTA. Salvar uma URL errada numa TV pendurada na parede custa
     * uma escada — o resultado do teste tem que aparecer antes de sair da tela.
     */
    fun salvar() = viewModelScope.launch {
        val s = _state.value
        if (s.urlBase.isNotBlank()) store.setApiBase(s.urlBase)
        if (s.nome.isNotBlank()) store.setDeviceName(s.nome)
        store.setKioskLocked(s.kiosk)
        _state.update { it.copy(salvo = true, testando = true, conexaoOk = null) }

        val (ok, detalhe) = try {
            api.getRaw("/api/config")
            true to "o servidor respondeu"
        } catch (e: Exception) {
            false to (e.message ?: "não consegui falar com o servidor")
        }
        _state.update { it.copy(testando = false, conexaoOk = ok, detalhe = detalhe) }
    }
    fun editarCodigo(v: String) = _state.update { it.copy(codigo = v.uppercase(), ativado = null) }

    /**
     * Passa para a próxima posição de tela, aplicando na hora.
     *
     * Cicla em vez de perguntar porque quem está ajustando está OLHANDO a TV: é
     * mais rápido apertar até a imagem ficar de pé do que ler quatro nomes e
     * adivinhar qual corresponde a como a caixa foi parafusada na parede.
     */
    fun girarTela() = viewModelScope.launch {
        val proximo = (_state.value.giro + 90) % 360
        store.setGiroTela(proximo)
        _state.update { it.copy(giro = proximo) }
    }

    /**
     * Como esta TV se identifica no console: modelo, versão do Android e a API
     * que o runtime REALMENTE oferece.
     *
     * A API é o que importa, e é justamente o que ninguém consegue ver: ROM de
     * TV box barata anuncia "Android 10" em Ajustes rodando um framework
     * recortado por baixo. O `SDK_INT` vem do runtime que executa o app, então
     * ele não mente — e responde de uma vez a pergunta que só apareceria como
     * um crash na parede.
     *
     * Vai dentro de `modelo`, um campo que já existe: uma coluna nova exigiria
     * SQL rodado à mão antes de qualquer TV conseguir se registrar.
     */
    private fun modeloEVersao(): String =
        "${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
            .replace("\"", "")

    /**
     * O que vai para o console da frota ao registrar: o aparelho, mais o IP
     * local e se ele aceita ADB por rede.
     *
     * O IP local é a peça que faltava para preparar a automação sem escada.
     * Ele só é útil enquanto a TV ainda não é device owner — depois disso a
     * linha vira ruído, então some.
     */
    private fun identificacao(): String {
        val base = modeloEVersao()
        if (com.tridi.tv.core.kiosk.Kiosk.ehDeviceOwner(app)) return "$base · automática"
        val ip = PortaDeEntrada.ipLocal(app) ?: return base
        val porta = PortaDeEntrada.portaAdbDeRede()
        return if (porta != null && porta != "-1") "$base · $ip · adb $porta" else "$base · $ip"
    }

    /**
     * Entra na frota SEM codigo: a TV se cadastra sozinha, so com o nome.
     *
     * O codigo de 8 caracteres obrigava abrir o console no computador, copiar e
     * digitar letra por letra no controle remoto — atrito suficiente para
     * ninguem usar. Aqui a pessoa da um nome a TV e acabou; o resto (endereco
     * do servidor, token, ritmo) ja vem pronto no app.
     */
    fun entrarNaFrota() = viewModelScope.launch {
        val nome = _state.value.nome.trim().ifBlank { "TV sem nome" }
        _state.update { it.copy(ativando = true, ativado = null, ativacaoMsg = "") }
        try {
            // O modelo vai com a versão REAL do Android — a que o runtime usa,
            // não a que a ROM exibe em Ajustes. Uma TV box quebrou por não ter
            // `java.time` (API 26+) enquanto anunciava Android 9/10, e sem esta
            // linha a única forma de descobrir era um crash na parede.
            val corpo = """{"nome":"${nome.replace("\"", "")}","segredo":"${BuildConfig.TV_REGISTRO_SEGREDO}","modelo":"${identificacao()}"}"""
            val resp = api.postRaw("/api/tv/device/registrar", corpo)
            val o = Json { ignoreUnknownKeys = true }.parseToJsonElement(resp).jsonObject
            val token = o["token"]?.jsonPrimitive?.content
            if (token.isNullOrBlank()) throw RuntimeException("resposta sem token")
            session.pair(token, nome, emptySet())
            store.setDeviceName(nome)
            _state.update { it.copy(ativando = false, ativado = true, ativacaoMsg = "esta TV entrou na frota") }
        } catch (e: Exception) {
            _state.update { it.copy(ativando = false, ativado = false, ativacaoMsg = e.message ?: "falha ao entrar na frota") }
        }
    }

    /**
     * Ativa esta TV na frota: troca o código (gerado no console) por um token
     * de dispositivo. A partir daí o agente (FleetAgent) atualiza e obedece
     * comando sozinho. Salva a URL antes, senão o activate vai pro fallback.
     */
    fun ativar() = viewModelScope.launch {
        val codigo = _state.value.codigo.trim()
        if (codigo.isBlank()) return@launch
        if (_state.value.urlBase.isNotBlank()) store.setApiBase(_state.value.urlBase)
        _state.update { it.copy(ativando = true, ativado = null, ativacaoMsg = "") }
        try {
            val resp = api.postRaw("/api/tv/device/activate", "{\"codigo\":\"$codigo\"}")
            val o = Json { ignoreUnknownKeys = true }.parseToJsonElement(resp).jsonObject
            val token = o["token"]?.jsonPrimitive?.content
            val nome = o["dispositivo"]?.jsonObject?.get("nome")?.jsonPrimitive?.content
                ?: _state.value.nome
            if (token.isNullOrBlank()) throw RuntimeException("resposta sem token")
            session.pair(token, nome, emptySet())
            _state.update { it.copy(ativando = false, ativado = true, nome = nome, ativacaoMsg = "ativado como \"$nome\"") }
        } catch (e: Exception) {
            _state.update { it.copy(ativando = false, ativado = false, ativacaoMsg = e.message ?: "falha na ativação") }
        }
    }
}
