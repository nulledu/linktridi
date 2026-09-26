package com.tridi.market.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.market.data.ProductEntity
import com.tridi.market.net.EmployeeDto

// Busca do totem: a pessoa digita e os produtos aparecem NA HORA, em linhas
// grandes com foto e preço, prontas pra tocar. Sem navegar categoria, sem
// botão "buscar" — cada letra já filtra.
@Composable
fun BuscaScreen(
    employee: EmployeeDto,
    online: Boolean,
    visitante: Boolean,
    empresa: String?,
    produtos: List<ProductEntity>,
    // Aberta pelo atalho "Produtos sem código": lista só esses. A busca normal
    // continua mostrando tudo.
    apenasSemCodigo: Boolean = false,
    itensNoCarrinho: Int,
    totalCarrinho: Double,
    onEscolher: (ProductEntity) -> Unit,
    onAbrirCarrinho: () -> Unit,
    onVoltar: () -> Unit,
) {
    var texto by remember { mutableStateOf("") }

    // Um ponto só decide quem aparece (regra em `visiveisNaBusca`), pra lista
    // rolável e busca digitada nunca divergirem — separar as duas já deixou uma
    // mostrando o que a outra escondia.
    val visiveis = remember(produtos, apenasSemCodigo) {
        visiveisNaBusca(produtos).let { if (apenasSemCodigo) it.filter { p -> p.semCodigo } else it }
    }

    // Índice pré-normalizado do catálogo — agora construído FORA do main thread
    // (produceState + Dispatchers.Default). Fazê-lo síncrono no `remember` dava
    // uma travadinha ao abrir a busca (normalizar centenas de itens no frame).
    // Até o índice ficar pronto a tela já mostra o catálogo (estado vazio), então
    // não trava; a filtragem por texto passa a valer assim que o índice chega.
    val index by produceState(initialValue = emptyList<ItemBusca>(), visiveis) {
        value = withContext(Dispatchers.Default) { indexarBusca(visiveis) }
    }
    val resultados by remember(index, texto) {
        derivedStateOf { if (texto.isBlank()) emptyList() else filtrarIndex(index, texto).take(40) }
    }
    // Catálogo completo pré-ordenado (fica pronto pra rolar SEM digitar — some a
    // sensação de travar "ao iniciar a busca"). Sem código primeiro (não dá pra
    // bipar nem digitar), depois o resto; em cada grupo, com estoque na frente.
    val semCodigo = remember(visiveis) {
        visiveis.filter { it.semCodigo }
            .sortedWith(compareByDescending<ProductEntity> { it.stock > 0 }.thenBy { it.name })
    }
    val resto = remember(visiveis) {
        visiveis.filter { !it.semCodigo }
            .sortedWith(compareByDescending<ProductEntity> { it.stock > 0 }.thenBy { it.name })
    }

    BackHandler(onBack = onVoltar)

    // Sem campo do sistema: o teclado próprio fica fixo embaixo e a lista de
    // resultados ocupa o espaço acima. Ver TecladoTexto (Teclado.kt).
    Column(Modifier.fillMaxSize().background(MarketCanvas)) {
        MarketHeader(employee, online, visitante, empresa, onVoltar)

        CampoBusca(texto = texto, onLimpar = { texto = "" })

        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                texto.isBlank() -> if (semCodigo.isEmpty() && resto.isEmpty()) Dica() else CatalogoCompleto(semCodigo, resto, onEscolher)
                resultados.isEmpty() -> NadaEncontrado(texto)
                else -> {
                    Column(Modifier.fillMaxSize()) {
                        Text(
                            text = if (resultados.size == 1) "1 produto" else "${resultados.size} produtos",
                            color = MarketMuted,
                            fontFamily = MarketBodyFamily,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(start = 18.dp, top = 4.dp, bottom = 6.dp),
                        )
                        LazyColumn(
                            modifier = Modifier.testTag("busca_resultados").weight(1f),
                            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(resultados, key = ProductEntity::id, contentType = { "resultado" }) { produto ->
                                LinhaResultado(produto, onEscolher)
                            }
                        }
                    }
                }
            }
        }

        // Carrinho fica ACIMA do teclado (não flutua por cima dele).
        if (itensNoCarrinho > 0) {
            CartDock(itensNoCarrinho, totalCarrinho, onAbrirCarrinho)
        }

        TecladoTexto(
            onLetra = { if (texto.length < 40) texto += it },
            onApagar = { texto = texto.dropLast(1) },
            onEspaco = { if (texto.isNotEmpty() && texto.length < 40) texto += " " },
        )
    }
}

// Mostra o que foi digitado (ou a dica). Não é campo editável — quem digita é o
// teclado próprio embaixo, então nada de cursor piscando nem IME do sistema.
@Composable
private fun CampoBusca(texto: String, onLimpar: () -> Unit) {
    Surface(
        color = Color.White,
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 1.dp,
        modifier = Modifier.testTag("busca_campo").fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            KioskIcon(KioskIconName.Search, null, size = 26.dp, color = MarketMuted)
            Text(
                text = texto.ifEmpty { "Digite o nome do produto" },
                color = if (texto.isEmpty()) MarketMuted else MarketInk,
                fontFamily = MarketDisplayFamily,
                fontSize = 22.sp,
                fontWeight = if (texto.isEmpty()) FontWeight.Normal else FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (texto.isNotEmpty()) {
                Box(Modifier.testTag("busca_limpar").size(44.dp).clickable(onClick = onLimpar), contentAlignment = Alignment.Center) {
                    KioskIcon(KioskIconName.X, "Limpar", size = 24.dp, color = MarketMuted)
                }
            }
        }
    }
}

