package com.tridi.tv.fleet

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File

/**
 * Instalação SILENCIOSA do APK — sem root, pelo privilégio de DEVICE OWNER.
 *
 * O device owner é o único não-root que pode `commit()` uma sessão do
 * PackageInstaller sem a tela de confirmação do Android. É update do PRÓPRIO
 * app (com.tridi.tv → com.tridi.tv), então a assinatura tem de bater com a
 * instalada (a keystore interna) — senão o sistema recusa por assinatura, não
 * por permissão.
 *
 * Ao dar commit num update do próprio pacote, o sistema mata este processo e o
 * relança já na versão nova. Numa TV kiosk (launcher), ele volta sozinho.
 */
object FleetInstaller {

    /**
     * Instala a atualizacao. Dois caminhos, escolhidos pelo que o aparelho
     * PERMITE — nao por preferencia:
     *
     * • Device owner  → silencioso, ninguem toca na TV.
     * • Sem device owner → ASSISTIDO: baixa e abre a tela de instalacao do
     *   Android; alguem confirma uma vez no controle.
     *
     * O assistido existe porque nem toda TV box deixa virar device owner: isso
     * exige ADB, e ha caixas cuja ROM nao expoe depuracao nem por USB nem por
     * rede. Sem este caminho, essas TVs so atualizariam por pen drive, na mao,
     * uma por uma — que e exatamente o trabalho que a frota veio eliminar.
     */
    fun instalar(context: Context, apk: File): Boolean =
        if (instalarSilencioso(context, apk)) true else pedirConfirmacao(context, apk)

    /**
     * Abre o instalador do Android. A TV mostra "deseja atualizar?" e alguem
     * aperta OK — um toque no controle, sem ir ate a maquina com pen drive.
     */
    private fun pedirConfirmacao(context: Context, apk: File): Boolean = try {
        val uri: Uri = FileProvider.getUriForFile(
            context, "${context.packageName}.fileprovider", apk,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
        Log.i("TridiFleet", "instalador aberto — aguardando confirmacao no controle")
        true
    } catch (e: Exception) {
        Log.w("TridiFleet", "nao consegui abrir o instalador", e)
        false
    }

    private fun instalarSilencioso(context: Context, apk: File): Boolean {
        return try {
            val pi = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(context.packageName)
            val sessionId = pi.createSession(params)
            pi.openSession(sessionId).use { session ->
                session.openWrite("apk", 0, apk.length()).use { out ->
                    apk.inputStream().use { it.copyTo(out) }
                    session.fsync(out)
                }
                val intent = Intent(context, FleetInstallReceiver::class.java)
                val flags = if (Build.VERSION.SDK_INT >= 31)
                    PendingIntent.FLAG_MUTABLE else 0
                val pending = PendingIntent.getBroadcast(context, sessionId, intent, flags)
                session.commit(pending.intentSender)
            }
            true
        } catch (e: Exception) {
            Log.w("TridiFleet", "instalacao silenciosa falhou — vou pedir confirmacao", e)
            false
        }
    }
}

/**
 * Recebe o resultado do commit. Registrado no manifesto. Numa atualização do
 * próprio app, na prática o processo é morto antes de logar o sucesso — o
 * receiver serve pra registrar a FALHA (assinatura divergente, espaço, etc.).
 */
class FleetInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)
        val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        when (status) {
            PackageInstaller.STATUS_SUCCESS -> {
                Log.i("TridiFleet", "update instalado")
                voltarAoPainel(context)
            }
            PackageInstaller.STATUS_PENDING_USER_ACTION -> abrirConfirmacao(context, intent)
            else -> Log.w("TridiFleet", "update falhou: status=$status $msg")
        }
    }

    /**
     * Reabre o painel assim que a atualizacao entra.
     *
     * Instalar o proprio pacote mata o processo, e o que fica na tela e o que
     * estava atras: numa TV box, o launcher. A atualizacao silenciosa resolvia
     * o trabalho e deixava a parede exibindo a grade de apps — sem ninguem por
     * perto, ate o Vigia passar, quinze minutos depois. Numa parede de galpao
     * quinze minutos de tela errada e a diferenca entre gestao remota e um
     * chamado.
     *
     * Vale so onde este receiver chega a rodar, e isso depende da versao: em
     * Android 7 o sistema faz "Force stopping … pkg removed" logo apos
     * instalar, e app em estado parado nao recebe broadcast nenhum — medido no
     * emulador, o metodo abaixo nunca executou. Quem cobre o caso de verdade e
     * o `MY_PACKAGE_REPLACED` no BootReceiver, entregue a versao NOVA.
     *
     * Fica como complemento porque em Android moderno ele funciona e chega
     * antes. Do Android 10 em diante, abrir Activity a partir do background e
     * restrito e pode ser engolido em silencio; ali quem cobre e o app ser o
     * launcher (CATEGORY_HOME), com o Vigia como ultima linha.
     */
    private fun voltarAoPainel(context: Context) {
        try {
            context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                ?.let(context::startActivity)
        } catch (e: Exception) {
            Log.w("TridiFleet", "instalou, mas nao consegui reabrir o painel", e)
        }
    }

    /**
     * Abre a tela de instalacao do Android numa TV que NAO e device owner.
     *
     * Este e o caminho que quase todo aparelho de galpao percorre, e por muito
     * tempo ele nao existia: `session.commit()` NAO lanca excecao sem o
     * privilegio — ele devolve STATUS_PENDING_USER_ACTION aqui, de forma
     * assincrona. Como `instalar()` ja tinha recebido `true` e seguido em
     * frente, o fallback nunca era alcancado e a atualizacao morria num aviso
     * de log. A TV baixava 2,3 MB a cada minuto, para sempre, sem nunca
     * instalar nada.
     *
     * O sistema entrega no EXTRA_INTENT a tela pronta pra ser aberta — ela ja
     * carrega a sessao, entao nao ha FileProvider nem URI pra montar. So falta
     * a flag de tarefa nova, porque quem dispara e um receiver, nao uma
     * Activity.
     */
    private fun abrirConfirmacao(context: Context, intent: Intent) {
        val confirmar = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
        }
        if (confirmar == null) {
            Log.w("TridiFleet", "sistema pediu confirmacao mas nao mandou a tela")
            return
        }
        try {
            confirmar.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(confirmar)
            Log.i("TridiFleet", "tela de instalacao aberta — confirme no controle")
        } catch (e: Exception) {
            Log.w("TridiFleet", "nao consegui abrir a tela de instalacao", e)
        }
    }
}
