package com.tridi.tv.panel.administracao.data

import java.util.Calendar
import java.util.TimeZone

/**
 * Quais avisos valem AGORA nesta parede — o port fiel de `avisosValidos`
 * (`lib/painel-avisos.ts`).
 *
 * A conta precisa ser a MESMA em três lugares: a prévia do editor, o painel web
 * e este aplicativo. Um aviso que a prévia mostra e a parede não (ou o
 * contrário) faz quem escreveu duvidar do sistema inteiro na primeira vez.
 */
fun avisosValidos(
    avisos: List<AvisoPainel>,
    perfilId: String?,
    hojeISO: String = hojeEmSaoPaulo(),
): List<AvisoPainel> = avisos.filter { a ->
    when {
        !a.ativo -> false
        a.texto.isBlank() -> false
        // Datas em `YYYY-MM-DD` comparam como TEXTO, e é de propósito: a ordem
        // alfabética dessa forma é a ordem cronológica, sem fuso no caminho.
        !a.de.isNullOrBlank() && hojeISO < a.de -> false
        !a.ate.isNullOrBlank() && hojeISO > a.ate -> false
        a.perfis.isEmpty() -> true
        // Sem perfil escolhido não dá para saber se esta TV é a doca: só
        // passam os avisos que valem para todas as paredes.
        perfilId.isNullOrBlank() -> false
        else -> a.perfis.any { it.equals(perfilId, ignoreCase = true) }
    }
}

/**
 * O aviso que TOMA a tela, se houver. Só um: dois recados disputando a parede
 * inteira não seriam lidos nem um nem outro. Ganha o primeiro da lista, que é
 * a ordem que quem escreveu enxerga no editor.
 */
fun avisoQueAssume(validos: List<AvisoPainel>): AvisoPainel? = validos.firstOrNull { it.assumeTela }

/**
 * Hoje em SÃO PAULO, `YYYY-MM-DD`.
 *
 * O fuso é fixo de propósito: o relógio de uma TV box costuma vir errado de
 * fábrica, e o de fuso quase sempre vem em UTC — o que faria o aviso de hoje
 * sumir às 21h, quando lá já é amanhã.
 */
fun hojeEmSaoPaulo(): String {
    val c = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
    return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
}
