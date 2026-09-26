package com.tridi.tv.core.network

/**
 * O resultado de uma leitura, com a PROCEDÊNCIA junto.
 *
 * Existe porque devolver só o dado apaga a diferença entre "isto acabou de vir do
 * servidor" e "isto é o que estava salvo no aparelho desde ontem". Numa TV isso
 * importa mais do que numa tela de computador: ninguém está ali para desconfiar
 * do número, e um faturamento de ontem exibido como se fosse de agora é pior do
 * que tela vazia — a decisão que alguém toma olhando para ele é errada.
 *
 * `em` é o instante em que ESTE dado veio da rede. Num acerto de cache, é o
 * instante da leitura boa lá atrás, não o de agora.
 */
data class Leitura<T>(
    val dado: T,
    val daRede: Boolean,
    val em: Long,
) {
    /** Há quanto tempo este número é verdade, em milissegundos. */
    fun idadeMs(agora: Long = System.currentTimeMillis()): Long = agora - em

    companion object {
        fun <T> daRede(dado: T, agora: Long = System.currentTimeMillis()) =
            Leitura(dado, daRede = true, em = agora)

        fun <T> doCache(dado: T, em: Long) =
            Leitura(dado, daRede = false, em = em)
    }
}
