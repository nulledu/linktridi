package com.tridi.market.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.market.data.ProductEntity
import com.tridi.market.net.EmployeeDto

// Primeira tela depois do código: como a pessoa quer achar o produto.
// Só dois caminhos, do mais rápido para o mais lento — sem navegar catálogo.
@Composable
fun EscolhaScreen(
    employee: EmployeeDto,
    online: Boolean,
    visitante: Boolean,
    empresa: String?,
    maisComprados: List<ProductEntity>,
    maisCompradosPersonalizado: Boolean,
    itensNoCarrinho: Int,
    totalCarrinho: Double,
    linhasCarrinho: List<LinhaCarrinho> = emptyList(),
    // Catálogo inteiro; a tela decide o que listar.
    produtosBusca: List<ProductEntity> = emptyList(),
    temSemCodigo: Boolean,
    // Recado da última leitura que não deu certo (código fora do catálogo).
    aviso: String? = null,
    // Tem leitor plugado/pareado? Sem câmera, um leitor ausente deixa o totem
    // mudo — e sem este aviso ninguém entende por que bipar não faz nada.
    leitorConectado: Boolean = true,
    onLerCodigo: () -> Unit,
    onPesquisar: () -> Unit,
    onSemCodigo: () -> Unit,
    onEscolherProduto: (ProductEntity) -> Unit,
    onAbrirCarrinho: () -> Unit,
    onSair: () -> Unit,
) {
    // Sair daqui APAGA o carrinho — é a única saída que faz isso (o "voltar" da
    // busca e do carrinho só navegam). Com item escolhido, pergunta antes: um
    // toque no voltar por engano jogava a compra inteira fora sem aviso, e
    // remontar o carrinho é o ponto em que a pessoa desiste.
    var confirmandoSaida by remember { mutableStateOf(false) }
    // Busca na PRÓPRIA home. Antes ela morava numa segunda tela; trazer pra cá
    // é o que permite pesquisar sem perder a câmera de vista.
    var texto by remember { mutableStateOf("") }
    var categoria by remember { mutableStateOf<String?>(null) }
    var digitando by remember { mutableStateOf(false) }
    val pesquisando = texto.isNotBlank() || categoria != null
    // Só produto SEM código entra na lista (ver visiveisNaBusca): o que tem
    // código se compra encostando na câmera.
    val listaveis = remember(produtosBusca) { visiveisNaBusca(produtosBusca) }
    val categorias = remember(produtosBusca) { categoriasDaBusca(produtosBusca) }
    val resultados = remember(listaveis, texto, categoria) {
        listaveis
            .filter { categoria == null || it.categoryName == categoria }
            .let { base -> if (texto.isBlank()) base else filtrarIndex(indexarBusca(base), texto) }
    }
    val tentarSair = { if (itensNoCarrinho > 0) confirmandoSaida = true else onSair() }

    BackHandler(onBack = tentarSair)
    // Fundo ROXO atrás de tudo: é ele que aparece no topo, atrás do cabeçalho, e
    // nas beiradas do cartão branco arredondado.
    Box(Modifier.fillMaxSize().background(MarketPurple)) {
        Column(Modifier.fillMaxSize()) {
            CabecalhoTotem(employee, online, visitante, empresa, tentarSair)

            // NADA de rolagem: tudo tem que caber. Quem absorve a diferença é o
            // quadro da câmera (weight abaixo) — com carrinho cheio ele encolhe,
            // vazio ele cresce. Assim o "Código danificado? Digitar" fica sempre
            // à vista, sem depender de a pessoa descobrir que a tela arrasta.
            // Cartão branco arredondado no topo, cobrindo o resto — é o que dá
            // a "folha" do desenho sobre o roxo.
            Surface(
                color = MarketCanvas,
                shape = RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp),
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) {
            Column(Modifier.fillMaxWidth()) {
                CampoDeBusca(
                    texto = texto,
                    aoTocar = { digitando = true },
                    aoLimpar = { texto = ""; digitando = false },
                )

                if (categorias.isNotEmpty()) {
                    Titulo("Categorias")
                    CategoriasDaBusca(categorias, categoria) { categoria = if (categoria == it) null else it }
                }

                Row(
                    Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Produtos",
                        color = MarketInk, fontFamily = MarketDisplayFamily, fontSize = 19.sp,
                        fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f),
                    )
                    // "Ver todos" limpa os filtros — é o caminho de volta pra
                    // lista inteira depois de tocar numa categoria.
                    run {
                        Text(
                            text = "Ver todos",
                            color = MarketPurple, fontFamily = MarketBodyFamily, fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.cliqueSonoro { texto = ""; categoria = null; digitando = false },
                        )
                    }
                }
                ResultadosDaBusca(resultados, onEscolherProduto, Modifier.weight(1f).padding(top = 8.dp, bottom = 12.dp))

                // Onde ficava o quadro da câmera. A leitura agora é só do
                // leitor, que funciona em QUALQUER tela — então aqui sobra a
                // instrução, o aviso de erro e a saída pra digitar o código.
                FaixaDoLeitor(
                    onDigitar = onLerCodigo,
                    aviso = aviso,
                    leitorConectado = leitorConectado,
                    compacta = pesquisando || digitando,
                )

                if (digitando) {
                    TecladoTexto(
                        onLetra = { if (texto.length < 40) texto += it },
                        onApagar = { texto = texto.dropLast(1) },
                        onEspaco = { if (texto.isNotEmpty() && texto.length < 40) texto += " " },
                    )
                }
            }
            }

        }

        if (itensNoCarrinho > 0) {
            BarraDoCarrinho(itensNoCarrinho, totalCarrinho, onAbrirCarrinho, Modifier.align(Alignment.BottomCenter))
        }

        if (confirmandoSaida) {
            ConfirmarSaida(
                itens = itensNoCarrinho,
                total = totalCarrinho,
                onContinuar = { confirmandoSaida = false },
                onSair = { confirmandoSaida = false; onSair() },
            )
        }
    }
}



