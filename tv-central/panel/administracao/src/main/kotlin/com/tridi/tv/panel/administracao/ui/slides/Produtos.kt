package com.tridi.tv.panel.administracao.ui.slides

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.data.Product
import com.tridi.tv.panel.administracao.data.SalesSnapshot

/** Produtos mais vendidos, com a barra relativa ao campeão. */
@Composable
fun ProdutosSlide(s: SalesSnapshot, modifier: Modifier = Modifier, curtos: Boolean = false) {
    /**
     * Escala do dinheiro: exata ou curta, conforme o perfil. A mesma chave
     * "números curtos" que vale para os blocos avulsos — sem isto ela não
     * fazia nada num perfil montado com telas prontas.
     */
    val dinheiro = moedaDoPerfil(curtos)
    if (s.topProducts.isEmpty()) {
        Aviso("Sem produtos", "Nenhum produto veio na lista deste período.", Tabler.pkg, modifier)
        return
    }
    // Pela QUANTIDADE, que é o que "mais vendidos" quer dizer — e o único
    // número que sempre existe. A receita por produto ficou zerada na API
    // por muito tempo, e a barra media exatamente esse zero.
    val maximo = (s.topProducts.maxOfOrNull { it.qty } ?: 1.0).coerceAtLeast(1.0)

    ComLayout(modifier.fillMaxSize()) { layout ->
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
            Text(
                "Produtos mais vendidos",
                color = Tokens.texto,
                // Em pé, 64sp vira três linhas de título e come metade da tela.
                fontSize = if (layout.retrato) Tokens.Tipo.titulo else Tokens.Tipo.numero,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(Tokens.Espaco.g))
            // Teto explícito: a lista da API pode crescer, a TV não.
            s.topProducts.take(if (layout.retrato) 4 else 6).forEach { p ->
                LinhaProduto(p, maximo, dinheiro)
                Spacer(Modifier.height(Tokens.Espaco.s))
            }
        }
    }
}

@Composable
private fun LinhaProduto(p: Product, maximo: Double, dinheiro: (Double) -> String) {
    Row(
        Modifier.fillMaxWidth().vidro().padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.s),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!p.imageUrl.isNullOrBlank()) {
            AsyncImage(
                p.imageUrl, p.name,
                Modifier.size(60.dp).clip(RoundedCornerShape(14.dp)),
                contentScale = ContentScale.Crop,
            )
        } else {
            // Sem foto: ícone Tabler. O original usava um emoji de caixa.
            Box(
                Modifier.size(60.dp).clip(RoundedCornerShape(14.dp)).background(Color(0x1AFFFFFF)),
                Alignment.Center,
            ) { TablerIcon(Tabler.photo, 26.dp, Tokens.textoApagado) }
        }
        Spacer(Modifier.width(Tokens.Espaco.m))
        Column(Modifier.weight(1f)) {
            Text(p.name, color = Tokens.texto, fontSize = Tokens.Tipo.corpo, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Spacer(Modifier.height(Tokens.Espaco.xs))
            Barra(p.qty / maximo, Modifier.fillMaxWidth(0.7f), altura = 8.dp)
        }
        Spacer(Modifier.width(Tokens.Espaco.s))
        Column(horizontalAlignment = Alignment.End) {
            Text("${fmtNum(p.qty)} un.", color = Tokens.texto, fontSize = Tokens.Tipo.corpo, fontWeight = FontWeight.Bold)
            // A receita só aparece quando existe de verdade. "R$ 0" embaixo de
            // todo produto é ruído que ensina a desconfiar do painel.
            if (p.revenue > 0) {
                Text(dinheiro(p.revenue), color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
            }
        }
    }
}
