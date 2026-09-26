package com.tridi.tv

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tridi.tv.core.design.*

/**
 * Configuração do aparelho. Existe porque uma TV não tem teclado nem alguém
 * disposto a reinstalar o APK para trocar a URL do backend.
 *
 * Chega-se aqui pelo seletor de painéis — que por sua vez é alcançado segurando
 * OK dentro de um painel.
 */
@Composable
fun SetupScreen(
    onVoltar: () -> Unit,
    modifier: Modifier = Modifier,
    ehDeviceOwner: Boolean = false,
) {
    val vm: SetupViewModel = hiltViewModel()
    val estado by vm.state.collectAsStateWithLifecycle()
    val primeiroFoco = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        runCatching { primeiroFoco.requestFocus() }
        // A pessoa sai desta tela pra Ajustes e volta; sem reconferir, o aviso
        // continuaria vermelho depois de ela ja ter resolvido.
        vm.reconferirPermissao()
    }
    val ciclo = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    androidx.compose.runtime.DisposableEffect(ciclo) {
        val obs = androidx.lifecycle.LifecycleEventObserver { _, e ->
            if (e == androidx.lifecycle.Lifecycle.Event.ON_RESUME) vm.reconferirPermissao()
        }
        ciclo.addObserver(obs)
        onDispose { ciclo.removeObserver(obs) }
    }

    MolduraPainel(modifier) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
        ) {
            Text("Configuração do aparelho", color = Tokens.texto, fontSize = Tokens.Tipo.titulo, fontWeight = FontWeight.Black)
            Text(
                "Vale só para esta TV. Nada aqui é por pessoa.",
                color = Tokens.textoFraco,
                fontSize = Tokens.Tipo.rotulo,
            )

            CampoTexto(
                rotulo = "Endereço do servidor",
                valor = estado.urlBase,
                onChange = vm::editarUrl,
                dica = "https://…",
                modifier = Modifier.fillMaxWidth(0.8f).focusRequester(primeiroFoco),
            )

            CampoTexto(
                rotulo = "Nome desta TV",
                valor = estado.nome,
                onChange = vm::editarNome,
                dica = "Expedição, Recepção, Comercial…",
                modifier = Modifier.fillMaxWidth(0.8f),
            )

            // ── Frota (gestao remota) ──────────────────────────────────────
            // Sem codigo, sem copiar nada do computador: a TV entra na frota
            // com o nome que esta ali em cima. O endereco do servidor ja vem
            // pronto no app, entao nao sobra nada para configurar.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
            ) {
                BotaoFocavel("Entrar na frota", vm::entrarNaFrota, iconePath = Tabler.plugConnected)
                Text(
                    "Deixa esta TV ser atualizada e comandada pelo sistema.",
                    color = Tokens.textoFraco,
                    fontSize = Tokens.Tipo.rotulo,
                )
            }
            when {
                estado.ativando -> Linha(Tabler.clock, "Entrando...", Tokens.textoFraco)
                estado.ativado == true ->
                    Linha(Tabler.plugConnected, "Na frota — " + estado.ativacaoMsg + ".", Tokens.positivo)
                estado.ativado == false ->
                    Linha(Tabler.alertTriangle, "Nao entrou: " + estado.ativacaoMsg, Tokens.negativo)
            }

            // ── Atualização sem ninguém apertar nada ────────────────────────
            // Logo abaixo de "Entrar na frota", porque é a continuação natural:
            // entrar na frota faz a TV RECEBER a atualização, e isto faz ela
            // TERMINAR. Estava no rodapé, depois de "Voltar", onde a coisa mais
            // importante da tela ficava fora da primeira dobra.
            if (estado.automatica) {
                Linha(Tabler.plugConnected, estado.automacao, Tokens.positivo)
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
                ) {
                    BotaoFocavel(
                        "Atualização automática",
                        vm::ligarAtualizacaoAutomatica,
                        iconePath = Tabler.rotate,
                    )
                    Text(
                        estado.automacao,
                        color = Tokens.textoFraco,
                        fontSize = Tokens.Tipo.rotulo,
                    )
                }
            }

            // ── A permissao que faz a atualizacao remota chegar ao fim ───────
            // Aparece SO quando falta, e aqui — na hora em que alguem esta em pe
            // na frente da TV com o controle na mao. Descobrir isso depois
            // significa a atualizacao baixando, abrindo um aviso de seguranca no
            // meio do painel e morrendo ali, de madrugada, sem ninguem por perto.
            if (!estado.podeAtualizar) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
                ) {
                    BotaoFocavel(
                        "Permitir atualização",
                        vm::abrirPermissaoDeInstalacao,
                        iconePath = Tabler.alertTriangle,
                        acento = Tokens.negativo,
                    )
                    Text(
                        "Falta liberar a instalação nesta TV. Sem isso a atualização " +
                            "chega mas não entra. Ligue a chave e volte.",
                        color = Tokens.textoFraco,
                        fontSize = Tokens.Tipo.rotulo,
                    )
                }
            }

            // ── Como esta TV está pendurada ─────────────────────────────────
            // Fica aqui, e não no painel, porque é do APARELHO: o mesmo painel
            // roda deitado numa TV e em pé na outra. Aperte até a imagem ficar
            // de pé — muda na hora, inclusive esta tela.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
            ) {
                BotaoFocavel("Girar a tela", vm::girarTela, iconePath = Tabler.rotate)
                Text(
                    nomeDoGiro(estado.giro),
                    color = Tokens.texto,
                    fontSize = Tokens.Tipo.rotulo,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m)) {
                BotaoFocavel("Salvar e testar", vm::salvar, iconePath = Tabler.plugConnected)
                BotaoFocavel("Voltar", onVoltar, acento = Tokens.textoApagado)
            }

            // Resultado do teste, na mesma tela: sair daqui achando que salvou e
            // descobrir na parede que a URL está errada custa uma escada.
            when {
                estado.testando -> Linha(Tabler.clock, "Testando a conexão…", Tokens.textoFraco)
                estado.conexaoOk == true -> Linha(Tabler.plugConnected, "Conectado — ${estado.detalhe}.", Tokens.positivo)
                estado.conexaoOk == false -> Linha(Tabler.alertTriangle, "Salvo, mas sem resposta: ${estado.detalhe}", Tokens.negativo)
                estado.salvo -> Linha(Tabler.settings, "Salvo.", Tokens.textoFraco)
            }

            // ── Atualização automática ──────────────────────────────────────
            // A linha que diz se esta TV já se atualiza sozinha e, quando não,
            // o comando exato para liberar. Fica em VERDE quando está pronta,
            // porque aí não é tarefa e sim confirmação: alguém subiu a escada
            // uma vez e não precisa subir de novo.
            // Quem é esta caixa, segundo o runtime — não segundo os Ajustes.
            // Fica discreto no rodapé porque no dia a dia não importa; no dia em
            // que importa, é a primeira coisa que alguém precisa e a última que
            // consegue achar.
            Text(
                estado.aparelho,
                color = Tokens.textoApagado,
                fontSize = Tokens.Tipo.rotulo,
            )
        }
    }
}

@Composable
private fun Linha(iconePath: String, texto: String, cor: androidx.compose.ui.graphics.Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs)) {
        TablerIcon(iconePath, 22.dp, cor)
        Text(texto, color = cor, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.SemiBold)
    }
}
