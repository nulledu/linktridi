package com.tridi.estoque

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.tridi.estoque.kiosk.DestravarReceiver
import com.tridi.estoque.kiosk.EstoqueAdminReceiver
import com.tridi.estoque.ui.EstoqueApp
import com.tridi.estoque.ui.EstoqueTheme
import com.tridi.estoque.ui.EstoqueViewModel

class MainActivity : ComponentActivity() {
    private val viewModel by viewModels<EstoqueViewModel>()

    // Leitor de código de barras USB/Bluetooth. Entra pela MESMA porta da
    // câmera (`codigoLido`), então tudo que já existe — produto repetido,
    // produto sem cadastro, bipe, confirmação com foto — vale igual, sem
    // nenhuma tela nova. Plugar o aparelho basta: HID não pede permissão.
    //
    // Enquanto a tela de manutenção está aberta a leitura é DESVIADA pra ela:
    // bipar ali é o teste do leitor, não uma compra. Sem o desvio, testar o
    // pareamento jogaria produto no carrinho de quem estivesse logado.
    private val leitorExterno by lazy {
        com.tridi.estoque.scan.TeclasDoLeitor { codigo ->
            if (!com.tridi.estoque.kiosk.PortaDeManutencao.consumir(codigo)) viewModel.codigoLido(codigo)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideSystemUi()
        brilhoMaximo()
        // O modo de preview do TridiMarket (BuildConfig.PREVIEW_ENABLED +
        // DebugPreview.kt) saiu na poda do domínio de venda: montava telas com
        // dados falsos de catálogo/carrinho, que não existem mais aqui.
        setContent { EstoqueTheme { EstoqueApp(viewModel) } }
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
        brilhoMaximo()
        val policy = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (policy.isDeviceOwnerApp(packageName)) {
            runCatching {
                policy.setLockTaskPackages(
                    ComponentName(this, EstoqueAdminReceiver::class.java),
                    // `com.android.settings` junto do próprio app, e SÓ por causa
                    // do diálogo de pareamento Bluetooth.
                    //
                    // Sem ele o pareamento é impossível: o Android abre
                    // `com.android.settings.bluetooth.BluetoothPairingDialog` pra
                    // pedir a confirmação, o lock task recusa activity de outro
                    // pacote, o diálogo é destruído no mesmo segundo e o vínculo
                    // morre em BOND_STATE_NONE — sem erro, sem PIN, sem pista.
                    // Foi exatamente o "não deixa conectar a impressora".
                    //
                    // Permitir na lista NÃO abre o Settings pra quem está no
                    // totem: lock task só autoriza o que o app inicia, e a única
                    // porta pro pareamento continua sendo a sequência secreta
                    // mais a senha de manutenção.
                    arrayOf(packageName, "com.android.settings"),
                )
            }
        }
        // Pedido de destrave veio pelo adb (ver DestravarReceiver): solta a
        // tela e NÃO reentra em lock task. Sem isto, este onResume prenderia o
        // aparelho de novo no instante seguinte e o destrave seria inútil.
        if (DestravarReceiver.destravarPedido) {
            runCatching { stopLockTask() }
            return
        }
        // COM device owner: lock task de verdade — não sai por jeito nenhum.
        // SEM device owner (o tablet tem conta cadastrada e o Android recusa a
        // promoção): `startLockTask` cai no "fixar tela" do sistema, que ainda
        // segura o HOME e o recentes; sai só segurando Voltar+Recentes juntos.
        // É bem menos que o totem completo, mas é o máximo possível enquanto a
        // conta não for removida — e melhor do que não travar nada.
        runCatching { startLockTask() }
    }

    // Antes de qualquer tela: o leitor HID "digita" o código no que estiver em
    // foco, e o totem não tem campo de texto do sistema em lugar nenhum. Teclas
    // que não são de leitura (volume, por exemplo) seguem o caminho normal.
    override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean =
        leitorExterno.processar(event) || super.dispatchKeyEvent(event)

    override fun onDestroy() {
        leitorExterno.encerrar()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    // Brilho no máximo e tela sempre acesa.
    //
    // É um totem: fica de pé o dia todo, na tomada, e a pessoa precisa enxergar
    // a foto do produto e o teclado num corredor claro. O Android, sozinho,
    // escurece a tela e depois apaga pra poupar bateria — num aparelho fixo
    // isso só cria o momento "o tablet está desligado?" antes de cada compra.
    //
    // `screenBrightness` vale só para ESTA janela: não altera o ajuste do
    // sistema nem some com o brilho automático fora do app.
    private fun brilhoMaximo() {
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.attributes = window.attributes.apply {
            screenBrightness = android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL
        }
    }

    private fun hideSystemUi() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
