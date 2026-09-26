package com.tridi.market.kiosk

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

/**
 * Ordem da lista: pareado primeiro (é o que a pessoa procura ao voltar), depois
 * periférico HID, depois nome. Aparelho sem nome vai pro fim — é quase sempre
 * ruído de vizinhança, não o leitor na mão.
 */
fun ordenar(lista: List<AparelhoBt>): List<AparelhoBt> = lista.sortedWith(
    compareByDescending<AparelhoBt> { it.pareado }
        .thenByDescending { it.hid }
        .thenBy { it.nome.isBlank() }
        .thenBy { it.nome.lowercase() },
)

/**
 * O que a tela mostra. Por padrão só periférico HID e o que já está pareado —
 * numa loja o `startDiscovery` acha fone, TV e celular de cliente, e o leitor
 * se perde no meio.
 *
 * `mostrarTodos` existe porque leitor barato às vezes se anuncia com classe
 * errada: esconder o aparelho certo seria pior do que mostrar ruído.
 */
fun visiveis(lista: List<AparelhoBt>, mostrarTodos: Boolean): List<AparelhoBt> =
    ordenar(if (mostrarTodos) lista else lista.filter { it.hid || it.pareado })
