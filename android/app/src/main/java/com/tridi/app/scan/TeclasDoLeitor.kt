package com.tridi.app.scan

import android.hardware.input.InputManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyEvent

/**
 * Recebe as teclas do leitor USB/Bluetooth e devolve códigos.
 *
 * Fica na Activity, antes de qualquer tela: um leitor HID digita no que estiver
 * em foco, e este app não tem campo de texto do sistema em lugar nenhum durante
 * o trabalho (os diálogos são desenhados em Compose e a mesa opera sem teclado).
 * Sem interceptar aqui, o código lido simplesmente se perderia.
 *
 * Mesmo desenho do totem do estoque — ver o cabeçalho de `LeitorExterno.kt`
 * sobre por que os dois apps carregam a régua em vez de compartilhá-la.
 */
class TeclasDoLeitor(private val onCodigo: (String) -> Unit) {

    private var estado = LeitorExternoState()
    private val relogio = Handler(Looper.getMainLooper())
    private val consumidas = mutableSetOf<Int>()

    // Fecha código de scanner configurado SEM sufixo de Enter. Reagendado a
    // cada tecla: só dispara quando o silêncio realmente acontece.
    private val fecharSemEnter = Runnable {
        val t = expirar(estado, SystemClock.elapsedRealtime())
        estado = t.estado
        (t.resultado as? TeclaResultado.Codigo)?.let { onCodigo(it.codigo) }
    }

    /** @return true se a tecla era do leitor e não deve seguir adiante. */
    fun processar(evento: KeyEvent): Boolean {
        if (!deTecladoFisico(evento)) return false

        // O ACTION_UP da tecla que já consumimos no DOWN também tem que ser
        // consumido: entregar só a metade de um evento confunde quem estiver
        // ouvindo depois.
        if (evento.action == KeyEvent.ACTION_UP) {
            return consumidas.remove(evento.keyCode)
        }
        if (evento.action != KeyEvent.ACTION_DOWN) return false

        val fim = evento.keyCode == KeyEvent.KEYCODE_ENTER ||
            evento.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
            evento.keyCode == KeyEvent.KEYCODE_TAB
        val caractere = evento.unicodeChar.takeIf { it != 0 }?.toChar()
        // Tecla que não escreve nada e não encerra (volume, power) segue o
        // caminho normal — o leitor não pode sequestrar o aparelho. Num tablet
        // de kiosk isto é mais do que educação: o volume é como a pessoa cala o
        // alarme da ordem nova.
        if (!fim && caractere == null) return false

        val agora = SystemClock.elapsedRealtime()
        val transicao = reduzirTecla(estado, caractere, fim, agora)
        estado = transicao.estado

        relogio.removeCallbacks(fecharSemEnter)
        when (val r = transicao.resultado) {
            is TeclaResultado.Codigo -> onCodigo(r.codigo)
            TeclaResultado.Acumulando -> relogio.postDelayed(fecharSemEnter, MS_PARA_FECHAR_SEM_ENTER + 20)
            TeclaResultado.Ignorado -> Unit
        }

        // Enter isolado não é nosso: devolvido, senão o Enter de um teclado
        // comum pararia de funcionar caso um dia exista campo de texto.
        val nosso = transicao.resultado != TeclaResultado.Ignorado || !fim
        if (nosso) consumidas.add(evento.keyCode)
        return nosso
    }

    fun encerrar() = relogio.removeCallbacks(fecharSemEnter)

    // Só teclado DE VERDADE. O teclado virtual do sistema chega marcado como
    // virtual; sem este filtro, o app leria a si mesmo.
    //
    // NÃO exige `KEYBOARD_TYPE_ALPHABETIC` aqui. Boa parte dos leitores se
    // declara NUMÉRICO, porque só digita dígitos — exigir alfabético
    // descartaria esses modelos inteiros, e o leitor pareceria morto sem dar
    // nenhum sinal de erro. Abrir aqui é seguro porque a guarda de verdade está
    // adiante: tecla que não escreve caractere nenhum segue o caminho normal, e
    // um Enter solto também.
    private fun deTecladoFisico(evento: KeyEvent): Boolean {
        val dispositivo = evento.device ?: return false
        if (dispositivo.isVirtual) return false
        return evento.source and InputDevice.SOURCE_KEYBOARD == InputDevice.SOURCE_KEYBOARD
    }

    companion object {
        /**
         * Tem leitor plugado/pareado? A tela usa isto pra avisar ANTES de a
         * pessoa esbarrar na porta: com a exigência ligada e nenhum leitor,
         * "Aceitar" pediria um bipe que o tablet não tem como receber.
         */
        fun conectado(gerenciador: InputManager?): Boolean {
            val ids = gerenciador?.inputDeviceIds ?: return false
            return ids.any { id ->
                val d = InputDevice.getDevice(id) ?: return@any false
                ehLeitor(d.isVirtual, d.sources, d.keyboardType)
            }
        }

        /**
         * Um aparelho de entrada é um LEITOR?
         *
         * `SOURCE_KEYBOARD` sozinho não serve — medido no E1035, o próprio
         * tablet expõe `mtk-kpd` e `ACCDET` (teclas de volume e o detector do
         * fone) como teclado físico. Só com essa checagem a tela dizia "leitor
         * conectado" num tablet sem leitor nenhum, que é pior do que não
         * avisar: some o único aviso de que o bipe não vai funcionar.
         *
         * O que separa é o `keyboardType`: teclado de VERDADE — que escreve
         * letras e números, como todo leitor HID — é `KEYBOARD_TYPE_ALPHABETIC`.
         * Botão de volume é `KEYBOARD_TYPE_NON_ALPHABETIC`.
         *
         * Fora do Android de propósito: assinatura de tipos primitivos pra
         * caber em teste de JVM.
         */
        fun ehLeitor(virtual: Boolean, sources: Int, keyboardType: Int): Boolean =
            !virtual &&
                sources and InputDevice.SOURCE_KEYBOARD == InputDevice.SOURCE_KEYBOARD &&
                keyboardType == InputDevice.KEYBOARD_TYPE_ALPHABETIC
    }
}
