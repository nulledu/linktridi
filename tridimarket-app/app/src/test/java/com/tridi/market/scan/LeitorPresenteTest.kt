package com.tridi.market.scan

import android.view.InputDevice
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Valores MEDIDOS no tablet do mercadinho (E1035, `adb shell dumpsys input`).
// Não são inventados: é o que separava "leitor conectado" de "tecla de volume".
class LeitorPresenteTest {

    @Test
    fun `o leitor bluetooth conta`() {
        // Z0 barcode scanner: sources=0x301, teclado alfabético.
        assertTrue(TeclasDoLeitor.ehLeitor(virtual = false, sources = 0x301, keyboardType = InputDevice.KEYBOARD_TYPE_ALPHABETIC))
    }

    @Test
    fun `tecla de volume do proprio tablet NAO conta`() {
        // mtk-kpd: também é SOURCE_KEYBOARD e também é físico — era isso que
        // fazia a tela dizer "leitor conectado" num tablet sem leitor.
        assertFalse(TeclasDoLeitor.ehLeitor(virtual = false, sources = 0x101, keyboardType = InputDevice.KEYBOARD_TYPE_NON_ALPHABETIC))
    }

    @Test
    fun `teclado virtual do sistema NAO conta`() {
        assertFalse(TeclasDoLeitor.ehLeitor(virtual = true, sources = 0x101, keyboardType = InputDevice.KEYBOARD_TYPE_ALPHABETIC))
    }

    @Test
    fun `tela de toque NAO conta`() {
        // mtk-tpd: SOURCE_TOUCHSCREEN, sem bit de teclado.
        assertFalse(TeclasDoLeitor.ehLeitor(virtual = false, sources = 0x1002, keyboardType = InputDevice.KEYBOARD_TYPE_NONE))
    }
}
