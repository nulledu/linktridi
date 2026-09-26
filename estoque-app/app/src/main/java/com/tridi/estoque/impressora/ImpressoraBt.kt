package com.tridi.estoque.impressora

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.io.OutputStream
import java.util.UUID

// ── O cano até a impressora ──────────────────────────────────────────────────
//
// Bluetooth Classic, perfil SPP (porta serial sobre Bluetooth). É o que a
// Goldensky 80MM-BT fala, e é o que praticamente toda impressora térmica de
// 80mm fala: o aparelho anuncia um canal serial e tudo que a gente escreve
// nele é interpretado como fluxo ESC/POS. Não há protocolo de resposta — a
// impressora não confirma nada. "Deu certo" aqui significa "os bytes saíram do
// tablet", não "o papel saiu impresso"; papel acabado, tampa aberta e cabeça
// superaquecida são invisíveis daqui.
//
// NÃO fazemos descoberta (`startDiscovery`) nesta classe. O pareamento já tem
// dono no app — kiosk/BluetoothPareador, atrás da porta de manutenção — e
// buscar e imprimir ao mesmo tempo faz os dois falharem, porque o rádio é um
// só. Aqui a gente só lê a lista de PAREADOS e conecta.
class ImpressoraBt(private val context: Context) {

    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    /**
     * Lista as impressoras que o Android já tem pareadas.
     *
     * IMPRESSORAS, não tudo. O tablet do galpão tem sempre pelo menos dois
     * pareados — a impressora e o LEITOR de código — e devolver os dois fazia
     * a tela oferecer "Z0 barcode scanner" como impressora, além de impedir a
     * escolha automática quando só existe uma impressora de verdade.
     *
     * O reconhecimento é o mesmo de `kiosk.pareceImpressora`: classe `IMAGING`
     * quando o aparelho é honesto, nome quando ele mente (genérica chinesa
     * costuma se anunciar `UNCATEGORIZED`).
     *
     * Se NADA casar, devolve a lista inteira em vez de vazia: uma impressora
     * com nome fora do previsto tem de continuar escolhível — esconder o
     * aparelho certo é pior do que mostrar o leitor junto.
     */
    @SuppressLint("MissingPermission")
    fun pareadas(): List<ImpressoraPareada> {
        val a = adapter ?: return emptyList()
        if (!temPermissao()) return emptyList()
        return runCatching {
            val todos = a.bondedDevices.orEmpty().map { d ->
                val nome = runCatching { d.name }.getOrNull().orEmpty()
                val ehImpressora = runCatching {
                    d.bluetoothClass?.majorDeviceClass == android.bluetooth.BluetoothClass.Device.Major.IMAGING
                }.getOrDefault(false) || com.tridi.estoque.kiosk.pareceImpressora(nome)
                ImpressoraPareada(endereco = d.address, nome = nome) to ehImpressora
            }
            val impressoras = todos.filter { it.second }.map { it.first }
            (if (impressoras.isNotEmpty()) impressoras else todos.map { it.first })
                .sortedBy { it.rotulo.lowercase() }
        }.getOrElse {
            Log.w(TAG, "não consegui ler os pareados: ${it.message}")
            emptyList()
        }
    }

    /** Diagnóstico do rádio, para a tela avisar ANTES de a pessoa tentar imprimir. */
    fun problemaDeAmbiente(): MotivoFalha? = when {
        adapter == null -> MotivoFalha.SEM_BLUETOOTH
        !temPermissao() -> MotivoFalha.SEM_PERMISSAO
        !adapter.isEnabled -> MotivoFalha.DESLIGADO
        else -> null
    }

    /**
     * Manda os bytes. Abre a conexão, escreve, fecha — sempre. Nada de socket
     * guardado entre impressões: um socket SPP parado quebra sozinho quando a
     * impressora entra em economia de energia, e o erro aparece só na PRÓXIMA
     * impressão, minutos depois, longe da causa. Reconectar custa ~1s e é
     * previsível.
     */
    suspend fun imprimir(endereco: String, bytes: ByteArray): ResultadoImpressao =
        comSocket(endereco) { saida ->
            escreverEmPedacos(saida, bytes)
            saida.flush()
            // A impressora precisa de um instante para drenar o buffer
            // ANTES de o socket fechar. Fechar na mesma linha do último
            // write corta o fim do trabalho — na prática, a etiqueta sai
            // sem o corte, porque `GS V` é justamente o último comando.
            Thread.sleep(ESPERA_DRENAGEM_MS)
        }

