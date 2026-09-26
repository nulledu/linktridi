package com.tridi.tv

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tridi.tv.core.design.*
import com.tridi.tv.core.panelapi.PanelPlugin

/**
 * Seletor de painel. Aparece uma vez na vida do aparelho: a escolha é gravada e
 * os boots seguintes vão direto para o painel.
 *
 * Foco: o primeiro card pede foco ao entrar, senão o controle remoto chega numa
 * tela sem cursor e o operador acha que travou.
 */
@Composable
fun SeletorScreen(
    paineis: List<PanelPlugin>,
    painelSumiu: Boolean,
    onEscolher: (PanelPlugin) -> Unit,
    onConfigurar: () -> Unit,
    modifier: Modifier = Modifier,
    /**
     * Os PERFIS publicados no ERP. Quando existem, a escolha é entre eles — o
     * módulo que desenha virou detalhe interno. `null` = não deu para saber
     * (sem rede, ERP antigo): a lista de painéis continua valendo, porque uma
     * TV instalada não pode ficar sem escolha por causa do servidor.
     */
    perfis: List<PerfilResumo>? = null,
    onEscolherPerfil: (PerfilResumo) -> Unit = {},
) {
    val primeiroFoco = remember { FocusRequester() }

    LaunchedEffect(paineis.size) {
        if (paineis.isNotEmpty()) runCatching { primeiroFoco.requestFocus() }
    }

    MolduraPainel(modifier) {
        if (paineis.isEmpty()) {
            // Sem painel visível a TV ainda precisa chegar na configuração —
            // senão uma URL errada deixa o aparelho sem saída pelo controle.
            Column(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Aviso(
                    "Nenhum painel disponível",
                    "Este APK não trouxe módulo de painel, ou as áreas deste aparelho não liberam nenhum.",
                    Tabler.alertTriangle,
                    Modifier.weight(1f),
                )
                BotaoFocavel("Configurar aparelho", onConfigurar, iconePath = Tabler.settings)
            }
            return@MolduraPainel
        }

        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Tridi", color = Tokens.texto, fontSize = Tokens.Tipo.titulo, fontWeight = FontWeight.Black)
                    Text(
                        if (painelSumiu) "O painel escolhido não existe mais nesta versão. Escolha outro."
                        else "Escolha o que esta tela vai mostrar",
                        color = if (painelSumiu) Tokens.atencao else Tokens.textoFraco,
                        fontSize = Tokens.Tipo.corpo,
                        modifier = Modifier.padding(top = Tokens.Espaco.xs),
                    )
                }
                BotaoFocavel(
                    "Configurar",
                    onConfigurar,
                    acento = Tokens.textoApagado,
                    iconePath = Tabler.settings,
                )
            }
            Spacer(Modifier.height(Tokens.Espaco.xg))

            ComLayout {  layout ->
                LazyVerticalGrid(
                    columns = GridCells.Fixed(layout.colunas),
                    horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.g),
                    verticalArrangement = Arrangement.spacedBy(Tokens.Espaco.g),
                    contentPadding = PaddingValues(Tokens.Espaco.s),
                ) {
                    // Com perfis publicados, são ELES a escolha: o que a pessoa
                    // decide é o desenho que vai na parede, não qual módulo do
                    // aplicativo desenha. Cada cartão diz o formato e a
                    // polegada para que a TV em pé não seja escolhida por
                    // engano numa TV deitada.
                    items(perfis.orEmpty(), key = { "perfil:${it.id}" }) { p ->
                        CardFocavel(
                            onClick = { onEscolherPerfil(p) },
                            acento = Tokens.acento,
                            modifier = Modifier
                                // 280 e não 240: com o selo em quadro e a linha
                                // "Selecionar", o conteúdo passou a estourar a
                                // altura antiga — e o que sumia era justamente
                                // a dica de que o OK faz alguma coisa.
                                .height(280.dp)
                                .then(
                                    if (p === perfis?.firstOrNull())
                                        Modifier.focusRequester(primeiroFoco) else Modifier
                                ),
                        ) { focado ->
                            // Ícone em QUADRO, como no painel de referência: o
                            // símbolo solto some no cartão escuro, e o quadro
                            // tingido dá a ele o peso de um botão.
                            SeloDoCartao(Tabler.chartBar, Tokens.acento, focado)
                            Text(
                                p.nome,
                                color = Tokens.texto,
                                fontSize = Tokens.Tipo.titulo,
                                letterSpacing = Tokens.Tracking.titulo,
                                fontWeight = FontWeight.Black,
                                modifier = Modifier.padding(top = Tokens.Espaco.s),
                            )
                            if (p.descricao.isNotBlank()) {
                                Text(
                                    p.descricao,
                                    color = Tokens.textoFraco,
                                    fontSize = Tokens.Tipo.rotulo,
                                    modifier = Modifier.padding(top = Tokens.Espaco.xs),
                                )
                            }
                            Text(
                                "${p.slides.size} ${if (p.slides.size == 1) "tela" else "telas"} · ${p.paraTela} · ${p.polegadas}\"",
                                color = Tokens.textoApagado,
                                fontSize = Tokens.Tipo.rotulo,
                                modifier = Modifier.padding(top = Tokens.Espaco.xs),
                            )
                            // "Selecionar →" do painel de referência. Aqui ele
                            // NÃO é um botão dentro do cartão — o cartão inteiro
                            // é o alvo do controle remoto. É uma dica de que o
                            // OK leva a algum lugar, e por isso acende junto com
                            // o foco em vez de ficar sempre chamando atenção.
                            Text(
                                "Selecionar  →",
                                color = if (focado) Tokens.acento else Tokens.textoApagado,
                                fontSize = Tokens.Tipo.rotulo,
                                fontWeight = FontWeight.Black,
                                modifier = Modifier.padding(top = Tokens.Espaco.s),
                            )
                        }
                    }

                    /*
                     * Os painéis DO APARELHO entram mesmo havendo perfis.
                     *
                     * Antes eles sumiam da lista assim que o ERP publicava o
                     * primeiro perfil, e com isso telas que só existem no APK —
                     * as lasers, por exemplo — ficavam inalcançáveis: não há
                     * perfil de máquinas para montar no editor, então não havia
                     * caminho nenhum até elas. Ficam DEPOIS dos perfis porque a
                     * escolha comum é o desenho publicado; estes são o que o
                     * aparelho sabe fazer sozinho.
                     */
                    /*
                     * Com perfis publicados, só entram os painéis de ASSUNTO
                     * PRÓPRIO. Administração, Logística e Produção existiam
                     * antes dos perfis e hoje são o desenho antigo da mesma
                     * coisa: mostrá-los aqui punha dois cartões "Logística"
                     * lado a lado — um levando à tela nova, outro à velha — e
                     * quem escolhia o errado via outra UI sem saber por quê.
                     */
                    val doAparelho = if (perfis.isNullOrEmpty()) paineis
                        else paineis.filter { it.descriptor.apareceComPerfis }
                    items(doAparelho, key = { it.descriptor.id.value }) { plugin ->
                        val d = plugin.descriptor
                        CardFocavel(
                            onClick = { onEscolher(plugin) },
                            acento = corHex(d.accentHex),
                            modifier = Modifier
                                // 280 e não 240: com o selo em quadro e a linha
                                // "Selecionar", o conteúdo passou a estourar a
                                // altura antiga — e o que sumia era justamente
                                // a dica de que o OK faz alguma coisa.
                                .height(280.dp)
                                .then(
                                    // O foco inicial é do PRIMEIRO cartão da
                                    // lista inteira: havendo perfis, ele já foi
                                    // pedido lá em cima, e dois pedidos no mesmo
                                    // requester deixam o controle sem foco
                                    // nenhum ao abrir.
                                    if (perfis.isNullOrEmpty() && plugin === doAparelho.firstOrNull())
                                        Modifier.focusRequester(primeiroFoco) else Modifier
                                ),
                        ) { focado ->
                            SeloDoCartao(d.iconPath, corHex(d.accentHex), focado)
                            Text(
                                d.title,
                                color = Tokens.texto,
                                fontSize = Tokens.Tipo.titulo,
                                fontWeight = FontWeight.Black,
                                modifier = Modifier.padding(top = Tokens.Espaco.s),
                            )
                            Text(
                                d.subtitle,
                                color = Tokens.textoFraco,
                                fontSize = Tokens.Tipo.rotulo,
                                modifier = Modifier.padding(top = Tokens.Espaco.xs),
                            )
                            if (d.preview) {
                                Row(
                                    Modifier.padding(top = Tokens.Espaco.s),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    TablerIcon(Tabler.alertTriangle, 18.dp, Tokens.atencao)
                                    Spacer(Modifier.width(Tokens.Espaco.xs))
                                    Text(
                                        "em construção",
                                        color = Tokens.atencao,
                                        fontSize = Tokens.Tipo.rotulo,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * O ícone do cartão, dentro de um quadro tingido — como no painel de
 * referência.
 *
 * O símbolo solto sobre o cartão escuro fica raso: não é figura nem botão.
 * Dentro de um quadro com a cor do painel em transparência, ele ganha a mesma
 * presença de um ícone de aplicativo — e, ao receber foco, o quadro acende
 * junto, o que reforça onde o controle remoto está sem precisar de outra borda.
 */
@Composable
private fun SeloDoCartao(iconePath: String, cor: Color, focado: Boolean) {
    Box(
        Modifier
            .size(72.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(cor.copy(alpha = if (focado) 0.26f else 0.14f))
            .border(1.dp, cor.copy(alpha = if (focado) 0.5f else 0.2f), RoundedCornerShape(18.dp)),
        contentAlignment = Alignment.Center,
    ) {
        TablerIcon(iconePath, 38.dp, if (focado) cor else Tokens.textoFraco)
    }
}
