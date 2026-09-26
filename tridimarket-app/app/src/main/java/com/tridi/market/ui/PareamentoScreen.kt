package com.tridi.market.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import com.tridi.market.kiosk.AparelhoBt
import com.tridi.market.kiosk.visiveis

// Tela de pareamento do leitor. Vive atrás da sequência secreta + senha, então
// quem chega aqui é quem está instalando o totem — não o cliente.

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
        Modifier.fillMaxSize().background(MarketCanvas).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        KioskIcon(KioskIconName.Bluetooth, null, size = 34.dp, color = MarketPurple)
        Text(
            "Manutenção",
            fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MarketInk,
            modifier = Modifier.padding(top = 10.dp),
        )
        Text(
            "Digite a senha para parear o leitor.",
            fontSize = 13.sp, color = MarketMuted, modifier = Modifier.padding(top = 4.dp, bottom = 14.dp),
        )
        // Bolinhas: mostra QUANTOS dígitos entraram, nunca quais.
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 12.dp)) {
            repeat(6) { i ->
                Box(
                    Modifier.size(14.dp).background(
                        if (i < valor.length) MarketPurple else MarketBorder,
                        RoundedCornerShape(7.dp),
                    ),
                )
            }
        }
        if (erro != null) {
            Text(erro, fontSize = 13.sp, color = MarketRed, modifier = Modifier.padding(bottom = 10.dp))
        }
        TecladoNumerico(
            onDigito = onDigito,
            onApagar = onApagar,
            acaoLabel = "Entrar",
            acaoAtiva = valor.length >= 4,
            onAcao = onConfirmar,
            modifier = Modifier.fillMaxWidth(.8f),
        )
        Text(
            "Voltar",
            fontSize = 14.sp, color = MarketMuted, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 16.dp).clickable(onClick = onVoltar),
        )
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

    Column(Modifier.fillMaxSize().background(MarketCanvas)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, shadowElevation = 1.dp) {
                IconButton(onClick = onVoltar, modifier = Modifier.size(52.dp)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar", color = MarketInk)
                }
            }
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text("Leitor de código de barras", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = MarketInk)
                Text(
                    if (buscando) "Procurando aparelhos…" else "Toque no leitor para parear",
                    fontSize = 12.sp, color = MarketMuted,
                )
            }
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, shadowElevation = 1.dp) {
                IconButton(onClick = onBuscar, enabled = !buscando, modifier = Modifier.size(52.dp)) {
                    if (buscando) {
                        CircularProgressIndicator(Modifier.size(20.dp), color = MarketPurple, strokeWidth = 2.dp)
                    } else {
                        KioskIcon(KioskIconName.Refresh, "Procurar de novo", color = MarketInk)
                    }
                }
            }
        }

        if (erro != null) {
            Aviso(erro, MarketRed)
        }

        // Variante em que quem digita é o LEITOR: a pessoa aponta o leitor pros
        // números e aperta Enter. Sem mostrar o número, esse pareamento é
        // impossível de completar — e o Android normalmente mostraria isso numa
        // caixa que o totem bloqueia.
        if (passkey != null) {
            Surface(
                color = MarketPurpleSoft,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Column(Modifier.padding(14.dp)) {
                    Text("Digite no leitor e aperte Enter:", fontSize = 13.sp, color = MarketInk)
                    Text(
                        passkey,
                        fontSize = 30.sp, fontWeight = FontWeight.Bold, color = MarketPurple,
                        modifier = Modifier.padding(top = 4.dp),
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
                        else "Nenhum leitor encontrado. Deixe o leitor em modo de pareamento e toque em procurar.",
                        fontSize = 13.sp, color = MarketMuted, modifier = Modifier.padding(vertical = 20.dp),
                    )
                }
            }
            items(lista, key = { it.endereco }) { a -> LinhaAparelho(a) { onParear(a.endereco) } }
            item {
                Text(
                    if (mostrarTodos) "Mostrar só leitores" else "Não achei meu leitor — ver todos os aparelhos",
                    fontSize = 13.sp, color = MarketPurple, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(vertical = 14.dp).clickable { mostrarTodos = !mostrarTodos },
                )
            }
        }

        // A prova: bipa qualquer coisa e o código aparece aqui. Sem isto a
        // pessoa desce do totem sem saber se o pareamento serviu pra alguma
        // coisa — e o leitor só é testável DEPOIS, na frente de um cliente.
        Surface(color = Color.White, shadowElevation = 6.dp, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Teste o leitor", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MarketInk)
                Text(
                    ultimoCodigo?.let { "Leu: $it" } ?: "Bipe qualquer produto — o código aparece aqui.",
                    fontSize = 15.sp,
                    color = if (ultimoCodigo != null) MarketGreen else MarketMuted,
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
        KioskIcon(KioskIconName.AlertTriangle, null, size = 18.dp, color = cor)
        Text(texto, fontSize = 13.sp, color = cor)
    }
}

@Composable
private fun LinhaAparelho(a: AparelhoBt, onClick: () -> Unit) {
    Surface(
        color = Color.White,
        shape = RoundedCornerShape(16.dp),
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth().clickable(enabled = !a.vinculando, onClick = onClick),
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            KioskIcon(
                KioskIconName.Bluetooth, null, size = 22.dp,
                color = if (a.pareado) MarketGreen else MarketPurple,
            )
            Column(Modifier.weight(1f)) {
                Text(
                    a.nome.ifBlank { "Aparelho sem nome" },
                    fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = MarketInk,
                )
                Text(a.endereco, fontSize = 11.sp, color = MarketMuted)
            }
            when {
                a.vinculando -> CircularProgressIndicator(Modifier.size(20.dp), color = MarketPurple, strokeWidth = 2.dp)
                a.pareado -> Text("Pareado", fontSize = 12.sp, color = MarketGreen, fontWeight = FontWeight.Bold)
                a.falhou -> Text("Falhou", fontSize = 12.sp, color = MarketRed, fontWeight = FontWeight.Bold)
                else -> Text("Parear", fontSize = 13.sp, color = MarketPurple, fontWeight = FontWeight.Bold)
            }
        }
    }
}
