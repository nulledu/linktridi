package com.tridi.estoque.kiosk

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

    /** Espera entre uma tentativa de PIN e a seguinte. Emendar sem folga faz o
     *  `createBond` cair em cima da desconexão anterior e falhar por outro
     *  motivo — o que estragaria justamente o diagnóstico de "PIN errado". */
    private val relogio = android.os.Handler(android.os.Looper.getMainLooper())

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
                    // ENGOLE o broadcast quando nós mesmos já respondemos.
                    //
                    // `ACTION_PAIRING_REQUEST` é ORDENADO: sem `abortBroadcast()`
                    // ele segue adiante e os Ajustes abrem o diálogo de PIN
                    // TAMBÉM. Foi isso no galpão — o app respondia certo, a caixa
                    // do sistema subia por cima mesmo assim, ninguém conseguia
                    // digitar nela (o teclado não sobe sobre o kiosk), e ao ser
                    // dispensada ela CANCELAVA o vínculo já respondido.
                    //
                    // Responder e não abortar é pior que não responder: parece
                    // que o PIN está errado quando o PIN estava certo.
                    if (responderPareamento(d, intent)) {
                        // Marca que a senha veio de NÓS: só assim a falha logo
                        // adiante pode ser lida como "PIN errado" e disparar a
                        // próxima tentativa. Falha de vínculo que ninguém
                        // respondeu é outra coisa (fora de alcance, desligada).
                        respondemosOPin = true
                        if (isOrderedBroadcast) {
                            runCatching { abortBroadcast() }
                                .onFailure { Log.w(TAG, "não engoli o broadcast: ${it.message}") }
                        }
                    }
                }
                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                    val d = dispositivo(intent) ?: return
                    when (intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1)) {
                        BluetoothDevice.BOND_BONDED ->
                            _aparelhos.value = comEstadoDeVinculo(_aparelhos.value, d.address, pareado = true)
                        BluetoothDevice.BOND_NONE -> {
                            // Voltar pra NONE depois de BONDING é falha de
                            // pareamento — e, quando NÓS respondemos o PIN, o
                            // motivo quase sempre é PIN errado.
                            //
                            // Em vez de mostrar "Falhou" e esperar que alguém
                            // adivinhe, tenta o próximo da lista sozinho. Foi o
                            // caso da Goldensky: recusou 0000 três vezes
                            // seguidas, e sem isto a tela só repetia "Falhou".
                            if (respondemosOPin && proximoPin()) {
                                Log.i(TAG, "PIN recusado; tentando ${pinAtual}")
                                _erro.value = "Senha $pinAtual… (${pinsRestantes} restantes)"
                                respondemosOPin = false
                                relogio.postDelayed({ parear(d.address) }, 1_200)
                            } else {
                                _aparelhos.value = comEstadoDeVinculo(_aparelhos.value, d.address, falhou = true)
                                if (respondemosOPin) {
                                    _erro.value = "Nenhuma senha de fábrica funcionou. " +
                                        "Veja a senha na etiqueta da impressora e informe na manutenção."
                                }
                                respondemosOPin = false
                            }
                        }
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
            val admin = ComponentName(context, EstoqueAdminReceiver::class.java)
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
    /**
     * PINs de fábrica, tentados em ordem — um por tentativa de vínculo.
     *
     * Ninguém digita senha de Bluetooth num quiosque de galpão: o diálogo do
     * sistema não é utilizável ali (o teclado não sobe sobre o lock task), e
     * exigir que alguém descubra o PIN da impressora pra usar o leitor é
     * trabalho que não vai acontecer. Então o app varre os padrões conhecidos.
     *
     * `1234` PRIMEIRO porque é o da Goldensky 80MM-BT deste galpão — confirmado
     * pelo dono do aparelho, depois de `0000` ser recusado três vezes seguidas
     * (o vínculo durava ~3s e voltava pra BOND_NONE, que é a assinatura de PIN
     * errado: PIN certo fecha em menos de 1s, e sem resposta nenhuma expira em
     * 20s). O resto da lista existe pro próximo aparelho, não pra este.
     */
    private val PINS_DE_FABRICA = listOf("1234", "0000", "1111", "8888", "9999", "123456")

    @Volatile
    private var indicePin = 0

    /** Se a última senha saiu daqui — distingue "PIN errado" de "sumiu do ar". */
    @Volatile
    private var respondemosOPin = false

    /** PIN da tentativa atual. */
    val pinAtual: String get() = PINS_DE_FABRICA.getOrElse(indicePin) { PINS_DE_FABRICA.first() }

    /** Quantos PINs ainda restam para tentar. */
    val pinsRestantes: Int get() = (PINS_DE_FABRICA.size - indicePin - 1).coerceAtLeast(0)

    /** Fixa um PIN específico (a tela de manutenção, quando alguém sabe qual é). */
    fun usarPin(pin: String) {
        val limpo = pin.filter { it.isDigit() }.take(16)
        if (limpo.length < 4) return
        indicePin = PINS_DE_FABRICA.indexOf(limpo).takeIf { it >= 0 } ?: run {
            // PIN que não está na lista entra na frente, só pra esta sessão.
            (PINS_DE_FABRICA as MutableList<String>).add(0, limpo); 0
        }
    }

    /** Volta pro começo da lista — chamado ao escolher outro aparelho. */
    private fun reiniciarPins() { indicePin = 0 }

    /** @return true se ainda há PIN pra tentar. */
    private fun proximoPin(): Boolean {
        if (indicePin >= PINS_DE_FABRICA.lastIndex) return false
        indicePin++
        return true
    }

    /** @return true se NÓS respondemos — e aí o broadcast tem de ser engolido. */
    private fun responderPareamento(d: BluetoothDevice, intent: Intent): Boolean {
        val variante = intent.getIntExtra(BluetoothDevice.EXTRA_PAIRING_VARIANT, -1)
        val chave = intent.getIntExtra(BluetoothDevice.EXTRA_PAIRING_KEY, -1)
        Log.i(TAG, "pedido de pareamento variante=$variante pin=${pinAtual}")
        var respondido = false
        runCatching {
            when (variante) {
                BluetoothDevice.PAIRING_VARIANT_PIN -> {
                    d.setPin(pinAtual.toByteArray()); respondido = true
                }
                VARIANTE_CONFIRMACAO, VARIANTE_CONSENTIMENTO -> {
                    d.setPairingConfirmation(true); respondido = true
                }
                VARIANTE_MOSTRAR_SENHA, VARIANTE_MOSTRAR_PIN ->
                    _passkeyParaDigitar.value = chave.takeIf { it >= 0 }?.toString()?.padStart(6, '0')
                else -> runCatching { d.setPairingConfirmation(true) }.onSuccess { respondido = true }
            }
        }.onFailure {
            // `setPairingConfirmation` exige BLUETOOTH_PRIVILEGED em algumas
            // ROMs. Quando falha, quem tem de aparecer é o diálogo do sistema —
            // e é pra isso que a tela libera os Ajustes no lock task enquanto
            // está aberta.
            Log.w(TAG, "não consegui responder o pareamento: ${it.message}")
            _erro.value = "Confirme o pareamento na caixa que apareceu na tela."
        }

        return respondido
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
        val admin = ComponentName(context, EstoqueAdminReceiver::class.java)
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
        // IMAGING é a classe da impressora Bluetooth. Sem esta linha a Goldensky
        // 80MM-BT não entrava na lista por nenhum caminho: `visiveis()` filtrava
        // por HID, e IMAGING não é PERIPHERAL.
        //
        // O nome entra como segunda rede porque impressora genérica costuma
        // mentir a classe (vem UNCATEGORIZED) e o que sobra é o anúncio —
        // "80MM-BT", "Printer001", "BT-Printer". Filtro por nome sozinho seria
        // frágil; junto da classe, ele só ACRESCENTA quem escaparia.
        impressora = runCatching {
            d.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.IMAGING ||
                pareceImpressora(runCatching { d.name }.getOrNull())
        }.getOrDefault(false),
        pareado = pareado || runCatching { d.bondState == BluetoothDevice.BOND_BONDED }.getOrDefault(false),
    )

    private fun concedida(permissao: String) =
        ContextCompat.checkSelfPermission(context, permissao) == PackageManager.PERMISSION_GRANTED

    private fun temPermissoes() = permissoesNecessarias().all(::concedida)

    companion object {
        private const val TAG = "TridiEstoqueBt"
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
