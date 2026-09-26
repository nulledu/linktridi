package com.tridi.estoque.scan

// Espelha `partirCodigo` de lib/estoque-unidades.ts: uma etiqueta de unidade é
// `<SKU>-<sequencial de 6 dígitos>`, ex.: "MDF6MM-BR-18-000042". O PRÓPRIO SKU
// tem hífen, então a quebra é pelo ÚLTIMO hífen — nunca o primeiro, senão o
// SKU quebraria ao meio.
data class UnidadeCodigo(val sku: String, val sequencia: Int)

/**
 * Desfaz o formato de uma etiqueta de unidade. `null` — nunca lança — quando:
 *  - não há hífen nenhum;
 *  - o hífen é a primeira posição (sem SKU antes dele);
 *  - o que vem depois do último hífen não é só dígitos (o "grupo numérico no
 *    fim" que a tela de bipagem exige pra aceitar a leitura).
 */
fun partirCodigoUnidade(codigo: String): UnidadeCodigo? {
    val idx = codigo.lastIndexOf('-')
    if (idx <= 0) return null
    val seqTexto = codigo.substring(idx + 1)
    if (seqTexto.isEmpty() || !seqTexto.all(Char::isDigit)) return null
    val sequencia = seqTexto.toIntOrNull() ?: return null
    return UnidadeCodigo(codigo.substring(0, idx), sequencia)
}
