package com.tridi.estoque.filas

// ── "Nada aqui" não diz se está funcionando ou quebrado ──────────────────────
//
// As três telas de trabalho do tablet são FILAS: a de Receber só tem linha
// depois que o setor de compras registra um pedido; a de Conferir, só depois
// que alguém conclui uma atividade de produção; a de Bipar, só depois que a
// pessoa aponta a pistola. No galpão de hoje as três estão vazias ao mesmo
// tempo — e quem liga o aparelho lê três "nada aqui" seguidos e conclui que o
// app está quebrado.
//
// A frase de uma fila vazia tem duas obrigações: dizer o que a tela É, e dizer
// o que faz aparecer coisa nela. "Nenhuma compra aguardando entrega" cumpre a
// primeira e falha na segunda, que é justamente a que a pessoa precisa.
//
// Kotlin puro: a decisão de QUAL frase mostrar depende de estado que vem de
// três lugares (rede, cache, resposta do servidor), e é ela que precisa estar
// certa. Confere-se na JVM, sem tablet — que é bom, porque o tablet do galpão
// está em lock task e ninguém consegue tocar na tela dele.

/**
 * @param alerta `true` pinta de âmbar: alguma coisa depende de gente pra
 *   destravar. Fila vazia por estar vazia NÃO é alerta — pintar de âmbar o
 *   estado normal é como o âmbar deixa de significar alguma coisa.
 */
data class FilaVazia(val titulo: String, val detalhe: String, val alerta: Boolean = false)

/**
 * A tela de Receber sem nenhuma entrega.
 *
 * A compra não nasce aqui: quem a cria é o setor de compras, no ERP. Sem dizer
 * isso, a pessoa fica esperando o caminhão aparecer sozinho na lista — ou pior,
 * conclui que a entrega que ela está vendo no pátio "não está no sistema" e vai
 * embora sem registrar nada.
 */
fun vazioDoRecebimento(): FilaVazia = FilaVazia(
    titulo = "Nenhuma entrega esperando",
    detalhe = "As compras aparecem aqui quando alguém as registra como " +
        "\"aguardando entrega\" no sistema. Chegou mercadoria que não está na " +
        "lista? Avise o setor de compras antes de guardar.",
)

/**
 * A tela de Conferir sem nenhuma caixa esperando.
 *
 * Três desfechos bem diferentes moram no mesmo "nada aqui", e só um deles é
 * normal:
 *
 *  - **`qcDesligado`** — o servidor respondeu que a conferência ainda não está
 *    instalada (a tabela `estoque_conferencias` não existe: falta rodar
 *    supabase/estoque_pendente_tudo.sql). A fila vem VAZIA de propósito, porque
 *    listar tudo e recusar toque a toque seria pior. Mas vazio sem explicação
 *    faz o gestor esperar um trabalho que nunca vai aparecer.
 *  - **`travadas`** — existem conferências GRAVADAS cujo estoque não entrou. O
 *    trabalho foi feito, as caixas estão prontas, e o número do estoque está
 *    errado agora. É o único caso que pede alguém no ERP.
 *  - **vazio de verdade** — ninguém terminou atividade ainda. Normal, e a
 *    frase diz o que faz aparecer coisa aqui.
 */
/**
 * @param anteriores caixas concluídas ANTES da janela da fila — o servidor
 *   conta e manda (`anteriores`), e o tablet ignorava. "Nada esperando
 *   conferência" com 83 caixas paradas atrás de sete dias é a frase que faz o
 *   gestor fechar o tablet e ir embora; as caixas continuam lá, o estoque
 *   continua menor que a prateleira, e ninguém procura o que a tela disse que
 *   não existe.
 * @param dias o tamanho da janela, pra frase dizer QUAL corte escondeu as
 *   caixas em vez de um "algumas ficaram de fora" que não se resolve.
 */
fun vazioDaConferencia(
    carregando: Boolean,
    qcDesligado: Boolean,
    travadas: Int,
    anteriores: Int = 0,
    dias: Int = 0,
): FilaVazia = when {
    carregando -> FilaVazia("Buscando o que ficou pronto…", "")
    qcDesligado -> FilaVazia(
        titulo = "A conferência ainda não foi ligada no sistema",
        detalhe = "Falta um passo de instalação no servidor — não é problema " +
            "deste tablet. Avise a administração; até lá ninguém consegue " +
            "aprovar caixa por aqui, nem por este aparelho nem pelo computador.",
        alerta = true,
    )
    travadas > 0 -> FilaVazia(
        titulo = "Nada esperando conferência",
        detalhe = "Mas ${conferencias(travadas)} já aprovada" +
            (if (travadas == 1) "" else "s") +
            " não entrou no estoque. Avise a administração: o número do " +
            "sistema está menor que a prateleira.",
        alerta = true,
    )
    // Vem DEPOIS de `travadas` de propósito: caixa aprovada cujo estoque não
    // entrou é número errado circulando agora; caixa velha esperando é trabalho
    // parado. As duas importam, e a primeira é mais urgente.
    anteriores > 0 -> FilaVazia(
        titulo = "Nada dos últimos ${if (dias > 0) "$dias dias" else "dias"}",
        detalhe = "Mas ${conferencias(anteriores)} de antes disso continua" +
            (if (anteriores == 1) "" else "m") +
            " esperando — e as peças delas não estão no estoque enquanto " +
            "ninguém aprovar. A fila mais antiga se abre no computador, em " +
            "Estoque › Conferir.",
        alerta = true,
    )
    else -> FilaVazia(
        titulo = "Nada esperando conferência",
        detalhe = "As caixas aparecem aqui quando alguém conclui uma atividade " +
            "de produção. Concluir NÃO põe as peças no estoque — quem põe é a " +
            "aprovação daqui.",
    )
}

private fun conferencias(n: Int) = if (n == 1) "1 conferência" else "$n conferências"
