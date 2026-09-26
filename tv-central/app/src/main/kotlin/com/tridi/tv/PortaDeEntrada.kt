package com.tridi.tv

import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.provider.Settings
import com.tridi.tv.fleet.DedoDaFrota
import java.net.NetworkInterface

/**
 * O que esta TV precisa expor para virar 100% automática — e nada além disso.
 *
 * Instalar atualização SEM ninguém apertar nada tem um único caminho no
 * Android: o app ser **device owner**. Não é preferência nossa; é desenho do
 * sistema, e não há truque que substitua. Device owner, por sua vez, se
 * concede uma única vez por ADB, num aparelho sem conta configurada.
 *
 * Numa TV box de galpão isso trava numa pergunta boba que ninguém consegue
 * responder: **qual é o IP dela, e ela aceita ADB pela rede?** A ROM esconde as
 * duas coisas em menus com nome diferente em cada fabricante, e sem elas a
 * pessoa fica tentando adivinhar de escada.
 *
 * Este arquivo responde as duas, e mostra na tela. Depois de concedido o device
 * owner, nada aqui é mais usado — é um andaime para o dia da instalação.
 */
object PortaDeEntrada {

    /**
     * O IP desta TV na rede local.
     *
     * Não serve o IP que o servidor enxerga (aquele é o da operadora, igual
     * para o prédio inteiro). Quem vai digitar `adb connect` está no mesmo
     * Wi-Fi, e precisa do endereço interno.
     *
     * Percorre as interfaces em vez de perguntar ao WifiManager porque TV box
     * costuma estar no CABO, e aí o Wi-Fi responde 0.0.0.0 com toda a
     * convicção.
     */
    fun ipLocal(context: Context): String? {
        try {
            for (iface in NetworkInterface.getNetworkInterfaces()) {
                if (iface.isLoopback || !iface.isUp) continue
                for (addr in iface.inetAddresses) {
                    val ip = addr.hostAddress ?: continue
                    // Só IPv4: é o que `adb connect` aceita sem cerimônia.
                    if (!addr.isLoopbackAddress && ip.count { it == '.' } == 3) return ip
                }
            }
        } catch (e: Exception) { /* cai no WifiManager abaixo */ }
        return try {
            @Suppress("DEPRECATION")
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            val n = wm.connectionInfo?.ipAddress ?: 0
            if (n == 0) null
            else "${n and 0xff}.${n shr 8 and 0xff}.${n shr 16 and 0xff}.${n shr 24 and 0xff}"
        } catch (e: Exception) { null }
    }

    /** A porta em que esta ROM aceita ADB por rede, ou `null` se não aceita. */
    fun portaAdbDeRede(): String? = try {
        // `service.adb.tcp.port` é o que decide, e várias TV boxes chinesas já
        // vêm com ele em 5555 de fábrica — é ADB de rede ligado, coisa que a
        // tela de "depuração sem fio" dos aparelhos modernos nem menciona.
        val p = Runtime.getRuntime().exec(arrayOf("getprop", "service.adb.tcp.port"))
            .inputStream.bufferedReader().readText().trim()
        p.ifBlank { null }
    } catch (e: Exception) { null }

    /** Se a depuração USB/ADB está habilitada nas opções de desenvolvedor. */
    fun adbLigado(context: Context): Boolean = try {
        Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
    } catch (e: Exception) { false }

    /**
     * Uma frase que diz, sem jargão, se esta TV já pode virar automática.
     *
     * A pessoa na frente da TV não quer um relatório: quer saber se dá ou não
     * dá, e o que digitar. Por isso a linha termina no comando pronto quando o
     * caminho está aberto.
     */
    fun diagnostico(context: Context): String {
        // Ordem pelo que é MELHOR para a TV, não pelo que é mais fácil de
        // explicar: device owner instala sem abrir tela nenhuma; o dedo abre a
        // tela e a confirma sozinho. Os dois dispensam alguém na frente da TV.
        if (com.tridi.tv.core.kiosk.Kiosk.ehDeviceOwner(context)) {
            return "Atualização automática LIGADA — esta TV instala sozinha, sem abrir nada."
        }
        if (DedoDaFrota.ligado(context)) {
            return "Atualização automática LIGADA — a confirmação é apertada sozinha."
        }
        val ip = ipLocal(context)
        val porta = portaAdbDeRede()
        return when {
            porta != null && porta != "-1" && ip != null ->
                "Dá para deixar 100% automática. No computador:  adb connect $ip:$porta"
            else ->
                "Ligue \"Atualização automática\" abaixo — sem isso, cada atualização espera alguém apertar."
        }
    }

    /** Se ainda há algo a fazer para esta TV se atualizar sem ajuda. */
    fun jaEhAutomatica(context: Context): Boolean =
        com.tridi.tv.core.kiosk.Kiosk.ehDeviceOwner(context) || DedoDaFrota.ligado(context)

    /**
     * Abre Ajustes → Acessibilidade, onde a pessoa liga a chave do app.
     *
     * O Android não deixa um app se conceder acessibilidade — a decisão é da
     * pessoa, na tela do sistema, e é assim que tem de ser. O que dá para fazer
     * é levar direto à lista, em vez de mandar procurar num menu que muda de
     * nome em cada ROM.
     */
    fun abrirAcessibilidade(context: Context) {
        for (acao in listOf(
            Settings.ACTION_ACCESSIBILITY_SETTINGS,
            Settings.ACTION_SETTINGS,
        )) {
            try {
                context.startActivity(Intent(acao).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            } catch (e: Exception) { /* tenta a próxima */ }
        }
    }
}