// Linha larga e alta: alvo de toque para quem está em pé, com o produto na
// outra mão. Grade de cards obrigaria a mirar.
@Composable
// Usada também pela busca da tela inicial (EscolhaScreen).
internal fun LinhaResultado(produto: ProductEntity, onEscolher: (ProductEntity) -> Unit) {
    Surface(
        color = Color.White,
        shape = RoundedCornerShape(16.dp),
        shadowElevation = 1.dp,
        modifier = Modifier.testTag("resultado_${produto.id}").fillMaxWidth().cliqueSonoro { onEscolher(produto) },
    ) {
        Row(
            Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            ProductImage(produto, Modifier.size(76.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = produto.name,
                    color = MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 18.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 5.dp),
                ) {
                    Text(
                        text = money(produto.price),
                        color = MarketPurple,
                        fontFamily = MarketDisplayFamily,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    if (produto.stock <= 0) {
                        Text(
                            text = "Sem estoque",
                            color = Color.White,
                            fontFamily = MarketBodyFamily,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.background(MarketAmber, RoundedCornerShape(50))
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                }
            }
            Box(
                Modifier.size(48.dp).background(MarketPurpleSoft, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                KioskIcon(KioskIconName.Plus, "Adicionar", size = 26.dp, color = MarketPurple)
            }
        }
    }
}

// Catálogo COMPLETO no estado vazio (campo de busca em branco): todos os
// produtos já carregados e prontos pra rolar/tocar, sem precisar digitar — é o
// que tira a travadinha de "iniciar a busca". "Produtos sem código" fica como
// categoria fixa no topo (não dá pra bipar nem digitar); o resto vem abaixo.
// Tocar em qualquer linha adiciona ao carrinho. LazyColumn aguenta centenas de
// itens sem custo (só renderiza o visível).
@Composable
private fun CatalogoCompleto(
    semCodigo: List<ProductEntity>,
    resto: List<ProductEntity>,
    onEscolher: (ProductEntity) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("busca_catalogo"),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (semCodigo.isNotEmpty()) {
            item(key = "hdr_semcodigo", contentType = "cabecalho") {
                CabecalhoCategoria(KioskIconName.Tag, "Produtos sem código de barras", "Toque para adicionar")
            }
            items(semCodigo, key = { "s_${it.id}" }, contentType = { "resultado" }) { produto ->
                LinhaResultado(produto, onEscolher)
            }
        }
        if (resto.isNotEmpty()) {
            item(key = "hdr_todos", contentType = "cabecalho") {
                CabecalhoCategoria(
                    KioskIconName.Search,
                    if (semCodigo.isEmpty()) "Todos os produtos" else "Todos os outros produtos",
                    "Ou digite acima pra achar mais rápido",
                )
            }
            items(resto, key = { "r_${it.id}" }, contentType = { "resultado" }) { produto ->
                LinhaResultado(produto, onEscolher)
            }
        }
    }
}

@Composable
private fun CabecalhoCategoria(icone: KioskIconName, titulo: String, sub: String) {
    Column(Modifier.padding(start = 2.dp, top = 8.dp, bottom = 2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KioskIcon(icone, null, size = 20.dp, color = MarketPurple)
            Text(
                text = titulo,
                color = MarketInk,
                fontFamily = MarketDisplayFamily,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Text(
            text = sub,
            color = MarketMuted,
            fontFamily = MarketBodyFamily,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

@Composable
private fun Dica() {
    Column(
        Modifier.fillMaxWidth().padding(top = 40.dp, start = 30.dp, end = 30.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        KioskIcon(KioskIconName.Search, null, size = 40.dp, color = MarketBorder)
        Text(
            text = "Comece a digitar",
            color = MarketInk,
            fontFamily = MarketDisplayFamily,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 14.dp),
        )
        Text(
            text = "Os produtos aparecem enquanto você escreve. Pode ser o nome, a marca ou a categoria.",
            color = MarketMuted,
            fontFamily = MarketBodyFamily,
            fontSize = 15.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(top = 7.dp),
        )
    }
}

@Composable
private fun NadaEncontrado(texto: String) {
    Column(
        Modifier.fillMaxWidth().padding(top = 40.dp, start = 30.dp, end = 30.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        KioskIcon(KioskIconName.AlertTriangle, null, size = 38.dp, color = MarketAmber)
        Text(
            text = "Nada encontrado para “$texto”",
            color = MarketInk,
            fontFamily = MarketDisplayFamily,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(top = 14.dp),
        )
        Text(
            // Saída honesta: melhor chamar alguém do que registrar item errado.
            text = "Tente outro nome, leia o código de barras da embalagem ou chame um responsável.",
            color = MarketMuted,
            fontFamily = MarketBodyFamily,
            fontSize = 15.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(top = 7.dp),
        )
    }
}
