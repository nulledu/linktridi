package com.tridi.market.kiosk

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// Pareamento do leitor SEM sair do totem.
//
// O totem roda em lock task com device owner: os Ajustes do Android não abrem,
// e sem eles não havia como parear um leitor Bluetooth — só pelo cabo adb. Esta
// classe faz o mínimo que os Ajustes fariam: listar, buscar e vincular.
//
// Nada aqui destrava o aparelho. A tela continua presa no app; o que muda é que
// o app passa a saber fazer a única coisa dos Ajustes de que ele depende.
class BluetoothPareador(private val context: Context) {

    private val _aparelhos = MutableStateFlow<List<AparelhoBt>>(emptyList())
    val aparelhos: StateFlow<List<AparelhoBt>> = _aparelhos

    private val _buscando = MutableStateFlow(false)
    val buscando: StateFlow<Boolean> = _buscando

    private val _erro = MutableStateFlow<String?>(null)
    val erro: StateFlow<String?> = _erro

    /** Senha que a pessoa precisa BIPAR/digitar no próprio leitor, quando o
     *  aparelho escolhe essa variante de pareamento. */
    private val _passkeyParaDigitar = MutableStateFlow<String?>(null)
    val passkeyParaDigitar: StateFlow<String?> = _passkeyParaDigitar

    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private var receiverRegistrado = false

