package com.tridi.estoque.kiosk

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log

// A ÚNICA saída do modo totem, e ela é de propósito só pelo adb.
//
// Com device owner + lock task o app vira a casa do aparelho: HOME volta pra
// ele, recentes não sai, e o BootReceiver o traz de volta ao ligar. Sem uma
// porta como esta, nem quem tem o cabo na mão consegue mexer no tablet — só
// restaria reset de fábrica, que apagaria as compras ainda não sincronizadas.
//
// Duas portas, da mais leve pra mais pesada:
//
//   adb shell am broadcast -a com.tridi.estoque.DESTRAVAR --es token <TOKEN>
//     Solta o lock task. O app continua sendo HOME e device owner; serve pra
//     mexer no Android um instante (Wi-Fi, ajustes) e depois é só reabrir.
//
//   adb shell am broadcast -a com.tridi.estoque.DESTRAVAR --es token <TOKEN> --ez remover_owner true
//     Além de soltar, ABRE MÃO do device owner. É irreversível pelo próprio
//     app: pra voltar ao modo totem é preciso rodar o script de novo, e
//     `set-device-owner` exige aparelho sem conta.
//
// O token existe porque o receiver é exported (adb não consegue mandar
// broadcast pra receiver privado). Sem ele, qualquer app instalado no tablet
// destravaria o totem com uma linha.
class DestravarReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getStringExtra("token") != TOKEN) {
            Log.w(TAG, "destravar recusado: token errado")
            return
        }
        val policy = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

        // Quem chama stopLockTask é a Activity, não o receiver — por isso o
        // pedido é repassado por uma flag que a MainActivity lê no onResume.
        destravarPedido = true
        Log.i(TAG, "destravar: lock task liberado no próximo foco da tela")

        if (intent.getBooleanExtra("remover_owner", false)) {
            runCatching {
                val admin = ComponentName(context, EstoqueAdminReceiver::class.java)
                policy.clearPackagePersistentPreferredActivities(admin, context.packageName)
                policy.clearDeviceOwnerApp(context.packageName)
                Log.i(TAG, "device owner removido")
            }.onFailure { Log.e(TAG, "falha ao remover device owner: ${it.message}") }
        }

        // Traz a tela pra frente pra MainActivity.onResume rodar e soltar o
        // lock task na hora, em vez de só no próximo toque.
        runCatching {
            context.startActivity(
                Intent(context, com.tridi.estoque.MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }

    companion object {
        private const val TAG = "TridiEstoqueKiosk"
        // Combinado com o script scripts/tablet-kiosk.sh. Não é segredo de
        // segurança de verdade — é só pra um app qualquer não destravar o
        // totem por acidente.
        const val TOKEN = "tridi-estoque-destravar"

        // Lido pela MainActivity. Enquanto true, ela NÃO reentra em lock task.
        @Volatile
        var destravarPedido: Boolean = false
    }
}
