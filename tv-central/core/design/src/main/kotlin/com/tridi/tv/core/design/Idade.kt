package com.tridi.tv.core.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay

/**
 * Relógio de tela: reemite a cada minuto para que "há 3 min" vire "há 4 min"
 * sozinho.
 *
 * É um TIMER VISUAL, não um poll: não busca nada, não escreve nada. É a exceção
 * legítima da regra de ritmo do projeto — a proibição é a intervalos que geram
 * requisição (ver CLAUDE.md).
 */
@Composable
fun relogioDeMinuto(): State<Long> {
    val agora = remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            agora.longValue = System.currentTimeMillis()
        }
    }
    return agora
}

/**
 * "agora mesmo", "há 4 min", "há 2 h".
 *
 * Por que existe: numa TV ninguém desconfia do número. Se a rede caiu às 9h e a
 * tela segue mostrando o faturamento das 9h às 15h, quem passa na frente lê como
 * se fosse de agora e decide com base nisso. O dado velho continua na tela — ele
 * é melhor que tela vazia — mas assinado com a idade.
 */
fun idadeCurta(idadeMs: Long): String {
    val min = idadeMs / 60_000
    return when {
        min < 2 -> "agora mesmo"
        min < 60 -> "há $min min"
        min < 48 * 60 -> "há ${min / 60} h"
        else -> "há ${min / (60 * 24)} dias"
    }
}

/** A partir de quando um número deixa de ser "o de agora" e passa a ser "velho". */
const val IDADE_SUSPEITA_MS = 5 * 60_000L

/**
 * O texto do aviso amarelo. Duas situações diferentes, dois textos:
 *
 * - a rede acabou de cair e o número ainda é recente → o problema é a CONEXÃO;
 * - o número envelheceu → o problema é o DADO.
 *
 * Sem essa distinção, o aviso saía como "⚠ dado de agora mesmo", que é uma
 * contradição: alarme e tranquilidade na mesma frase, e quem lê ignora os dois.
 */
fun avisoDeProcedencia(semRede: Boolean, idadeMs: Long?): String = when {
    idadeMs == null -> "último dado salvo"
    // O DIA VIROU e o número é do dia anterior. É a pior forma do dado velho,
    // porque a tela em volta continua dizendo "hoje": o cabeçalho traz a data
    // de hoje, o título diz "ATIVIDADES HOJE", e o número embaixo é de ontem.
    // Quem passa lê a soma de ontem como se fosse a de hoje — e "hoje" numa
    // parede de galpão é a única coisa que importa. Nenhuma quantidade de
    // "há 14 h" comunica isso: o que precisa ser dito é que o dia mudou.
    idadeMs >= UM_DIA_MS / 2 && idadeMs > IDADE_SUSPEITA_MS -> "números de ontem — o dia já virou"
    idadeMs > IDADE_SUSPEITA_MS -> "dado de ${idadeCurta(idadeMs)}"
    semRede -> "sem conexão com o servidor"
    else -> "dado de ${idadeCurta(idadeMs)}"
}

/**
 * Doze horas, não vinte e quatro.
 *
 * A régua não é "faz um dia": é "o expediente que estes números descrevem já
 * acabou". Uma leitura das 16h vista às 8h da manhã seguinte tem dezesseis
 * horas e é de ontem; uma das 8h vista às 17h tem nove e ainda é do mesmo dia.
 * Meio dia separa os dois casos sem precisar de fuso nem de calendário — que na
 * TV do galpão são justamente o que costuma estar errado.
 */
private const val UM_DIA_MS = 24 * 60 * 60_000L

@Composable
fun lembrarIdade(dadoDe: Long?): String? {
    val agora by relogioDeMinuto()
    if (dadoDe == null || dadoDe <= 0L) return null
    return idadeCurta(agora - dadoDe)
}