    /**
     * Um lote LONGO, etiqueta por etiqueta, com direito a parar no meio.
     *
     * Numa conexão só, como o lote de uma vez — reconectar a cada peça custaria
     * ~1s cada e daria 50 oportunidades a mais de a conexão cair. A diferença
     * é que aqui os bytes de cada etiqueta são pedidos NA HORA (`bytesDe`) e
     * entre uma e outra a gente pergunta se alguém mandou parar.
     *
     * Parar é entre etiquetas, nunca no meio de uma: uma etiqueta cortada ao
     * meio é papel perdido que ainda precisa ser jogado fora, e pior, pode sair
     * com metade do código de barras — que um leitor eventualmente lê errado.
     *
     * @param bytesDe   os bytes da etiqueta `i` (raster + corte). Chamado uma
     *                  vez por etiqueta, tarde, pra não montar 50 bitmaps antes
     *                  de saber se o socket abre.
     * @param cancelou  consultado entre etiquetas.
     * @param aoEnviar  quantas já saíram — é o contador da tela.
     */
    suspend fun imprimirEmSerie(
        endereco: String,
        quantidade: Int,
        cabecalho: ByteArray,
        bytesDe: (Int) -> ByteArray,
        cancelou: () -> Boolean,
        aoEnviar: (Int) -> Unit,
    ): ResultadoImpressao = comSocket(endereco) { saida ->
        escreverEmPedacos(saida, cabecalho)
        for (i in 0 until quantidade) {
            if (cancelou()) {
                Log.i(TAG, "impressão parada a pedido depois de $i de $quantidade")
                break
            }
            escreverEmPedacos(saida, bytesDe(i))
            saida.flush()
            aoEnviar(i + 1)
        }
        Thread.sleep(ESPERA_DRENAGEM_MS)
    }

    /**
     * Abre o canal, entrega o `OutputStream` e fecha — sempre.
     *
     * Todo o diagnóstico de rádio, vínculo e socket mora aqui, num lugar só:
     * era o corpo do `imprimir`, e virou moldura quando o lote longo passou a
     * precisar do MESMO tratamento de erro. Duas cópias dessa cadeia de
     * `catch` divergiriam no primeiro ajuste, e o sintoma seria uma impressão
     * dizendo "não consegui imprimir" onde a outra diria "impressora
     * desligada ou fora de alcance".
     */
    @SuppressLint("MissingPermission")
    private suspend fun comSocket(endereco: String, bloco: (OutputStream) -> Unit): ResultadoImpressao =
        withContext(Dispatchers.IO) {
            problemaDeAmbiente()?.let { return@withContext ResultadoImpressao.Falha(it) }
            if (endereco.isBlank()) return@withContext ResultadoImpressao.Falha(MotivoFalha.NAO_ESCOLHIDA)

            val a = adapter ?: return@withContext ResultadoImpressao.Falha(MotivoFalha.SEM_BLUETOOTH)

            val device = runCatching { a.getRemoteDevice(endereco) }.getOrNull()
                ?: return@withContext ResultadoImpressao.Falha(MotivoFalha.NAO_PAREADA, "endereço inválido: $endereco")

            // Pareada? Sem vínculo, `connect()` dispara o pareamento do sistema
            // — que o lock task do totem bloqueia — e a chamada fica pendurada
            // até estourar. Melhor recusar aqui, com a instrução certa.
            val pareada = runCatching { device.bondState == BluetoothDevice.BOND_BONDED }.getOrDefault(false)
            if (!pareada) return@withContext ResultadoImpressao.Falha(MotivoFalha.NAO_PAREADA)

            // Descoberta em andamento derruba a conexão. Se a tela de
            // pareamento ficou buscando, cancela antes.
            runCatching { if (a.isDiscovering) a.cancelDiscovery() }

            var socket: BluetoothSocket? = null
            try {
                socket = abrirComUmaSegundaChance(device)
                bloco(socket.outputStream)
                ResultadoImpressao.Ok
            } catch (e: SocketRecusado) {
                Log.w(TAG, "socket recusado", e)
                ResultadoImpressao.Falha(MotivoFalha.RECUSADA, e.message)
            } catch (e: SocketInalcancavel) {
                Log.w(TAG, "impressora inalcançável", e)
                ResultadoImpressao.Falha(MotivoFalha.FORA_DE_ALCANCE, e.message)
            } catch (e: IOException) {
                Log.w(TAG, "falha de escrita", e)
                ResultadoImpressao.Falha(MotivoFalha.ESCRITA, e.message)
            } catch (e: SecurityException) {
                Log.w(TAG, "sem permissão", e)
                ResultadoImpressao.Falha(MotivoFalha.SEM_PERMISSAO, e.message)
            } catch (e: Exception) {
                Log.w(TAG, "falha desconhecida", e)
                ResultadoImpressao.Falha(MotivoFalha.DESCONHECIDO, e.message)
            } finally {
                runCatching { socket?.close() }
            }
        }

