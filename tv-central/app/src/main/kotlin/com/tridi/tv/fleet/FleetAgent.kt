package com.tridi.tv.fleet

import android.content.Context
import android.content.Intent
import android.util.Log
import com.tridi.tv.core.network.ApiClient
import com.tridi.tv.core.sinal.Evento
import com.tridi.tv.core.sinal.SinalDaParede
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.storage.DeviceStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.tridi.tv.BuildConfig
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.security.MessageDigest

/**
 * Agente da frota — o que faz a caixa se atualizar e obedecer comandos do
 * console, SEM root, pelo privilégio de device owner.
 *
 * Roda um laço simples (não WorkManager): a TV é um aparelho sempre ligado, e
 * um `while(delay)` num escopo de processo é mais previsível que o
 * WorkManager, que neste app já foi fonte de crash (ver CLAUDE.md do projeto).
 *
 * Só age quando há token pareado E o aparelho é device owner — em qualquer
 * outra TV o agente fica quieto, e a MESMA APK roda nas duas.
 */
class FleetAgent(
    private val appContext: Context,
    private val api: ApiClient,
    private val store: DeviceStore,
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    // Estado do freio de atualização (ver `aplicarUpdate`). Vive no processo:
    // se a TV reiniciar, tentar de novo é exatamente o certo.
    private var ultimaTentativaVersao = -1
    private var ultimaTentativaEm = 0L

    @Serializable private data class Atualizacao(
        val versionCode: Int, val versionName: String = "",
        val url: String, val sha256: String, val obrigatoria: Boolean = false,
    )
    @Serializable private data class Comando(
        val id: String, val tipo: String,
        val args: Map<String, String> = emptyMap(),
    )
    @Serializable private data class Sync(
        val atualizacao: Atualizacao? = null,
        val comandos: List<Comando> = emptyList(),
    )

    fun iniciar(scope: CoroutineScope, sinal: SinalDaParede? = null) {
        scope.launch {
            while (true) {
                try { ciclo() } catch (e: Exception) { Log.w("TridiFleet", "ciclo falhou", e) }
                // 15 min: o laço é RESERVA. Versão publicada e comando chegam
                // pelo sinal (abaixo) em segundos; o laço cobre o dia em que o
                // socket não abre. Antes era 60 s — 1.440 invocações por TV
                // por dia só para ouvir "nada mudou".
                delay(15 * 60_000L)
            }
        }
        sinal ?: return
        scope.launch {
            sinal.eventos.collect { ev ->
                val paraMim = when (ev) {
                    is Evento.Versao -> true
                    // Lista vazia = para todos. Sem id ainda (TV pareada por
                    // versão antiga) reage a tudo: um sync a mais é barato.
                    is Evento.Comando -> ev.dispositivos.isEmpty() ||
                        (store.deviceId()?.let { it in ev.dispositivos } ?: true)
                    else -> false
                }
                if (paraMim) {
                    try { ciclo() } catch (e: Exception) { Log.w("TridiFleet", "ciclo pelo sinal falhou", e) }
                }
            }
        }
    }

    private suspend fun ciclo() {
        // Entra na frota SOZINHA na primeira vez que conseguir falar com o
        // servidor.
        //
        // Isto era um botão, e o botão era o defeito: uma TV só podia ser
        // gerenciada depois que alguém subisse até ela, achasse a tela de
        // configuração e apertasse "Entrar na frota". Quem instalou o app e
        // escolheu um painel nunca passou por ali — e o resultado foi uma TV
        // pendurada, funcionando, e invisível para o console. Gestão remota que
        // depende de uma visita presencial não é gestão remota.
        //
        // O nome nasce do aparelho e pode ser trocado depois, na tela ou no
        // console. Nome provisório é problema pequeno; TV inalcançável não é.
        if (store.deviceToken() == null) {
            if (!entrarNaFrotaSozinha()) return
        }
        val vc = versionCodeAtual()
        val vn = versionNameAtual()
        val corpo = """{"versionCode":$vc,"versionName":${esc(vn)}}"""
        val resp = try {
            api.postRaw("/api/tv/device/sync", corpo)
        } catch (e: Exception) {
            // 401: o token não vale mais — a TV foi removida do console, ou o
            // banco foi trocado. Sem isto ela vira zumbi: continua ligada,
            // mostrando o painel, e nunca mais aparece na frota, porque insiste
            // para sempre num token morto. Pior, o token velho vai junto em
            // TODA requisição, então até a lista de perfis passa a ser negada.
            //
            // Esquecer e entrar de novo é seguro: o registro é idempotente pelo
            // nome, e quem foi removido de propósito volta com nome conhecido —
            // um clique em Remover resolve, e é melhor que uma TV invisível.
            if (e.message?.contains("401") == true) {
                Log.w("TridiFleet", "token recusado — vou entrar na frota de novo")
                // `deviceToken()` já lê vazio como "não tenho token", então
                // gravar vazio é o suficiente para o próximo ciclo registrar.
                store.setDeviceToken("")
            }
            throw e
        }
        val sync = json.decodeFromString(Sync.serializer(), resp)

        sync.atualizacao?.let { aplicarUpdate(it) }
        for (c in sync.comandos) executar(c)
    }

    /**
     * Registra esta TV na frota sem pedir nada a ninguém.
     *
     * Devolve `true` quando ficou pareada — e só então o ciclo segue. Falhar é
     * normal (TV sem rede ainda, servidor fora): o próximo ciclo tenta de novo,
     * a cada minuto, até entrar.
     *
     * O nome sai do ANDROID_ID: estável para a mesma TV, diferente entre TVs, e
     * curto o bastante para caber numa lista. É provisório por natureza — a
     * ideia é que quem estiver no console renomeie para "Expedição", "Produção".
     */
    private suspend fun entrarNaFrotaSozinha(): Boolean {
        return try {
            val nome = store.deviceName.first()?.takeIf { it.isNotBlank() } ?: nomeDeFabrica()
            val corpo = buildString {
                append("{\"nome\":"); append(esc(nome))
                append(",\"segredo\":"); append(esc(BuildConfig.TV_REGISTRO_SEGREDO))
                append(",\"modelo\":"); append(esc(identificacaoDoAparelho()))
                append("}")
            }
            val resp = api.postRaw("/api/tv/device/registrar", corpo)
            val obj = json.parseToJsonElement(resp).jsonObject
            val token = obj["token"]?.jsonPrimitive?.content
            if (token.isNullOrBlank()) {
                false
            } else {
                store.setDeviceToken(token)
                store.setDeviceName(nome)
                // O id é o que deixa a TV saber se um comando é para ela.
                obj["dispositivo"]?.jsonObject?.get("id")?.jsonPrimitive?.content
                    ?.takeIf { it.isNotBlank() }?.let { store.setDeviceId(it) }
                Log.i("TridiFleet", "entrei na frota sozinha como \"$nome\"")
                true
            }
        } catch (e: Exception) {
            // Sem rede ainda, ou servidor fora. O próximo ciclo tenta de novo.
            Log.w("TridiFleet", "ainda não entrei na frota", e)
            false
        }
    }

    private fun nomeDeFabrica(): String {
        val id = try {
            android.provider.Settings.Secure.getString(
                appContext.contentResolver, android.provider.Settings.Secure.ANDROID_ID,
            ).orEmpty()
        } catch (e: Exception) { "" }
        val sufixo = id.takeLast(4).ifBlank { android.os.Build.MODEL.takeLast(4) }
        return "TV $sufixo"
    }

    /** Modelo, versão real do Android, API e a versão do WebView. */
    private fun identificacaoDoAparelho(): String =
        "${android.os.Build.MODEL} · Android ${android.os.Build.VERSION.RELEASE}" +
            " (API ${android.os.Build.VERSION.SDK_INT}) · WebView ${versaoWebView()}"

    /**
     * A versão do motor que RENDERIZA o painel — o número que decide se a
     * página sai igual ao navegador ou "espremida".
     *
     * O painel usa CSS moderno (Grid, clamp, container queries) que só existe a
     * partir de certas versões do Chrome; o WebView de fábrica de uma TV box
     * costuma ser bem mais velho. Esse número é o que ninguém consegue ver na
     * TV e é exatamente o que precisamos para decidir a estratégia — então ele
     * vai para o console junto do modelo.
     *
     * Lido pelo PackageManager (e não por WebView.getCurrentWebViewPackage,
     * API 26+) para funcionar já no Android 7 e fora da thread de UI.
     */
    private fun versaoWebView(): String = try {
        listOf("com.google.android.webview", "com.android.webview", "com.android.chrome")
            .firstNotNullOfOrNull {
                try { appContext.packageManager.getPackageInfo(it, 0).versionName?.substringBefore('.') }
                catch (e: Exception) { null }
            } ?: "?"
    } catch (e: Exception) { "?" }

    private suspend fun aplicarUpdate(a: Atualizacao) {
        // Nao exige mais device owner: sem ele o FleetInstaller cai no caminho
        // ASSISTIDO (abre a tela de instalacao e alguem confirma no controle).
        // Havia TV box cuja ROM nao expoe ADB nem por USB nem por rede — nela o
        // device owner e impossivel, e desistir aqui condenava a caixa a
        // atualizar so por pen drive, na mao.
        if (a.versionCode <= versionCodeAtual()) return

        // Freio. Numa TV que NÃO é device owner, a instalação espera alguém
        // confirmar no controle — e ninguém confirma às três da manhã. Sem este
        // freio o ciclo de 60s rebaixaria 2,3 MB e reabriria a tela de
        // instalação por cima do painel a cada minuto, a noite inteira: a
        // parede fica inútil e a caixa passa o dia baixando o mesmo arquivo.
        val agora = System.currentTimeMillis()
        if (a.versionCode == ultimaTentativaVersao && agora - ultimaTentativaEm < ESPERA_ENTRE_TENTATIVAS) return
        ultimaTentativaVersao = a.versionCode
        ultimaTentativaEm = agora

        // Reaproveita o download quando o arquivo em cache já é esta versão:
        // depois de uma tentativa assistida o APK certo já está no aparelho, e
        // baixá-lo de novo só gasta banda do galão e egress do servidor.
        val cache = File(appContext.cacheDir, "fleet-update.apk")
        val apk = if (cache.exists() && a.sha256.equals(sha256(cache), ignoreCase = true)) cache
                  else baixar(a.url) ?: return
        val ok = a.sha256.equals(sha256(apk), ignoreCase = true)
        if (!ok) {
            Log.w("TridiFleet", "sha256 do APK não confere — descartando")
            apk.delete(); return
        }
        // Avisa o "dedo" ANTES de mandar instalar: é essa janela de dois
        // minutos que autoriza ele a confirmar a tela que está prestes a
        // aparecer. Sem device owner e sem ninguém por perto, é o que faz a
        // atualização terminar. Numa TV que é device owner nada disso é usado —
        // ali a instalação nem abre tela.
        DedoDaFrota.esperarInstalacao(appContext)
        FleetInstaller.instalar(appContext, apk)
        // Não apaga o APK aqui: o commit mata o processo. O cache é limpo no
        // próximo boot (arquivo em cacheDir, o sistema recupera o espaço).
    }

    private suspend fun executar(c: Comando) {
        var ok = true
        var resultado: String? = null
        try {
            when (c.tipo) {
                "atualizar_agora" -> {
                    // Força o caminho de update já: refaz o sync e instala se houver.
                    val resp = api.postRaw("/api/tv/device/sync", """{"versionCode":${versionCodeAtual()}}""")
                    json.decodeFromString(Sync.serializer(), resp).atualizacao?.let { aplicarUpdate(it) }
                }
                "reiniciar" -> relancar()
                "abrir_painel" -> {
                    // Perfil primeiro: é o desenho publicado no ERP, e é o que
                    // a pessoa escolhe no console. O painel "cru" continua
                    // valendo para quem não usa perfil.
                    val perfil = (c.args["perfil"] as? String)?.trim().orEmpty()
                    if (perfil.isNotEmpty()) {
                        store.selectPerfil(perfil)
                        store.clearPanel()
                        relancar()
                    } else {
                        val painel = mapearPainel(c.args["painel"])
                        if (painel == null) { ok = false; resultado = "painel sem equivalente neste app" }
                        else {
                            store.clearPerfil()
                            store.selectPanel(PanelId(painel))
                            relancar()
                        }
                    }
                }
                "girar" -> {
                    // Virar a tela sem escada. Uma TV pendurada em retrato é
                    // decidida na parede, não na mesa — e descobrir isso depois
                    // de instalada significava subir de novo só para apertar um
                    // botão de configuração.
                    val graus = (c.args["graus"] as? String)?.toIntOrNull()
                        ?: (c.args["graus"] as? Number)?.toInt()
                    if (graus == null || graus % 90 != 0) {
                        ok = false; resultado = "giro inválido"
                    } else {
                        store.setGiroTela(graus)
                        resultado = "tela girada para $graus°"
                    }
                }
                "logs" -> resultado = ultimasLinhasDeLog()
                else -> { ok = false; resultado = "comando desconhecido" }
            }
        } catch (e: Exception) { ok = false; resultado = e.message }
        // Devolve o resultado — fecha o comando na fila do console.
        try {
            val body = buildString {
                append("{\"id\":"); append(esc(c.id))
                append(",\"ok\":"); append(ok)
                if (resultado != null) { append(",\"resultado\":"); append(esc(resultado!!)) }
                append("}")
            }
            api.postRaw("/api/tv/device/resultado", body)
        } catch (e: Exception) { Log.w("TridiFleet", "não devolveu resultado", e) }
    }

    /**
     * Os painéis WEB (vendas/producao/logistica/maquinas) mapeados nos painéis
     * NATIVOS deste app (administracao/logistica/producao). "maquinas" ainda não
     * existe nativo — devolve null, e o console mostra que não deu.
     */
    private fun mapearPainel(web: String?): String? = when (web) {
        "producao" -> "producao"
        "logistica" -> "logistica"
        "vendas" -> "administracao"
        else -> null
    }

    private fun relancar() {
        val intent = appContext.packageManager.getLaunchIntentForPackage(appContext.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        if (intent != null) appContext.startActivity(intent)
    }

    /** As últimas linhas do log do PRÓPRIO processo (não precisa de READ_LOGS). */
    private fun ultimasLinhasDeLog(): String = try {
        val p = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "-t", "120", "--pid", android.os.Process.myPid().toString()))
        p.inputStream.bufferedReader().readText().takeLast(4000)
    } catch (e: Exception) { "sem log: ${e.message}" }

    private fun baixar(url: String): File? = try {
        val destino = File(appContext.cacheDir, "fleet-update.apk")
        // Timeout OBRIGATÓRIO. `openStream()` cru não tem teto: numa rede que
        // responde pela metade (Wi-Fi de galpão), o copyTo pendura para sempre.
        // Como isto roda dentro do laço do agente, um download travado congela
        // TUDO — heartbeat, comandos e as próprias atualizações — e a TV vira
        // zumbi sem ninguém perceber, só o visto_em parando.
        val con = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 30_000
            instanceFollowRedirects = true
        }
        con.inputStream.use { input ->
            destino.outputStream().use { input.copyTo(it) }
        }
        con.disconnect()
        destino
    } catch (e: Exception) { Log.w("TridiFleet", "download falhou", e); null }

    private fun sha256(f: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { s ->
            val buf = ByteArray(8192); var n = s.read(buf)
            while (n > 0) { md.update(buf, 0, n); n = s.read(buf) }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    /** Escapa uma string pra montar JSON na mão, sem depender de serializer. */
    private fun esc(s: String): String {
        val b = StringBuilder("\"")
        for (c in s) when (c) {
            '\\' -> b.append("\\\\")
            '"' -> b.append("\\\"")
            '\n' -> b.append("\\n")
            '\r' -> b.append("\\r")
            '\t' -> b.append("\\t")
            else -> if (c < ' ') b.append("\\u%04x".format(c.code)) else b.append(c)
        }
        b.append("\"")
        return b.toString()
    }

    private fun versionCodeAtual(): Int = try {
        val pi = appContext.packageManager.getPackageInfo(appContext.packageName, 0)
        @Suppress("DEPRECATION") pi.versionCode
    } catch (e: Exception) { 0 }

    private fun versionNameAtual(): String = try {
        appContext.packageManager.getPackageInfo(appContext.packageName, 0).versionName ?: ""
    } catch (e: Exception) { "" }

    private companion object {
        /** Meia hora entre duas tentativas da MESMA versão. Longo o bastante
         *  pra não atrapalhar quem está olhando a parede, curto o bastante pra
         *  pegar o turno seguinte sem ninguém ir até lá. */
        const val ESPERA_ENTRE_TENTATIVAS = 30 * 60_000L
    }
}
