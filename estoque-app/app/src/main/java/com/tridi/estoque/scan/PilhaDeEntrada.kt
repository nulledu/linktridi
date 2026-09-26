package com.tridi.estoque.scan

// ── A pilha da ENTRADA por bipagem ───────────────────────────────────────────
//
// A saída empilha ETIQUETAS: cada código é uma peça (ou uma caixa) única, e
// bipar duas vezes o mesmo é engano. A entrada é o CONTRÁRIO: vinte almofadas
// chegam com o MESMO código (a etiqueta de produto é o SKU cru), então bipar
// repetido é o gesto normal — cada bipe SOMA uma peça na linha.
//
// Kotlin puro, sem Android: é a mesma regra da tela da web
// (EntradaPorLeitura.tsx), e ela se confere em teste de milissegundos.

/** Uma linha da pilha: o código lido e quantas peças ele acumulou. */
data class LinhaDeEntrada(
    val codigo: String,
    val quantidade: Int,
)

/**
 * Teto de LINHAS na pilha. Igual ao espírito do teto da saída: uma pilha que
 * não cabe na tela é uma pilha que ninguém confere antes de confirmar. As
 * peças por linha não têm teto próprio aqui — o servidor tem o dele
 * (MAX_POR_AJUSTE) e recusa com frase.
 */
const val TETO_DE_LINHAS_DA_ENTRADA = 60

sealed interface EntradaResultado {
    data class Aceita(val pilha: List<LinhaDeEntrada>) : EntradaResultado
    data object Cheia : EntradaResultado
}

/**
 * Um bipe: código repetido soma na linha que já existe; código novo abre linha
 * no fim. A ordem é a da chegada — é como a pessoa confere contra o monte que
 * está na bancada.
 */
fun somarLeitura(pilha: List<LinhaDeEntrada>, codigo: String): EntradaResultado {
    val cru = codigo.trim()
    val existente = pilha.indexOfFirst { it.codigo.equals(cru, ignoreCase = true) }
    if (existente >= 0) {
        val nova = pilha.toMutableList()
        nova[existente] = nova[existente].copy(quantidade = nova[existente].quantidade + 1)
        return EntradaResultado.Aceita(nova)
    }
    if (pilha.size >= TETO_DE_LINHAS_DA_ENTRADA) return EntradaResultado.Cheia
    return EntradaResultado.Aceita(pilha + LinhaDeEntrada(cru, 1))
}

/** Tira UMA peça da linha; a linha com uma só sai inteira. */
fun tirarUma(pilha: List<LinhaDeEntrada>, codigo: String): List<LinhaDeEntrada> =
    pilha.mapNotNull { linha ->
        when {
            !linha.codigo.equals(codigo, ignoreCase = true) -> linha
            linha.quantidade <= 1 -> null
            else -> linha.copy(quantidade = linha.quantidade - 1)
        }
    }

/** Remove a linha inteira, seja lá quantas peças ela tenha. */
fun removerLinha(pilha: List<LinhaDeEntrada>, codigo: String): List<LinhaDeEntrada> =
    pilha.filterNot { it.codigo.equals(codigo, ignoreCase = true) }

fun totalDePecas(pilha: List<LinhaDeEntrada>): Int = pilha.sumOf { it.quantidade }

/** "3 peças de 2 itens" / "1 peça" — a frase do botão e do selo. */
fun fraseDaEntrada(pilha: List<LinhaDeEntrada>): String {
    val pecas = totalDePecas(pilha)
    val p = if (pecas == 1) "1 peça" else "$pecas peças"
    return if (pilha.size <= 1) p else "$p de ${pilha.size} itens"
}

// ── Os motivos da entrada ────────────────────────────────────────────────────
//
// ESPELHO de MOTIVOS_DE_ENTRADA em lib/estoque-entrada.ts — as chaves têm que
// bater uma a uma, senão o servidor recusa a fila inteira com "motivo
// inválido" horas depois do bipe, quando ninguém mais está com as peças na
// mão. A trava é o teste (PilhaDeEntradaTest).
//
// Fixos no app, e não descidos pelo bootstrap como os da baixa: os da baixa
// são cadastráveis pelo escritório; estes três são o VOCABULÁRIO do custo
// (chegou = comprou, produzido = fez, encontrado = já era seu) e mudar um
// exige mudar o servidor junto.

data class MotivoDeEntrada(val key: String, val label: String)

val MOTIVOS_DE_ENTRADA: List<MotivoDeEntrada> = listOf(
    MotivoDeEntrada("chegou", "Chegou de fornecedor"),
    MotivoDeEntrada("produzido", "Produzido aqui"),
    MotivoDeEntrada("encontrado", "Encontrado na contagem"),
)
