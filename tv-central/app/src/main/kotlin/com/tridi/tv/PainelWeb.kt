package com.tridi.tv

import android.annotation.SuppressLint
import android.graphics.Color as CorAndroid
import android.os.Build
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Mostra o painel do ERP — a MESMA página que abre no navegador.
 *
 * O app tinha uma segunda implementação de cada painel, desenhada em Compose,
 * e ela era condenada a divergir: o painel de verdade evolui na web, ganha
 * cor, bloco e correção, e a cópia nativa fica para trás até alguém reescrevê-la
 * e publicar um APK novo. Toda diferença que aparecia na parede era isso.
 *
 * Abrindo a página, três coisas deixam de ser trabalho:
 *
 * • O visual é o que a pessoa aprovou no navegador, incluindo a pele clara —
 *   sem repintar nada aqui.
 * • Mudança no painel chega na TV no próximo ciclo, sem atualizar o aplicativo.
 * • Retrato e paisagem já são resolvidos pelo layout responsivo do site.
 *
 * O que continua sendo trabalho do app nativo é o que só ele pode fazer: ligar
 * sozinho, ficar em quiosque, se atualizar à distância e girar a tela numa ROM
 * que não gira.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PainelWeb(url: String, modifier: Modifier = Modifier) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    // Cache de versão anterior + página nova é o defeito clássico deste tipo de
    // cache, e ele não parece cache: parece a página quebrada. Zerar ao subir
    // de versão é barato — a TV acabou de atualizar, logo está online.
    androidx.compose.runtime.LaunchedEffect(Unit) {
        CacheDaParede.limparSeMudouDeVersao(ctx, BuildConfig.VERSION_NAME)
        CacheDaParede.restaurar(ctx)
    }

    Box(modifier.fillMaxSize()) {
        PainelWebCru(url, Modifier.fillMaxSize())
        AvisoSemInternet()
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun PainelWebCru(url: String, modifier: Modifier = Modifier) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { ctx ->
            WebView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                // Fundo claro desde o primeiro quadro. O WebView nasce branco,
                // mas numa TV box lenta o intervalo até a página pintar aparece
                // como um flash — e preto sobre parede clara é justamente o que
                // se nota de longe.
                setBackgroundColor(CorAndroid.WHITE)

                // Tudo dentro do app: sem isto, um link abriria o navegador da
                // TV por cima do painel, e não há ninguém ali para fechá-lo.
                webViewClient = ClienteComRemendo(ctx.applicationContext, settings.userAgentString)

                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    // A página é feita para tela cheia: deixá-la decidir a
                    // largura evita o zoom "de celular" que o WebView aplica
                    // quando acha que está num aparelho pequeno.
                    loadWithOverviewMode = true
                    useWideViewPort = true
                    setSupportZoom(false)
                    builtInZoomControls = false
                    displayZoomControls = false
                    // A parede fica ligada o dia inteiro: o cache normal evita
                    // rebaixar o mesmo HTML a cada recarga, e a página já cuida
                    // do próprio ritmo de atualização.
                    cacheMode = WebSettings.LOAD_DEFAULT
                    mediaPlaybackRequiresUserGesture = false
                }
                loadUrl(url)
            }
        },
        // O `update` recarrega só quando a URL muda de fato — trocar de perfil
        // não pode custar um recarregamento a cada recomposição.
        update = { web -> if (web.url != url) web.loadUrl(url) },
    )
}

/**
 * A faixa que aparece quando a internet cai.
 *
 * Fica num canto e não empurra nada: os números continuam onde estavam, e quem
 * passa na frente entende sozinho por que eles não mudam. Uma tela de erro no
 * lugar do painel resolveria menos — a informação de ontem ainda serve para
 * quase toda decisão de chão de fábrica; o que não serve é não saber que ela é
 * de ontem.
 *
 * Some sozinha quando a rede volta, porque quem guarda o estado é o cliente do
 * WebView: qualquer requisição bem-sucedida marca o retorno.
 */
