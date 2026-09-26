package com.tridi.ponto.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.tridi.ponto.BuildConfig
import com.tridi.ponto.data.EnviadaItem
import com.tridi.ponto.data.Enviadas
import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// Preferências persistentes: URL, token do device, cache de pessoas+embeddings,
// moldes aprendidos por ESTA câmera, fila offline e última batida por pessoa.
// Tudo local — o reconhecimento e a batida funcionam sem internet.
private val Context.ds by preferencesDataStore(name = "ponto")

// Teto da fila offline. Um tablet com 30 pessoas gera ~120 batidas/dia: 2000
// aguenta duas semanas sem internet sem perder nada.
const val FILA_MAX = 2000

class Store(private val ctx: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private val K_URL = stringPreferencesKey("base_url")
    private val K_TOKEN = stringPreferencesKey("device_token")
    private val K_CACHE = stringPreferencesKey("cache")
    private val K_TEMPLATES = stringPreferencesKey("templates")
    private val K_FILA = stringPreferencesKey("fila")
    private val K_ULTIMO = stringPreferencesKey("ultimo_tipo")
    private val K_LASTSYNC = longPreferencesKey("last_sync_ms")
    private val K_SOM = booleanPreferencesKey("som_sucesso")

    suspend fun baseUrl(): String = ctx.ds.data.first()[K_URL] ?: BuildConfig.DEFAULT_API_BASE
    suspend fun setBaseUrl(v: String) { ctx.ds.edit { it[K_URL] = v.trim().trimEnd('/') } }

    suspend fun token(): String? = ctx.ds.data.first()[K_TOKEN]
    suspend fun setToken(v: String?) { ctx.ds.edit { if (v == null) it.remove(K_TOKEN) else it[K_TOKEN] = v } }

    private suspend inline fun <reified T> ler(key: androidx.datastore.preferences.core.Preferences.Key<String>, fallback: T): T = try {
        ctx.ds.data.first()[key]?.let { json.decodeFromString<T>(it) } ?: fallback
    } catch (_: Exception) { fallback }

    private suspend inline fun <reified T> gravar(key: androidx.datastore.preferences.core.Preferences.Key<String>, v: T) {
        ctx.ds.edit { it[key] = json.encodeToString(v) }
    }

    suspend fun cache(): CacheLocal = ler(K_CACHE, CacheLocal())
    suspend fun setCache(c: CacheLocal) = gravar(K_CACHE, c)

    // Quando o cache foi atualizado pela última vez (epoch ms). 0 = nunca.
    suspend fun lastSyncMs(): Long = ctx.ds.data.first()[K_LASTSYNC] ?: 0L
    suspend fun setLastSyncMs(v: Long) { ctx.ds.edit { it[K_LASTSYNC] = v } }

    // Som de confirmação ao bater ponto (padrão ligado).
    suspend fun somSucesso(): Boolean = ctx.ds.data.first()[K_SOM] ?: true
    suspend fun setSomSucesso(v: Boolean) { ctx.ds.edit { it[K_SOM] = v } }

    // ── Moldes aprendidos (como esta câmera vê cada pessoa) ──────────────────
    suspend fun templates(): Templates = ler(K_TEMPLATES, Templates())
    suspend fun limparTemplates() { gravar(K_TEMPLATES, Templates()) }

    // Tag do MODELO de rosto com que os moldes locais foram feitos. Mudou o
    // modelo → moldes antigos morrem e o cadastro re-sincroniza (o arranque
    // compara com engine.tag). É o que torna a troca de modelo um deploy só.
    private val K_MODELO = stringPreferencesKey("modelo_rosto")
    suspend fun modeloRosto(): String? = ctx.ds.data.first()[K_MODELO]
    suspend fun setModeloRosto(v: String) { ctx.ds.edit { it[K_MODELO] = v } }

    // Reset único de manutenção (ex.: limpar moldes envenenados numa atualização).
    private val K_RESET = intPreferencesKey("reset_v")
    suspend fun resetV(): Int = ctx.ds.data.first()[K_RESET] ?: 0
    suspend fun setResetV(v: Int) { ctx.ds.edit { it[K_RESET] = v } }

    // Guarda um molde novo. Mantém no máx. 10 por pessoa (descarta o mais velho)
    // e ignora quase-duplicados (similaridade > 0.97 com um molde existente).
    suspend fun addTemplate(pessoaId: String, emb: FloatArray) {
        val atual = templates().porPessoa.toMutableMap()
        val lista = (atual[pessoaId] ?: emptyList()).toMutableList()
        val novo = emb.toList()
        val quaseIgual = lista.any { t ->
            var s = 0f; val n = minOf(t.size, novo.size)
            for (i in 0 until n) s += t[i] * novo[i]
            s > 0.97f
        }
        if (!quaseIgual) {
            lista.add(novo)
            while (lista.size > 6) lista.removeAt(0)   // teto baixo: molde demais "engole" outras pessoas
            atual[pessoaId] = lista
            gravar(K_TEMPLATES, Templates(atual))
        }
    }

    // ── Fila offline ──────────────────────────────────────────────────────────
    // TODA mudança na fila passa por aqui, e o "lê → muda → grava" acontece
    // DENTRO do `edit` — que é a transação do DataStore, serializada com as
    // outras.
    //
    // Era exatamente isto que fazia "a pessoa bate e o ponto não chega". Quem
    // mexia na fila eram dois coroutines: o dreno (que envia) e a batida (que
    // enfileira). O dreno lia a fila no começo, gastava o tempo da requisição
    // HTTP e no fim gravava a lista que tinha lido, sem o item enviado. Quem
    // batesse o ponto NESSA janela era apagado:
    //
    //   dreno: lê [A] ─── envia A (300ms–3s) ──────────────► grava [] ✗ B morreu
    //   pessoa:            └ enfileira B → grava [A, B]
    //
    // Por isso a perda acontecia nos horários de PICO (todo mundo batendo em
    // sequência, um dreno sempre no ar), nunca chegava atrasada depois — o item
    // não estava travado em lugar nenhum, tinha sido sobrescrito — e o servidor
    // não via nada, porque a requisição nunca saiu.
    //
    // Ninguém mais grava a lista inteira: o dreno tira UM item pelo clientId.
    private suspend fun editarFila(bloco: (List<FilaItem>) -> List<FilaItem>) {
        ctx.ds.edit { prefs ->
            val atual = try {
                prefs[K_FILA]?.let { json.decodeFromString<Fila>(it).itens } ?: emptyList()
            } catch (_: Exception) { emptyList() }
            prefs[K_FILA] = json.encodeToString(Fila(bloco(atual).take(FILA_MAX)))
        }
    }

    suspend fun fila(): List<FilaItem> = ler(K_FILA, Fila()).itens
    suspend fun enfileirar(item: FilaItem) = editarFila { it + item }
    /** Enviada com sucesso: sai da fila. Pelo clientId, nunca por posição — a
     *  fila pode ter mudado enquanto a requisição estava no ar. */
    suspend fun removerDaFila(clientId: String) = editarFila { l -> l.filterNot { it.clientId == clientId } }
    /** Recusada pelo servidor: marca e vai pro FIM em vez de travar a fila.
     *  Fica visível (e re-tentável — a pessoa pode ser reativada) até o
     *  administrador descartar pelo menu. */
    suspend fun marcarRecusada(clientId: String) = editarFila { l ->
        l.filterNot { it.clientId == clientId } + l.filter { it.clientId == clientId }.map { it.copy(recusada = true) }
    }
    /** Decisão explícita do administrador no menu: joga fora as recusadas. */
    suspend fun descartarRecusadas() = editarFila { l -> l.filterNot { it.recusada } }

    // ── Rastro das enviadas (conferência fim-a-fim) ──────────────────────────
    // Mesma regra da fila: TODA mudança dentro do `edit` (transação), nunca
    // "lê fora → grava por cima". Guarda as ~300 mais novas (uns 3 dias).
    private val K_ENVIADAS = stringPreferencesKey("enviadas")
    private suspend fun editarEnviadas(bloco: (List<EnviadaItem>) -> List<EnviadaItem>) {
        ctx.ds.edit { prefs ->
            val atual = try {
                prefs[K_ENVIADAS]?.let { json.decodeFromString<Enviadas>(it).itens } ?: emptyList()
            } catch (_: Exception) { emptyList() }
            prefs[K_ENVIADAS] = json.encodeToString(Enviadas(bloco(atual).takeLast(300)))
        }
    }
    suspend fun enviadas(): List<EnviadaItem> = ler(K_ENVIADAS, Enviadas()).itens
    suspend fun marcarEnviada(item: EnviadaItem) = editarEnviadas { l -> l.filterNot { it.clientId == item.clientId } + item }
    suspend fun confirmarEnviadas(clientIds: Set<String>) = editarEnviadas { l ->
        l.map { if (it.clientId in clientIds) it.copy(confirmada = true) else it }
    }

    // ── Alternância local de entrada/saída (offline-safe) ────────────────────
    suspend fun ultimoTipo(pessoaId: String, hoje: String): String? {
        val v = ler(K_ULTIMO, UltimoTipo()).porPessoa[pessoaId] ?: return null
        val (tipo, dia) = v.split("@").let { it[0] to it.getOrElse(1) { "" } }
        return if (dia == hoje) tipo else null
    }
    suspend fun setUltimoTipo(pessoaId: String, tipo: String, hoje: String) {
        val atual = ler(K_ULTIMO, UltimoTipo()).porPessoa.toMutableMap()
        atual[pessoaId] = "$tipo@$hoje"
        gravar(K_ULTIMO, UltimoTipo(atual))
    }
}
