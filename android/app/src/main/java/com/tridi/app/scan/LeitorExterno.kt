package com.tridi.app.scan

// Leitor de código de barras USB/Bluetooth no TABLET DE ATIVIDADES — sem
// Android, pra ser testável na JVM.
//
// POR QUE HID E NÃO CÂMERA (a decisão, escrita aqui pra não se perder):
//
// O galpão já tem leitor pistola: o totem do estoque (com.tridi.estoque) opera
// com eles todo dia. Um leitor HID se apresenta como TECLADO — ao ler um código
// ele "digita" os caracteres e, quase sempre, um Enter no fim. Não precisa de
// driver, de permissão, de emparelhamento especial nem de UMA LINHA de
// dependência nova: basta plugar (ou parear por Bluetooth).
//
// A alternativa era ML Kit (o que o totem usa PARA A CÂMERA) ou ZXing. As duas
// custam ~10 MB no APK e um segundo caminho de câmera dentro de um app que já
// abre a câmera pra foto de conclusão. Este APK roda o dia inteiro na mão de 24
// pessoas, em tablets baratos: peso de APK e um segundo pipeline de câmera não
// são detalhe. E a câmera é justamente o caminho PIOR aqui — o material que
// interessa é chapa prateada, caixa curva e folha com condensação, que é onde a
// leitura por foco falha e o laser não.
//
// O preço da escolha é honesto: mesa sem leitor não bipa. Por isso duas coisas
// existem no app — o aviso de "leitor não conectado" (`TeclasDoLeitor.conectado`)
// e a saída registrada ("Não deu pra bipar" com motivo). Se um dia uma mesa
// precisar mesmo de câmera, o ponto de entrada é o mesmo (`codigoLido`), e só a
// origem do texto muda.
//
// O trabalho aqui é separar uma leitura de scanner do resto. Duas coisas
// distinguem:
//  • VELOCIDADE — o scanner despeja o código inteiro em poucos milissegundos;
//    dedo humano não chega perto. Pausa longa no meio quer dizer que aquilo não
//    era uma leitura, e o que estava acumulado é descartado.
//  • FIM — Enter (ou Tab) fecha o código. Modelos configurados sem sufixo não
//    mandam nada: pra esses, `expirar` fecha sozinho depois de um instante de
//    silêncio.
//
// É a mesma régua do totem do estoque (com.tridi.estoque.scan.LeitorExterno),
// copiada de propósito: são dois projetos Gradle independentes, sem módulo
// comum, e um "core" compartilhado entre eles hoje custaria mais do que rende.
// Se divergir, o teste de cada lado é que segura.

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
    /** Código completo, pronto pra entrar na lista do bipe. */
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
            // Enter sozinho (ou lixo curto) não vira nada — mas some, pra não
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

// ── A lista do bipe ──────────────────────────────────────────────────────────

/**
 * Acrescenta um código à lista de etiquetas do bipe, sem repetir.
 *
 * Repetir acontece o tempo todo: o gatilho do leitor é sensível e a pessoa
 * segura meio segundo a mais. Se a repetida entrasse na lista, ela subiria pro
 * servidor e voltaria `ja_baixada` — a pessoa leria "etiqueta já usada" no meio
 * de um bipe que deu certo e concluiria que o sistema está errado. Aqui ela
 * simplesmente não entra, e a contagem na tela não mexe.
 *
 * @return a lista nova (a MESMA instância quando nada mudou, pra quem compara
 *         por identidade não redesenhar à toa).
 */
fun somarCodigo(lista: List<String>, codigo: String, teto: Int = TETO_DE_ETIQUETAS): List<String> {
    val limpo = codigo.trim()
    if (limpo.length < MINIMO_DE_CARACTERES) return lista
    if (lista.contains(limpo)) return lista
    if (lista.size >= teto) return lista
    return lista + limpo
}

/** Teto de etiquetas num bipe. Espelha `LOTE_MAXIMO_BIPES` de lib/atividade-bipes.ts. */
const val TETO_DE_ETIQUETAS = 40
