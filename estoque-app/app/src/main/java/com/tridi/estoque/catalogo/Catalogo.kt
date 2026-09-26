package com.tridi.estoque.catalogo

import com.tridi.estoque.sync.ha

// ── "Quantos temos disso?" ───────────────────────────────────────────────────
//
// As três telas do tablet (Bipar, Receber, Conferir) são FILAS DE TRABALHO:
// enquanto ninguém recebeu mercadoria, concluiu atividade nem etiquetou peça,
// as três estão vazias — com razão, não por defeito. Quem liga o aparelho no
// galpão hoje vê um app que não faz nada.
//
// Consultar o estoque é o que serve ANTES de qualquer fila existir, e usa o
// dado que JÁ está lá: o catálogo. A pessoa está de pé, de luva, com a peça na
// mão — ela digita meia palavra ou bipa a etiqueta e quer três coisas: quanto
// tem, em que unidade, e onde fica.
//
// Este arquivo é Kotlin puro de propósito. O que precisa estar certo aqui é
// COMO o texto vira busca (acento, maiúscula, hífen) e O QUE a tela diz quando
// não achou nada — e as duas coisas se conferem em teste na JVM, sem tablet.

/**
 * O texto reduzido à forma em que se busca: minúsculo, sem acento, com
 * pontuação virando espaço.
 *
 * Existe porque o `LIKE` do SQLite só é insensível a maiúscula em ASCII: sem
 * isto, procurar "almofada" não acha "Almofada" com acento nenhum, mas
 * procurar "cola" não acha "Cola Térmica" — e pior, "mdf6mm" não acha
 * "MDF 6mm". O galpão digita como fala, não como está cadastrado.
 *
 * O MESMO texto é aplicado no que se guarda e no que se procura; é isso que
 * faz os dois se encontrarem.
 */
fun normalizarBusca(texto: String): String {
    val sb = StringBuilder(texto.length)
    for (c in texto.lowercase()) {
        val letra = SEM_ACENTO[c] ?: c
        if (letra.isLetterOrDigit()) sb.append(letra) else sb.append(' ')
    }
    return sb.toString().trim().replace(SEQUENCIA_DE_ESPACOS, " ")
}

private val SEQUENCIA_DE_ESPACOS = Regex("\\s+")

// Só o que aparece em português (e o "ç"). Uma tabela curta e explícita em vez
// de `java.text.Normalizer`: o Normalizer existe no Android, mas depender dele
// arrastaria este arquivo pra fora do Kotlin puro que roda no teste da JVM sem
// aparelho — e a lista de acentos que um catálogo de galpão brasileiro usa
// cabe em duas linhas.
private val SEM_ACENTO: Map<Char, Char> = buildMap {
    "áàâãä".forEach { put(it, 'a') }
    "éèêë".forEach { put(it, 'e') }
    "íìîï".forEach { put(it, 'i') }
    "óòôõö".forEach { put(it, 'o') }
    "úùûü".forEach { put(it, 'u') }
    put('ç', 'c')
    put('ñ', 'n')
}

/**
 * As palavras que a busca vai exigir, no máximo três.
 *
 * Todas TÊM que casar (é `AND`, não `OR`): quem digita "mdf 6" quer as chapas
 * de 6mm, não tudo que tem "6" no nome. Três porque é o que a consulta do Room
 * comporta sem virar SQL montado à mão — e ninguém digita quatro palavras de
 * luva.
 */
fun palavrasDaBusca(termo: String): List<String> =
    normalizarBusca(termo).split(' ').filter { it.isNotBlank() }.take(3)

/** Menos que isto não é busca, é ruído: uma letra devolveria meio catálogo. */
const val MINIMO_PRA_BUSCAR = 2

fun termoBuscavel(termo: String): Boolean =
    palavrasDaBusca(termo).sumOf { it.length } >= MINIMO_PRA_BUSCAR

/**
 * O SKU guardado pra casar com o que a pistola lê.
 *
 * A etiqueta é `<SKU>-<sequencial>`; quem bipa quer o ITEM, não a unidade — e
 * quase sempre a unidade bipada nem está no tablet. Guardar o SKU em caixa alta
 * e comparar em caixa alta é o que faz a leitura cair no item certo.
 */
fun skuComparavel(sku: String?): String = sku?.trim()?.uppercase().orEmpty()