// Cantos do leitor + faixa luminosa, como no desenho. Só quatro "L" nas
// quinas: a moldura fechada tapava mais imagem do que ajudava a mirar.
@Composable
private fun BoxScope.CantosDeLeitura() {
    val cor = Color.White.copy(alpha = 0.9f)
    val lado = 34.dp
    val grossura = 4.dp
    @Composable
    fun canto(alinhamento: Alignment, cima: Boolean, esquerda: Boolean) {
        Box(Modifier.align(alinhamento).padding(18.dp).size(lado)) {
            Box(
                Modifier.fillMaxWidth().height(grossura)
                    .align(if (cima) Alignment.TopStart else Alignment.BottomStart).background(cor),
            )
            Box(
                Modifier.width(grossura).fillMaxHeight()
                    .align(if (esquerda) Alignment.TopStart else Alignment.TopEnd).background(cor),
            )
        }
    }
    canto(Alignment.TopStart, cima = true, esquerda = true)
    canto(Alignment.TopEnd, cima = true, esquerda = false)
    canto(Alignment.BottomStart, cima = false, esquerda = true)
    canto(Alignment.BottomEnd, cima = false, esquerda = false)
    // Faixa da "leitura em andamento", no meio.
    Box(
        Modifier.align(Alignment.Center).fillMaxWidth(0.86f).height(3.dp)
            .background(Color.White.copy(alpha = 0.75f)),
    )
}

