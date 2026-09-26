package com.tridi.app.fila

import kotlin.random.Random

/**
 * Em que ordem o tablet oferece a próxima ordem do pool a quem está livre.
 *
 * Antes era a ordem da LISTA — alfabética, porque o servidor devolve as
 * pessoas por nome — e o tablet parava no primeiro que o servidor aceitasse.
 * Resultado: com duas pessoas livres, quem vinha antes no alfabeto recebia
 * tudo o dia inteiro, e o colega ficava parado do lado.
 *
 * Agora: quem CONCLUIU MENOS hoje vem primeiro — quem ainda não fez nenhuma
 * tem a vez. Entre empatados, sorteio. O servidor continua decidindo quem
 * PODE pegar cada ordem (faixa, habilidade, bancada); isto só decide a vez
 * entre quem pode.
 *
 * `sortedBy` é estável: o embaralhado sobrevive dentro de cada empate, e é
 * isso que faz o empate ser sorteio de verdade e não o nome de novo.
 */
fun ordemDeQuemRecebe(
    livres: List<String>,
    concluidasHoje: Map<String, Int>,
    sorteio: Random = Random.Default,
): List<String> = livres.shuffled(sorteio).sortedBy { concluidasHoje[it] ?: 0 }
