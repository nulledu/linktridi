package com.tridi.estoque.scan

// Regras do leitor de código de barras, sem Android nem câmera — a câmera
// dispara MUITAS leituras por segundo do mesmo código enquanto a embalagem
// está na frente da lente, e é aqui que se decide o que vira uma compra.

const val JANELA_REPETICAO_MS = 1_500L

data class ScanState(val ultimoCodigo: String? = null, val ultimoEmMs: Long = 0L)

sealed interface ScanResultado {
    /** Código novo (ou a janela passou): pode virar item no carrinho. */
    data class Aceito(val codigo: String) : ScanResultado
    /** Mesmo código dentro da janela: ignora em silêncio, sem bip nem erro. */
    data object Repetido : ScanResultado
    /** Leitura vazia/lixo: ignora. */
    data object Invalido : ScanResultado
}

data class ScanTransicao(val estado: ScanState, val resultado: ScanResultado)

fun reduceScan(estado: ScanState, bruto: String?, agoraMs: Long, janelaMs: Long = JANELA_REPETICAO_MS): ScanTransicao {
    val codigo = normalizarCodigo(bruto)
    if (codigo.isEmpty()) return ScanTransicao(estado, ScanResultado.Invalido)
    // A MESMA embalagem parada na frente da câmera dispara dezenas de leituras
    // por segundo. Sem isto, um refrigerante viraria 30 no carrinho.
    //
    // A janela DESLIZA: cada leitura repetida empurra o prazo pra frente, então
    // o código só volta a valer depois de sumir de vista por `janelaMs`. Com
    // janela fixa, segurar o produto três segundos na frente da lente
    // adicionava dois — o que é pior do que não ler, porque cobra a mais.
    if (codigo == estado.ultimoCodigo && agoraMs - estado.ultimoEmMs < janelaMs) {
        return ScanTransicao(estado.copy(ultimoEmMs = agoraMs), ScanResultado.Repetido)
    }
    return ScanTransicao(ScanState(codigo, agoraMs), ScanResultado.Aceito(codigo))
}

// ── Confirmar antes de cobrar ───────────────────────────────────────────────
// Medido no tablet lendo uma lata de Coca: em 12 leituras, DUAS vieram erradas
// — `2860900681178` e `2831900681178` no lugar de `7894900681178`. As duas são
// EAN-13 válidos: passam no dígito verificador. Não dá para filtrar por
// validação, porque o erro não é de formato — é um símbolo mal decodificado que
// por acaso fecha a conta.
//
// Isso é o preço de decodificar imagem invertida, curva e de baixo contraste. E
// num mercadinho é pior do que não ler: cobra o produto errado ou some com a
// venda.
//
// A defesa é exigir que a leitura se REPITA. O erro é aleatório (cada leitura
// errada deu um número diferente); o código certo sai igual dezenas de vezes por
// segundo. Como o leitor agora lê em ~200 ms, esperar a confirmação custa quase
// nada — e a alternativa é cobrar errado.

const val CONFIRMACOES_NECESSARIAS = 2

/** Confirmação precisa vir logo: leitura de dois produtos diferentes não se soma. */
const val JANELA_DE_CONFIRMACAO_MS = 1_500L

data class ConfirmacaoState(val candidato: String? = null, val vezes: Int = 0, val emMs: Long = 0L)

data class ConfirmacaoTransicao(val estado: ConfirmacaoState, val confirmado: String?)

fun confirmarLeitura(
    estado: ConfirmacaoState,
    codigo: String,
    agoraMs: Long,
    necessarias: Int = CONFIRMACOES_NECESSARIAS,
    janelaMs: Long = JANELA_DE_CONFIRMACAO_MS,
): ConfirmacaoTransicao {
    val continua = codigo == estado.candidato && agoraMs - estado.emMs <= janelaMs
    val vezes = if (continua) estado.vezes + 1 else 1
    if (vezes >= necessarias) {
        // Zera: o próximo bipe do mesmo produto recomeça a contagem, e quem
        // decide se ele vira item é o `reduceScan`, não isto aqui.
        return ConfirmacaoTransicao(ConfirmacaoState(), codigo)
    }
    return ConfirmacaoTransicao(ConfirmacaoState(codigo, vezes, agoraMs), null)
}

/** Depois de adicionar ao carrinho manualmente, o próximo bipe do mesmo item vale. */
fun liberarRepeticao(estado: ScanState): ScanState = estado.copy(ultimoCodigo = null, ultimoEmMs = 0L)

fun normalizarCodigo(bruto: String?): String = (bruto ?: "").trim()

// ── Casar o código lido com o produto ───────────────────────────────────────
// O cadastro nem sempre guarda o código exatamente como o scanner devolve:
//  • UPC-A tem 12 dígitos e o mesmo produto costuma estar cadastrado como
//    EAN-13, que é o UPC com um zero na frente;
//  • há cadastros com zeros à esquerda sobrando ou faltando.
// Comparar só por igualdade exata faria produtos existentes darem "não
// encontrado" com o item na mão da pessoa.
fun chavesDeBusca(codigo: String): List<String> {
    val limpo = normalizarCodigo(codigo)
    if (limpo.isEmpty()) return emptyList()
    val chaves = linkedSetOf(limpo)
    if (limpo.all(Char::isDigit)) {
        chaves += limpo.trimStart('0').ifEmpty { "0" }   // sem zeros à esquerda
        if (limpo.length == 12) chaves += "0$limpo"       // UPC-A → EAN-13
        if (limpo.length == 13 && limpo.startsWith("0")) chaves += limpo.drop(1)
    }
    return chaves.toList()
}

/** O código lido casa com o cadastrado? Tolerante às variações acima. */
fun codigoCasa(lido: String, cadastrado: String?): Boolean {
    if (cadastrado.isNullOrBlank()) return false
    val doCadastro = chavesDeBusca(cadastrado).toSet()
    return chavesDeBusca(lido).any { it in doCadastro }
}