// Barra do carrinho — verde, no rodapé, sempre alcançável com o polegar.
@Composable
private fun BarraDoCarrinho(itens: Int, total: Double, onAbrir: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        color = MarketGreen,
        contentColor = Color.White,
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 10.dp,
        modifier = modifier.testTag("barra_carrinho").fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 14.dp)
            .cliqueSonoro(onClick = onAbrir),
    ) {
        Row(
            Modifier.padding(horizontal = 18.dp, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KioskIcon(KioskIconName.ShoppingCart, null, size = 30.dp, color = Color.White)
            Text(
                text = "Ver carrinho",
                fontFamily = MarketDisplayFamily, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f).padding(start = 12.dp),
            )
            Text(
                text = money(total),
                fontFamily = MarketDisplayFamily, fontSize = 20.sp, fontWeight = FontWeight.Bold,
            )
            Surface(
                color = Color.White.copy(alpha = 0.22f),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.padding(start = 12.dp),
            ) {
                Text(
                    text = if (itens == 1) "1 item" else "$itens itens",
                    color = Color.White, fontFamily = MarketBodyFamily, fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        }
    }
}

// Cabeçalho roxo do totem: quem é a pessoa, quanto ela já deve e a saída.
@Composable
private fun CabecalhoTotem(
    employee: EmployeeDto,
    online: Boolean,
    visitante: Boolean,
    empresa: String?,
    onSair: () -> Unit,
) {
    val iniciais = employee.name.trim().split(" ").filter(String::isNotBlank)
        .let { partes -> (partes.firstOrNull()?.take(1).orEmpty() + partes.drop(1).lastOrNull()?.take(1).orEmpty()) }
        .uppercase().ifEmpty { "?" }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(60.dp).clip(CircleShape).background(Color.White),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = iniciais,
                color = MarketPurple, fontFamily = MarketDisplayFamily, fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(
                text = "Olá, ${employee.name.trim().split(" ").firstOrNull().orEmpty()}",
                color = Color.White, fontFamily = MarketDisplayFamily, fontSize = 24.sp,
                fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            // "Em aberto" e não "gasto no mês": este número é a DÍVIDA atual, e
            // chamá-lo de gasto mensal mentiria — pagamento abate, e compra do
            // mês passado ainda não paga continua contando.
            Text(
                text = "Em aberto: ${money(employee.open)}",
                color = Color.White.copy(alpha = 0.85f), fontFamily = MarketBodyFamily, fontSize = 15.sp,
            )
            if (visitante && empresa != null) {
                Text(
                    text = "conta de $empresa",
                    color = Color.White.copy(alpha = 0.7f), fontFamily = MarketBodyFamily, fontSize = 12.sp,
                )
            }
            if (!online) {
                Text(
                    text = "sem internet — a compra sobe depois",
                    color = Color.White.copy(alpha = 0.7f), fontFamily = MarketBodyFamily, fontSize = 12.sp,
                )
            }
        }
        Surface(
            onClick = onSair,
            color = Color.White.copy(alpha = 0.16f),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.testTag("totem_sair"),
        ) {
            Column(
                Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                KioskIcon(KioskIconName.Logout, "Sair", size = 24.dp, color = Color.White)
                Text("Sair", color = Color.White, fontFamily = MarketBodyFamily, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun Titulo(texto: String) {
    Text(
        text = texto,
        color = MarketInk, fontFamily = MarketDisplayFamily, fontSize = 19.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(start = 18.dp, top = 10.dp, bottom = 8.dp),
    )
}

// Campo de busca. Não é input do sistema: quem digita é o teclado próprio do
// totem (TecladoTexto), então aqui é só a caixa que mostra o que foi digitado.
@Composable
private fun CampoDeBusca(texto: String, aoTocar: () -> Unit, aoLimpar: () -> Unit) {
    Surface(
        color = Color.White,
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 1.dp,
        modifier = Modifier.testTag("campo_busca_home").fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 14.dp)
            .cliqueSonoro(onClick = aoTocar),
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            KioskIcon(KioskIconName.Search, null, size = 24.dp, color = MarketMuted)
            Text(
                text = texto.ifEmpty { "Buscar produto..." },
                color = if (texto.isEmpty()) MarketMuted else MarketInk,
                fontFamily = MarketBodyFamily, fontSize = 17.sp,
                fontWeight = if (texto.isEmpty()) FontWeight.Normal else FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
            if (texto.isNotEmpty()) {
                Box(Modifier.size(32.dp).clip(CircleShape).cliqueSonoro(onClick = aoLimpar), Alignment.Center) {
                    KioskIcon(KioskIconName.X, "Limpar", size = 18.dp, color = MarketMuted)
                }
            }
        }
    }
}

// Categorias dos produtos SEM código — são os únicos que a lista mostra, então
// tirar as categorias do catálogo inteiro daria botões que abrem vazio.
// Tocar de novo na mesma limpa o filtro.
@Composable
private fun CategoriasDaBusca(categorias: List<String>, ativa: String?, onEscolher: (String) -> Unit) {
    if (categorias.isEmpty()) return
    // TRÊS botões lado a lado, dividindo a largura igualmente — como no desenho.
    // Fileira fixa e não rolável: com peso igual, os três ficam do mesmo
    // tamanho; se houver mais categorias, as três primeiras aparecem.
    Row(
        modifier = Modifier.testTag("categorias_busca").fillMaxWidth()
            .padding(horizontal = 18.dp).padding(bottom = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        categorias.take(3).forEach { nome ->
            val on = nome == ativa
            Surface(
                onClick = { onEscolher(nome) },
                shape = RoundedCornerShape(18.dp),
                color = Color.White,
                border = if (on) androidx.compose.foundation.BorderStroke(2.dp, MarketPurple) else null,
                modifier = Modifier.weight(1f),
            ) {
                Column(
                    Modifier.padding(vertical = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier.size(58.dp).clip(CircleShape).background(MarketPurple),
                        contentAlignment = Alignment.Center,
                    ) {
                        KioskIcon(iconeDaCategoria(nome), null, size = 28.dp, color = Color.White)
                    }
                    Text(
                        text = nome,
                        color = MarketInk, fontFamily = MarketBodyFamily, fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 10.dp, start = 4.dp, end = 4.dp),
                    )
                }
            }
        }
    }
}

// Ícone por categoria, pelo nome. Sem mapa no banco: as categorias são criadas
// livremente no painel, então o palpite pelo nome é o que dá pra fazer sem
// obrigar alguém a cadastrar ícone.
// Só ícones que EXISTEM no KioskIcon — nada de inventar path do Tabler. O
// desenho usa garrafa/bala/pacote; aqui o mais próximo disponível.
private fun iconeDaCategoria(nome: String): KioskIconName = when {
    nome.contains("bebid", true) || nome.contains("suco", true) || nome.contains("água", true) -> KioskIconName.ShoppingCart
    nome.contains("salgad", true) || nome.contains("snack", true) -> KioskIconName.ShoppingBag
    else -> KioskIconName.Tag
}

@Composable
private fun ResultadosDaBusca(
    produtos: List<ProductEntity>,
    onEscolher: (ProductEntity) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (produtos.isEmpty()) {
        Box(modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
            Text(
                text = "Nada encontrado por aqui.",
                color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 15.sp,
            )
        }
        return
    }
    // UM cartão branco com linhas divisórias, e não um cartão por produto: com
    // cartões soltos a lista virava uma pilha de blocos com sombra, e ao rolar
    // o último ficava cortado no meio pela câmera — daí a sensação de bagunça.
    Surface(
        color = Color.White,
        shape = RoundedCornerShape(18.dp),
        modifier = modifier.fillMaxWidth().padding(horizontal = 18.dp),
    ) {
        LazyColumn(
            modifier = Modifier.testTag("resultados_home").fillMaxWidth(),
            // Respiro embaixo: sem ele a última linha encostava na borda do
            // cartão e ficava espremida contra a câmera.
            contentPadding = PaddingValues(bottom = 4.dp),
        ) {
            itemsIndexed(produtos, key = { _, p -> p.id }) { i, produto ->
                if (i > 0) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(MarketCanvas))
                }
                LinhaProdutoHome(produto, onEscolher)
            }
        }
    }
}

// Linha do desenho: foto, nome, preço e o "+" à direita. Enxuta de propósito —
// é uma linha dentro de um cartão, não um cartão por si.
@Composable
private fun LinhaProdutoHome(produto: ProductEntity, onEscolher: (ProductEntity) -> Unit) {
    Row(
        Modifier.fillMaxWidth().cliqueSonoro { onEscolher(produto) }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProductImage(produto, Modifier.size(58.dp))
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(
                text = produto.name,
                color = MarketInk, fontFamily = MarketBodyFamily, fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 3.dp)) {
                Text(
                    text = money(produto.price),
                    color = MarketPurple, fontFamily = MarketDisplayFamily, fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
                if (produto.stock <= 0) {
                    Surface(
                        color = MarketAmber, shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.padding(start = 8.dp),
                    ) {
                        Text(
                            text = "Sem estoque",
                            color = Color.White, fontFamily = MarketBodyFamily, fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        )
                    }
                }
            }
        }
        Box(
            Modifier.size(46.dp).clip(CircleShape).background(MarketPurpleSoft),
            contentAlignment = Alignment.Center,
        ) {
            KioskIcon(KioskIconName.Plus, "Adicionar", size = 24.dp, color = MarketPurple)
        }
    }
}

// Faixa do leitor na tela inicial, no lugar do antigo quadro da câmera.
//
// A leitura por câmera saiu: o leitor Bluetooth/USB entra pela Activity e vale
// em QUALQUER tela, então não existe mais "a tela onde se bipa". O que sobra
// aqui é o que a câmera carregava junto e continua necessário: dizer o que
// fazer, mostrar o erro da última leitura e oferecer a digitação manual.
@Composable
private fun ColumnScope.FaixaDoLeitor(
    onDigitar: () -> Unit,
    aviso: String?,
    leitorConectado: Boolean,
    // Encolhe enquanto a pessoa pesquisa: a lista passa a ser o que importa.
    compacta: Boolean = false,
) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.testTag("faixa_leitor").fillMaxWidth()
                .height(if (compacta) 84.dp else 132.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(if (leitorConectado) MarketPurple else MarketAmber),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                KioskIcon(
                    if (leitorConectado) KioskIconName.Barcode else KioskIconName.AlertTriangle,
                    null, size = if (compacta) 22.dp else 30.dp, color = Color.White,
                )
                Text(
                    text = if (leitorConectado) "Bipe o produto no leitor" else "Leitor desconectado",
                    color = Color.White, fontFamily = MarketDisplayFamily,
                    fontSize = if (compacta) 15.sp else 18.sp,
                    fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 6.dp),
                )
                if (!compacta) Text(
                    text = if (leitorConectado) "Ou toque no produto na lista acima"
                    else "Ligue o leitor. Enquanto isso, toque no produto na lista.",
                    color = Color.White.copy(alpha = .9f), fontFamily = MarketBodyFamily,
                    fontSize = 14.sp, modifier = Modifier.padding(top = 2.dp),
                )
            }

            // Código lido que não existe no catálogo. Sem este aviso a pessoa
            // só ouvia o tom de erro e ficava sem saber por que nada aconteceu.
            if (aviso != null) {
                Surface(
                    color = MarketAmber,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.testTag("home_aviso").align(Alignment.BottomCenter)
                        .padding(10.dp).fillMaxWidth(),
                ) {
                    Row(
                        Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        KioskIcon(KioskIconName.AlertTriangle, null, size = 20.dp, color = Color.White)
                        Text(
                            text = aviso,
                            color = Color.White, fontFamily = MarketBodyFamily, fontSize = 14.sp,
                            lineHeight = 18.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(start = 10.dp),
                        )
                    }
                }
            }
        }
        // Saída pro código ilegível: embalagem amassada, etiqueta rasgada.
        androidx.compose.material3.TextButton(
            onClick = onDigitar,
            modifier = Modifier.testTag("home_digitar").padding(top = 2.dp),
        ) {
            Text(
                text = "Código danificado? Digitar",
                color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}


// O que já está no carrinho, na própria tela inicial. Tocar abre o carrinho
// completo, onde dá pra mexer na quantidade.
//
// Fileira que rola DE LADO, e não lista empilhada: a altura fica a mesma com 1
// ou com 20 itens. Empilhada, um carrinho grande empurrava o botão de digitar
// pra fora da tela — e era isso que obrigava a arrastar.
@Composable
private fun FaixaDoCarrinho(linhas: List<LinhaCarrinho>, onAbrir: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 6.dp)) {
        Text(
            text = "No seu carrinho",
            color = MarketInk, fontFamily = MarketDisplayFamily, fontSize = 17.sp,
            fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 18.dp, bottom = 6.dp),
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(horizontal = 18.dp),
        ) {
            items(linhas, key = { it.produto.id }, contentType = { "carrinho" }) { linha ->
                Surface(
                    onClick = onAbrir,
                    shape = RoundedCornerShape(14.dp),
                    color = Color.White,
                    modifier = Modifier.width(150.dp),
                ) {
                    Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        ProductImage(linha.produto, Modifier.size(40.dp))
                        Column(Modifier.weight(1f).padding(start = 8.dp)) {
                            Text(
                                text = linha.produto.name,
                                color = MarketInk, fontFamily = MarketBodyFamily, fontSize = 12.5.sp,
                                fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis,
                                lineHeight = 15.sp,
                            )
                            Text(
                                text = "${linha.quantidade}× · ${money(linha.subtotal)}",
                                color = MarketPurple, fontFamily = MarketBodyFamily, fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }
        }
    }
}

// Aviso antes de jogar a compra fora. O botão GRANDE é o de continuar: a saída
// é o caminho destrutivo e não deve ser o mais fácil de acertar sem ler.
@Composable
private fun ConfirmarSaida(
    itens: Int,
    total: Double,
    onContinuar: () -> Unit,
    onSair: () -> Unit,
) {
    // Voltar de novo com o aviso aberto fecha o aviso — não sai. Se o segundo
    // "voltar" saísse, dois toques rápidos no botão continuariam descartando a
    // compra em silêncio, que é justamente o que este aviso existe pra impedir.
    BackHandler(onBack = onContinuar)
    Box(
        Modifier.testTag("confirmar_saida").fillMaxSize().background(Color(0xCC171333)),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier.padding(24.dp).widthIn(max = 460.dp),
            color = Color.White,
            shape = RoundedCornerShape(26.dp),
            shadowElevation = 14.dp,
        ) {
            Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                KioskIcon(KioskIconName.AlertTriangle, null, size = 40.dp, color = MarketAmber)
                Text(
                    text = "Sair sem finalizar?",
                    color = MarketInk, fontFamily = MarketDisplayFamily, fontSize = 26.sp,
                    fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp),
                )
                Text(
                    text = if (itens == 1) "1 item no carrinho, ${money(total)}."
                    else "$itens itens no carrinho, ${money(total)}.",
                    color = MarketPurple, fontFamily = MarketDisplayFamily, fontSize = 20.sp,
                    fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 6.dp),
                )
                Text(
                    text = "Se sair agora, o carrinho é apagado e você terá que escolher tudo de novo. A compra NÃO será registrada.",
                    color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 15.sp,
                    lineHeight = 20.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.padding(top = 10.dp),
                )
                androidx.compose.material3.Button(
                    onClick = onContinuar,
                    modifier = Modifier.testTag("continuar_comprando").fillMaxWidth().height(66.dp).padding(top = 0.dp),
                    shape = RoundedCornerShape(15.dp),
                ) {
                    Text(
                        "Continuar comprando",
                        fontFamily = MarketBodyFamily, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                    )
                }
                androidx.compose.material3.OutlinedButton(
                    onClick = onSair,
                    modifier = Modifier.testTag("sair_cancelando").fillMaxWidth().height(58.dp).padding(top = 10.dp),
                    shape = RoundedCornerShape(15.dp),
                ) {
                    Text(
                        "Sair e apagar o carrinho",
                        fontFamily = MarketBodyFamily, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
private fun CaminhoGrande(
    titulo: String,
    detalhe: String,
    icone: KioskIconName,
    destaque: Boolean,
    testTag: String,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier.testTag(testTag).fillMaxWidth().height(118.dp).cliqueSonoro(onClick = onClick),
        color = if (destaque) MarketPurple else Color.White,
        shape = RoundedCornerShape(22.dp),
        shadowElevation = 2.dp,
    ) {
        Row(
            Modifier.padding(horizontal = 22.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Box(
                Modifier.size(64.dp).background(
                    if (destaque) Color.White.copy(alpha = 0.2f) else MarketPurpleSoft,
                    RoundedCornerShape(18.dp),
                ),
                contentAlignment = Alignment.Center,
            ) {
                KioskIcon(icone, null, size = 34.dp, color = if (destaque) Color.White else MarketPurple)
            }
            Column {
                Text(
                    text = titulo,
                    color = if (destaque) Color.White else MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = detalhe,
                    color = if (destaque) Color.White.copy(alpha = 0.8f) else MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 15.sp,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
        }
    }
}

@Composable
private fun AtalhoCompacto(produto: ProductEntity, onEscolher: (ProductEntity) -> Unit) {
    Card(
        modifier = Modifier.testTag("atalho_${produto.id}").width(146.dp).cliqueSonoro { onEscolher(produto) },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Box {
            ProductImage(produto, Modifier.fillMaxWidth().height(100.dp))
            if (produto.stock <= 0) {
                Text(
                    text = "Sem estoque",
                    color = Color.White,
                    fontFamily = MarketBodyFamily,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.align(Alignment.BottomStart).padding(7.dp)
                        .background(MarketAmber, RoundedCornerShape(50))
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                )
            }
        }
        Column(Modifier.padding(horizontal = 10.dp, vertical = 9.dp)) {
            Text(
                text = produto.name,
                color = MarketInk,
                fontFamily = MarketDisplayFamily,
                fontSize = 13.sp,
                lineHeight = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.height(30.dp),
            )
            Text(
                text = money(produto.price),
                color = MarketPurple,
                fontFamily = MarketDisplayFamily,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
    }
}

// Confirmação do produto — aparece NA HORA da leitura, com foto e nome.
//
// O item não entra sozinho no carrinho: um código parecido lido por engano
// viraria uma cobrança que ninguém percebeu. A foto é o que confirma em um
// olhar que é o produto certo, sem ler nada.
//
// Sem estoque não bloqueia (o contador local atrasa e o produto pode estar na
// prateleira) — vira um aviso dentro do mesmo pop-up.
@Composable
fun ConfirmarProduto(
    produto: ProductEntity,
    onConfirmar: () -> Unit,
    onCancelar: () -> Unit,
    pedeFoto: Boolean = false,
) {
    val semEstoque = produto.stock <= 0
    // Vindo da busca, o teclado fica aberto e tapa justamente os botões de
    // "Não" e "Adicionar" — a pessoa via o produto e não conseguia responder.
    val teclado = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    androidx.compose.runtime.LaunchedEffect(produto.id) { teclado?.hide() }
    Box(
        Modifier.testTag("confirmar_produto").fillMaxSize().background(Color(0xCC171333)),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier.padding(24.dp).widthIn(max = 460.dp),
            color = Color.White,
            shape = RoundedCornerShape(26.dp),
            shadowElevation = 14.dp,
        ) {
            Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "Adicionar ao carrinho?",
                    color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                ProductImage(produto, Modifier.fillMaxWidth().height(210.dp).padding(top = 12.dp))
                Text(
                    text = produto.name,
                    color = MarketInk, fontFamily = MarketDisplayFamily, fontSize = 25.sp,
                    lineHeight = 29.sp, fontWeight = FontWeight.Bold,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.padding(top = 14.dp),
                )
                Text(
                    text = money(produto.price),
                    color = MarketPurple, fontFamily = MarketDisplayFamily, fontSize = 30.sp,
                    fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp),
                )
                if (semEstoque) {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color(0xFFFFF3E0),
                        modifier = Modifier.padding(top = 12.dp).testTag("aviso_sem_estoque"),
                    ) {
                        Row(
                            Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            KioskIcon(KioskIconName.AlertTriangle, null, size = 22.dp, color = MarketAmber)
                            Text(
                                text = "Produto sem estoque. Adicionar mesmo assim?",
                                color = MarketAmber, fontFamily = MarketBodyFamily, fontSize = 14.sp,
                                lineHeight = 18.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(start = 10.dp),
                            )
                        }
                    }
                }
                // Avisa que a foto vem a seguir. A tela da câmera abrindo sem
                // aviso assusta e faz a pessoa achar que errou alguma coisa.
                if (pedeFoto) {
                    Row(
                        Modifier.padding(top = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        KioskIcon(KioskIconName.Camera, null, size = 18.dp, color = MarketMuted)
                        Text(
                            text = "Sem código de barras: vamos pedir uma foto do produto.",
                            color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 13.sp,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    androidx.compose.material3.OutlinedButton(
                        onClick = onCancelar,
                        modifier = Modifier.testTag("cancelar_produto").weight(1f).height(62.dp),
                        shape = RoundedCornerShape(15.dp),
                    ) { Text("Não", fontFamily = MarketBodyFamily, fontSize = 17.sp, fontWeight = FontWeight.SemiBold) }
                    androidx.compose.material3.Button(
                        onClick = onConfirmar,
                        modifier = Modifier.testTag("confirma_produto").weight(1.4f).height(62.dp),
                        shape = RoundedCornerShape(15.dp),
                    ) {
                        Text(
                            text = if (pedeFoto) "Continuar" else "Adicionar",
                            fontFamily = MarketBodyFamily, fontSize = 17.sp, fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

// Um código de barras pode pertencer a mais de um produto (permitido no painel,
// com confirmação). Nesse caso o tablet NÃO adivinha: mostra os candidatos com
// foto e preço e a pessoa toca no que está na mão. Chutar aqui significaria
// cobrar o item errado e dar baixa no estoque errado, sem ninguém perceber.
@Composable
fun EscolherDoEmpate(
    produtos: List<ProductEntity>,
    onEscolher: (ProductEntity) -> Unit,
    onCancelar: () -> Unit,
    // O reconhecimento por FOTO reusa esta mesma lista: é o mesmo gesto (tocar
    // no produto certo) e o mesmo destino (a confirmação com foto e preço).
    // Só o texto muda — dizer "mesmo código de barras" numa lista que veio da
    // câmera confundiria quem está comprando.
    titulo: String = "Qual destes você pegou?",
    subtitulo: String = "Estes produtos têm o mesmo código de barras.",
) {
    BackHandler(onBack = onCancelar)
    Box(
        Modifier.testTag("empate_codigo").fillMaxSize().background(Color(0xCC171333)),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier.padding(24.dp).widthIn(max = 520.dp),
            color = Color.White,
            shape = RoundedCornerShape(26.dp),
            shadowElevation = 14.dp,
        ) {
            Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = titulo,
                    color = MarketInk, fontFamily = MarketDisplayFamily, fontSize = 25.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = subtitulo,
                    color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 6.dp, bottom = 14.dp),
                )
                // Rola quando forem muitos, em vez de estourar a folha.
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(produtos, key = ProductEntity::id, contentType = { "empate" }) { produto ->
                        LinhaEmpate(produto) { onEscolher(produto) }
                    }
                }
                androidx.compose.material3.OutlinedButton(
                    onClick = onCancelar,
                    modifier = Modifier.testTag("cancelar_empate").fillMaxWidth().height(58.dp).padding(top = 14.dp),
                    shape = RoundedCornerShape(15.dp),
                ) {
                    Text("Nenhum destes", fontFamily = MarketBodyFamily, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun LinhaEmpate(produto: ProductEntity, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFFF6F5FB),
        modifier = Modifier.fillMaxWidth().height(84.dp),
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            ProductImage(produto, Modifier.size(64.dp))
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(
                    text = produto.name,
                    color = MarketInk, fontFamily = MarketBodyFamily, fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = if (produto.stock > 0) "${produto.stock} em estoque" else "sem estoque",
                    color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 12.sp,
                )
            }
            Text(
                text = money(produto.price),
                color = MarketPurple, fontFamily = MarketDisplayFamily, fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

// Cabeçalho compartilhado entre Escolha e Busca: quem é a pessoa, se está
// online e quanto ela ainda pode gastar.
@Composable
fun MarketHeader(
    employee: EmployeeDto,
    online: Boolean,
    visitante: Boolean,
    empresa: String?,
    onExit: () -> Unit,
) {
    Surface(color = Color.White, shadowElevation = 1.dp) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(15.dp), color = MarketCanvas) {
                androidx.compose.material3.IconButton(
                    onClick = onExit,
                    modifier = Modifier.testTag("catalog_exit").size(56.dp),
                ) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar para o início", color = MarketInk)
                }
            }
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(
                    text = "Olá, ${employee.name.substringBefore(' ')}",
                    color = MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 23.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(Modifier.size(7.dp).background(if (online) MarketGreen else MarketAmber, CircleShape))
                    Text(
                        text = if (online) "Conectado" else "Modo offline",
                        color = MarketMuted,
                        fontFamily = MarketBodyFamily,
                        fontSize = 11.sp,
                    )
                    if (visitante && !empresa.isNullOrBlank()) {
                        Surface(shape = RoundedCornerShape(999.dp), color = MarketPurpleSoft) {
                            Text(
                                text = "Conta: $empresa",
                                color = MarketPurple,
                                fontFamily = MarketBodyFamily,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            )
                        }
                    }
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("Disponível", color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 10.sp)
                Text(
                    text = money(employee.available),
                    color = MarketGreen,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
fun CartDock(count: Int, total: Double, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        color = MarketPurple,
        contentColor = Color.White,
        shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
        shadowElevation = 10.dp,
        modifier = modifier.testTag("cart_dock").fillMaxWidth().cliqueSonoro(onClick = onClick),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(42.dp).background(Color.White.copy(alpha = 0.16f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                KioskIcon(KioskIconName.ShoppingCart, null, size = 23.dp, color = Color.White)
            }
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(
                    text = if (count == 1) "Ver 1 produto" else "Ver $count produtos",
                    fontFamily = MarketDisplayFamily,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Revise antes de finalizar",
                    fontFamily = MarketBodyFamily,
                    fontSize = 11.sp,
                    color = Color.White.copy(alpha = 0.72f),
                )
            }
            Text(
                text = money(total),
                fontFamily = MarketDisplayFamily,
                fontSize = 21.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.width(4.dp))
        }
    }
}
