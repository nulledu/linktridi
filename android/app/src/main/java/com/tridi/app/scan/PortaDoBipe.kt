package com.tridi.app.scan

// A porta: com o bipe exigido, o que a tela pode oferecer agora.
//
// Isto é uma função pura e não um `if` dentro do Compose porque as duas regras
// que ela carrega são as que não podem quebrar em silêncio, e um `if` no meio
// de 90 linhas de layout quebra em silêncio:
//
//   1. Com a exigência LIGADA, ninguém começa sem ter bipado alguma coisa OU
//      ter dito por que não deu. Se isto afrouxar, a exigência não existe mais
//      e nada avisa — o galpão só descobre meses depois, quando o histórico
//      estiver metade vazio.
//
//   2. A SAÍDA existe sempre que a exigência está ligada. Se isto afrouxar,
//      alguém fica parado na bancada com uma etiqueta descolada na mão, sem
//      poder trabalhar, e o único caminho é chamar o gerente. Foi a condição
//      explícita do pedido: tem que haver saída.
//
// As duas puxam em direções opostas de propósito. É por isso que elas moram na
// mesma função, e não em dois lugares que podem divergir.

/** O que a tela oferece agora, com o bipe exigido. */
data class PortaDoBipe(
    /** O botão principal libera o trabalho? */
    val podeComecar: Boolean,
    /** A tela está esperando uma leitura do leitor? */
    val esperandoBipe: Boolean,
    /** "Não deu pra bipar" aparece? */
    val temSaida: Boolean,
)

/**
 * @param exigeBipe o interruptor do escritório (estoque_config.bipe_para_iniciar).
 * @param reconheceu a pessoa já tocou "Vou pegar o material" (ou já bipou) —
 *        é o toque que cala o alarme e troca a tela pra espera do leitor.
 * @param bipados quantas etiquetas já entraram na lista.
 */
fun portaDoBipe(exigeBipe: Boolean, reconheceu: Boolean, bipados: Int): PortaDoBipe {
    // Exigência desligada: o app de sempre — um botão, "Aceitar", e nada de
    // bipe. É o estado em que o galpão está hoje, e o padrão do banco.
    if (!exigeBipe) return PortaDoBipe(podeComecar = true, esperandoBipe = false, temSaida = false)

    val temEtiqueta = bipados > 0
    return PortaDoBipe(
        // Regra 1: só com etiqueta na lista. Sem etiqueta o caminho é a saída,
        // que passa por escolher um motivo — nunca este botão.
        podeComecar = temEtiqueta,
        esperandoBipe = reconheceu || temEtiqueta,
        // Regra 2: a saída existe enquanto ninguém bipou nada. Depois da
        // primeira etiqueta ela some porque deixou de fazer sentido — o bipe
        // funcionou, e "não deu pra bipar" ali só serviria pra pular o registro
        // do que já está na mão.
        temSaida = !temEtiqueta,
    )
}
