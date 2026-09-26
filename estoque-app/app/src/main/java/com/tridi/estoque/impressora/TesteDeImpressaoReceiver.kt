package com.tridi.estoque.impressora

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

// Teste de impressão pelo adb, sem tocar na tela.
//
// A tela de impressora já tem o botão "Imprimir teste", e ele continua sendo o
// caminho de quem está na frente do aparelho. Este receiver existe pra quem
// está com o CABO na mão: em lock task o tablet não aceita nada por cima, e
// acertar a folga da guilhotina é um ciclo de tentativa e erro — imprime, olha
// onde caiu o corte, ajusta, imprime de novo. Fazer isso navegando pelo kiosk
// a cada volta é o tipo de coisa que faz ninguém calibrar.
//
//   adb shell am broadcast -n com.tridi.estoque/.impressora.TesteDeImpressaoReceiver \
//     -a com.tridi.estoque.TESTE_IMPRESSAO --es token tridi-estoque-teste
//
//   ... --ei folga 20     (opcional: sobrescreve a folga do corte, em mm)
//   ... --ei altura 25    (opcional: sobrescreve a altura da etiqueta, em mm)
//
// O `-n` NÃO é opcional: desde o Android 8, receiver declarado no manifesto não
// recebe broadcast implícito, e o `am` responde `result=0` como se tivesse
// funcionado. Sem endereçar o componente, isto nunca roda.
//
// O token é o mesmo desenho do DestravarReceiver: o receiver é exported porque
// broadcast de adb não alcança receiver privado, e sem ele qualquer app
// instalado no tablet imprimiria à vontade. Não é segredo de segurança —
// é a tranca que impede acionamento por acidente.
class TesteDeImpressaoReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getStringExtra("token") != TOKEN) {
            Log.w(TAG, "teste recusado: token errado")
            return
        }
        val folga = intent.getIntExtra("folga", -1).takeIf { it >= 0 }
        val altura = intent.getIntExtra("altura", -1).takeIf { it > 0 }
        // `--ez uma true` → tira única, como o botão "Só 1" da tela. Duas é o
        // padrão porque é o que mostra ONDE a lâmina cortou.
        val duas = !intent.getBooleanExtra("uma", false)

        // `goAsync` porque imprimir é lento (SPP a ~17 kB por etiqueta) e um
        // BroadcastReceiver comum é morto em ~10s. Sem isto o processo poderia
        // ser recolhido no meio do envio e a impressora ficaria com meia
        // etiqueta no buffer — que é pior que não imprimir nada.
        val pendente = goAsync()
        val app = context.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val prefs = ImpressoraPrefs(app)
                folga?.let { prefs.definirFolga(it); Log.i(TAG, "folga ajustada para ${it}mm") }
                altura?.let { prefs.definirAltura(it); Log.i(TAG, "altura ajustada para ${it}mm") }

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
                Log.i(TAG, "imprimindo teste em ${cfg.nome} (${cfg.endereco}) " +
                    "altura=${cfg.alturaMm}mm folga=${cfg.folgaMm}mm tiras=${if (duas) 2 else 1}")
                val r = servico.imprimirTeste(duas)
                Log.i(TAG, "teste de impressão: $r")
            } catch (e: Throwable) {
                Log.e(TAG, "teste de impressão falhou: ${e.message}", e)
            } finally {
                pendente.finish()
            }
        }
    }

    companion object {
        private const val TAG = "TridiEstoquePrint"
        const val ACAO = "com.tridi.estoque.TESTE_IMPRESSAO"
        const val TOKEN = "tridi-estoque-teste"
    }
}
