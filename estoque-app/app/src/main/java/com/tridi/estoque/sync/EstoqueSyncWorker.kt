package com.tridi.estoque.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.tridi.estoque.BuildConfig
import com.tridi.estoque.data.EstoqueDao
import com.tridi.estoque.data.EstoqueDatabase
import com.tridi.estoque.data.EstoqueRepository
import com.tridi.estoque.data.PendingBaixaEntity
import com.tridi.estoque.data.PendingConferenciaEntity
import com.tridi.estoque.data.PendingEntradaEntity
import com.tridi.estoque.data.PendingRecebimentoEntity
import com.tridi.estoque.data.SyncFeedbackEntity
import com.tridi.estoque.data.TrabalhoImpressaoEntity
import com.tridi.estoque.conferencia.PreparoDoItem
import com.tridi.estoque.conferencia.mereceAvisoDePreparo
import com.tridi.estoque.impressora.EtiquetaLivreLayout
import com.tridi.estoque.impressora.ResultadoImpressao
import com.tridi.estoque.impressora.ServicoDeImpressao
import com.tridi.estoque.impressora.paraTrabalho
import com.tridi.estoque.net.AvisoDePreparoDto
import com.tridi.estoque.net.BaixaRequest
import com.tridi.estoque.net.EntradaRequest
import com.tridi.estoque.net.ConfirmacaoImpressaoDto
import com.tridi.estoque.net.ConfirmarImpressaoRequest
import com.tridi.estoque.net.ConteudoLivreDto
import com.tridi.estoque.net.TrabalhoImpressaoDto
import com.tridi.estoque.net.EstoqueApi
import com.tridi.estoque.net.EstoqueApiException
import com.tridi.estoque.net.RecebimentoRequest
import com.tridi.estoque.security.DeviceSecrets
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

// Drena as duas filas offline do galpão — baixa e recebimento —, mais antigo
// primeiro. Cada linha reenvia com o MESMO operationId (nunca regenerado):
// isso é o que deixa o servidor responder o resultado já gravado em vez de
// baixar a mesma etiqueta duas vezes numa etiqueta com pouca rede.
//
// A cada ciclo também atualiza o diretório offline (bootstrap) e manda um
// heartbeat — o mesmo raciocínio do totem do mercadinho, adaptado pra fila
// dupla em vez de uma só.
class EstoqueSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun doWork(): Result = try {
        val db = EstoqueDatabase.get(applicationContext)
        val dao = db.estoqueDao()
        val secrets = DeviceSecrets(applicationContext)
        val api = EstoqueApi(BuildConfig.DEFAULT_API_BASE)
        val repository = EstoqueRepository(dao, api, secrets)
        val credenciais = secrets.load()

