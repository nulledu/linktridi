package com.tridi.estoque.kiosk

// Estado da tela de pareamento do leitor — sem Android, pra caber em teste.
//
// A tela mistura três fontes: o que já está pareado no aparelho, o que aparece
// na busca, e o resultado do vínculo em andamento. Juntar isso na Compose vira
// lista piscando e item duplicado; aqui é uma função de mesclagem só.

/** Um aparelho visto pelo Bluetooth. `endereco` (MAC) é a identidade. */
data class AparelhoBt(
    val endereco: String,
    val nome: String,
    /** Classificado como periférico de entrada (teclado/leitor). */
    val hid: Boolean = false,
    /**
     * Classificado como IMAGING — a classe que impressora Bluetooth usa.
     *
     * Existe porque o galpão tem DOIS periféricos, não um: o leitor (HID) e a
     * impressora de etiqueta. Enquanto só o `hid` contava, a impressora não
     * aparecia na lista de jeito nenhum, e a única saída era um botão escrito
     * "Não achei meu leitor" — que ninguém lê quando está procurando impressora.
     */
    val impressora: Boolean = false,
    val pareado: Boolean = false,
    val vinculando: Boolean = false,
    val falhou: Boolean = false,
)

/**
 * Entra um aparelho novo (ou uma versão nova do mesmo). Dedupe por endereço:
 * `ACTION_FOUND` dispara várias vezes pro mesmo leitor enquanto a busca roda.
 *
 * O nome chega vazio na primeira vez e preenchido depois — por isso um nome
 * vazio NUNCA sobrescreve um que já temos.
 */
fun mesclar(atual: List<AparelhoBt>, novo: AparelhoBt): List<AparelhoBt> {
    val i = atual.indexOfFirst { it.endereco.equals(novo.endereco, ignoreCase = true) }
    if (i < 0) return atual + novo
    val antigo = atual[i]
    return atual.toMutableList().apply {
        this[i] = novo.copy(nome = novo.nome.ifBlank { antigo.nome })
    }
}

/** Marca o andamento do vínculo sem mexer no resto da lista. */
fun comEstadoDeVinculo(
    atual: List<AparelhoBt>,
    endereco: String,
    vinculando: Boolean = false,
    pareado: Boolean? = null,
    falhou: Boolean = false,
): List<AparelhoBt> = atual.map {
    if (!it.endereco.equals(endereco, ignoreCase = true)) it
    else it.copy(vinculando = vinculando, pareado = pareado ?: it.pareado, falhou = falhou)
}

/** Aparelho que este app usa: leitor de código OU impressora de etiqueta. */
fun AparelhoBt.ehDoGalpao(): Boolean = hid || impressora

/**
 * Rede pelo NOME, pra impressora que mente a classe de dispositivo.
 *
 * Puro e aqui (não no pareador Android) pra ser testável: a Goldensky se
 * anuncia "80MM-BT", e genéricas vêm como "Printer001", "BT-Printer",
 * "POS-58". Se a classe já disser IMAGING isto nem é consultado — é só o que
 * salva quem escaparia do filtro e sumiria da tela.
 */
fun pareceImpressora(nome: String?): Boolean {
    val n = (nome ?: "").lowercase()
    if (n.isBlank()) return false
    return listOf("print", "impress", "pos-", "pos58", "pos80", "mm-bt", "mtp-", "goldensky")
        .any { n.contains(it) }
}

/**
 * Ordem da lista: pareado primeiro (é o que a pessoa procura ao voltar), depois
 * o que serve pra este app, depois nome. Aparelho sem nome vai pro fim — é
 * quase sempre ruído de vizinhança, não o periférico na mão.
 */
fun ordenar(lista: List<AparelhoBt>): List<AparelhoBt> = lista.sortedWith(
    compareByDescending<AparelhoBt> { it.pareado }
        .thenByDescending { it.ehDoGalpao() }
        .thenBy { it.nome.isBlank() }
        .thenBy { it.nome.lowercase() },
)

/**
 * O que a tela mostra. Por padrão só o que serve aqui — leitor (HID),
 * impressora (IMAGING) e o que já está pareado. No galpão o `startDiscovery`
 * acha fone, TV e celular de todo mundo, e o periférico se perde no meio.
 *
 * `mostrarTodos` existe porque periférico barato às vezes se anuncia com classe
 * errada — impressora chinesa genérica que se declara `UNCATEGORIZED` é comum.
 * Esconder o aparelho certo seria pior do que mostrar ruído.
 */
fun visiveis(lista: List<AparelhoBt>, mostrarTodos: Boolean): List<AparelhoBt> =
    ordenar(if (mostrarTodos) lista else lista.filter { it.ehDoGalpao() || it.pareado })
