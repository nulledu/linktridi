package com.tridi.estoque.sync

// Reduz o resultado de UMA tentativa de sincronizar um item da fila offline
// (baixa ou recebimento) — puro, sem Room nem OkHttp, pra testar sem Android.
//
// O `operationId` NUNCA é regenerado aqui: ele nasce uma vez no enfileiramento
// (EstoqueRepository.enfileirar*) e é exatamente o que faz o servidor tratar
// um reenvio como o MESMO pedido em vez de duplicar a baixa/recebimento.

sealed interface DesfechoEnvio {
    data object Sucesso : DesfechoEnvio

    /** Sem rede, 401 (token), 429 (freio do servidor) ou 5xx — vale tentar de novo mais tarde. */
    data class FalhaTransitoria(val motivo: String) : DesfechoEnvio

    /**
     * 4xx que NÃO é de autenticação: o servidor recusou o CONTEÚDO do que foi
     * mandado (código desconhecido, dados inválidos). Reenviar não muda o
     * resultado — o worker para de insistir.
     */
    data class FalhaDeConteudo(val motivo: String) : DesfechoEnvio
}

data class ItemDaFila(
    val operationId: String,
    val tentativas: Int = 0,
    val falhouDefinitivo: Boolean = false,
    val ultimoErro: String? = null,
)

sealed interface AcaoDaFila {
    /** Sucesso: a linha some da fila. */
    data object Remover : AcaoDaFila

    /** Continua na fila — pra tentar de novo, ou só registrada como falha definitiva. */
    data class Manter(val item: ItemDaFila) : AcaoDaFila
}

fun reduzirEnvio(item: ItemDaFila, desfecho: DesfechoEnvio): AcaoDaFila = when (desfecho) {
    is DesfechoEnvio.Sucesso -> AcaoDaFila.Remover
    is DesfechoEnvio.FalhaTransitoria ->
        AcaoDaFila.Manter(item.copy(tentativas = item.tentativas + 1, ultimoErro = desfecho.motivo))
    is DesfechoEnvio.FalhaDeConteudo ->
        AcaoDaFila.Manter(item.copy(tentativas = item.tentativas + 1, falhouDefinitivo = true, ultimoErro = desfecho.motivo))
}

/**
 * Classifica um status HTTP (de `EstoqueApiException.statusCode`) no desfecho
 * que `reduzirEnvio` entende. `0` é a convenção de EstoqueApi para "não chegou
 * no servidor" — sem rede. `401` é tratado como transitório (não como
 * conteúdo recusado): o token pode voltar a valer, e não é isso que o pedido
 * em si tem de errado.
 */
fun classificarFalha(statusCode: Int, mensagem: String?): DesfechoEnvio = when {
    statusCode == 0 -> DesfechoEnvio.FalhaTransitoria(mensagem ?: "sem_conexao")
    statusCode == 401 -> DesfechoEnvio.FalhaTransitoria(mensagem ?: "nao_autenticado")
    // 429 = freio do servidor (rate limit): é "tente de novo mais tarde", NUNCA
    // conteúdo recusado. Sem este ramo ele cairia no 400..499 abaixo, a baixa/
    // recebimento/conferência seria marcada como falha DEFINITIVA e SUMIRIA da
    // fila — perda silenciosa de movimento de estoque. Tem que ser transitória.
    statusCode == 429 -> DesfechoEnvio.FalhaTransitoria(mensagem ?: "muitas_requisicoes")
    statusCode in 400..499 -> DesfechoEnvio.FalhaDeConteudo(mensagem ?: "http_$statusCode")
    else -> DesfechoEnvio.FalhaTransitoria(mensagem ?: "http_$statusCode")
}
