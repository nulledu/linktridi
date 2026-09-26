package com.tridi.market.kiosk

// A porta de serviço do totem: a sequência que abre o pareamento do leitor.
//
//     0  0  ⌫  ⌫  0  0  ⌫  ⌫
//
// Digitada no teclado da tela de código, que já existe. Escolhida porque NÃO
// COLIDE com uso real: o código do funcionário tem 6 dígitos e é enviado
// sozinho ao completar o sexto, e esta sequência nunca deixa mais de 2 dígitos
// no campo. Ninguém entra aqui tentando fazer login.
//
// Sem Android de propósito — é a mesma escolha de LeitorExterno: o que decide
// fica testável em JVM, e a Activity só entrega eventos.

/** O que o teclado produz, do ponto de vista da sequência. */
enum class ToqueSecreto { ZERO, APAGAR, OUTRO }

/**
 * Silêncio que zera o progresso. Sem isto a sequência ficaria armada pra
 * sempre: quem digitasse dois zeros hoje e apagasse amanhã abriria a porta sem
 * querer.
 */
const val MS_PARA_ESQUECER = 5_000L

private val PASSOS = listOf(
    ToqueSecreto.ZERO, ToqueSecreto.ZERO, ToqueSecreto.APAGAR, ToqueSecreto.APAGAR,
    ToqueSecreto.ZERO, ToqueSecreto.ZERO, ToqueSecreto.APAGAR, ToqueSecreto.APAGAR,
)

/** `posicao` = quantos passos já casaram. Nunca é mostrada na tela: progresso
 *  visível transforma segredo em brincadeira coletiva. */
data class SequenciaSecreta(val posicao: Int = 0, val ultimoToqueMs: Long = 0L) {

    /** @return o estado seguinte e se a porta abriu NESTE toque. */
    fun toque(toque: ToqueSecreto, agoraMs: Long): Resultado {
        // Demorou demais: o que veio antes não era a sequência.
        val base = if (posicao > 0 && agoraMs - ultimoToqueMs > MS_PARA_ESQUECER) 0 else posicao

        if (toque != PASSOS[base]) {
            // Recomeço no mesmo toque: um zero errado no meio ainda pode ser o
            // PRIMEIRO zero de uma tentativa nova. Sem isto a pessoa teria que
            // esperar o tempo de esquecimento pra tentar de novo.
            val recomecou = toque == PASSOS[0]
            return Resultado(SequenciaSecreta(if (recomecou) 1 else 0, agoraMs), abriu = false)
        }

        val proxima = base + 1
        if (proxima == PASSOS.size) return Resultado(SequenciaSecreta(0, agoraMs), abriu = true)
        return Resultado(SequenciaSecreta(proxima, agoraMs), abriu = false)
    }

    data class Resultado(val estado: SequenciaSecreta, val abriu: Boolean)
}
