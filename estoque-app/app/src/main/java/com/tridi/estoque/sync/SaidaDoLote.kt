package com.tridi.estoque.sync

import com.tridi.estoque.net.ItemDaSaidaDto

// ── "O que acabou de sair?" ──────────────────────────────────────────────────
//
// A tela de Bipar dizia "Última baixa: 8 de 8 confirmadas" e mais nada. Oito o
// quê? A pessoa que acabou de tirar oito caixas da prateleira não tem como
// conferir NADA nessa frase: não sabe se o sistema entendeu que eram caixas de
// 50, não sabe se era o item certo, e não sabe com quanto o estoque ficou. Bipar
// virou um gesto de fé — e o dia em que a conta estivesse errada só apareceria
// no inventário, meses depois.
//
// Isto aqui é a régua pura que transforma o que o servidor devolveu na frase que
// ela lê. Sem Compose e sem Room, porque a parte que pode estar errada é a
// aritmética, não o pixel.

/**
 * O tipo da linha de `sync_feedback` que guarda o resumo POR ITEM.
 *
 * Tipo próprio, ao lado de "baixa", e não uma coluna a mais na mesma linha: o
 * formato é outro, e `lotesDe` descarta em silêncio o que não decodifica. Se as
 * duas listas dividissem o mesmo tipo, um tablet lendo o feedback gravado pela
 * versão anterior perderia TAMBÉM a lista de códigos que não baixaram — que é a
 * única coisa nesta tela que ainda exige ação de alguém.
 *
 * Nenhuma migração: `tipo` é coluna de texto que já existe (mesmo caminho do
 * TIPO_AVISO_DE_PREPARO).
 */
const val TIPO_SAIDA_POR_ITEM: String = "baixa_itens"

/** Uma linha do resumo: "Chapa MDF 6 mm — 400 peças · restam 320 un". */
data class LinhaDaSaida(val item: String, val pecas: Int, val saldo: Double, val unidade: String)

/**
 * Junta o resumo de VÁRIOS lotes que subiram no mesmo ciclo.
 *
 * Aqui NÃO se deduplica, ao contrário de `juntarFeedback`: dois lotes do mesmo
 * item são duas saídas de verdade, e ficar com uma só esconderia metade do
 * material que deixou a prateleira. Peça soma.
 *
 * O SALDO, esse sim, é o do lote mais RECENTE — ele é um retrato, não uma
 * parcela. Somar saldo daria um número que não existe em lugar nenhum; ficar com
 * o primeiro mostraria o estoque de antes da segunda baixa. Os lotes chegam do
 * mais velho pro mais novo (`lotesDe` já inverte), então o último vence.
 *
 * Item sem nome é descartado: uma linha "— 50 peças" se lê como item apagado.
 */
fun somarSaidaPorItem(lotes: List<List<ItemDaSaidaDto>>, teto: Int = TETO_DE_FEEDBACK): List<LinhaDaSaida> {
    if (teto <= 0) return emptyList()
    // LinkedHashMap: a ordem é a da primeira aparição, que é a ordem em que a
    // pessoa bipou — a que ela reconhece ao conferir.
    val porItem = LinkedHashMap<String, LinhaDaSaida>()
    for (lote in lotes) {
        for (dto in lote) {
            val nome = dto.item.trim()
            if (nome.isEmpty()) continue
            val pecas = if (dto.pecas > 0) dto.pecas else 0
            val anterior = porItem[nome]
            if (anterior == null) {
                if (porItem.size >= teto) continue
                porItem[nome] = LinhaDaSaida(nome, pecas, saldoLimpo(dto.saldo), unidadeLimpa(dto.unidade))
            } else {
                porItem[nome] = anterior.copy(
                    pecas = anterior.pecas + pecas,
                    saldo = saldoLimpo(dto.saldo),
                    unidade = unidadeLimpa(dto.unidade),
                )
            }
        }
    }
    return porItem.values.toList()
}

private fun saldoLimpo(saldo: Double): Double =
    if (saldo.isNaN() || saldo.isInfinite() || saldo < 0) 0.0 else saldo

private fun unidadeLimpa(unidade: String): String = unidade.trim().ifEmpty { "un" }

/**
 * "1 peça" / "400 peças" — PEÇA, não etiqueta.
 *
 * É a contrapartida de `fraseDeEtiquetas`, e a diferença entre as duas é o
 * assunto todo desta tela: ANTES de confirmar o tablet só conhece etiquetas (o
 * tamanho da caixa mora no servidor), DEPOIS de subir ele conhece as peças,
 * porque o servidor respondeu quantas eram.
 */
fun frasePecas(quantas: Int): String = if (quantas == 1) "1 peça" else "$quantas peças"

/** "restam 320 un" — o saldo sem unidade não quer dizer nada na prateleira. */
fun fraseDeSaldo(linha: LinhaDaSaida): String = "restam ${numeroCurto(linha.saldo)} ${linha.unidade}"

/** A linha inteira: "400 peças · restam 320 un". */
fun fraseDaSaida(linha: LinhaDaSaida): String = "${frasePecas(linha.pecas)} · ${fraseDeSaldo(linha)}"

/**
 * Número do jeito que se lê no galpão: sem casa decimal quando é inteiro, com
 * vírgula quando não é.
 *
 * "320,0 un" faz quem está de luva parar pra interpretar; "12,5 L" é o que está
 * escrito no balde. Sem `String.format`: o Locale do tablet decide o separador,
 * e um aparelho configurado em inglês escreveria "12.5" no meio de uma tela toda
 * em português.
 */
fun numeroCurto(valor: Double): String {
    if (valor.isNaN() || valor.isInfinite()) return "0"
    val arredondado = Math.round(valor * 100.0) / 100.0
    if (arredondado == Math.floor(arredondado) && Math.abs(arredondado) < Long.MAX_VALUE.toDouble()) {
        return arredondado.toLong().toString()
    }
    return arredondado.toString().trimEnd('0').trimEnd('.').replace('.', ',')
}

/**
 * O total do lote, pra linha de cima do balão: "450 peças em 2 itens".
 *
 * Existe porque o número que a pessoa conferia até agora era o de ETIQUETAS
 * confirmadas, e ele é o único número desta tela que não corresponde a nada que
 * ela contou com a mão.
 */
fun totalDaSaida(linhas: List<LinhaDaSaida>): Int = linhas.sumOf { it.pecas }
