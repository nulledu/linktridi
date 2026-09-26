package com.tridi.estoque.impressora

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Base64
import android.util.Log
import com.tridi.estoque.net.ConteudoLivreDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

// Etiqueta livre pelo adb, sem tocar na tela.
//
// O caminho normal da etiqueta livre é a fila do escritório, que desce anexada
// ao bootstrap — com até ~15 minutos de atraso, e um trabalho por vez na tela
// de quem enfileira. Este receiver existe pro LOTE com o cabo na mão: as ~55
// placas de prateleira do galpão saem de um script que dispara um broadcast
// por placa, sem ninguém navegar o kiosk nem esperar ciclo de worker.
//
// O trabalho vai no extra em JSON, com o shape de `ConteudoLivreDto` (o MESMO
// contrato da fila — a conversão é a mesma função, `paraTrabalho`, de
// propósito: dois parsers do mesmo JSON divergem).
//
//   adb shell am broadcast -n com.tridi.estoque/.impressora.ImprimirLivreReceiver \
//     -a com.tridi.estoque.IMPRIMIR_LIVRE --es token tridi-estoque-livre \
//     --es trabalho '{"linhas":[{"texto":"A3","tamanho":"grande","negrito":true},{"texto":"Perfis de alumínio","tamanho":"media"}],"codigo":"GAL-A-C3","qr":"https://tridigaius.vercel.app/g/GAL-A-C3","alturaMm":45}'
//
// Aspas dentro de aspas atravessando dois shells (o do Mac e o do Android) é
// briga perdida — por isso o mesmo JSON também entra em Base64:
//
//   ... --es trabalho64 "$(printf '%s' "$JSON" | base64)"
//
// O `-n` NÃO é opcional: desde o Android 8, receiver declarado no manifesto não
// recebe broadcast implícito, e o `am` responde `result=0` como se tivesse
// funcionado. Sem endereçar o componente, isto nunca roda.
//
// O token é o mesmo desenho do TesteDeImpressaoReceiver: o receiver é exported
// porque broadcast de adb não alcança receiver privado, e sem ele qualquer app
// instalado no tablet imprimiria à vontade. Não é segredo de segurança — é a
// tranca que impede acionamento por acidente.
class ImprimirLivreReceiver : BroadcastReceiver() {

    // O mesmo `ignoreUnknownKeys` da fila: um script mais novo que o app manda
    // um campo que este apk não conhece, e a placa sai mesmo assim.
    private val json = Json { ignoreUnknownKeys = true }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getStringExtra("token") != TOKEN) {
            Log.w(TAG, "livre recusado: token errado")
            return
        }
        val bruto = jsonDoIntent(intent)
        if (bruto == null) {
            Log.w(TAG, "livre recusado: mande o JSON em --es trabalho ou --es trabalho64")
            return
        }
        val conteudo = runCatching { json.decodeFromString<ConteudoLivreDto>(bruto) }.getOrNull()
        if (conteudo == null) {
            Log.w(TAG, "livre falhou: o tablet não entendeu o JSON do trabalho")
            return
        }
        val trabalho = conteudo.paraTrabalho()
        val rotulo = trabalho.linhasComTexto.firstOrNull()?.texto
            ?: trabalho.codigoLimpo ?: "(sem texto)"

        // `goAsync` porque imprimir é lento (SPP a ~17 kB por etiqueta) e um
        // BroadcastReceiver comum é morto em ~10s. Sem isto o processo poderia
        // ser recolhido no meio do envio e a impressora ficaria com meia
        // etiqueta no buffer — que é pior que não imprimir nada.
        val pendente = goAsync()
        val app = context.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val prefs = ImpressoraPrefs(app)
                val servico = ServicoDeImpressao(app)

                // Nenhuma escolhida e existe UMA pareada → escolhe sozinho.
                //
                // Parear no Android e escolher no app são dois passos que a
                // pessoa lê como um só; ela pareia, manda imprimir e não
                // entende o "nenhuma impressora escolhida". Com uma só no
                // aparelho não há ambiguidade a resolver. Com duas ou mais,
                // aí sim é escolha de gente — e o receiver diz quais são.
                var cfg = prefs.ler()
                if (!cfg.temImpressora) {
                    val candidatas = servico.pareadas()
                    when (candidatas.size) {
                        0 -> { Log.w(TAG, "nenhuma impressora pareada no Android"); return@launch }
                        1 -> {
                            val u = candidatas.single()
                            prefs.escolherImpressora(u.endereco, u.nome)
                            cfg = prefs.ler()
                            Log.i(TAG, "escolhi sozinho a única pareada: ${u.rotulo}")
                        }
                        else -> {
                            Log.w(TAG, "há ${candidatas.size} pareadas — escolha na tela: " +
                                candidatas.joinToString { it.rotulo })
                            return@launch
                        }
                    }
                }
                Log.i(TAG, "imprimindo livre em ${cfg.nome} (${cfg.endereco}) " +
                    "${trabalho.larguraMm}×${trabalho.alturaMm}mm copias=${trabalho.copias}: $rotulo")
                when (val r = servico.imprimirLivre(trabalho)) {
                    is ResultadoImpressao.Ok -> Log.i(TAG, "livre ok: $rotulo")
                    is ResultadoImpressao.Falha ->
                        Log.w(TAG, "livre falhou: ${r.detalheTecnico ?: r.mensagem}")
                }
            } catch (e: Throwable) {
                Log.e(TAG, "livre falhou: ${e.message}", e)
            } finally {
                pendente.finish()
            }
        }
    }

    /** O JSON cru, venha ele pelado (`trabalho`) ou em Base64 (`trabalho64`). */
    private fun jsonDoIntent(intent: Intent): String? {
        intent.getStringExtra("trabalho")?.takeIf { it.isNotBlank() }?.let { return it }
        val em64 = intent.getStringExtra("trabalho64")?.takeIf { it.isNotBlank() } ?: return null
        return runCatching { String(Base64.decode(em64, Base64.DEFAULT), Charsets.UTF_8) }.getOrNull()
    }

    companion object {
        private const val TAG = "TridiEstoquePrint"
        const val ACAO = "com.tridi.estoque.IMPRIMIR_LIVRE"
        const val TOKEN = "tridi-estoque-livre"
    }
}
