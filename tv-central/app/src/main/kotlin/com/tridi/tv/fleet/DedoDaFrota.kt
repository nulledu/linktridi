package com.tridi.tv.fleet

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * O dedo que aperta "Instalar" quando não há ninguém na frente da TV.
 *
 * Existe porque a instalação verdadeiramente silenciosa exige **device
 * owner**, e device owner exige ADB uma vez — e há TV box sem porta USB e sem
 * depuração por rede na ROM. Nessas caixas o caminho simplesmente não existe:
 * a atualização chega, abre a tela de confirmação, e fica esperando um toque
 * que ninguém vai dar às três da manhã.
 *
 * Um serviço de acessibilidade se liga em Ajustes → Acessibilidade, com o
 * CONTROLE REMOTO. É a única porta de automação que uma TV box sempre tem, e
 * a pessoa não precisa de computador, cabo nem terminal.
 *
 * ## Por que isto não é um robô solto apertando botões
 *
 * Um serviço destes vê tudo o que aparece na tela, então ele é escrito para
 * fazer o mínimo:
 *
 * 1. Só age quando o próprio app AVISOU que mandou instalar algo (janela de
 *    dois minutos, gravada por [esperarInstalacao]). Fora dessa janela ele é
 *    inerte, mesmo que uma tela de instalação apareça.
 * 2. Só age na tela do INSTALADOR do sistema.
 * 3. Só age se o app sendo instalado for ESTE — confere o nome na tela.
 * 4. Só aperta confirmar. Nunca "cancelar", nunca navega, nunca digita, e não
 *    lê nem guarda nada do que passa na tela.
 *
 * Se qualquer uma das quatro falhar, ele não faz nada e a tela fica esperando
 * uma pessoa, como faria sem ele.
 */
class DedoDaFrota : AccessibilityService() {

    override fun onAccessibilityEvent(evento: AccessibilityEvent?) {
        try {
            val pacote = evento?.packageName?.toString() ?: return
            if (!ehInstalador(pacote)) return
            if (!esperandoInstalacao(this)) return

            val raiz = rootInActiveWindow ?: return
            // Guarda 3: é o NOSSO app na tela? Sem isto, o serviço apertaria
            // "instalar" em qualquer APK que aparecesse na janela.
            if (!contemNome(raiz, getString(applicationInfo.labelRes))) return

            val botao = acharConfirmar(raiz) ?: return
            botao.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            Log.i("TridiFleet", "confirmei a instalação pela acessibilidade")
            limparEspera(this)
        } catch (e: Throwable) {
            // Um serviço de acessibilidade que quebra derruba a navegação da TV
            // inteira. Ele nunca pode lançar.
            Log.w("TridiFleet", "dedo da frota falhou — a tela segue esperando alguém", e)
        }
    }

    override fun onInterrupt() { /* nada a desfazer */ }

    private fun ehInstalador(pacote: String) =
        pacote == "com.android.packageinstaller" ||
            pacote == "com.google.android.packageinstaller" ||
            pacote == "com.android.packageinstaller.permission.ui"

    private fun contemNome(no: AccessibilityNodeInfo, nome: String): Boolean {
        if (nome.isBlank()) return false
        return no.findAccessibilityNodeInfosByText(nome)?.isNotEmpty() == true
    }

    /**
     * O botão que confirma, em qualquer idioma que a ROM esteja.
     *
     * TV box costuma vir em inglês mesmo com o Brasil configurado, e a lista de
     * rótulos é curta de propósito: nada que se pareça com "cancelar",
     * "desinstalar" ou "abrir" entra aqui.
     */
    private fun acharConfirmar(raiz: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val rotulos = listOf(
            "Instalar", "INSTALAR", "Atualizar", "ATUALIZAR",
            "Install", "INSTALL", "Update", "UPDATE",
        )
        for (r in rotulos) {
            val achados = raiz.findAccessibilityNodeInfosByText(r) ?: continue
            for (no in achados) {
                val alvo = if (no.isClickable) no else no.parent?.takeIf { it.isClickable }
                if (alvo != null && alvo.isEnabled) return alvo
            }
        }
        return null
    }

    companion object {
        private const val ARQ = "tridi_dedo"
        private const val ATE = "ate"
        /** Dois minutos: tempo de sobra para a tela abrir, e curto o bastante
         *  para o serviço voltar a ser inerte logo depois. */
        private const val JANELA_MS = 2 * 60_000L

        /**
         * Abre a janela em que o dedo pode agir. Chamado pelo agente ANTES de
         * mandar instalar — é o que amarra o clique a uma ação nossa, em vez de
         * a qualquer instalador que apareça.
         */
        fun esperarInstalacao(context: Context) = try {
            context.getSharedPreferences(ARQ, Context.MODE_PRIVATE).edit()
                .putLong(ATE, System.currentTimeMillis() + JANELA_MS).apply()
        } catch (e: Throwable) { /* sem janela, o dedo só não age */ }

        fun esperandoInstalacao(context: Context): Boolean = try {
            context.getSharedPreferences(ARQ, Context.MODE_PRIVATE)
                .getLong(ATE, 0L) > System.currentTimeMillis()
        } catch (e: Throwable) { false }

        fun limparEspera(context: Context) = try {
            context.getSharedPreferences(ARQ, Context.MODE_PRIVATE).edit().remove(ATE).apply()
        } catch (e: Throwable) { /* ignora */ }

        /** Se a pessoa já ligou o serviço em Ajustes → Acessibilidade. */
        fun ligado(context: Context): Boolean = try {
            val ativos = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ).orEmpty()
            ativos.contains(context.packageName + "/" + DedoDaFrota::class.java.name)
        } catch (e: Throwable) { false }
    }
}
