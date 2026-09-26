package com.tridi.market.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tridi.market.kiosk.BluetoothPareador
import com.tridi.market.kiosk.PortaDeManutencao
import com.tridi.market.kiosk.SequenciaSecreta
import com.tridi.market.kiosk.ToqueSecreto

// A porta de serviço do totem, montada em cima da tela de código.
//
// Por que aqui e não num botão: o totem fica num corredor sem ninguém olhando.
// Um botão "Ajustes" na tela seria testado por todo mundo que passa. A porta é
// a sequência 0 0 ⌫ ⌫ 0 0 ⌫ ⌫ (kiosk/SequenciaSecreta), que não colide com o
// código de 6 dígitos porque nunca deixa mais de 2 dígitos no campo.

private enum class Etapa { FECHADA, SENHA, PAREAMENTO }

@Composable
fun PinComPortaDeManutencao(
    state: PinState,
    busy: Boolean,
    error: String?,
    online: Boolean,
    onDigit: (Char) -> Unit,
    onErase: () -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
) {
    var etapa by remember { mutableStateOf(Etapa.FECHADA) }
    var sequencia by remember { mutableStateOf(SequenciaSecreta()) }
    var senha by remember { mutableStateOf("") }
    var erroSenha by remember { mutableStateOf<String?>(null) }

    fun registrar(toque: ToqueSecreto) {
        val r = sequencia.toque(toque, SystemClock.elapsedRealtime())
        sequencia = r.estado
        if (r.abriu) { senha = ""; erroSenha = null; etapa = Etapa.SENHA }
    }

    when (etapa) {
        Etapa.FECHADA -> PinScreen(
            state = state,
            busy = busy,
            error = error,
            online = online,
            // A sequência é lida do MESMO toque que alimenta o código: o dígito
            // segue seu caminho normal, então nada muda pra quem só quer logar.
            onDigit = { d -> registrar(if (d == '0') ToqueSecreto.ZERO else ToqueSecreto.OUTRO); onDigit(d) },
            onErase = { registrar(ToqueSecreto.APAGAR); onErase() },
            onSubmit = onSubmit,
            onBack = onBack,
        )

        Etapa.SENHA -> SenhaDeManutencao(
            valor = senha,
            erro = erroSenha,
            onDigito = { d -> if (senha.length < 6) { senha += d; erroSenha = null } },
            onApagar = { senha = senha.dropLast(1) },
            onConfirmar = {
                if (senha == PortaDeManutencao.SENHA) {
                    senha = ""
                    etapa = Etapa.PAREAMENTO
                } else {
                    senha = ""
                    erroSenha = "Senha incorreta."
                }
            },
            onVoltar = { senha = ""; erroSenha = null; etapa = Etapa.FECHADA },
        )

        Etapa.PAREAMENTO -> TelaDePareamento(onVoltar = { etapa = Etapa.FECHADA })
    }
}

@Composable
private fun TelaDePareamento(onVoltar: () -> Unit) {
    val context = LocalContext.current
    val pareador = remember(context) { BluetoothPareador(context) }
    val aparelhos by pareador.aparelhos.collectAsStateWithLifecycle()
    val buscando by pareador.buscando.collectAsStateWithLifecycle()
    val erro by pareador.erro.collectAsStateWithLifecycle()
    val ultimoCodigo by PortaDeManutencao.ultimoCodigo.collectAsStateWithLifecycle()
    val passkey by pareador.passkeyParaDigitar.collectAsStateWithLifecycle()

    // Abrir/fechar a porta é o que desvia a leitura do leitor pra cá, em vez de
    // ela virar item no carrinho de quem estiver logado.
    //
    // `permitirDialogoDoSistema` é a exceção estreita: enquanto esta tela está
    // aberta, o diálogo de pareamento dos Ajustes pode aparecer. Fora daqui o
    // totem volta a barrar tudo — medido no aparelho, sem isso o vínculo morria
    // com "Attempted Lock Task Mode violation".
    DisposableEffect(Unit) {
        PortaDeManutencao.abrir()
        pareador.permitirDialogoDoSistema(true)
        onDispose {
            pareador.permitirDialogoDoSistema(false)
            PortaDeManutencao.fechar()
            pareador.encerrar()
        }
    }

    LaunchedEffect(Unit) {
        context.activity()?.let(pareador::garantirPermissoes)
        pareador.carregarPareados()
        pareador.buscar()
    }

    PareamentoScreen(
        aparelhos = aparelhos,
        buscando = buscando,
        erro = erro,
        passkey = passkey,
        ultimoCodigo = ultimoCodigo,
        onBuscar = pareador::buscar,
        onParear = pareador::parear,
        onVoltar = onVoltar,
    )
}

private tailrec fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}
