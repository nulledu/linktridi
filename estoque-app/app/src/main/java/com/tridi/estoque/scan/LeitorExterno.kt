package com.tridi.estoque.scan

// Leitor de código de barras USB/Bluetooth — sem Android, para ser testável.
//
// Como esses aparelhos funcionam: o scanner se apresenta como TECLADO (HID).
// Ao ler um código ele "digita" os caracteres e, quase sempre, um Enter no fim.
// Por isso não precisa de driver, de permissão de USB nem de emparelhamento
// especial: basta plugar. É também por isso que ele resolve os casos que a
// câmera não resolve — laser lê através de gotícula de condensação, de
// superfície prateada e de curvatura de lata, e não depende de foco.
//
// O trabalho aqui é separar uma leitura de scanner do resto. Duas coisas
// distinguem:
//  • VELOCIDADE — o scanner despeja o código inteiro em poucos milissegundos;
//    dedo humano não chega perto disso. Uma pausa longa no meio quer dizer que
//    aquilo não era uma leitura, e o que estava acumulado é descartado.
//  • FIM — Enter (ou Tab) fecha o código. Modelos configurados sem sufixo não
//    mandam nada: para esses, `expirar` fecha sozinho depois de um instante de
//    silêncio.

/** Pausa acima disso quebra a rajada: o que veio antes não era do scanner. */
const val MS_ENTRE_TECLAS = 300L

/** Silêncio depois do último caractere que fecha um código sem sufixo. */
const val MS_PARA_FECHAR_SEM_ENTER = 140L

/** Código de barras mais curto em uso (EAN-8 tem 8). Abaixo disso é tecla solta. */
const val MINIMO_DE_CARACTERES = 4

/** Teto de segurança: teclado preso apertado não pode crescer sem limite. */
const val MAXIMO_DE_CARACTERES = 64

data class LeitorExternoState(val buffer: String = "", val ultimaTeclaMs: Long = 0L)

sealed interface TeclaResultado {
    /** Código completo, pronto para virar item. */
    data class Codigo(val codigo: String) : TeclaResultado
    /** Faz parte de uma leitura em andamento. */
    data object Acumulando : TeclaResultado
    /** Não interessa ao leitor — a tecla deve seguir seu caminho normal. */
    data object Ignorado : TeclaResultado
}

data class TeclaTransicao(val estado: LeitorExternoState, val resultado: TeclaResultado)

/**
 * @param caractere o que a tecla escreve, ou `null` se ela não escreve nada.
 * @param fim a tecla encerra o código (Enter/Tab).
 */
fun reduzirTecla(
    estado: LeitorExternoState,
    caractere: Char?,
    fim: Boolean,
    agoraMs: Long,
    janelaMs: Long = MS_ENTRE_TECLAS,
): TeclaTransicao {
    // Rajada quebrada: o que estava acumulado não era uma leitura de scanner.
    val base = if (estado.buffer.isNotEmpty() && agoraMs - estado.ultimaTeclaMs > janelaMs) {
        LeitorExternoState()
    } else {
        estado
    }

    if (fim) {
        val codigo = base.buffer
        return if (codigo.length >= MINIMO_DE_CARACTERES) {
            TeclaTransicao(LeitorExternoState(), TeclaResultado.Codigo(codigo))
        } else {
            // Enter sozinho (ou lixo curto) não vira nada — mas some, para não
            // contaminar a próxima leitura.
            TeclaTransicao(LeitorExternoState(), TeclaResultado.Ignorado)
        }
    }

    if (caractere == null || !aceitavel(caractere)) {
        return TeclaTransicao(base, TeclaResultado.Ignorado)
    }
    if (base.buffer.length >= MAXIMO_DE_CARACTERES) {
        return TeclaTransicao(LeitorExternoState(), TeclaResultado.Ignorado)
    }
    return TeclaTransicao(
        LeitorExternoState(base.buffer + caractere, agoraMs),
        TeclaResultado.Acumulando,
    )
}

/**
 * Fecha um código quando o scanner não manda Enter. Chamado por um temporizador
 * depois de cada tecla; só dispara se houve silêncio suficiente.
 */
fun expirar(
    estado: LeitorExternoState,
    agoraMs: Long,
    esperaMs: Long = MS_PARA_FECHAR_SEM_ENTER,
): TeclaTransicao {
    val pronto = estado.buffer.length >= MINIMO_DE_CARACTERES &&
        agoraMs - estado.ultimaTeclaMs >= esperaMs
    return if (pronto) {
        TeclaTransicao(LeitorExternoState(), TeclaResultado.Codigo(estado.buffer))
    } else {
        TeclaTransicao(estado, TeclaResultado.Ignorado)
    }
}

// Código de barras é alfanumérico (Code 128 carrega letra e traço). Espaço e
// acento não aparecem — e aceitar tudo faria qualquer teclado virar leitor.
private fun aceitavel(c: Char): Boolean =
    c.isDigit() || (c in 'A'..'Z') || (c in 'a'..'z') || c == '-' || c == '.' || c == '_'