    /**
     * Abre o canal SPP, com o plano B que essas impressoras exigem.
     *
     * `createRfcommSocketToServiceRecord` pergunta ao aparelho, por SDP, em
     * qual canal está o serviço SPP. Boa parte das impressoras de 80mm baratas
     * responde SDP mal (ou não responde) e a chamada volta com
     * "read failed, socket might closed" — que parece impressora desligada e
     * não é. O plano B é o `createRfcommSocket` reflexivo no canal 1, que é
     * onde essas impressoras SEMPRE colocam o SPP. É gambiarra conhecida, tem
     * mais de dez anos, e é a diferença entre "imprime" e "nunca conecta".
     */
    @SuppressLint("MissingPermission")
    private fun abrir(device: BluetoothDevice): BluetoothSocket {
        val primeiroErro = try {
            val s = device.createRfcommSocketToServiceRecord(SPP)
            s.connect()
            return s
        } catch (e: IOException) {
            e
        }

        Log.i(TAG, "SDP falhou (${primeiroErro.message}); tentando canal 1 por reflexão")
        try {
            val metodo = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
            val s = metodo.invoke(device, 1) as BluetoothSocket
            s.connect()
            return s
        } catch (e: Exception) {
            val texto = "${primeiroErro.message} / ${e.message}"
            // "Connection refused" e "Host is down" separam o aparelho que
            // respondeu dizendo não (canal ocupado, vínculo velho) do aparelho
            // que não respondeu nada (apagado, longe).
            throw if (texto.contains("refused", ignoreCase = true) || texto.contains("busy", ignoreCase = true)) {
                SocketRecusado(texto)
            } else {
                SocketInalcancavel(texto)
            }
        }
    }

    /**
     * Abre o socket, e se cair, tenta UMA vez mais depois de uma pausa.
     *
     * Medido no galpão: a PRIMEIRA impressão depois de parear falha com
     * "read failed, socket might closed or timeout, ret: -1" e a segunda sai
     * na hora. A pilha Bluetooth ainda está arrumando a casa logo após o
     * vínculo, e a impressora térmica costuma dormir entre trabalhos — o
     * primeiro connect serve de despertador.
     *
     * Uma tentativa extra, não um laço: se a impressora está mesmo desligada
     * ou longe, insistir só atrasa a mensagem de erro que a pessoa precisa ler.
     */
    private fun abrirComUmaSegundaChance(device: BluetoothDevice): BluetoothSocket =
        try {
            abrir(device)
        } catch (primeira: IOException) {
            Log.i(TAG, "primeiro connect falhou (${primeira.message}); segunda chance em ${ESPERA_SEGUNDA_CHANCE_MS}ms")
            Thread.sleep(ESPERA_SEGUNDA_CHANCE_MS)
            abrir(device)
        }

    /**
     * Escreve em pedaços com uma pausa entre eles.
     *
     * Despejar 20 kB de uma vez estoura o buffer de entrada da impressora: ela
     * descarta o excedente em silêncio e a etiqueta sai truncada no meio de uma
     * linha. Pedaço de 2 kB com pausa curta é o ritmo que essas unidades
     * absorvem sem controle de fluxo.
     */
    private fun escreverEmPedacos(saida: OutputStream, bytes: ByteArray) {
        var i = 0
        while (i < bytes.size) {
            val n = minOf(PEDACO, bytes.size - i)
            saida.write(bytes, i, n)
            saida.flush()
            i += n
            if (i < bytes.size) Thread.sleep(PAUSA_ENTRE_PEDACOS_MS)
        }
    }

    private fun temPermissao(): Boolean = permissoesNecessarias().all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    private class SocketRecusado(mensagem: String) : IOException(mensagem)
    private class SocketInalcancavel(mensagem: String) : IOException(mensagem)

    companion object {
        private const val TAG = "TridiEstoqueImpressora"

        /** UUID canônico do Serial Port Profile. Toda impressora ESC/POS usa este. */
        val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

        private const val PEDACO = 2048
        private const val PAUSA_ENTRE_PEDACOS_MS = 20L
        private const val ESPERA_DRENAGEM_MS = 400L

        /** Pausa antes da segunda tentativa de connect. Curta o bastante pra
         *  ninguém achar que travou, longa o bastante pra impressora acordar. */
        private const val ESPERA_SEGUNDA_CHANCE_MS = 1_200L

        /**
         * O que o Android exige para CONECTAR (não para buscar).
         *
         * Do Android 12 (S) em diante é BLUETOOTH_CONNECT. Abaixo disso, quem
         * autoriza é `BLUETOOTH`/`BLUETOOTH_ADMIN` do manifesto, que são
         * permissões normais — concedidas na instalação, sem pedir nada em
         * tempo de execução. Este tablet (E1035) é Android 8.1, então cai no
         * caminho de baixo e a lista fica VAZIA de propósito.
         *
         * ACCESS_FINE_LOCATION não entra aqui: no Android 11 e abaixo a
         * localização é exigida para DESCOBRIR aparelhos (a varredura revela
         * onde você está), não para falar com um que já está pareado. O
         * BluetoothPareador é quem precisa dela, e ele já a pede.
         */
        fun permissoesNecessarias(): List<String> =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                listOf(Manifest.permission.BLUETOOTH_CONNECT)
            } else {
                emptyList()
            }
    }
}
