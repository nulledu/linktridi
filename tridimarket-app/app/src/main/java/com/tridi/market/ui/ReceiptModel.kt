package com.tridi.market.ui

import com.tridi.market.data.ProductEntity
import com.tridi.market.net.EmployeeDto

// O que a tela de fim de compra mostra.
//
// Antes ela recebia só `total` e um booleano. Isso deixava a pessoa sem a única
// informação que ela realmente confere no fim: O QUE foi cobrado. Quem bipou
// dois itens parecidos saía sem saber qual entrou — e o erro só aparecia no
// extrato, dias depois.
//
// Tudo aqui é calculado do carrinho e da sessão que já estão no tablet: a tela
// de recibo continua correta sem internet.
data class ReceiptLine(
    val productId: Long,
    val name: String,
    val quantity: Int,
    val unitPrice: Double,
    // Comprado com o contador zerado. Não impede a venda (o número local
    // atrasa e o produto pode estar na prateleira), mas fica marcado no recibo
    // para a pessoa ver na hora que aquele item vai gerar conferência.
    val semEstoque: Boolean,
) {
    val subtotal: Double get() = unitPrice * quantity
}

data class ReceiptData(
    val nome: String,
    val linhas: List<ReceiptLine>,
    val total: Double,
    val saldoAntes: Double,
    // true = guardada no tablet, ainda não confirmada pelo servidor.
    val naFila: Boolean,
    // Conta cobrada quando a pessoa é de outra empresa que não a do tablet.
    val empresa: String? = null,
    // Dia e hora da compra, como num comprovante de papel.
    val momento: String = "",
) {
    val itens: Int get() = linhas.sumOf { it.quantity }
    val saldoDepois: Double get() = saldoAntes - total
    val divergencias: Int get() = linhas.count { it.semEstoque }
}

// O primeiro nome é o que cabe num título grande. Nomes do cadastro vêm em
// caixa variada ("MARIA DA SILVA", "maria"), e gritar com a pessoa na tela de
// agradecimento fica péssimo.
internal fun primeiroNome(completo: String): String {
    val bruto = completo.trim().substringBefore(' ').takeIf(String::isNotEmpty) ?: return ""
    return bruto.lowercase().replaceFirstChar(Char::uppercase)
}

// Marcado com o relógio do TABLET, não do servidor: offline é o único relógio
// que existe, e o horário que a pessoa viu na tela precisa bater com o que ela
// lembra depois.
internal fun momentoDaCompra(agoraMs: Long): String =
    java.text.SimpleDateFormat("dd/MM 'às' HH:mm", java.util.Locale("pt", "BR"))
        .format(java.util.Date(agoraMs))

fun montarRecibo(
    products: List<ProductEntity>,
    cart: Map<Long, Int>,
    employee: EmployeeDto,
    naFila: Boolean,
    empresa: String? = null,
    agoraMs: Long = System.currentTimeMillis(),
): ReceiptData {
    val porId = products.associateBy(ProductEntity::id)
    val linhas = cart.mapNotNull { (id, quantidade) ->
        if (quantidade <= 0) return@mapNotNull null
        val produto = porId[id] ?: return@mapNotNull null
        ReceiptLine(
            productId = produto.id,
            name = produto.name,
            quantity = quantidade,
            unitPrice = produto.price,
            semEstoque = produto.stock <= 0,
        )
        // Ordena pelo nome SEM ACENTO: comparar as letras cruas jogava todo
        // "Água"/"Açaí" para o fim da lista, porque o código do caractere
        // acentuado é maior que o de qualquer letra simples.
    }.sortedBy { normalizarBusca(it.name) }

    return ReceiptData(
        nome = primeiroNome(employee.name),
        linhas = linhas,
        total = linhas.sumOf(ReceiptLine::subtotal),
        saldoAntes = employee.available,
        naFila = naFila,
        empresa = empresa,
        momento = momentoDaCompra(agoraMs),
    )
}
