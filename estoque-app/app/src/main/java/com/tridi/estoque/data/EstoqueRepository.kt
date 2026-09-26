package com.tridi.estoque.data

import com.tridi.estoque.net.AtividadeConferenciaDto
import com.tridi.estoque.net.BootstrapData
import com.tridi.estoque.net.CompraDto
import com.tridi.estoque.net.CriarLocalRequest
import com.tridi.estoque.net.CriarLocalResponse
import com.tridi.estoque.net.EstoqueApi
import com.tridi.estoque.net.LocaisData
import com.tridi.estoque.net.ItemCatalogoDto
import com.tridi.estoque.catalogo.normalizarBusca
import com.tridi.estoque.catalogo.palavrasDaBusca
import com.tridi.estoque.catalogo.skuComparavel
import com.tridi.estoque.catalogo.termoBuscavel
import com.tridi.estoque.conferencia.atividadesSeguradasPelaFila
import com.tridi.estoque.net.MotivoDto
import com.tridi.estoque.scan.LeituraGuardada
import com.tridi.estoque.scan.partirCodigoUnidade
import com.tridi.estoque.security.DeviceSecrets
import com.tridi.estoque.sync.ResumoDaFila
import com.tridi.estoque.sync.somarFilas
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID

private const val CHAVE_SALT = "operadores_salt"
private const val CHAVE_MOTIVOS = "motivos_baixa"
private const val CHAVE_COMPRAS = "compras_aguardando"
private const val CHAVE_ATIVIDADES = "conferencias_pendentes"
private const val CHAVE_QC_DESLIGADO = "conferencia_desligada"
private const val CHAVE_QC_TRAVADAS = "conferencias_travadas"
private const val CHAVE_QC_ANTERIORES = "conferencias_anteriores"
private const val CHAVE_QC_DIAS = "conferencias_dias"
private const val CHAVE_CATALOGO_ASSINATURA = "catalogo_assinatura"
private const val CHAVE_CATALOGO_EM = "catalogo_atualizado_em"
private const val CHAVE_CATALOGO_TRUNCADO = "catalogo_truncado"

/**
 * Os códigos de etiqueta que já saíram no papel deste tablet.
 *
 * No disco e não em memória: o aviso da conferência sobrevive ao app fechar (ele
 * mora no banco), então a memória do que já foi impresso precisa sobreviver
 * junto. Sem isso, reabrir o app devolveria o botão "Imprimir etiquetas (2)"
 * com a caixa que já está etiquetada na prateleira.
 */
private const val CHAVE_ETIQUETAS_IMPRESSAS = "etiquetas_impressas"

/**
 * Teto da busca no catálogo local. A tela mostra uma lista rolável, mas quem
 * está de pé no galpão não rola cinquenta linhas: passando disso a resposta
 * certa é digitar mais uma palavra, e é o que o rodapé da lista diz.
 */
const val TETO_DA_BUSCA = 30

