package com.tridi.market.ui

import com.tridi.market.data.ProductEntity

// Busca do totem. Com 348 produtos, digitar é o caminho mais rápido depois da
// câmera — mas só funciona se o texto for tolerante ao que a pessoa realmente
// digita: sem acento, em qualquer ordem, e por marca ou categoria.
//
// "agua" tem que achar "Água Mineral"; "coca zero" tem que achar "Coca-Cola
// Zero 350ml" mesmo com as palavras separadas por outras no meio.
fun normalizarBusca(texto: String): String =
    texto.lowercase()
        .replace("[àáâãä]".toRegex(), "a").replace("[éêë]".toRegex(), "e")
        .replace("[íï]".toRegex(), "i").replace("[óôõö]".toRegex(), "o")
        .replace("[úü]".toRegex(), "u").replace("ç", "c")
        .replace("[^a-z0-9 ]".toRegex(), " ")   // hífen do "Coca-Cola" vira espaço
        .replace("\\s+".toRegex(), " ").trim()

// Um código digitado por inteiro (EAN-8 tem 8 dígitos, EAN-13 tem 13) é busca
// por código. Um fragmento numérico curto NÃO é: procurar "350" traria todo
// produto com 350 no meio do código de barras, e o que a pessoa queria era
// "350ml" no nome.
private const val MIN_DIGITOS_CODIGO = 8

// ── Quem aparece na busca ───────────────────────────────────────────────────
// Regra de OFERTA, não de venda: o que sai daqui continua sendo vendido ao
// bipar o código de barras (o scanner consulta o banco direto, em MarketDao).
// Some só da lista que a pessoa rola e pesquisa no totem.
//
//  • estoque zerado sai — não se oferece o que acabou;
//  • `ocultoBusca` sai — escolhido a dedo no painel;
//  • SEM CÓDIGO fica SEMPRE. Pão, fruta e granel não bipam: esta lista é o
//    ÚNICO jeito de vendê-los, e o estoque deles é impreciso por natureza.
//    Escondê-los por estoque zerado os tornaria invendáveis.
// REGRA ATUAL: quem tem código de barras NÃO aparece na busca, ponto. O jeito
// de comprar esses é encostar na câmera, que está sempre ligada na tela — e
// listá-los só duplicava um caminho mais lento pro mesmo produto.
//
// Sobram os SEM código (pão, fruta, granel), que não têm como ser bipados: pra
// eles a lista é a única forma de venda, então aparecem mesmo com estoque
// zerado — o estoque de item a granel é impreciso por natureza, e escondê-lo
// por isso o tornaria invendável.
//
// `ocultoBusca` (escolhido a dedo no painel) continua valendo e tira da lista.
fun visiveisNaBusca(products: List<ProductEntity>): List<ProductEntity> =
    products.filter { it.semCodigo && !it.ocultoBusca }

// Categorias dos produtos que a busca REALMENTE lista. Tirar do catálogo
// inteiro daria botões que abrem vazio — "Bebidas" só tem item com código, que
// não aparece aqui.
fun categoriasDaBusca(products: List<ProductEntity>): List<String> =
    visiveisNaBusca(products)
        .mapNotNull { it.categoryName?.trim()?.takeIf(String::isNotEmpty) }
        .distinct()
        .sortedWith(compareBy(porNome) { it })

// Produto com os campos de busca JÁ NORMALIZADOS. O custo de normalizar (vários
// regex por produto) é pago UMA vez, quando o catálogo carrega — não a cada
// tecla. Sem isto, digitar re-normalizava os 348 produtos a cada letra, no main
// thread, e o caractere demorava a aparecer.
class ItemBusca(val produto: ProductEntity, val alvo: String, val nome: String)

fun indexarBusca(products: List<ProductEntity>): List<ItemBusca> =
    products.map { ItemBusca(it, normalizarBusca("${it.name} ${it.categoryName ?: ""}"), normalizarBusca(it.name)) }

