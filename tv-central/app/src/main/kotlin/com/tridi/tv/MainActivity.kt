package com.tridi.tv

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.platform.LocalConfiguration
import com.tridi.tv.core.design.GiroDaTela
import com.tridi.tv.core.design.MolduraPainel
import com.tridi.tv.core.design.Tokens
import com.tridi.tv.core.design.TrocaDeTela
import com.tridi.tv.core.panelapi.PanelPlugin
import com.tridi.tv.core.kiosk.Kiosk
import com.tridi.tv.core.kiosk.Vigia
import com.tridi.tv.core.panelapi.PanelOrientation
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Nível 1 do quiosque: tela sempre ligada, imersivo, acorde ao ligar.
        Kiosk.aplicarTelaDeTV(this)
        Vigia.agendar(this)

        setContent {
            val vm: ShellViewModel = hiltViewModel()
            val estado by vm.state.collectAsStateWithLifecycle()

            // Caixa-preta: se a abertura ANTERIOR quebrou, a TV conta o que
            // houve antes de qualquer outra coisa. Numa caixa sem ADB, esta
            // tela e o unico jeito de saber o motivo de um "app parou".
            var crash by remember { mutableStateOf(CaixaPreta.ultimo(this@MainActivity)) }

            // Requisito 4: a orientação é do PAINEL, não do app. O manifesto fica
            // em `unspecified` e quem pede retrato é o descriptor — só enquanto
            // aquele painel está na tela.
            val destino = estado.destino
            LaunchedEffect(destino) {
                requestedOrientation = when {
                    destino is Destino.Painel ->
                        when (destino.plugin.descriptor.orientation) {
                            PanelOrientation.LANDSCAPE -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                            PanelOrientation.PORTRAIT -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
                            PanelOrientation.SYSTEM -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                        }
                    else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }
            }

            // Quiosque: aplicado quando a configuração pede E o aparelho é Device
            // Owner. Sem provisionamento, `travar` é no-op — a mesma APK roda nas
            // duas TVs.
            LaunchedEffect(estado.kiosk) {
                if (estado.kiosk) Kiosk.travar(this@MainActivity)
                else Kiosk.destravar(this@MainActivity)
            }

            /*
             * O giro é do APARELHO e envolve tudo — painel, seletor e a própria
             * configuração. A ROM de TV box costuma ignorar
             * `requestedOrientation`, então quem gira é o DESENHO (`GiroDaTela`).
             *
             * E é por isso que o formato do perfil precisa entrar aqui: pedir
             * `SCREEN_ORIENTATION_SENSOR_PORTRAIT` acima não vira nada numa
             * caixa dessas. Quem escolhia um perfil 9:16 (a Logística) via a
             * parede seguir deitada — a tela em pé desenhada espremida no meio
             * do 16:9 — e a única saída era descobrir sozinho o comando de giro.
             *
             * Regra: o giro configurado no aparelho MANDA (alguém foi lá e
             * decidiu, inclusive para consertar uma TV pendurada torta). Sem
             * ele, um perfil em pé numa saída deitada gira 90° sozinho, porque
             * um perfil 9:16 numa tela 16:9 quer dizer exatamente isso: a TV
             * está na parede em pé. Numa tela já em pé, nada a fazer.
             */
            val deitada = LocalConfiguration.current.let { it.screenWidthDp >= it.screenHeightDp }
            val giroEfetivo = when {
                estado.giro != 0 -> estado.giro
                estado.perfilRetrato && deitada -> 90
                else -> 0
            }
            GiroDaTela(giroEfetivo) {
            // A tela da vez vira uma CHAVE que carrega o que ela precisa. É a
            // chave (não o `estado` de agora) que desenha cada lado da troca:
            // durante os 150ms em que a tela antiga sai, o `destino` já é o
            // novo, e desenhar a antiga a partir dele quebraria o cast.
            val tela: Tela = when {
                crash != null -> Tela.Crash(crash!!)
                estado.setupAberto -> Tela.Setup
                destino is Destino.Carregando -> Tela.Splash
                destino is Destino.Seletor || estado.seletorAberto -> Tela.Seletor
                destino is Destino.Web -> Tela.Web(destino.url)
                destino is Destino.Painel -> Tela.Painel(destino.plugin)
                else -> Tela.Splash
            }
            Box(Modifier.fillMaxSize().background(Tokens.fundo)) {
                // Troca curta (250ms entra, 150ms sai) no lugar do corte seco —
                // o mesmo desenho da parede web (`app/painel/tv-tokens.css`).
                TrocaDeTela(tela, Modifier.fillMaxSize()) { t ->
                when (t) {
                    is Tela.Crash -> TelaDoCrash(
                        texto = t.texto,
                        aoFechar = { CaixaPreta.limpar(this@MainActivity); crash = null },
                    )

                    Tela.Setup -> SetupScreen(
                        onVoltar = vm::fecharSetup,
                        ehDeviceOwner = Kiosk.ehDeviceOwner(this@MainActivity),
                    )

                    // Nunca tela preta: numa TV, preto é indistinguível de aparelho
                    // morto e alguém vai reiniciar a caixa à toa. Piscar o seletor
                    // antes de saber a escolha também é errado — então, marca.
                    Tela.Splash -> Splash()

                    // A tela de escolha: ou porque não há nada escolhido, ou
                    // porque alguém apertou VOLTAR para trocar. No segundo caso
                    // a escolha continua salva — sair sem escolher devolve a TV
                    // ao painel de sempre.
                    Tela.Seletor -> SeletorScreen(
                        paineis = estado.disponiveis,
                        painelSumiu = estado.painelSumiu,
                        onEscolher = vm::escolher,
                        onConfigurar = vm::abrirSetup,
                        perfis = estado.perfis,
                        onEscolherPerfil = vm::escolherPerfil,
                    )

                    // O painel do ERP, aberto como página: é o MESMO endereço
                    // que a pessoa abre no navegador, então o que aparece na
                    // parede é o que ela aprovou — pele clara incluída.
                    is Tela.Web -> {
                        PainelWeb(t.url, Modifier.fillMaxSize())
                        DicaDeSaida()
                    }

                    is Tela.Painel -> {
                        val plugin = t.plugin
                        // Ciclo de vida por painel: ao trocar, o ViewModel do
                        // anterior é limpo e o poll dele para. Sem isso a TV fica
                        // buscando dados de uma tela que ninguém está vendo.
                        PainelHospedeiro(plugin.descriptor.id) {
                            MolduraPainel {
                                // O modifier já vem com overscan e área segura.
                                plugin.Content(Modifier.fillMaxSize())
                            }
                        }
                        // Como sair, dito uma vez ao entrar. Uma saída que
                        // ninguém descobre é a mesma coisa que não ter saída —
                        // e some sozinha porque a parede não é lugar de
                        // instrução permanente.
                        DicaDeSaida()
                    }
                }
                }
            }
            }

            // Como se sai do painel. Duas portas, porque uma só não bastou:
            //
            // • VOLTAR — o botão que qualquer pessoa aperta. Antes ele fechava o
            //   app inteiro e a TV caía no launcher; quem quisesse trocar de
            //   painel reabria e voltava ao mesmo lugar, porque a escolha está
            //   salva. Dava um beco: a tela de configuração ficava inalcançável.
            // • Segurar OK — continua valendo, e é o que protege de um esbarrão
            //   quando o app é o launcher da TV (ali não existe "sair").
            LaunchedEffect(destino, estado.setupAberto, estado.seletorAberto) {
                val noPainel = (destino is Destino.Painel || destino is Destino.Web) &&
                    !estado.setupAberto && !estado.seletorAberto
                aoSegurarOk = if (noPainel) ({ vm.voltarAoSeletor(); Unit }) else null
                aoVoltar = when {
                    estado.setupAberto -> ({ vm.fecharSetup(); Unit })
                    // Visitou a escolha e desistiu: volta ao painel que já
                    // estava lá, sem exigir que escolha de novo.
                    estado.seletorAberto -> ({ vm.fecharSeletor(); Unit })
                    noPainel -> ({ vm.voltarAoSeletor(); Unit })
                    // Na primeira tela, VOLTAR não faz nada: fechar o app numa
                    // TV de parede não serve a ninguém.
                    else -> ({ })
                }
            }
        }
    }

    private var aoSegurarOk: (() -> Unit)? = null
    private var aoVoltar: (() -> Unit)? = null

    /**
     * VOLTAR navega dentro do app, em vez de fechá-lo.
     *
     * Numa TV de parede não existe "sair para a área de trabalho": fechar o app
     * é sempre o resultado errado. Aqui o botão faz o que a pessoa espera —
     * recua uma tela — e no seletor simplesmente não faz nada.
     */
    @Deprecated("A alternativa (OnBackPressedDispatcher) não cobre o controle de TV box antiga.")
    override fun onBackPressed() {
        val voltar = aoVoltar
        if (voltar != null) voltar() else super.onBackPressed()
    }

    override fun onKeyLongPress(keyCode: Int, event: KeyEvent): Boolean {
        val sair = aoSegurarOk
        if (sair != null && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
            sair()
            return true
        }
        return super.onKeyLongPress(keyCode, event)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        // `startTracking` é o que faz o onKeyLongPress existir. Só no painel:
        // no seletor, engolir o OK deixaria a tela sem como escolher nada.
        if (aoSegurarOk != null &&
            (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)
        ) {
            event.startTracking()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}

/**
 * O que está na tela, com o que cada tela precisa para se desenhar sozinha.
 * Igualdade por valor: o mesmo painel/URL não dispara troca a cada recomposição.
 */
private sealed interface Tela {
    data class Crash(val texto: String) : Tela
    data object Setup : Tela
    data object Splash : Tela
    data object Seletor : Tela
    data class Web(val url: String) : Tela
    data class Painel(val plugin: PanelPlugin) : Tela
}