// Ativação do tablet, diretório offline (operadores/sal/motivos/compras) e as
// duas filas de trabalho do galpão — baixa e recebimento. O carrinho, a
// dívida e o funcionário-com-limite do TridiMarket saíram na poda do domínio
// de venda; aqui não tem carrinho, tem etiqueta.
class EstoqueRepository(private val dao: EstoqueDao, private val api: EstoqueApi, private val secrets: DeviceSecrets) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun provision(codigo: String) {
        val dados = api.activate(codigo)
        secrets.save(dados.token, dados.deviceId, dados.nome)
        // Sem isto o primeiro login exigiria rede: o diretório offline só
        // existe depois de UM bootstrap bem-sucedido. Best-effort — se falhar
        // aqui (rede caiu no instante seguinte à ativação), o worker
        // periódico tenta de novo.
        runCatching { sincronizarBootstrap() }
    }

    // Esquenta a conexão: resolve DNS, abre o TCP e faz o handshake TLS antes
    // de a pessoa precisar da resposta. Best-effort.
    suspend fun aquecerConexao() = api.aquecer()

    // ── Diretório offline (operadores/sal/motivos/compras) ──────────────────
    suspend fun sincronizarBootstrap(): BootstrapData? {
        val token = secrets.load()?.token ?: return null
        val dados = api.bootstrap(token)
        dao.limparOperadores()
        dao.putOperadores(dados.operadores.map { OperadorEntity(it.id, it.nome, it.verificador) })
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_SALT, dados.salt))
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_MOTIVOS, json.encodeToString(dados.motivos)))
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_COMPRAS, json.encodeToString(dados.compras)))
        return dados
    }

    // ── Os lugares do galpão (tela "Placas do galpão") ──────────────────────
    // Sem cache local de propósito: a tela abre, busca, e a lista de ~80
    // linhas cabe numa resposta só. Quem chama é gente (abertura da tela e o
    // pós-criação), nunca relógio — cache aqui seria a versão velha da parede
    // aparecendo depois que alguém acabou de criar um lugar nela.
    suspend fun locaisDoGalpao(): LocaisData? {
        val token = secrets.load()?.token ?: return null
        return api.locais(token)
    }

    suspend fun criarLocal(pedido: CriarLocalRequest): CriarLocalResponse {
        val token = secrets.load()?.token
            ?: return CriarLocalResponse(ok = false, detalhe = "Tablet sem ativação — ative o aparelho primeiro.")
        return api.criarLocal(token, pedido)
    }

    // ── O que já virou papel ────────────────────────────────────────────────
    // Ver conferencia/EtiquetasJaImpressas.kt: duas caixas com o mesmo código é
    // o pior estrago que este app pode fazer, e a reimpressão acidental é a
    // porta. Leitura tolerante — JSON estragado devolve lista vazia em vez de
    // derrubar a tela de conferência, e o pior caso de perder esta memória é
    // voltar ao comportamento de antes, nunca imprimir errado.
    suspend fun etiquetasJaImpressas(): List<String> = dao.metadata(CHAVE_ETIQUETAS_IMPRESSAS)
        ?.let { runCatching { json.decodeFromString<List<String>>(it) }.getOrNull() } ?: emptyList()

    suspend fun guardarEtiquetasImpressas(codigos: List<String>) {
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_ETIQUETAS_IMPRESSAS, json.encodeToString(codigos)))
    }

    suspend fun operadoresCache(): List<OperadorEntity> = dao.operadores()
    suspend fun saltCache(): String? = dao.metadata(CHAVE_SALT)
    suspend fun motivosCache(): List<MotivoDto> = dao.metadata(CHAVE_MOTIVOS)
        ?.let { runCatching { json.decodeFromString<List<MotivoDto>>(it) }.getOrNull() } ?: emptyList()
    suspend fun comprasCache(): List<CompraDto> = dao.metadata(CHAVE_COMPRAS)
        ?.let { runCatching { json.decodeFromString<List<CompraDto>>(it) }.getOrNull() } ?: emptyList()

    // Remoção otimista: some da lista assim que o recebimento é enfileirado,
    // pra não deixar a mesma compra ser confirmada duas vezes enquanto a fila
    // não sincronizou. O próximo bootstrap corrige se algo divergir.
    private suspend fun removerCompraDoCache(compraId: String) {
        val restante = comprasCache().filterNot { it.id == compraId }
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_COMPRAS, json.encodeToString(restante)))
    }

    // ── Catálogo ("quantos temos disso?") ───────────────────────────────────
    //
    // A sincronização NÃO é poll: quem a dispara é gente — a tela de código
    // (junto do diretório offline) e a abertura da consulta. E ela quase sempre
    // não traz nada: o aparelho manda a assinatura que tem e o servidor
    // responde `mudou: false` quando o catálogo é o mesmo.

    /**
     * @return quantos itens ficaram no tablet, ou `null` quando não deu pra
     *   falar com o servidor (aí o que já estava continua valendo).
     */
    suspend fun sincronizarCatalogo(): Int? {
        val token = secrets.load()?.token ?: return null
        val dados = api.catalogo(token, dao.metadata(CHAVE_CATALOGO_ASSINATURA))
        if (!dados.mudou) {
            // Nada mudou lá: só carimba que a conversa aconteceu agora, pra
            // tela poder dizer "atualizado há 2 min" com honestidade.
            dao.putMetadata(EstoqueMetadataEntity(CHAVE_CATALOGO_EM, System.currentTimeMillis().toString()))
            return dao.quantosItensNoCatalogo()
        }
        dao.substituirCatalogo(dados.itens.map(::paraEntidade))
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_CATALOGO_ASSINATURA, dados.assinatura))
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_CATALOGO_EM, System.currentTimeMillis().toString()))
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_CATALOGO_TRUNCADO, if (dados.truncado) "1" else ""))
        return dados.itens.size
    }

    private fun paraEntidade(dto: ItemCatalogoDto) = ItemCatalogoEntity(
        id = dto.id,
        nome = dto.nome,
        sku = dto.sku?.takeIf { it.isNotBlank() },
        categoria = dto.categoria?.takeIf { it.isNotBlank() },
        unidade = dto.unidade.ifBlank { "un" },
        quantidade = dto.quantidade,
        local = dto.local?.takeIf { it.isNotBlank() },
        // Nome, categoria e SKU no MESMO campo: quem está de luva procura por
        // qualquer um dos três sem saber que são campos diferentes.
        busca = normalizarBusca(listOfNotNull(dto.nome, dto.categoria, dto.sku).joinToString(" ")),
        skuBusca = skuComparavel(dto.sku),
    )

    suspend fun quantosItensNoCatalogo(): Int = dao.quantosItensNoCatalogo()
    suspend fun catalogoAtualizadoEm(): Long? = dao.metadata(CHAVE_CATALOGO_EM)?.toLongOrNull()
    suspend fun catalogoTruncado(): Boolean = dao.metadata(CHAVE_CATALOGO_TRUNCADO) == "1"

    /**
     * A busca da tela — no disco, sem rede.
     *
     * Bipar uma etiqueta cai aqui também: `<SKU>-<sequencial>` vira consulta
     * por SKU, e só se ela não achar nada é que o texto inteiro é procurado
     * como nome. Um código que não é etiqueta (um EAN da caixa do fornecedor,
     * por exemplo) segue o caminho de texto e não trava nada.
     */
    suspend fun buscarNoCatalogo(termo: String, limite: Int = TETO_DA_BUSCA): List<ItemCatalogoEntity> {
        partirCodigoUnidade(termo.trim())?.let { etiqueta ->
            val porSku = dao.itensPorSku(skuComparavel(etiqueta.sku))
            if (porSku.isNotEmpty()) return porSku
        }
        val palavras = palavrasDaBusca(termo)
        // Campo vazio (ou com uma letra só) mostra o CATÁLOGO, não o nada. A
        // tela dizia "221 itens neste tablet" e listava zero — quem está de
        // luva na frente da prateleira lê isso como "o app não sabe de nada".
        if (!termoBuscavel(termo)) return dao.catalogoInteiro(limite)
        return dao.buscarNoCatalogo(
            p1 = palavras.getOrElse(0) { "" },
            p2 = palavras.getOrElse(1) { "" },
            p3 = palavras.getOrElse(2) { "" },
            limite = limite,
        )
    }

    // ── Rascunho da bipagem ─────────────────────────────────────────────────
    //
    // A pilha vivia só na memória do ViewModel: entre a primeira leitura e o
    // Confirmar, até 200 etiquetas existiam apenas na RAM. Agora cada leitura
    // aceita toca o disco na hora.

    suspend fun guardarLeitura(codigo: String, operadorId: String) =
        dao.guardarLeitura(LeituraEmAbertoEntity(codigo = codigo, operadorId = operadorId))

    suspend fun esquecerLeitura(codigo: String) = dao.esquecerLeituras(listOf(codigo))

    suspend fun esquecerLeituras(codigos: List<String>) {
        if (codigos.isNotEmpty()) dao.esquecerLeituras(codigos)
    }

    suspend fun limparRascunhoDe(operadorId: String) = dao.limparRascunhoDe(operadorId)

    /** O rascunho inteiro, cru — quem decide o que fazer é `destinoDoRascunho`. */
    suspend fun rascunhoDeBipagem(): List<LeituraGuardada> =
        dao.rascunhoDeBipagem().map { LeituraGuardada(it.codigo, it.operadorId, it.criadoEm) }

    // ── Fila offline ──────────────────────────────────────────────────────
    // `operationId` nasce AQUI, uma vez só, por enfileiramento — nunca no
    // worker. É o que faz o servidor tratar um reenvio como o MESMO pedido em
    // vez de dar baixa duas vezes na mesma etiqueta (ver PLAN.md do App E3).
    suspend fun enfileirarBaixa(codigos: List<String>, motivo: String, obs: String?, operadorId: String): String {
        val operationId = UUID.randomUUID().toString()
        dao.putPendingBaixa(
            PendingBaixaEntity(
                operationId = operationId,
                codigosJson = json.encodeToString(codigos),
                motivo = motivo,
                obs = obs,
                operadorId = operadorId,
                ocorridoEm = Instant.now().toString(),
            ),
        )
        return operationId
    }

    /**
     * Uma LINHA da entrada por bipagem — um código, N peças. O lote da tela
     * vira N chamadas a esta função, cada uma com o próprio operationId: o
     * endpoint trabalha por código, e um id compartilhado faria o servidor
     * tratar a segunda linha como repetição da primeira.
     */
    suspend fun enfileirarEntrada(codigo: String, quantidade: Int, motivo: String, obs: String?, operadorId: String): String {
        val operationId = UUID.randomUUID().toString()
        dao.putPendingEntrada(
            PendingEntradaEntity(
                operationId = operationId,
                codigo = codigo,
                quantidade = quantidade,
                motivo = motivo,
                obs = obs,
                operadorId = operadorId,
                ocorridoEm = Instant.now().toString(),
            ),
        )
        return operationId
    }

    suspend fun enfileirarRecebimento(compraId: String, quantidadeRecebida: Int, operadorId: String): String {
        val operationId = UUID.randomUUID().toString()
        dao.putPendingRecebimento(
            PendingRecebimentoEntity(
                operationId = operationId,
                compraId = compraId,
                quantidadeRecebida = quantidadeRecebida,
                operadorId = operadorId,
                ocorridoEm = Instant.now().toString(),
            ),
        )
        removerCompraDoCache(compraId)
        return operationId
    }

    // ── Conferência de qualidade ────────────────────────────────────────────
    //
    // A lista de atividades NÃO vem no bootstrap: ela muda o dia inteiro e só
    // interessa a quem abriu a tela. Cache primeiro (a tela abre cheia, mesmo
    // sem rede), busca depois.
    suspend fun atividadesCache(): List<AtividadeConferenciaDto> = dao.metadata(CHAVE_ATIVIDADES)
        ?.let { runCatching { json.decodeFromString<List<AtividadeConferenciaDto>>(it) }.getOrNull() } ?: emptyList()

    /**
     * Busca a lista no servidor e guarda. O que já está na FILA local some da
     * lista: a conferência foi confirmada aqui e ainda não subiu, então o
     * servidor continua devolvendo a atividade — mostrá-la de novo convidaria
     * o gestor a conferir duas vezes a mesma caixa.
     *
     * A conferência RECUSADA de vez é a exceção, e quem decide isso é
     * `atividadesSeguradasPelaFila`: ela não vai mais subir, então precisa
     * devolver a atividade pra lista — é o que o cartão de recusa promete.
     */
    suspend fun sincronizarConferencias(): List<AtividadeConferenciaDto> {
        val token = secrets.load()?.token ?: return atividadesCache()
        val presas = atividadesSeguradasPelaFila(dao.conferenciasNaFila())
        val resposta = api.conferenciasPendentes(token)
        val lista = resposta.atividades.filterNot { it.id in presas }
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_ATIVIDADES, json.encodeToString(lista)))
        // Guardados junto da lista: sem eles, uma fila vazia porque a
        // conferência nem está instalada no servidor fica idêntica a uma fila
        // vazia porque ninguém terminou atividade — e o gestor espera pra
        // sempre um trabalho que nunca vai aparecer.
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_QC_DESLIGADO, if (resposta.qcDesligado) "1" else ""))
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_QC_TRAVADAS, resposta.travadas.toString()))
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_QC_ANTERIORES, resposta.anteriores.toString()))
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_QC_DIAS, resposta.dias.toString()))
        return lista
    }

    suspend fun qcDesligadoCache(): Boolean = dao.metadata(CHAVE_QC_DESLIGADO) == "1"
    suspend fun conferenciasTravadasCache(): Int = dao.metadata(CHAVE_QC_TRAVADAS)?.toIntOrNull() ?: 0
    suspend fun conferenciasAnterioresCache(): Int = dao.metadata(CHAVE_QC_ANTERIORES)?.toIntOrNull() ?: 0
    suspend fun conferenciasDiasCache(): Int = dao.metadata(CHAVE_QC_DIAS)?.toIntOrNull() ?: 0

    private suspend fun removerAtividadeDoCache(atividadeId: String) {
        val restante = atividadesCache().filterNot { it.id == atividadeId }
        dao.putMetadata(EstoqueMetadataEntity(CHAVE_ATIVIDADES, json.encodeToString(restante)))
    }

    /**
     * Guarda o veredito na fila. SEM quantidade: a caixa nasce com o que a
     * pessoa registrou ao concluir, lido pelo servidor na hora de gravar.
     *
     * COM destino, ao contrário da quantidade, e a diferença é essa: a
     * quantidade o servidor relê do banco; o item escolhido só existe na cabeça
     * de quem estava de pé na frente da caixa. Se ele não viajar na fila, a
     * aprovação sobe sem destino e volta recusada.
     */
    suspend fun enfileirarConferencia(
        atividadeId: String,
        produtoNome: String,
        resultado: String,
        destinoId: String?,
        defeitos: List<String>,
        obs: String?,
        conferidoPorId: String,
    ): String {
        val operationId = UUID.randomUUID().toString()
        dao.putPendingConferencia(
            PendingConferenciaEntity(
                operationId = operationId,
                atividadeId = atividadeId,
                produtoNome = produtoNome,
                resultado = resultado,
                destinoId = destinoId?.takeIf { it.isNotBlank() },
                defeitosJson = json.encodeToString(defeitos),
                obs = obs?.takeIf { it.isNotBlank() },
                conferidoPorId = conferidoPorId,
                ocorridoEm = Instant.now().toString(),
            ),
        )
        removerAtividadeDoCache(atividadeId)
        return operationId
    }

    // ── As recusadas de vez — cada tela mostra o motivo em português ─────────
    fun conferenciasRecusadasFlow(): Flow<List<PendingConferenciaEntity>> = dao.conferenciasRecusadasFlow()
    fun baixasRecusadasFlow(): Flow<List<PendingBaixaEntity>> = dao.baixasRecusadasFlow()
    fun entradasRecusadasFlow(): Flow<List<PendingEntradaEntity>> = dao.entradasRecusadasFlow()
    fun recebimentosRecusadosFlow(): Flow<List<PendingRecebimentoEntity>> = dao.recebimentosRecusadosFlow()

    suspend fun descartarConferenciaRecusada(operationId: String) = dao.removerPendingConferencia(operationId)
    suspend fun descartarBaixaRecusada(operationId: String) = dao.removerPendingBaixa(operationId)
    suspend fun descartarEntradaRecusada(operationId: String) = dao.removerPendingEntrada(operationId)
    suspend fun descartarRecebimentoRecusado(operationId: String) = dao.removerPendingRecebimento(operationId)

    /**
     * O retrato das três filas juntas — nunca as linhas.
     *
     * Agregado de propósito: arrastar os lotes inteiros (com o `codigosJson` de
     * até 200 etiquetas) a cada mudança do banco seria pagar o dado que ninguém
     * lê. O que a faixa precisa é a contagem, a idade da mais antiga e o erro
     * dela — tudo o que decide entre "ainda vai subir" e "isto aqui travou".
     */
    fun resumoDaFilaFlow(): Flow<ResumoDaFila> = combine(
        dao.resumoDeBaixasFlow(),
        dao.resumoDeRecebimentosFlow(),
        dao.resumoDeConferenciasFlow(),
        dao.resumoDeEntradasFlow(),
    ) { baixas, recebimentos, conferencias, entradas -> somarFilas(listOf(baixas, recebimentos, conferencias, entradas)) }

    // ── O que voltou do servidor (pra tela mostrar quando sincronizar) ──────
    fun feedbackDeBaixaFlow(): Flow<List<SyncFeedbackEntity>> = dao.feedbackFlow("baixa")
    fun feedbackDeEntradaFlow(): Flow<List<SyncFeedbackEntity>> = dao.feedbackFlow("entrada")
    fun feedbackDeRecebimentoFlow(): Flow<List<SyncFeedbackEntity>> = dao.feedbackFlow("recebimento")
    fun feedbackDeConferenciaFlow(): Flow<List<SyncFeedbackEntity>> = dao.feedbackFlow("conferencia")

    /**
     * O resumo do que SAIU, por item — canal à parte do das etiquetas baixadas,
     * pelo mesmo motivo do aviso de preparo: o formato da linha é outro e
     * `lotesDe` descarta em silêncio o que não decodifica. Misturar os dois
     * derrubaria a lista de códigos que NÃO baixaram, que é a única coisa da
     * tela que ainda exige ação de alguém.
     */
    fun saidaPorItemFlow(): Flow<List<SyncFeedbackEntity>> =
        dao.feedbackFlow(com.tridi.estoque.sync.TIPO_SAIDA_POR_ITEM)

    /**
     * A conferência que entrou no estoque SEM etiqueta — canal à parte do das
     * etiquetas, porque o formato da linha é outro (ver TIPO_AVISO_DE_PREPARO).
     */
    fun avisosDePreparoFlow(): Flow<List<SyncFeedbackEntity>> =
        dao.feedbackFlow(com.tridi.estoque.sync.TIPO_AVISO_DE_PREPARO)
    // Só por TIPO. O `descartarFeedback(id)` que existia aqui era uma armadilha:
    // as três telas passavam o tipo ("baixa"/"recebimento") no lugar do id, e o
    // DELETE por id não casava com nada — o aviso nunca saía da tela.
    suspend fun descartarFeedbacksDoTipo(tipo: String) = dao.removerFeedbacksDoTipo(tipo)
}
