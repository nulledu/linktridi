package com.tridi.tv

import android.content.Context
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.security.MessageDigest

/**
 * O que a parede mostra quando a internet cai.
 *
 * Uma TV de galpão não pode virar a página de erro do navegador porque o
 * roteador reiniciou. Quem passa na frente não sabe se o Wi-Fi caiu, se o
 * sistema quebrou ou se a empresa parou de vender — e a única reação possível
 * é chamar alguém.
 *
 * A regra aqui é a que a parede pede: **o último dado bom continua no ar**.
 * Nada de tela vazia, nada de "tentando reconectar" ocupando o lugar dos
 * números. O que muda é uma faixa discreta dizendo desde quando aquilo está
 * parado — porque um número velho sem aviso é pior que nenhum número.
 *
 * O cache é por URL e guarda tudo o que a página precisa: o HTML, os scripts,
 * o estilo e as respostas da API. Sem os scripts não adianta ter o HTML — a
 * página não desenha —, e é por isso que o cache não se limita aos dados.
 */
object CacheDaParede {

    private const val PASTA = "parede"
    /**
     * Teto do cache. Um painel inteiro (HTML + scripts + estilo + dados) não
     * passa de alguns MB; o limite existe para o caso de a página mudar de
     * endereço muitas vezes e o diretório crescer sem ninguém olhando.
     */
    private const val TETO_BYTES = 40L * 1024 * 1024

    private val _semRede = MutableStateFlow(false)
    /** `true` quando a última tentativa de rede falhou e a tela veio do cache. */
    val semRede: StateFlow<Boolean> = _semRede.asStateFlow()

    private val _sincronizadoEm = MutableStateFlow(0L)
    /** Quando a rede funcionou pela última vez (epoch ms), ou 0 se nunca. */
    val sincronizadoEm: StateFlow<Long> = _sincronizadoEm.asStateFlow()

    private fun pasta(ctx: Context): File =
        File(ctx.cacheDir, PASTA).apply { if (!exists()) mkdirs() }

    /**
     * Joga fora o cache inteiro quando o app muda de versão.
     *
     * É a defesa contra o defeito clássico deste tipo de cache: HTML novo
     * pedindo script velho, ou o contrário. O resultado não é "um pouco
     * desatualizado" — é a página quebrada de um jeito que ninguém liga ao
     * cache, e que só some depois de alguém limpar os dados do aplicativo.
     *
     * Apagar tudo é barato: o cache se refaz na primeira carga com internet, e
     * a TV acabou de atualizar, então ela está online agora.
     */
    fun limparSeMudouDeVersao(ctx: Context, versaoAtual: String) {
        try {
            val marca = File(pasta(ctx), "versao.txt")
            val anterior = if (marca.exists()) marca.readText() else ""
            if (anterior == versaoAtual) return
            pasta(ctx).listFiles()?.forEach { it.delete() }
            pasta(ctx).mkdirs()
            marca.writeText(versaoAtual)
            Log.i("TridiTV", "cache da parede zerado (versão $anterior → $versaoAtual)")
        } catch (e: Exception) {
            Log.w("TridiTV", "não consegui zerar o cache", e)
        }
    }

    private fun arquivo(ctx: Context, url: String): File {
        val md = MessageDigest.getInstance("SHA-256").digest(url.toByteArray())
        return File(pasta(ctx), md.joinToString("") { "%02x".format(it) })
    }

    /** O que foi guardado de uma URL: o corpo e como servi-lo de volta. */
    data class Guardado(val bytes: ByteArray, val mime: String, val encoding: String)

    fun guardar(ctx: Context, url: String, bytes: ByteArray, mime: String, encoding: String) {
        try {
            // Cabeçalho de uma linha com o tipo, para o cache saber devolver a
            // resposta com o mesmo `Content-Type` — sem isso o WebView trata
            // JavaScript como texto e a página não roda.
            val f = arquivo(ctx, url)
            f.outputStream().use { saida ->
                saida.write(("$mime|$encoding\n").toByteArray(Charsets.UTF_8))
                saida.write(bytes)
            }
            marcarSucesso(ctx)
            podar(ctx)
        } catch (e: Exception) {
            Log.w("TridiTV", "não consegui guardar no cache da parede", e)
        }
    }