/**
 * Quanto tem, dito como o galpão fala.
 *
 * Fração só aparece quando existe: "2,5 m" é verdade, "12,0 ch" é ruído numa
 * tela lida a um metro de distância. A vírgula é a decimal do português — o
 * ponto é o que a máquina usa, não a pessoa.
 */
fun fraseDeQuantidade(quantidade: Double, unidade: String): String {
    val u = unidade.trim().ifBlank { "un" }
    val arredondado = Math.round(quantidade * 100.0) / 100.0
    val numero = if (arredondado == Math.floor(arredondado) && !arredondado.isInfinite()) {
        arredondado.toLong().toString()
    } else {
        arredondado.toString().replace('.', ',')
    }
    return "$numero $u"
}

/**
 * Um item do catálogo como a tela de consulta o mostra.
 *
 * Não é a entidade do Room de propósito: a decisão de "o que se lê numa linha"
 * é desta camada, e ela cabe em teste sem banco. Quem converte é o ViewModel.
 */
data class ItemConsultado(
    val id: String,
    val nome: String,
    val sku: String?,
    val categoria: String?,
    val unidade: String,
    val quantidade: Double,
    val local: String?,
) {
    /** "12 ch" — a resposta da pergunta. */
    val quantidadeEmTexto: String get() = fraseDeQuantidade(quantidade, unidade)

    /** `true` quando não tem nenhum: a tela pinta diferente. */
    val zerado: Boolean get() = quantidade <= 0.0

    /**
     * A segunda linha: onde fica, e o que é. Sem local a linha continua
     * existindo — dizer a categoria já ajuda a achar a prateleira.
     */
    val detalhe: String get() = listOfNotNull(
        local?.takeIf { it.isNotBlank() },
        categoria?.takeIf { it.isNotBlank() },
        sku?.takeIf { it.isNotBlank() },
    ).joinToString(" · ")
}

/** O que a tela de consulta mostra quando não há LISTA pra mostrar. */
data class VazioDaConsulta(
    val titulo: String,
    val detalhe: String,
    /** `true` pinta de âmbar: falta alguma coisa que depende de gente ou de rede. */
    val alerta: Boolean = false,
)

/**
 * A frase do estado vazio da consulta — a decisão inteira num lugar só.
 *
 * A ordem é o conteúdo do arquivo. "Nada aqui" não diz se o app está
 * funcionando ou quebrado, e cada um destes casos pede uma reação diferente:
 * sem catálogo baixado alguém precisa levar o tablet pro Wi-Fi; sem resultado
 * a pessoa erra a palavra; com o catálogo cheio e nada digitado não há
 * problema nenhum, é só a tela esperando.
 *
 * @param itensNoTablet quantos itens o catálogo local tem (0 = nunca baixou).
 * @param atualizadoEm quando o catálogo local foi sincronizado; `null` = nunca.
 */
fun vazioDaConsulta(
    termo: String,
    resultados: Int,
    itensNoTablet: Int,
    sincronizando: Boolean,
    online: Boolean,
    atualizadoEm: Long?,
    agora: Long,
): VazioDaConsulta? {
    if (resultados > 0) return null

    if (itensNoTablet <= 0) {
        return when {
            sincronizando -> VazioDaConsulta(
                "Baixando o catálogo…",
                "É uma vez só. Depois a consulta funciona sem internet.",
            )
            !online -> VazioDaConsulta(
                "O catálogo ainda não está neste tablet",
                "Leve o aparelho pra perto do Wi-Fi uma vez. Depois disso a consulta funciona offline.",
                alerta = true,
            )
            else -> VazioDaConsulta(
                "O catálogo ainda não está neste tablet",
                "Toque em atualizar. Se não vier, o aparelho perdeu o acesso ao sistema — chame a administração.",
                alerta = true,
            )
        }
    }

    val quantos = if (itensNoTablet == 1) "1 item" else "$itensNoTablet itens"
    val desde = atualizadoEm?.let { " · atualizado há ${ha((agora - it).coerceAtLeast(0L))}" } ?: ""

    if (termo.isBlank()) {
        return VazioDaConsulta(
            "$quantos neste tablet$desde",
            "Digite o nome do item ou bipe a etiqueta pra ver quanto tem e onde fica.",
        )
    }
    if (!termoBuscavel(termo)) {
        return VazioDaConsulta("Continue digitando", "Com uma letra só a busca traria o galpão inteiro.")
    }
    return VazioDaConsulta(
        "Nada encontrado para “${termo.trim()}”",
        "Tente outra palavra do nome, ou o SKU. O catálogo deste tablet tem $quantos$desde.",
    )
}
