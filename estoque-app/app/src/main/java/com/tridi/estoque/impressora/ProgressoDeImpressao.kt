package com.tridi.estoque.impressora

// ── Um lote longo de etiquetas, contado em voz alta ──────────────────────────
//
// Cinquenta peças aprovadas são cinquenta tiras de papel, e cada uma leva um a
// dois segundos por Bluetooth: a impressão inteira passa de um minuto. Um
// botão que fica "Imprimindo…" por um minuto e meio é indistinguível de um
// botão travado — a pessoa aperta de novo, desliga a impressora, ou vai embora
// achando que falhou.
//
// Daí este arquivo, em Kotlin puro (sem Android, testável na JVM): o número
// que a tela mostra enquanto sai, e a frase que ela mostra no fim.

/** Quantas já saíram de quantas — e se alguém pediu pra parar. */
data class ProgressoImpressao(
    val enviadas: Int,
    val total: Int,
    val parando: Boolean = false,
) {
    val fracao: Float get() = if (total <= 0) 0f else (enviadas.toFloat() / total).coerceIn(0f, 1f)
}

/**
 * A frase do fim da impressão.
 *
 * A parte que importa é a segunda: **parar a impressão não desfaz a entrada no
 * estoque**. Quem aperta "Parar" está parando PAPEL — as peças foram admitidas
 * no instante em que a conferência foi confirmada, muito antes de a primeira
 * tira sair. Sem dizer isso, o gestor que parou por engano fica achando que
 * precisa conferir a caixa de novo, e conferir de novo é o caminho pra mesma
 * peça entrar duas vezes no estoque.
 */
fun frasePosImpressao(enviadas: Int, total: Int, parado: Boolean): String = when {
    parado -> "Impressão parada: $enviadas de ${plural(total)} saíram. " +
        "As peças continuam no estoque — parou o papel, não a entrada."
    total == 1 -> "1 etiqueta enviada para a impressora."
    else -> "$total etiquetas enviadas para a impressora."
}

/** O texto do contador enquanto o lote sai. */
fun fraseDoProgresso(progresso: ProgressoImpressao): String =
    if (progresso.parando) {
        "Parando… ${progresso.enviadas} de ${progresso.total}"
    } else {
        "Imprimindo ${progresso.enviadas} de ${progresso.total}"
    }

private fun plural(quantas: Int): String = if (quantas == 1) "1 etiqueta" else "$quantas etiquetas"