@Composable
private fun AvisoSemInternet() {
    val semRede by CacheDaParede.semRede.collectAsState()
    val desde by CacheDaParede.sincronizadoEm.collectAsState()
    if (!semRede) return

    val quando = remember(desde) {
        if (desde <= 0L) "sem dados salvos"
        else "dados de " + android.text.format.DateFormat.format("dd/MM HH:mm", desde)
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomEnd) {
        Text(
            "Sem internet · $quando",
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .padding(16.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xCC8A5A00))
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
}

/**
 * Entrega a página ao WebView com o remendo que ele precisa para rodá-la.
 *
 * O WebView de fábrica de uma TV box com Android 7 é o Chrome 55, de 2016, e
 * não conhece `globalThis` — que o runtime do site usa na primeira linha. O
 * resultado media exatamente uma TELA PRETA: os scripts morriam em
 * `ReferenceError` e o React nunca chegava a desenhar.
 *
 * Duas tentativas mais simples falharam, e vale registrar por quê:
 *
 * • `evaluateJavascript` no `onPageStarted` roda DEPOIS dos scripts do
 *   documento — tarde demais.
 * • Um `<script>` no `<head>` da página também não serve: o Next injeta os
 *   chunks dele antes de qualquer marcação nossa (medido: posição 1113 contra
 *   5002), então o erro acontece antes de o remendo existir.
 *
 * Só sobra interceptar o HTML e inserir o remendo no topo, que é o que este
 * cliente faz. Custa o streaming da primeira página — ela é lida inteira antes
 * de ser entregue —, e numa parede que carrega uma vez por dia isso não pesa.
 *
 * Age só no documento principal e só quando o WebView é antigo: em aparelho
 * novo devolve `null`, e o WebView carrega a página por conta própria, como
 * sempre.
 */
private class ClienteComRemendo(
    /** Para guardar e reler o que a parede precisa quando a internet cai. */
    private val ctx: android.content.Context,
    /**
     * O agente do WebView, lido na criação.
     *
     * Tem de vir de fora: `shouldInterceptRequest` roda numa thread de rede, e
     * qualquer método do WebView chamado ali lança
     * "A WebView method was called on thread 'Chrome_FileThread'". O remendo
     * inteiro falhava por causa disso — e falhava em silêncio, com a mesma tela
     * preta de antes.
     */
    private val agente: String,
) : WebViewClient() {

    /**
     * Busca na REDE e guarda; se a rede falhar, devolve o que foi guardado.
     *
     * A ordem importa e é sempre esta. Um cache que responde antes da rede
     * mostra número velho numa TV com internet — o defeito mais caro que este
     * arquivo poderia ter, porque ninguém desconfia de uma tela que parece
     * normal. Aqui o cache só existe para o momento em que a rede não responde.
     */
    override fun shouldInterceptRequest(
        view: WebView, request: WebResourceRequest,
    ): WebResourceResponse? {
        if (!request.method.equals("GET", ignoreCase = true)) return null
        val url = request.url.toString()
        if (!url.startsWith("http")) return null

        val principal = request.isForMainFrame
        try {
            val conexao = (URL(url).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = 12_000
                readTimeout = 20_000
                // O site decide o que servir pelo agente; manter o do próprio
                // WebView evita receber uma variante que ele não saberia rodar.
                setRequestProperty("User-Agent", agente)
                request.requestHeaders["Accept"]?.let { setRequestProperty("Accept", it) }
            }
            val codigo = conexao.responseCode
            if (codigo !in 200..299) {
                conexao.disconnect()
                // Resposta ruim NÃO vira tela boa. Um 500/502/manutenção no
                // frame principal, se deixado passar, viraria a tela de erro do
                // navegador na parede — pior que o último dado bom. Então, para
                // a PÁGINA, servimos o cache quando o servidor tropeça (é
                // efetivamente "sem dado fresco"); e nunca guardamos a resposta
                // ruim como se fosse boa. Sub-recurso com erro segue o fluxo
                // normal do WebView.
                if (principal) {
                    CacheDaParede.ler(ctx, url)?.let { g ->
                        CacheDaParede.marcarFalha()
                        return WebResourceResponse(g.mime, g.encoding, ByteArrayInputStream(g.bytes))
                    }
                }
                return null
            }
            val mime = (conexao.contentType ?: "").substringBefore(';').trim()
                .ifBlank { "application/octet-stream" }
            val bytes = conexao.inputStream.use { it.readBytes() }
            conexao.disconnect()

            val ehHtml = mime.contains("text/html", ignoreCase = true)
            val corpo = if (principal && ehHtml && precisaDeRemendo) {
                comRemendo(String(bytes, Charsets.UTF_8)).toByteArray(Charsets.UTF_8)
            } else bytes

            CacheDaParede.guardar(ctx, url, corpo, mime, "utf-8")
            return WebResourceResponse(mime, "utf-8", ByteArrayInputStream(corpo))
        } catch (e: Exception) {
            // Sem internet. O último dado bom continua no ar — é a diferença
            // entre uma parede desatualizada e uma parede com a tela de erro do
            // navegador, que não diz nada a quem passa na frente.
            val guardado = CacheDaParede.ler(ctx, url)
            if (guardado == null) {
                Log.w("TridiTV", "sem rede e sem cache para $url", e)
                if (principal) CacheDaParede.marcarFalha()
                return null
            }
            CacheDaParede.marcarFalha()
            return WebResourceResponse(
                guardado.mime, guardado.encoding, ByteArrayInputStream(guardado.bytes),
            )
        }
    }

    /** Enfia o remendo como PRIMEIRA coisa do documento. */
    private fun comRemendo(html: String): String {
        val marca = html.indexOf("<head", ignoreCase = true)
        if (marca < 0) return REMENDO + html
        val fim = html.indexOf('>', marca)
        if (fim < 0) return REMENDO + html
        return html.substring(0, fim + 1) + REMENDO + html.substring(fim + 1)
    }

    private companion object {
        /**
         * `globalThis` chegou no Chrome 71. Abaixo disso o site não roda, e é
         * exatamente a faixa em que vive a TV box de galpão.
         */
        val precisaDeRemendo: Boolean = Build.VERSION.SDK_INT < 28

        const val REMENDO =
            "<script>if(typeof globalThis==='undefined'){" +
                "Object.defineProperty(Object.prototype,'__g__'," +
                "{get:function(){return this},configurable:true});" +
                "__g__.globalThis=__g__;delete Object.prototype.__g__;}</script>"
    }
}