    fun ler(ctx: Context, url: String): Guardado? = try {
        val f = arquivo(ctx, url)
        if (!f.exists()) null else {
            val tudo = f.readBytes()
            val quebra = tudo.indexOf('\n'.code.toByte())
            if (quebra <= 0) null else {
                val cab = String(tudo, 0, quebra, Charsets.UTF_8).split("|")
                Guardado(
                    bytes = tudo.copyOfRange(quebra + 1, tudo.size),
                    mime = cab.getOrNull(0).orEmpty().ifBlank { "text/html" },
                    encoding = cab.getOrNull(1).orEmpty().ifBlank { "utf-8" },
                )
            }
        }
    } catch (e: Exception) { null }

    /**
     * Carimba a hora do último dado bom — EM DISCO.
     *
     * Guardar só na memória fazia a faixa dizer "sem dados salvos" logo depois
     * de a TV reiniciar sem rede, justamente quando o cache estava cheio e
     * salvando a parede. O carimbo tem de sobreviver ao mesmo desligamento que
     * o cache sobrevive, senão ele mente sobre o que está na tela.
     */
    fun marcarSucesso(ctx: Context) {
        val agora = System.currentTimeMillis()
        _sincronizadoEm.value = agora
        _semRede.value = false
        try {
            File(pasta(ctx), CARIMBO).writeText(agora.toString())
        } catch (e: Exception) { /* a faixa só perde a hora, não o dado */ }
    }

    /** Relê o carimbo do disco ao abrir, antes de qualquer requisição. */
    fun restaurar(ctx: Context) {
        try {
            val f = File(pasta(ctx), CARIMBO)
            if (f.exists()) _sincronizadoEm.value = f.readText().trim().toLongOrNull() ?: 0L
        } catch (e: Exception) { /* segue com 0 */ }
    }

    private const val CARIMBO = "sincronizado.txt"

    fun marcarFalha() { _semRede.value = true }

    /**
     * Corta o cache quando ele passa do teto, do arquivo mais velho para o mais
     * novo. Nunca apaga tudo: numa TV que ficou dias offline, o cache é a única
     * coisa entre a parede e uma tela de erro.
     */
    private fun podar(ctx: Context) {
        try {
            val arquivos = pasta(ctx).listFiles()
                ?.filter { it.name != CARIMBO && it.name != "versao.txt" }
                ?.sortedBy { it.lastModified() } ?: return
            var total = arquivos.sumOf { it.length() }
            if (total <= TETO_BYTES) return

            // O ESQUELETO por último. O HTML e os scripts são o que faz a página
            // abrir; os dados (JSON) a página busca depois. Se a poda comer o
            // esqueleto antes dos dados, a parede não consegue nem BOOTAR
            // offline — fica pior do que ter dados velhos. Então derrubamos
            // primeiro o que é descartável (dados/imagens) e só tocamos no
            // esqueleto se, mesmo assim, ainda estourar o teto.
            val (esqueleto, descartavel) = arquivos.partition { ehEsqueleto(it) }
            for (f in descartavel + esqueleto) {
                if (total <= TETO_BYTES) break
                total -= f.length()
                f.delete()
            }
        } catch (e: Exception) { /* cache cheio é melhor que crash */ }
    }

    /** HTML e JavaScript = o que a página precisa para desenhar antes de buscar dados. */
    private fun ehEsqueleto(f: File): Boolean = try {
        val cab = f.inputStream().bufferedReader().use { it.readLine() }.orEmpty().lowercase()
        cab.contains("text/html") || cab.contains("javascript")
    } catch (e: Exception) { false }
}