// Filtra usando o índice pré-normalizado: cada tecla vira só `contains`, barato.
fun filtrarIndex(index: List<ItemBusca>, query: String): List<ProductEntity> {
    val busca = normalizarBusca(query)
    val termos = busca.split(" ").filter(String::isNotEmpty)
    if (termos.isEmpty()) return index.map { it.produto }
    val comoCodigo = busca.length >= MIN_DIGITOS_CODIGO && busca.all(Char::isDigit)
    val primeiro = termos.first()
    return index.filter { item ->
        if (comoCodigo && item.produto.barcode?.contains(busca) == true) return@filter true
        termos.all { item.alvo.contains(it) }
    }.sortedWith(
        // 1) QUEM TEM ESTOQUE PRIMEIRO (o zerado vai pro fim; ainda dá pra
        //    comprar, mas não se oferece antes do que com certeza existe).
        // 2) Quem começa com o digitado: "coca" traz "Coca-Cola" antes de coco.
        compareByDescending<ItemBusca> { it.produto.stock > 0 }
            .thenByDescending { it.nome.startsWith(primeiro) }
            .thenBy { it.nome },
    ).map { it.produto }
}

// Mantido para os testes e para quem não tem índice pronto: monta o índice na
// hora e filtra. A tela de busca usa o caminho indexado (indexarBusca +
// filtrarIndex), que não repaga a normalização a cada tecla.
fun filterProductsByName(products: List<ProductEntity>, query: String): List<ProductEntity> =
    filtrarIndex(indexarBusca(products), query)

fun catalogCategories(products: List<ProductEntity>): List<String?> =
    listOf<String?>(null) + products
        .mapNotNull { it.categoryName?.trim()?.takeIf(String::isNotEmpty) }
        .distinct()
        .sortedBy(String::lowercase)

data class CartSummary(
    val itemCount: Int,
    val total: Double,
)

fun summarizeCart(products: List<ProductEntity>, cart: Map<Long, Int>): CartSummary {
    val productsById = products.associateBy(ProductEntity::id)
    var itemCount = 0
    var total = 0.0
    cart.forEach { (productId, quantity) ->
        if (quantity > 0) {
            productsById[productId]?.let { product ->
                itemCount += quantity
                total += product.price * quantity
            }
        }
    }
    return CartSummary(itemCount, total)
}

// Uma linha do carrinho pronta pra desenhar. O totem só mostrava a CONTAGEM
// ("3 itens, R$ 12,50") — pra saber o que já tinha escolhido a pessoa
// precisava abrir o carrinho e voltar. Aqui ela vê a lista sem sair da tela.
data class LinhaCarrinho(
    val produto: ProductEntity,
    val quantidade: Int,
    val subtotal: Double,
)

// Ordenação por nome respeitando o português. `sortedBy` compara por código de
// caractere, e aí "Água" e "Açaí" caem DEPOIS de Z — num mercadinho brasileiro
// metade dos itens acentuados iria parar no fim da lista. O Collator resolve
// acento como a pessoa espera.
private val porNome: Comparator<String> =
    java.text.Collator.getInstance(java.util.Locale("pt", "BR"))
        .apply { strength = java.text.Collator.PRIMARY }
        .let { c -> Comparator { a, b -> c.compare(a, b) } }

// Ordem de inserção não existe (o carrinho é um Map), então ordena pelo nome:
// estável entre recomposições, sem item pulando de lugar quando a quantidade
// muda. Produto que sumiu do catálogo é descartado — não dá pra cobrar o que
// não tem preço.
fun linhasDoCarrinho(products: List<ProductEntity>, cart: Map<Long, Int>): List<LinhaCarrinho> {
    val porId = products.associateBy(ProductEntity::id)
    return cart.entries
        .filter { it.value > 0 }
        .mapNotNull { (id, qtd) -> porId[id]?.let { LinhaCarrinho(it, qtd, it.price * qtd) } }
        .sortedWith(compareBy(porNome) { it.produto.name })
}

data class CatalogInteractionState(val pendingProductId: Long? = null)

sealed interface CatalogAction {
    data class RequestAdd(val productId: Long) : CatalogAction
    data object CancelAdd : CatalogAction
    data object ConfirmAdd : CatalogAction
}

data class CatalogTransition(
    val state: CatalogInteractionState,
    val productToAdd: Long? = null,
)

fun reduceCatalogInteraction(
    state: CatalogInteractionState,
    action: CatalogAction,
): CatalogTransition = when (action) {
    is CatalogAction.RequestAdd -> CatalogTransition(state.copy(pendingProductId = action.productId))
    CatalogAction.CancelAdd -> CatalogTransition(state.copy(pendingProductId = null))
    CatalogAction.ConfirmAdd -> CatalogTransition(
        state = state.copy(pendingProductId = null),
        productToAdd = state.pendingProductId,
    )
}
