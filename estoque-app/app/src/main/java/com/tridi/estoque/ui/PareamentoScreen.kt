package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.platform.testTag
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.estoque.kiosk.AparelhoBt
import com.tridi.estoque.kiosk.visiveis

// Tela de pareamento do leitor. Vive atrás da sequência secreta + senha, então
// quem chega aqui é quem está instalando o totem — não o cliente.
//
// Era a única tela que não tinha recebido a escala do galpão: 11sp no endereço
// MAC, 12–13sp nos rótulos, e dois controles que eram texto clicável sem alvo
// nenhum ("Voltar" e "ver todos"). Quem usa isto está DE PÉ instalando o
// aparelho, muitas vezes de luva — e um MAC de 11sp a um braço de distância
// não se lê. Aqui o piso é 16sp e todo controle tem ALVO_MINIMO, igual ao
// resto do app; as peças são as mesmas de ImpressoraScreen.

@Composable
fun SenhaDeManutencao(
    valor: String,
    erro: String?,
    onDigito: (Char) -> Unit,
    onApagar: () -> Unit,
    onConfirmar: () -> Unit,
    onVoltar: () -> Unit,
) {
    BackHandler(onBack = onVoltar)
    Column(
        Modifier.fillMaxSize().background(GalpaoFundo).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        KioskIcon(KioskIconName.Bluetooth, null, size = 38.dp, color = GalpaoAcento)
        Text(
            "Manutenção",
            fontFamily = FonteTitulo, fontSize = 28.sp, fontWeight = FontWeight.Bold, color = GalpaoTexto,
            modifier = Modifier.padding(top = 10.dp),
        )
        Text(
            "Digite a senha para parear o leitor.",
            fontFamily = FonteTexto, fontSize = 17.sp, color = GalpaoTextoFraco,
            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
        )
        // Bolinhas: mostra QUANTOS dígitos entraram, nunca quais.
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 14.dp)) {
            repeat(6) { i ->
                Box(
                    Modifier.size(16.dp).background(
                        if (i < valor.length) GalpaoAcento else GalpaoBorda,
                        RoundedCornerShape(8.dp),
                    ),
                )
            }
        }
        if (erro != null) {
            Text(
                erro, fontFamily = FonteTexto, fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
                color = GalpaoErro, modifier = Modifier.padding(bottom = 12.dp),
            )
        }
        TecladoNumerico(
            onDigito = onDigito,
            onApagar = onApagar,
            acaoLabel = "Entrar",
            acaoAtiva = valor.length >= 4,
            onAcao = onConfirmar,
            modifier = Modifier.fillMaxWidth(.8f),
        )
        // Botão, não texto clicável: o app roda com as barras do sistema
        // escondidas (ver MainActivity), então este é o ÚNICO caminho visível
        // pra sair da tela — e um alvo de 14sp de altura de letra não se acerta
        // de luva.
        OutlinedButton(
            onClick = onVoltar,
            modifier = Modifier.testTag("manutencao_voltar").padding(top = 18.dp)
                .fillMaxWidth(.5f).height(ALVO_MINIMO),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = GalpaoTextoFraco),
            border = BorderStroke(1.dp, GalpaoBorda),
        ) {
            Text("Voltar", fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun PareamentoScreen(
    aparelhos: List<AparelhoBt>,
    buscando: Boolean,
    erro: String?,
    /** Senha que o próprio leitor tem de digitar, quando ele pede essa variante. */
    passkey: String? = null,
    /** Último código que chegou pelo leitor — a PROVA de que funcionou. */
    ultimoCodigo: String?,
    onBuscar: () -> Unit,
    onParear: (String) -> Unit,
    onVoltar: () -> Unit,
) {
    BackHandler(onBack = onVoltar)
    var mostrarTodos by remember { mutableStateOf(false) }
    val lista = remember(aparelhos, mostrarTodos) { visiveis(aparelhos, mostrarTodos) }

    Column(Modifier.fillMaxSize().background(GalpaoFundo)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onVoltar, modifier = Modifier.size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar", color = GalpaoTexto)
                }
            }
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                // "Aparelhos", não "Leitor": esta tela pareia o leitor E a
                // impressora de etiqueta. Enquanto o título falava só de leitor,
                // quem vinha atrás da impressora achava que estava na tela errada.
                Text(
                    "Aparelhos do galpão",
                    fontFamily = FonteTitulo, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = GalpaoTexto,
                )
                Text(
                    if (buscando) "Procurando aparelhos…" else "Toque no leitor ou na impressora para parear",
                    fontFamily = FonteTexto, fontSize = 16.sp, color = GalpaoTextoFraco,
                )
            }
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onBuscar, enabled = !buscando, modifier = Modifier.size(ALVO_MINIMO)) {
                    if (buscando) {
                        CircularProgressIndicator(Modifier.size(20.dp), color = GalpaoAcento, strokeWidth = 2.dp)
                    } else {
                        KioskIcon(KioskIconName.Refresh, "Procurar de novo", color = GalpaoTexto)
                    }
                }
            }
        }

        if (erro != null) {
            Aviso(erro, GalpaoErro)
        }

        // Variante em que quem digita é o LEITOR: a pessoa aponta o leitor pros
        // números e aperta Enter. Sem mostrar o número, esse pareamento é
        // impossível de completar — e o Android normalmente mostraria isso numa
        // caixa que o totem bloqueia.
        if (passkey != null) {
            Surface(
                color = GalpaoAcentoFundo,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        "Digite no leitor e aperte Enter:",
                        fontFamily = FonteTexto, fontSize = 17.sp, color = GalpaoTexto,
                    )
                    Text(
                        passkey,
                        fontFamily = FonteTitulo, fontSize = 38.sp, fontWeight = FontWeight.Bold,
                        letterSpacing = 4.sp, color = GalpaoAcento,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }

        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (lista.isEmpty()) {
                item {
                    Text(
                        if (buscando) "Procurando…"
                        else "Nenhum aparelho encontrado. Ligue o leitor ou a impressora em modo de pareamento e toque em procurar.",
                        fontFamily = FonteTexto, fontSize = 17.sp, lineHeight = 23.sp,
                        color = GalpaoTextoFraco, modifier = Modifier.padding(vertical = 20.dp),
                    )
                }
            }
            items(lista, key = { it.endereco }) { a -> LinhaAparelho(a) { onParear(a.endereco) } }
            item {
                // O texto antigo dizia "Não achei meu leitor", e era a ÚNICA porta
                // pra impressora aparecer — ninguém procurando impressora clica
                // num botão sobre leitor. Agora a impressora entra na lista
                // sozinha, e este botão volta a ser o que devia: a saída pra
                // aparelho que mentiu a classe.
                OutlinedButton(
                    onClick = { mostrarTodos = !mostrarTodos },
                    modifier = Modifier.testTag("pareamento_ver_todos").fillMaxWidth()
                        .padding(vertical = 12.dp).height(ALVO_MINIMO),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = GalpaoAcento),
                    border = BorderStroke(1.dp, GalpaoBorda),
                ) {
                    Text(
                        if (mostrarTodos) "Mostrar só leitor e impressora"
                        else "Não achei meu aparelho — ver todos",
                        fontFamily = FonteTexto, fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        // A prova: bipa qualquer coisa e o código aparece aqui. Sem isto a
        // pessoa desce do totem sem saber se o pareamento serviu pra alguma
        // coisa — e o leitor só é testável DEPOIS, na frente de um cliente.
        Surface(color = GalpaoSuperficie, border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    "Teste o leitor",
                    fontFamily = FonteTitulo, fontSize = 19.sp, fontWeight = FontWeight.Bold, color = GalpaoTexto,
                )
                Text(
                    ultimoCodigo?.let { "Leu: $it" } ?: "Bipe qualquer produto — o código aparece aqui.",
                    fontFamily = FonteTexto, fontSize = 18.sp, lineHeight = 24.sp,
                    color = if (ultimoCodigo != null) GalpaoOk else GalpaoTextoFraco,
                    fontWeight = if (ultimoCodigo != null) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun Aviso(texto: String, cor: Color) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        KioskIcon(KioskIconName.AlertTriangle, null, size = 22.dp, color = cor)
        Text(texto, fontFamily = FonteTexto, fontSize = 17.sp, lineHeight = 23.sp, color = cor)
    }
}

@Composable
private fun LinhaAparelho(a: AparelhoBt, onClick: () -> Unit) {
    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(16.dp),
        shadowElevation = 1.dp,
        // A linha inteira é o alvo, e ela não pode ser menor que ALVO_MINIMO:
        // pareia-se isto de pé, na frente do suporte, muitas vezes de luva.
        modifier = Modifier.testTag("pareamento_item_${a.endereco}").fillMaxWidth()
            .heightIn(min = ALVO_MINIMO)
            .cliqueSonoro(enabled = !a.vinculando, onClick = onClick),
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            KioskIcon(
                KioskIconName.Bluetooth, null, size = 26.dp,
                color = if (a.pareado) GalpaoOk else GalpaoAcento,
            )
            Column(Modifier.weight(1f)) {
                Text(
                    a.nome.ifBlank { "Aparelho sem nome" },
                    fontFamily = FonteTexto, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = GalpaoTexto,
                )
                // O MAC é o que distingue dois leitores do mesmo modelo. A 11sp,
                // a um braço de distância, ele simplesmente não era legível — e
                // é justamente o dado que a pessoa está comparando.
                Text(
                    a.endereco,
                    fontFamily = FonteTexto, fontSize = 15.sp, color = GalpaoTextoFraco,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            when {
                a.vinculando -> CircularProgressIndicator(Modifier.size(24.dp), color = GalpaoAcento, strokeWidth = 2.dp)
                a.pareado -> Text("Pareado", fontFamily = FonteTexto, fontSize = 16.sp, color = GalpaoOk, fontWeight = FontWeight.Bold)
                a.falhou -> Text("Falhou", fontFamily = FonteTexto, fontSize = 16.sp, color = GalpaoErro, fontWeight = FontWeight.Bold)
                else -> Text("Parear", fontFamily = FonteTexto, fontSize = 17.sp, color = GalpaoAcento, fontWeight = FontWeight.Bold)
            }
        }
    }
}
