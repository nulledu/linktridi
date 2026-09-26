package com.tridi.tv.panel.administracao.data

import com.tridi.tv.core.network.Leitura
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json

/**
 * Tudo que a parede tem NO DISCO, sem tocar na rede.
 *
 * Existe para a tela nascer preenchida. A TV que liga sem internet desenhava
 * "Sincronizando…" por até 45 segundos esperando um timeout — com o dado bom
 * parado no disco o tempo todo. O cofre é lido antes do primeiro ciclo de
 * rede, em milissegundos; a rede vira sincronização em segundo plano, nunca
 * condição para desenhar.
 */
data class Cofre(
    val config: PanelConfig? = null,
    val vendas: Leitura<SalesSnapshot>? = null,
    val producao: ResumoProducao? = null,
    val estoque: ResumoEstoque? = null,
    val expedicao: StatusExpedicao? = null,
)

/**
 * Monta o cofre a partir de leitores crus — puro, para o teste JVM não
 * precisar de Android nem de DataStore. `ler` devolve o JSON guardado sob uma
 * chave (ou `null`); `em` devolve o carimbo dessa chave.
 *
 * Cache que não abre é cache que não existe: um formato antigo não derruba a
 * leitura, só aquela peça fica vazia.
 */
fun montarCofre(json: Json, ler: (String) -> String?, em: (String) -> Long?): Cofre {
    fun <T> peca(chave: String, des: KSerializer<T>): T? =
        ler(chave)?.let { runCatching { json.decodeFromString(des, it) }.getOrNull() }
    val vendas = peca(CHAVES.vendas, SalesSnapshot.serializer())
    return Cofre(
        config = peca(CHAVES.config, PanelConfig.serializer()),
        vendas = vendas?.let { Leitura.doCache(it, em(CHAVES.vendas) ?: 0L) },
        producao = peca(CHAVES.producao, ResumoProducao.serializer()),
        estoque = peca(CHAVES.estoque, ResumoEstoque.serializer()),
        expedicao = peca(CHAVES.expedicao, StatusExpedicao.serializer()),
    )
}

/** As chaves do cache do painel — as mesmas que o `AdminRepository` grava. */
object CHAVES {
    const val vendas = "sales"
    const val config = "config"
    const val producao = "producao"
    const val expedicao = "expedicao"
    const val estoque = "estoque"
}