        if (credenciais == null) {
            // Tablet ainda não ativado: nada pra sincronizar.
            Result.success()
        } else {
            android.util.Log.i("TridiEstoqueSync", "sync: começou")

            // Diretório fresco antes de drenar — se um motivo ou uma compra
            // mudou no servidor, a tela pega a atualização no próximo desenho.
            // Best-effort: uma falha aqui não pode travar o envio das filas.
            val bootstrap = runCatching { repository.sincronizarBootstrap() }.getOrNull()
            bootstrap?.impressao?.let { i ->
                // A configuração de impressão do escritório entra aqui também,
                // e não só quando alguém abre a tela: o tablet pode ficar o dia
                // inteiro parado na tela do código, e uma altura trocada de
                // manhã precisa valer antes do primeiro lote da tarde.
                runCatching {
                    com.tridi.estoque.impressora.ImpressoraPrefs(applicationContext)
                        .aplicarDoEscritorio(
                            i.definida, i.alturaMm, i.larguraMm, i.copias, i.caixas, i.ocultos,
                        )
                }
            }
            // As etiquetas que o escritório escreveu à mão. Best-effort, como o
            // bootstrap: uma impressora fora do ar não pode travar o envio das
            // filas de baixa e recebimento, que são estoque de verdade.
            runCatching { imprimirDoEscritorio(dao, api, credenciais.token, bootstrap?.trabalhos ?: emptyList()) }

            var precisaRetentar = false
            var restantes = 0

            dao.pendingBaixasParaEnviar().forEach { linha ->
                if (drenarBaixa(api, dao, credenciais.token, linha)) { precisaRetentar = true; restantes++ }
            }
            dao.pendingEntradasParaEnviar().forEach { linha ->
                if (drenarEntrada(api, dao, credenciais.token, linha)) { precisaRetentar = true; restantes++ }
            }
            dao.pendingRecebimentosParaEnviar().forEach { linha ->
                if (drenarRecebimento(api, dao, credenciais.token, linha)) { precisaRetentar = true; restantes++ }
            }
            dao.pendingConferenciasParaEnviar().forEach { linha ->
                if (drenarConferencia(api, dao, credenciais.token, linha)) { precisaRetentar = true; restantes++ }
            }

            runCatching { api.heartbeat(credenciais.token, restantes) }

            if (precisaRetentar) Result.retry() else Result.success()
        }
    } catch (_: Exception) {
        Result.retry()
    }

    /** @return true se a linha continua pendente e precisa de nova tentativa depois. */
    private suspend fun drenarBaixa(api: EstoqueApi, dao: EstoqueDao, token: String, linha: PendingBaixaEntity): Boolean {
        val item = ItemDaFila(linha.operationId, linha.tentativas, linha.falhouDefinitivo, linha.ultimoErro)
        val desfecho = try {
            val codigos = json.decodeFromString<List<String>>(linha.codigosJson)
            val resposta = api.baixa(token, BaixaRequest(linha.operationId, codigos, linha.motivo, linha.obs, linha.operadorId, linha.ocorridoEm))
            dao.putFeedback(SyncFeedbackEntity(UUID.randomUUID().toString(), "baixa", json.encodeToString(resposta.resultado)))
            // O resumo por item — "MDF 6 mm, 400 peças, restam 320". Linha
            // SEPARADA e só quando vem: um servidor mais velho que esta versão
            // do app responde sem `itens`, e gravar uma lista vazia faria a tela
            // mostrar um balão de resumo que não resume nada.
            if (resposta.itens.isNotEmpty()) {
                dao.putFeedback(
                    SyncFeedbackEntity(UUID.randomUUID().toString(), TIPO_SAIDA_POR_ITEM, json.encodeToString(resposta.itens)),
                )
            }
            DesfechoEnvio.Sucesso
        } catch (e: EstoqueApiException) {
            classificarFalha(e.statusCode, e.message)
        } catch (e: Exception) {
            classificarFalha(0, e.message)
        }
        return when (val acao = reduzirEnvio(item, desfecho)) {
            AcaoDaFila.Remover -> { dao.removerPendingBaixa(linha.operationId); false }
            is AcaoDaFila.Manter -> {
                dao.atualizarPendingBaixa(
                    linha.copy(tentativas = acao.item.tentativas, falhouDefinitivo = acao.item.falhouDefinitivo, ultimoErro = acao.item.ultimoErro),
                )
                !acao.item.falhouDefinitivo
            }
        }
    }

    /** A entrada por bipagem: uma linha, uma chamada, a frase do servidor vira feedback. */
    private suspend fun drenarEntrada(api: EstoqueApi, dao: EstoqueDao, token: String, linha: PendingEntradaEntity): Boolean {
        val item = ItemDaFila(linha.operationId, linha.tentativas, linha.falhouDefinitivo, linha.ultimoErro)
        val desfecho = try {
            val resposta = api.entrada(
                token,
                EntradaRequest(linha.operationId, linha.codigo, linha.quantidade, linha.motivo, linha.obs, linha.operadorId),
            )
            // A frase pronta ("+2 Almofada · agora 20 un") — é o que a tela
            // mostra na próxima visita. Lista de UMA, no mesmo canal das outras.
            dao.putFeedback(SyncFeedbackEntity(UUID.randomUUID().toString(), "entrada", json.encodeToString(listOf(resposta.frase))))
            DesfechoEnvio.Sucesso
        } catch (e: EstoqueApiException) {
            classificarFalha(e.statusCode, e.message)
        } catch (e: Exception) {
            classificarFalha(0, e.message)
        }
        return when (val acao = reduzirEnvio(item, desfecho)) {
            AcaoDaFila.Remover -> { dao.removerPendingEntrada(linha.operationId); false }
            is AcaoDaFila.Manter -> {
                dao.atualizarPendingEntrada(
                    linha.copy(tentativas = acao.item.tentativas, falhouDefinitivo = acao.item.falhouDefinitivo, ultimoErro = acao.item.ultimoErro),
                )
                !acao.item.falhouDefinitivo
            }
        }
    }

    /**
     * A conferência que admite a caixa no estoque.
     *
     * O feedback guardado aqui são as ETIQUETAS montadas pelo servidor, não os
     * códigos: vindo de uma atividade o servidor sabe o item (nome, cor,
     * local), e o tablet não sabe — ele imprime o que veio, sem re-derivar
     * nada do código de barras. No CERTO vem UMA etiqueta, a da caixa, valendo
     * as N peças que a pessoa fez.
     */
    private suspend fun drenarConferencia(api: EstoqueApi, dao: EstoqueDao, token: String, linha: PendingConferenciaEntity): Boolean {
        val item = ItemDaFila(linha.operationId, linha.tentativas, linha.falhouDefinitivo, linha.ultimoErro)
        val desfecho = try {
            // O corpo é montado por `pedidoDeConferencia`, em Kotlin puro: um
            // campo que a tela coleta e o envio esquece é invisível daqui de
            // dentro e só aparece como recusa na frente da caixa (foi o que
            // aconteceu com o item de destino). Lá isso cabe em teste na JVM.
            val resposta = api.conferencia(token, pedidoDeConferencia(linha))
            // ERRADO não devolve etiqueta nenhuma, e linha sem conteúdo não é
            // feedback: ela só ocuparia uma vaga do teto de `feedbackFlow`.
            //
            // Isto já foi mais grave do que é: enquanto a tela lia só o
            // feedback MAIS RECENTE, uma reprovação que subisse depois de uma
            // aprovação apagava da tela a etiqueta que ainda não tinha sido
            // impressa. Agora a tela junta as linhas (`juntarFeedback`) e um
            // lote vazio no meio não apaga mais nada — a guarda fica por
            // higiene, não por perigo.
            if (resposta.etiquetas.isNotEmpty()) {
                dao.putFeedback(SyncFeedbackEntity(UUID.randomUUID().toString(), "conferencia", json.encodeToString(resposta.etiquetas)))
            } else {
                // ── O silêncio que custou meses ──────────────────────────────
                //
                // Lista vazia caía aqui e NÃO acontecia nada. Só que o servidor
                // já tinha gravado a conferência e somado as peças: a caixa foi
                // pra prateleira, o número do sistema subiu e nenhum papel saiu.
                // Quem fosse bipar aquilo depois não acharia nada, e ninguém
                // ligava as duas pontas — a leitura do galpão virou "a impressão
                // de etiqueta do ERP está quebrada".
                //
                // Agora o motivo sobe junto (`preparo`) e vira aviso na tela, no
                // MESMO canal das etiquetas: uma linha de `sync_feedback` que
                // sobrevive ao tablet ser desligado e espera alguém ler.
                val preparo = PreparoDoItem.de(resposta.preparo?.estado, resposta.preparo?.motivo)
                if (mereceAvisoDePreparo(linha.resultado, resposta.etiquetas.size, preparo)) {
                    dao.putFeedback(
                        SyncFeedbackEntity(
                            UUID.randomUUID().toString(),
                            TIPO_AVISO_DE_PREPARO,
                            json.encodeToString(
                                listOf(
                                    AvisoDePreparoDto(
                                        atividade = linha.produtoNome,
                                        estado = resposta.preparo?.estado.orEmpty(),
                                        motivo = resposta.preparo?.motivo.orEmpty(),
                                    ),
                                ),
                            ),
                        ),
                    )
                }
            }
            DesfechoEnvio.Sucesso
        } catch (e: EstoqueApiException) {
            classificarFalha(e.statusCode, e.message)
        } catch (e: Exception) {
            classificarFalha(0, e.message)
        }
        return when (val acao = reduzirEnvio(item, desfecho)) {
            AcaoDaFila.Remover -> { dao.removerPendingConferencia(linha.operationId); false }
            is AcaoDaFila.Manter -> {
                dao.atualizarPendingConferencia(
                    linha.copy(tentativas = acao.item.tentativas, falhouDefinitivo = acao.item.falhouDefinitivo, ultimoErro = acao.item.ultimoErro),
                )
                !acao.item.falhouDefinitivo
            }
        }
    }

    private suspend fun drenarRecebimento(api: EstoqueApi, dao: EstoqueDao, token: String, linha: PendingRecebimentoEntity): Boolean {
        val item = ItemDaFila(linha.operationId, linha.tentativas, linha.falhouDefinitivo, linha.ultimoErro)
        val desfecho = try {
            val resposta = api.recebimento(token, RecebimentoRequest(linha.operationId, linha.compraId, linha.quantidadeRecebida, linha.operadorId, linha.ocorridoEm))
            dao.putFeedback(SyncFeedbackEntity(UUID.randomUUID().toString(), "recebimento", json.encodeToString(resposta.unidades)))
            DesfechoEnvio.Sucesso
        } catch (e: EstoqueApiException) {
            classificarFalha(e.statusCode, e.message)
        } catch (e: Exception) {
            classificarFalha(0, e.message)
        }
        return when (val acao = reduzirEnvio(item, desfecho)) {
            AcaoDaFila.Remover -> { dao.removerPendingRecebimento(linha.operationId); false }
            is AcaoDaFila.Manter -> {
                dao.atualizarPendingRecebimento(
                    linha.copy(tentativas = acao.item.tentativas, falhouDefinitivo = acao.item.falhouDefinitivo, ultimoErro = acao.item.ultimoErro),
                )
                !acao.item.falhouDefinitivo
            }
        }
    }
    // ── As etiquetas que o escritório escreveu à mão ─────────────────────────
    //
    // Três passos, nesta ordem, e a ordem é a trava:
    //
    //  1. GUARDA o que veio, com `INSERT ... IGNORE` pela chave, que é o id do
    //     SERVIDOR. Trabalho que este aparelho já conhece — porque já imprimiu e
    //     a confirmação se perdeu na volta — é ignorado aqui e não vira papel de
    //     novo. É o espelho de `estoque_operacoes` com os papéis invertidos: lá
    //     o servidor lembra pra não processar duas vezes, aqui o tablet lembra
    //     pra não IMPRIMIR duas vezes.
    //  2. IMPRIME o que está gravado e ainda não saiu. Gravar antes de imprimir
    //     é o que faz o app morrer no meio sem perder o trabalho.
    //  3. CONFIRMA o que saiu. Só existe chamada de rede aqui quando houve
    //     papel — ciclo comum, fila vazia, nenhuma requisição.
    //
    // ── E TUDO ISSO UM DE CADA VEZ ──────────────────────────────────────────
    //
    // `TRAVA_DA_IMPRESSAO` é do processo inteiro (`companion object`), e ela
    // existe porque ESTE worker roda em duas filas ao mesmo tempo: a periódica
    // de 15 minutos (`tridiestoque-periodic-sync`) e a imediata que todo
    // "Confirmar" da tela dispara (`tridiestoque-sync`). Nomes únicos
    // DIFERENTES não se serializam — o WorkManager roda os dois em paralelo.
    // Sem a trava, os dois liam a mesma linha pendente e saíam duas tiras.
    //
    // A trava resolve o caso dentro do processo; o `reservarTrabalho` do passo
    // 2 resolve o que ela não alcança (o processo morto no meio da impressão).
    private suspend fun imprimirDoEscritorio(
        dao: EstoqueDao,
        api: EstoqueApi,
        token: String,
        vindos: List<TrabalhoImpressaoDto>,
    ): Unit = TRAVA_DA_IMPRESSAO.withLock {
        if (vindos.isNotEmpty()) {
            // O filtro é a trava com NOME (`trabalhosNovos`, testada em
            // FilaDeImpressaoTest); o `OnConflictStrategy.IGNORE` do DAO é a
            // segunda linha. Duas defesas porque a anotação some num refactor
            // sem quebrar nada, e o defeito aparece como papel saindo sozinho.
            val conhecidos = dao.idsDeTrabalhosConhecidos().toSet()
            val novos = trabalhosNovos(vindos.map { it.id }, conhecidos).toSet()
            val aGuardar = vindos.filter { it.id in novos }
            if (aGuardar.isNotEmpty()) {
                dao.guardarTrabalhos(
                    aGuardar.map {
                        TrabalhoImpressaoEntity(
                            id = it.id,
                            conteudoJson = json.encodeToString(it.conteudo),
                            copias = it.copias,
                        )
                    },
                )
            }
        }

        val pendentes = dao.trabalhosParaImprimir()
        if (pendentes.isNotEmpty()) {
            val servico = ServicoDeImpressao(applicationContext)
            for (linha in pendentes) {
                val agora = System.currentTimeMillis()
                // TOMA a linha antes de mandar byte nenhum. Entre ler a fila e
                // gravar o desfecho há segundos de Bluetooth, e quem não
                // atravessa esse vão com a linha na mão imprime o que outro já
                // imprimiu. `0` = não é minha, alguém levou.
                if (dao.reservarTrabalho(linha.id, agora, MARCA_CAIU_NO_MEIO) != 1) continue
                val erro = imprimirUm(servico, linha)
                dao.atualizarTrabalho(linha.copy(impressoEm = agora, erro = erro))
            }
        }

        // Confirmação em LOTE e num pedido só: são poucas linhas e cada uma
        // valeria uma invocação no servidor.
        val aConfirmar = dao.trabalhosParaConfirmar()
        if (aConfirmar.isNotEmpty()) {
            val resposta = runCatching {
                api.confirmarImpressao(
                    token,
                    ConfirmarImpressaoRequest(
                        aConfirmar.map { ConfirmacaoImpressaoDto(id = it.id, ok = it.erro == null, detalhe = it.erro) },
                    ),
                )
            }
            // Só marca como confirmado quando o servidor respondeu. Marcar no
            // otimismo faria um papel que saiu ficar "esperando o tablet" pra
            // sempre na tela do escritório — e alguém mandaria de novo.
            if (resposta.isSuccess) {
                aConfirmar.forEach { dao.atualizarTrabalho(it.copy(confirmado = true)) }
            } else {
                aConfirmar.forEach { dao.atualizarTrabalho(it.copy(tentativasDeConfirmar = it.tentativasDeConfirmar + 1)) }
            }
        }

        // Poda o que já foi impresso E confirmado há mais tempo do que a fila do
        // servidor sobrevive (6 horas, ver VALIDADE_HORAS). Antes disso a linha
        // ainda é a trava contra a repetição; depois, ela não protege de nada.
        runCatching { dao.podarTrabalhos(System.currentTimeMillis() - VALIDADE_DA_FILA_MS) }
    }

    /** @return a frase do que deu errado, ou `null` quando o papel saiu. */
    private suspend fun imprimirUm(servico: ServicoDeImpressao, linha: TrabalhoImpressaoEntity): String? {
        val conteudo = runCatching { json.decodeFromString<ConteudoLivreDto>(linha.conteudoJson) }.getOrNull()
            ?: return "o tablet não entendeu o conteúdo desta etiqueta"

        val trabalho = conteudo.paraTrabalho(linha.copias)
        // O servidor já validou — com a versão DELE das regras. Este aparelho
        // pode estar rodando um app de três meses atrás (ou o contrário), e
        // etiqueta torta colada numa prateleira só é descoberta semanas depois,
        // quando alguém tenta bipar. Recusar com a frase é o desfecho certo.
        EtiquetaLivreLayout.problemaDoTrabalho(trabalho)?.let { return it }

        // A frase que sobe é a MESMA que a tela do tablet mostraria ("Impressora
        // desligada ou fora de alcance"), e não a exceção crua: quem lê no
        // escritório precisa saber se manda alguém ligar a impressora ou se o
        // problema é outro.
        return when (val r = servico.imprimirLivre(trabalho)) {
            is ResultadoImpressao.Ok -> null
            is ResultadoImpressao.Falha -> r.mensagem
        }
    }
}

/** Seis horas — o mesmo prazo em que a fila do servidor deixa de entregar. */
private const val VALIDADE_DA_FILA_MS = 6L * 60 * 60 * 1000

/**
 * Uma impressão de cada vez NO PROCESSO INTEIRO.
 *
 * Fora da classe de propósito: o WorkManager cria uma instância nova de
 * `EstoqueSyncWorker` por execução, então uma trava de instância não travaria
 * nada. As duas execuções que se cruzam são a periódica de 15 minutos e a
 * imediata de cada "Confirmar" — filas de nomes diferentes, que o WorkManager
 * roda em paralelo.
 */
private val TRAVA_DA_IMPRESSAO = Mutex()

/**
 * O erro que a linha carrega ENQUANTO a tira está saindo.
 *
 * Ele é gravado na reserva e apagado quando o papel sai. Se o processo morrer
 * no meio, é esta frase que sobe pro escritório — e o trabalho NÃO volta pra
 * fila, porque a tira pode ter saído inteira antes da queda. Reimprimir "por
 * via das dúvidas" é o defeito que a reserva existe pra evitar.
 */
private const val MARCA_CAIU_NO_MEIO = "o tablet foi desligado no meio da impressão"