    /** Pedimos a busca com o rádio desligado: ela sai assim que ele acender. */
    private var buscarQuandoLigar = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            when (intent.action) {
                BluetoothDevice.ACTION_FOUND -> {
                    val d = dispositivo(intent) ?: return
                    _aparelhos.value = mesclar(_aparelhos.value, deAparelho(d))
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> _buscando.value = false
                BluetoothAdapter.ACTION_STATE_CHANGED -> {
                    val estado = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1)
                    if (estado == BluetoothAdapter.STATE_ON && buscarQuandoLigar) {
                        buscarQuandoLigar = false
                        adapter?.let { carregarPareados(); iniciarBusca(it) }
                    }
                }
                // O Android pede confirmação do pareamento abrindo um diálogo
                // DOS AJUSTES — que o lock task bloqueia ("Attempted Lock Task
                // Mode violation" no log), e aí o vínculo expira sozinho em 20s.
                // Respondemos aqui, sem diálogo nenhum.
                BluetoothDevice.ACTION_PAIRING_REQUEST -> {
                    val d = dispositivo(intent) ?: return
                    responderPareamento(d, intent)
                }
                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                    val d = dispositivo(intent) ?: return
                    when (intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1)) {
                        BluetoothDevice.BOND_BONDED ->
                            _aparelhos.value = comEstadoDeVinculo(_aparelhos.value, d.address, pareado = true)
                        BluetoothDevice.BOND_NONE ->
                            // Voltar pra NONE depois de BONDING é falha de
                            // pareamento (PIN errado, leitor fora de alcance).
                            _aparelhos.value = comEstadoDeVinculo(_aparelhos.value, d.address, falhou = true)
                        BluetoothDevice.BOND_BONDING ->
                            _aparelhos.value = comEstadoDeVinculo(_aparelhos.value, d.address, vinculando = true)
                    }
                }
            }
        }
    }

    /** `false` = o tablet não tem Bluetooth; a tela avisa em vez de ficar vazia. */
    fun existe(): Boolean = adapter != null

    fun ligado(): Boolean = adapter?.isEnabled == true

    /**
     * Concede as permissões de Bluetooth pelo DEVICE OWNER, sem diálogo. Num
     * totem em lock task o diálogo de permissão é justamente o que não dá pra
     * responder de forma confiável — e negar uma vez deixaria a tela inútil pra
     * sempre.
     */
    fun garantirPermissoes(activity: Activity) {
        val necessarias = permissoesNecessarias()
        val policy = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (policy.isDeviceOwnerApp(context.packageName)) {
            val admin = ComponentName(context, MarketAdminReceiver::class.java)
            necessarias.forEach { permissao ->
                runCatching {
                    policy.setPermissionGrantState(
                        admin, context.packageName, permissao,
                        DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED,
                    )
                }.onFailure { Log.w(TAG, "não consegui conceder $permissao: ${it.message}") }
            }
        }
        // Sem device owner (tablet com conta cadastrada) sobra o pedido normal.
        val faltando = necessarias.filterNot { concedida(it) }
        if (faltando.isNotEmpty()) {
            runCatching { activity.requestPermissions(faltando.toTypedArray(), PEDIDO_PERMISSAO) }
        }
    }

    /** Lista o que já está pareado. É o estado inicial da tela. */
    @SuppressLint("MissingPermission")
    fun carregarPareados() {
        val a = adapter ?: return
        if (!temPermissoes()) return
        runCatching {
            _aparelhos.value = a.bondedDevices.orEmpty().map { deAparelho(it, pareado = true) }
        }.onFailure { _erro.value = "Não consegui ler os aparelhos já pareados." }
    }

    @SuppressLint("MissingPermission")
    fun buscar() {
        val a = adapter ?: run { _erro.value = "Este tablet não tem Bluetooth."; return }
        if (!temPermissoes()) { _erro.value = "Faltou permissão de Bluetooth."; return }
        registrar()
        _erro.value = null

        if (!a.isEnabled) {
            // `enable()` volta na hora, mas o rádio leva alguns segundos em
            // TURNING_ON — e `startDiscovery` nesse meio-tempo devolve false
            // sem explicar nada. Medido no tablet: a busca "não começava"
            // sempre que o Bluetooth estava desligado ao abrir a tela.
            //
            // Ligar sozinho é bloqueado do Android 13 em diante; ali o jeito é
            // pedir pra pessoa ligar. Este totem é Android 10.
            val ligou = runCatching { @Suppress("DEPRECATION") a.enable() }.getOrDefault(false)
            if (!ligou) { _erro.value = "Ligue o Bluetooth do tablet e tente de novo."; return }
            buscarQuandoLigar = true
            _buscando.value = true    // a tela já mostra "procurando", sem piscar
            return
        }
        iniciarBusca(a)
    }

    @SuppressLint("MissingPermission")
    private fun iniciarBusca(a: BluetoothAdapter) {
        runCatching {
            if (a.isDiscovering) a.cancelDiscovery()
            _buscando.value = a.startDiscovery()
            if (!_buscando.value) _erro.value = "A busca não começou. Tente de novo."
        }.onFailure { _erro.value = "A busca falhou: ${it.message}" }
    }

    @SuppressLint("MissingPermission")
    fun parear(endereco: String) {
        val a = adapter ?: return
        runCatching {
            // Buscar e parear ao mesmo tempo faz os dois falharem: o rádio é um
            // só. O Android documenta isso e mesmo assim é o erro mais comum.
            if (a.isDiscovering) a.cancelDiscovery()
            _buscando.value = false
            val d = a.getRemoteDevice(endereco)
            _aparelhos.value = comEstadoDeVinculo(_aparelhos.value, endereco, vinculando = true)
            if (d.bondState == BluetoothDevice.BOND_BONDED) {
                _aparelhos.value = comEstadoDeVinculo(_aparelhos.value, endereco, pareado = true)
                return
            }
            if (!d.createBond()) {
                _aparelhos.value = comEstadoDeVinculo(_aparelhos.value, endereco, falhou = true)
                _erro.value = "O tablet recusou o pareamento. Deixe o leitor em modo de pareamento e tente de novo."
            }
        }.onFailure {
            _aparelhos.value = comEstadoDeVinculo(_aparelhos.value, endereco, falhou = true)
            _erro.value = "Falha ao parear: ${it.message}"
        }
    }

    /**
     * Responde o pedido de pareamento no lugar do diálogo do sistema.
     *
     * Cada variante pede uma resposta diferente:
     *  • CONFIRMAÇÃO/CONSENTIMENTO — é só dizer sim.
     *  • PIN — leitor barato usa 0000; alguns usam 1234.
     *  • MOSTRAR SENHA — quem digita é o LEITOR: a pessoa bipa os números na
     *    tela e aperta Enter. Aí não há o que responder aqui, e a tela precisa
     *    exibir o número — por isso ele sobe pro `passkeyParaDigitar`.
     */
    @SuppressLint("MissingPermission")
    private fun responderPareamento(d: BluetoothDevice, intent: Intent) {
        val variante = intent.getIntExtra(BluetoothDevice.EXTRA_PAIRING_VARIANT, -1)
        val chave = intent.getIntExtra(BluetoothDevice.EXTRA_PAIRING_KEY, -1)
        Log.i(TAG, "pedido de pareamento variante=$variante")
        runCatching {
            when (variante) {
                BluetoothDevice.PAIRING_VARIANT_PIN ->
                    d.setPin("0000".toByteArray())
                VARIANTE_CONFIRMACAO, VARIANTE_CONSENTIMENTO ->
                    d.setPairingConfirmation(true)
                VARIANTE_MOSTRAR_SENHA, VARIANTE_MOSTRAR_PIN ->
                    _passkeyParaDigitar.value = chave.takeIf { it >= 0 }?.toString()?.padStart(6, '0')
                else -> runCatching { d.setPairingConfirmation(true) }
            }
        }.onFailure {
            // `setPairingConfirmation` exige BLUETOOTH_PRIVILEGED em algumas
            // ROMs. Quando falha, quem tem de aparecer é o diálogo do sistema —
            // e é pra isso que a tela libera os Ajustes no lock task enquanto
            // está aberta.
            Log.w(TAG, "não consegui responder o pareamento: ${it.message}")
            _erro.value = "Confirme o pareamento na caixa que apareceu na tela."
        }
    }

    /**
     * Deixa o diálogo de pareamento DOS AJUSTES aparecer por cima do totem.
     *
     * É uma exceção estreita e temporária: vale só enquanto a tela de
     * manutenção (atrás da sequência secreta + senha) está aberta, e é desfeita
     * ao sair. Sem isto o pareamento que exige confirmação humana é impossível
     * — o Android recusa abrir o diálogo e o vínculo expira em 20 segundos.
     */
    fun permitirDialogoDoSistema(ativo: Boolean) {
        val policy = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (!policy.isDeviceOwnerApp(context.packageName)) return
        val admin = ComponentName(context, MarketAdminReceiver::class.java)
        val pacotes =
            if (ativo) arrayOf(context.packageName, PACOTE_AJUSTES) else arrayOf(context.packageName)
        runCatching { policy.setLockTaskPackages(admin, pacotes) }
            .onFailure { Log.w(TAG, "lock task packages: ${it.message}") }
    }

    @SuppressLint("MissingPermission")
    fun encerrar() {
        runCatching { if (adapter?.isDiscovering == true) adapter.cancelDiscovery() }
        if (receiverRegistrado) {
            runCatching { context.unregisterReceiver(receiver) }
            receiverRegistrado = false
        }
        _buscando.value = false
    }

    private fun registrar() {
        if (receiverRegistrado) return
        val filtro = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            addAction(BluetoothDevice.ACTION_PAIRING_REQUEST)
            // Chegar ANTES do receiver dos Ajustes é o que evita o diálogo.
            priority = IntentFilter.SYSTEM_HIGH_PRIORITY
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
        }
        ContextCompat.registerReceiver(context, receiver, filtro, ContextCompat.RECEIVER_EXPORTED)
        receiverRegistrado = true
    }

    private fun dispositivo(intent: Intent): BluetoothDevice? =
        @Suppress("DEPRECATION") intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)

    @SuppressLint("MissingPermission")
    private fun deAparelho(d: BluetoothDevice, pareado: Boolean = false) = AparelhoBt(
        endereco = d.address,
        nome = runCatching { d.name }.getOrNull().orEmpty(),
        hid = runCatching {
            d.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.PERIPHERAL
        }.getOrDefault(false),
        pareado = pareado || runCatching { d.bondState == BluetoothDevice.BOND_BONDED }.getOrDefault(false),
    )

    private fun concedida(permissao: String) =
        ContextCompat.checkSelfPermission(context, permissao) == PackageManager.PERMISSION_GRANTED

    private fun temPermissoes() = permissoesNecessarias().all(::concedida)

    companion object {
        private const val TAG = "TridiMarketBt"
        const val PEDIDO_PERMISSAO = 4711
        private const val PACOTE_AJUSTES = "com.android.settings"

        // Constantes de variante de pareamento: existem no framework, mas são
        // @hide na API pública, então ficam nomeadas aqui em vez de números
        // soltos no meio do `when`.
        private const val VARIANTE_CONFIRMACAO = 2      // PAIRING_VARIANT_PASSKEY_CONFIRMATION
        private const val VARIANTE_CONSENTIMENTO = 3    // PAIRING_VARIANT_CONSENT
        private const val VARIANTE_MOSTRAR_SENHA = 4    // PAIRING_VARIANT_DISPLAY_PASSKEY
        private const val VARIANTE_MOSTRAR_PIN = 5      // PAIRING_VARIANT_DISPLAY_PIN

        /**
         * Android 12 trocou o conjunto: antes a busca exigia LOCALIZAÇÃO (o
         * Bluetooth revela onde o aparelho está), depois virou BLUETOOTH_SCAN.
         * Este totem roda Android 10, então o caminho antigo é o que vale hoje
         * — mas o app já tem targetSdk 34 e roda nos dois.
         */
        fun permissoesNecessarias(): List<String> =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
            } else {
                listOf(Manifest.permission.ACCESS_FINE_LOCATION)
            }
    }
}
