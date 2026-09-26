package com.tridi.estoque.conferencia

import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Há quanto tempo a caixa está esperando.
 *
 * O cartão da fila mostrava rosto, nome, "19 de 30", categoria, "faltaram 11" e
 * "com foto" — e nada sobre QUANDO. O gestor não distinguia a caixa que ficou
 * pronta há duas horas da que está lá desde a sexta passada, então não sabia por
 * onde começar nem quando o trabalho estava atrasando. O dado sempre desceu
 * (`AtividadeConferenciaDto.concluidaEm`); só não era desenhado.
 *
 * A tela do computador já diz isso (`agoLabel`), e é a mesma leitura: o tempo
 * relativo é o que responde "isto é urgente?" sem obrigar ninguém a fazer conta
 * com data.
 *
 * `java.time` não existe no minSdk 24 deste app — daí `SimpleDateFormat`, o
 * mesmo caminho de `QuandoSaiu.kt`.
 */

private const val MINUTO = 60_000L
private const val HORA = 60 * MINUTO
private const val DIA = 24 * HORA

/**
 * Milissegundos de um carimbo ISO do servidor, ou `null` quando não dá pra ler.
 *
 * Tolerante de propósito: um formato inesperado devolve nulo e o cartão fica
 * como estava antes, sem a linha do tempo. Derrubar a fila de conferência por
 * causa de um caractere numa data seria trocar um incômodo por uma tela morta.
 */
fun instanteDoIso(iso: String?): Long? {
    val texto = iso?.trim().orEmpty()
    if (texto.length < 19) return null
    // Corta no segundo e força UTC: o servidor manda com offset ("+00:00" ou
    // "Z"), e as duas grafias quebram um parse rígido. O erro máximo dessa
    // simplificação é o fuso do aparelho, que a frase relativa absorve.
    val base = texto.substring(0, 19)
    return runCatching {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .parse(base)?.time
    }.getOrNull()
}

/**
 * "agora", "há 40 min", "há 3 h", "ontem", "há 5 dias", "há 3 semanas".
 *
 * Sem hora exata: quem está de pé na frente da caixa quer saber se ela é de hoje
 * ou da semana passada, não que horas eram. A data cheia mora no computador,
 * onde há espaço e alguém sentado pra ler.
 *
 * Futuro vira "agora" em vez de "há -2 h": relógio de tablet barato atrasa, e
 * um número negativo na tela é o tipo de coisa que faz a pessoa desconfiar do
 * resto do que está escrito ali.
 */
fun fraseDeQuandoFicouPronta(iso: String?, agoraMs: Long): String? {
    val quando = instanteDoIso(iso) ?: return null
    val delta = agoraMs - quando
    if (delta < 2 * MINUTO) return "agora"
    if (delta < HORA) return "há ${delta / MINUTO} min"
    if (delta < DIA) return "há ${delta / HORA} h"
    val dias = delta / DIA
    if (dias == 1L) return "ontem"
    if (dias < 7) return "há $dias dias"
    val semanas = dias / 7
    if (semanas == 1L) return "há 1 semana"
    if (semanas < 5) return "há $semanas semanas"
    val meses = dias / 30
    return if (meses <= 1L) "há 1 mês" else "há $meses meses"
}

/**
 * A caixa está esperando HÁ TEMPO DEMAIS?
 *
 * Uma semana é o corte, e não é arbitrário: é a janela da própria fila
 * (`DIAS_DA_FILA`). Caixa que passou dela vai sumir da lista do tablet na
 * virada, e é a última chance de alguém olhar antes que ela vire "acervo" que
 * só o computador abre.
 */
fun esperandoDemais(iso: String?, agoraMs: Long): Boolean {
    val quando = instanteDoIso(iso) ?: return false
    return agoraMs - quando >= 7 * DIA
}
