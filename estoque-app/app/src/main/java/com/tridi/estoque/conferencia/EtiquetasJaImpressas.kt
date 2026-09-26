package com.tridi.estoque.conferencia

/**
 * Etiqueta que já saiu no papel NÃO sai de novo.
 *
 * O aviso verde da conferência junta as caixas que entraram no estoque e fica na
 * tela até alguém dispensar — de propósito, porque o gestor confere longe da
 * impressora e o aviso é o registro do que passou. Só que o botão de imprimir
 * mandava a lista INTEIRA. Confere a primeira caixa, imprime, cola. Confere a
 * segunda: o aviso agora diz "2 caixas" e o botão "Imprimir etiquetas (2)" —
 * saem duas tiras, a nova e a que já está colada na primeira caixa.
 *
 * Duas caixas físicas com o mesmo código é o pior estrago que este app pode
 * fazer: bipar uma delas dá baixa na outra, e não há como descobrir qual, nem
 * depois. A caixa continua na prateleira com o ERP jurando que saiu.
 *
 * Guardar o que JÁ SAIU (e não apagar o aviso) preserva as duas coisas: o
 * registro continua na tela, e o papel não repete. A lista é limitada porque ela
 * mora no disco de um tablet e o galpão imprime todo dia — o que importa é o
 * passado recente, que é onde a reimpressão acidental acontece.
 */

/** Quantos códigos o tablet lembra de ter impresso. Ver o comentário acima. */
const val TETO_DE_IMPRESSAS = 400

/**
 * O que ainda não foi impresso, na ordem em que chegou.
 *
 * Comparação exata e sem normalizar: o código da etiqueta nasce do servidor e é
 * usado byte a byte pelo Code128. "Arrumar" a caixa aqui abriria a porta pra
 * duas grafias do mesmo código serem tratadas como coisas diferentes — que é
 * exatamente o defeito que esta função existe pra impedir.
 */
fun <T> pendentesDeImpressao(todas: List<T>, jaImpressas: Set<String>, codigo: (T) -> String): List<T> =
    todas.filter { codigo(it) !in jaImpressas }

/**
 * A lista nova de impressas, com as que acabaram de sair.
 *
 * Mantém a ORDEM de chegada e corta pelo começo (o mais antigo sai primeiro):
 * um tablet que imprime 50 caixas por dia esquece a semana passada, e é isso
 * que se quer — reimprimir uma etiqueta de duas semanas atrás é decisão
 * consciente de alguém, não um toque acidental na tela.
 */
fun comAsImpressas(antes: List<String>, saidas: List<String>): List<String> {
    if (saidas.isEmpty()) return antes
    val vistos = LinkedHashSet(antes)
    vistos.addAll(saidas)
    return if (vistos.size <= TETO_DE_IMPRESSAS) vistos.toList()
    else vistos.toList().takeLast(TETO_DE_IMPRESSAS)
}

/**
 * A frase do botão. Ela precisa dizer QUANTAS vão sair AGORA, não quantas o
 * aviso mostra — senão o gestor conta as tiras na mão e conclui que a impressora
 * comeu papel.
 */
fun fraseDoBotaoDeImprimir(pendentes: Int, total: Int): String = when {
    pendentes == 0 && total > 0 -> "Todas já impressas"
    pendentes == 1 && total == 1 -> "Imprimir a etiqueta"
    pendentes == total -> "Imprimir etiquetas ($pendentes)"
    pendentes == 1 -> "Imprimir a etiqueta nova (1 de $total)"
    else -> "Imprimir as $pendentes novas (de $total)"
}
