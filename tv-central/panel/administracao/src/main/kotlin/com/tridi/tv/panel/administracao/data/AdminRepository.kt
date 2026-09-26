package com.tridi.tv.panel.administracao.data

import com.tridi.tv.core.network.ApiClient
import com.tridi.tv.core.network.Leitura
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.storage.DeviceStore
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Rede + cache offline do painel de Administração.
 *
 * Duas coisas que a TV exige e o navegador não:
 *  - sem rede, devolve o último snapshot bom em vez de apagar a tela;
 *  - devolve junto DE ONDE veio e DE QUANDO é (`Leitura`), porque a tela precisa
 *    conseguir dizer "isto é de 40 minutos atrás".
 */
@Singleton
class AdminRepository @Inject constructor(
    private val api: ApiClient,
    private val store: DeviceStore,
) {
    private val painel = PanelId("administracao")

    /** O que está no disco, sem rede — ver `Cofre.kt`. */
    suspend fun doCofre(): Cofre {
        // DataStore é suspenso; lê tudo de uma vez e entrega ao montador puro.
        val chaves = listOf(CHAVES.vendas, CHAVES.config, CHAVES.producao, CHAVES.estoque, CHAVES.expedicao)
        val jsons = chaves.associateWith { store.panelCache(painel, it) }
        val ems = chaves.associateWith { store.panelCacheEm(painel, it) }
        return montarCofre(api.json, { jsons[it] }, { ems[it] })
    }

    suspend fun carregarVendas(): Leitura<SalesSnapshot>? = try {
        val s: SalesSnapshot = api.get("/api/sales")
        val agora = System.currentTimeMillis()
        if (s.reserva) {
            /*
             * Snapshot de RESERVA: o servidor não conseguiu ler o ERP e mandou
             * o salvo. Duas consequências, as duas importantes.
             *
             * Não vira cache. Gravá-lo por cima do último snapshot bom trocaria
             * um dado completo por um de outra base e sem tráfego — e a troca
             * ficaria gravada no aparelho, sobrevivendo ao problema que a
             * causou.
             *
             * E não conta como leitura ao vivo: a tela mostra a procedência em
             * vez de carimbar "atualizado agora" num número que o próprio
             * servidor entregou avisando que era reserva.
             */
            Leitura.doCache(s, store.panelCacheEm(painel, CHAVE_VENDAS) ?: agora)
        } else {
            store.savePanelCache(
                painel, CHAVE_VENDAS,
                api.json.encodeToString(SalesSnapshot.serializer(), s),
                em = agora,
            )
            Leitura.daRede(s, agora)
        }
    } catch (e: Exception) {
        // Cache que não abre é cache que não existe: decodificar dentro de
        // `runCatching` para um formato antigo não derrubar a leitura.
        store.panelCache(painel, CHAVE_VENDAS)
            ?.let { runCatching { api.json.decodeFromString(SalesSnapshot.serializer(), it) }.getOrNull() }
            ?.let { dado -> Leitura.doCache(dado, em = store.panelCacheEm(painel, CHAVE_VENDAS) ?: 0L) }
    }

    /**
     * A configuração — meta, cor, ritmo e, sobretudo, os PERFIS.
     *
     * Devolve `null` quando não deu para saber. Aqui morava o defeito que
     * fazia a parede "enlouquecer" quando a internet caía: no lugar do `null`
     * havia um `?: PanelConfig()`, uma configuração de fábrica VAZIA. Sem
     * perfis, a TV perdia o desenho escolhido e caía nas telas clássicas; com
     * `monthlyRevenueGoal = 0`, toda barra de meta virava 0 de 0 e todo
     * percentual saía sem chão. O pior é que essa configuração vazia
     * SOBRESCREVIA a boa que já estava na memória: bastava um ciclo sem rede
     * para a tela virar outra coisa, e ela não voltava sozinha ao normal
     * porque o estrago já tinha sido gravado no estado.
     *
     * Com `null`, quem chama mantém o que já tinha. Uma queda de internet passa
     * a ser o que deveria ter sido desde sempre: os números param de atualizar
     * e a tela avisa a idade do dado — o desenho continua o mesmo.
     */
    suspend fun carregarConfig(): PanelConfig? = try {
        val c: PanelConfig = api.get("/api/config")
        store.savePanelCache(painel, CHAVE_CONFIG, api.json.encodeToString(PanelConfig.serializer(), c))
        c
    } catch (e: Exception) {
        store.panelCache(painel, CHAVE_CONFIG)
            ?.let {
                // O cache também pode estar corrompido ou de uma versão antiga
                // do formato: decodificar dentro de um try, senão a exceção
                // sobe e derruba o ciclo inteiro.
                try { api.json.decodeFromString(PanelConfig.serializer(), it) } catch (e: Exception) { null }
            }
    }

    /**
     * Produção. Cache offline igual ao das vendas: sem rede a parede continua
     * mostrando o último turno em vez de piscar vazio — numa TV, tela vazia é
     * lida como "o setor parou", não como "a rede caiu".
     *
     * `null` quando não há nem rede nem cache; `disponivel = false` quando o
     * servidor respondeu que ainda não sabe (ERP sem a rota publicada, por
     * exemplo). São situações diferentes e a tela diz coisas diferentes.
     */
    suspend fun carregarProducao(): ResumoProducao? = try {
        val p: ResumoProducao = api.get("/api/producao/painel")
        store.savePanelCache(painel, CHAVE_PRODUCAO, api.json.encodeToString(ResumoProducao.serializer(), p))
        p
    } catch (e: Exception) {
        // Cache que não abre (gravado por uma versão anterior do modelo) é
        // cache que não existe — decodificar dentro de `runCatching` para a
        // exceção não derrubar a leitura inteira.
        store.panelCache(painel, CHAVE_PRODUCAO)
            ?.let { runCatching { api.json.decodeFromString(ResumoProducao.serializer(), it) }.getOrNull() }
    }

    /** Estoque. Mesmo desenho da produção: cache offline, `null` sem nada. */
    suspend fun carregarEstoque(): ResumoEstoque? = try {
        val e: ResumoEstoque = api.get("/api/estoque/painel")
        store.savePanelCache(painel, CHAVE_ESTOQUE, api.json.encodeToString(ResumoEstoque.serializer(), e))
        e
    } catch (e: Exception) {
        // Cache que não abre (gravado por uma versão anterior do modelo) é
        // cache que não existe — decodificar dentro de `runCatching` para a
        // exceção não derrubar a leitura inteira.
        store.panelCache(painel, CHAVE_ESTOQUE)
            ?.let { runCatching { api.json.decodeFromString(ResumoEstoque.serializer(), it) }.getOrNull() }
    }

    /** Expedição. Mesmo desenho da produção: cache offline, `null` sem nada. */
    suspend fun carregarExpedicao(): StatusExpedicao? = try {
        val s: StatusExpedicao = api.get("/api/logistica/painel")
        store.savePanelCache(painel, CHAVE_EXPEDICAO, api.json.encodeToString(StatusExpedicao.serializer(), s))
        s
    } catch (e: Exception) {
        // Cache que não abre (gravado por uma versão anterior do modelo) é
        // cache que não existe — decodificar dentro de `runCatching` para a
        // exceção não derrubar a leitura inteira.
        store.panelCache(painel, CHAVE_EXPEDICAO)
            ?.let { runCatching { api.json.decodeFromString(StatusExpedicao.serializer(), it) }.getOrNull() }
    }

    private companion object {
        const val CHAVE_VENDAS = CHAVES.vendas
        const val CHAVE_CONFIG = CHAVES.config
        const val CHAVE_PRODUCAO = CHAVES.producao
        const val CHAVE_EXPEDICAO = CHAVES.expedicao
        const val CHAVE_ESTOQUE = CHAVES.estoque
    }
}

/** Progresso por vendedor — base da detecção de meta batida. */
object Metas {
    fun progresso(s: SalesSnapshot): Map<String, Double> =
        s.salespeople.associate { v ->
            v.id to if (v.goal.monthly > 0) v.sales.monthly / v.goal.monthly else 0.0
        }

    /** Quem cruzou 100% agora — e só agora. Não celebra duas vezes. */
    fun batidasAgora(antes: Map<String, Double>, agora: Map<String, Double>): List<String> =
        agora.filter { (id, p) -> p >= 1.0 && (antes[id] ?: 0.0) < 1.0 }.keys.toList()
}
