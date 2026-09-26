package com.tridi.estoque.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.estoque.sync.AvisoDeTrabalho
import com.tridi.estoque.sync.IconeDoAviso

/**
 * A faixa fina do topo: "cadê o meu trabalho?".
 *
 * Fica embaixo do cabeçalho de cada tela de trabalho, não em cima: o título e o
 * "Voltar" são o que a pessoa procura primeiro, e empurrá-los pra baixo por um
 * aviso que na maior parte do tempo nem existe faria a tela dançar.
 *
 * Não é botão nem alvo de toque: não há o que fazer a respeito (a fila sobe
 * sozinha), e um alvo de 56dp aqui competiria com "Confirmar" pelo polegar.
 * Some sozinha quando a rede volta e a fila esvazia.
 */
@Composable
fun FaixaDeTrabalho(aviso: AvisoDeTrabalho?) {
    if (aviso == null) return
    val corTexto = if (aviso.atencao) GalpaoAtencao else GalpaoTextoFraco
    Surface(
        color = if (aviso.atencao) GalpaoAtencaoFundo else GalpaoSuperficie,
        modifier = Modifier.testTag("faixa_trabalho").fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Quem escolhe o ícone é a REGRA, não o `atencao`.
            //
            // Enquanto o âmbar significava "sem rede", o Wi-Fi cortado servia
            // pros dois casos. Agora o âmbar também cobre fila presa e operação
            // recusada — as duas com o Wi-Fi funcionando —, e desenhar Wi-Fi
            // cortado ali mandaria a pessoa mexer no roteador por um problema
            // que está no servidor ou no cadastro do aparelho.
            KioskIcon(
                when (aviso.icone) {
                    IconeDoAviso.SEM_REDE -> KioskIconName.WifiOff
                    IconeDoAviso.ATENCAO -> KioskIconName.AlertTriangle
                    IconeDoAviso.SUBINDO -> KioskIconName.CloudUpload
                },
                null, size = 20.dp, color = corTexto,
            )
            Text(
                aviso.texto,
                color = corTexto, fontFamily = FonteTexto, fontSize = 17.sp,
                fontWeight = if (aviso.atencao) FontWeight.SemiBold else FontWeight.Normal,
                modifier = Modifier.padding(start = 10.dp),
            )
        }
    }
}
