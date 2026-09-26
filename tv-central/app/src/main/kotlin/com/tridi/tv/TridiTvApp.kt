package com.tridi.tv

import android.app.Application
import android.util.Log
import com.tridi.tv.core.network.ApiClient
import com.tridi.tv.core.sinal.SinalDaParede
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.tridi.tv.core.storage.DeviceStore
import com.tridi.tv.fleet.FleetAgent
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.android.HiltAndroidApp
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@HiltAndroidApp
class TridiTvApp : Application(), coil.ImageLoaderFactory {

    /**
     * Fotos que sobrevivem sem internet.
     *
     * O Storage manda a foto da vendedora com cabeçalho de cache curto, e o
     * Coil, obedecendo, ia à rede para REVALIDAR antes de mostrar a cópia do
     * disco — sem rede, a validação falha e o pódio nasce com círculos vazios,
     * mesmo com a foto guardada. `respectCacheHeaders(false)`: o que está no
     * disco vale; a cópia é renovada quando a rede voltar, sem ninguém notar.
     */
    override fun newImageLoader(): coil.ImageLoader = coil.ImageLoader.Builder(this)
        .respectCacheHeaders(false)
        .diskCache {
            coil.disk.DiskCache.Builder()
                .directory(cacheDir.resolve("fotos"))
                .maxSizeBytes(64L * 1024 * 1024)
                .build()
        }
        .build()

    // Pega as dependências Hilt sem transformar a Application num alvo de
    // injeção (que exige mais cerimônia). O agente é um objeto simples.
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface FleetEntryPoint {
        fun api(): ApiClient
        fun store(): DeviceStore
        fun sinal(): SinalDaParede
    }

    override fun onCreate() {
        super.onCreate()
        // Primeiro de tudo: sem ADB na TV do galpao, isto e a unica forma de
        // saber POR QUE o app quebrou.
        CaixaPreta.instalar(this)
        iniciarAgenteDaFrota()
    }

    /**
     * Liga o agente da frota SEM poder derrubar o app.
     *
     * Regra que vale mais que o agente inteiro: **a parede tem que acender**.
     * Um erro aqui — Hilt ainda não pronto, DataStore corrompido, R8 tendo
     * removido algo alcançado por reflexão — mataria o processo dentro do
     * `onCreate` da Application, e a TV mostraria "Tridi Painéis parou" em vez
     * do painel. Gestão remota é conveniência; exibir o painel é a função.
     *
     * Por isso: try/catch em volta de tudo, e o começo ADIADO. O `onCreate` da
     * Application é caminho crítico de arranque — qualquer coisa feita aqui
     * atrasa a primeira tela, e o agente não tem pressa nenhuma (o primeiro
     * ciclo dele pode acontecer 15 segundos depois sem prejuízo).
     */
    private fun iniciarAgenteDaFrota() {
        try {
            val escopo = CoroutineScope(SupervisorJob() + Dispatchers.IO)
            escopo.launch {
                try {
                    // Deixa a TV desenhar o painel primeiro.
                    delay(15_000)
                    val ep = EntryPointAccessors.fromApplication(
                        this@TridiTvApp, FleetEntryPoint::class.java,
                    )
                    val sinal = ep.sinal()
                    FleetAgent(applicationContext, ep.api(), ep.store()).iniciar(escopo, sinal)
                    // O endereço do sinal vem de uma rota pública e sem banco,
                    // uma leitura por boot. Guardado, vale offline; a próxima
                    // leitura só troca se mudar.
                    escopo.launch {
                        try {
                            val v = ep.api().getRaw("/api/version")
                            val s = Json { ignoreUnknownKeys = true }.parseToJsonElement(v).jsonObject["sinal"]?.jsonObject
                            val url = s?.get("url")?.jsonPrimitive?.contentOrNull
                            val chave = s?.get("chave")?.jsonPrimitive?.contentOrNull
                            if (!url.isNullOrBlank() && !chave.isNullOrBlank()) ep.store().setSinal(url, chave)
                        } catch (e: Exception) {
                            Log.w("TridiSinal", "sem endereço do sinal ainda — o poll cobre", e)
                        }
                    }
                    sinal.iniciar(escopo)
                } catch (e: Throwable) {
                    Log.w("TridiFleet", "agente não subiu — a TV segue mostrando o painel", e)
                }
            }
        } catch (e: Throwable) {
            Log.w("TridiFleet", "não consegui nem criar o escopo do agente", e)
        }
    }
}
