package com.tridi.market.data

import com.tridi.market.BuildConfig
import com.tridi.market.domain.CartLine
import com.tridi.market.domain.createPurchaseOperation
import com.tridi.market.net.ActivationRequest
import com.tridi.market.net.HeartbeatRequest
import com.tridi.market.net.MarketApi
import com.tridi.market.net.MarketApiException
import com.tridi.market.net.PurchaseLineRequest
import com.tridi.market.net.PurchaseRequest
import com.tridi.market.security.DeviceSecrets
import com.tridi.market.sync.LocalOperation
import com.tridi.market.sync.OperationState
import com.tridi.market.sync.SyncResult
import com.tridi.market.sync.reduceSync
import java.time.Instant
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

// O tablet não sabe de qual empresa é a carteira cobrada (a pessoa pode ter
// conta em várias). O servidor lê isso de usuarios_perfil e sobrescreve.
private const val COMPANY_DEFINIDA_PELO_SERVIDOR = 1L

data class AuthenticatedSession(val session: com.tridi.market.net.SessionData, val online: Boolean)

class MarketRepository(private val dao: MarketDao, private val api: MarketApi, private val secrets: DeviceSecrets) {
    suspend fun provision(code: String) = api.activate(ActivationRequest(code, BuildConfig.VERSION_NAME, secrets.installationId())).also { secrets.save(it.token, it.deviceId, it.profileId) }

    suspend fun refreshSnapshot() {
        val credentials = requireNotNull(secrets.load()) { "device_not_provisioned" }
        val snapshot = api.bootstrap(credentials.token)
        val now = System.currentTimeMillis()
        // O diretório de funcionários é o que faz o tablet reconhecer o código
        // de qualquer pessoa sem internet. Guardado junto com o catálogo, na
        // mesma transação, pra os dois nunca ficarem em versões diferentes.
        dao.replaceSnapshot(
            snapshot.products.map { ProductEntity(it.id, it.name, it.barcode, it.price, it.imageUrl, it.categoryName, it.stock, it.minimumStock, it.active, now, it.semCodigo, it.ocultoBusca) },
            snapshot.employees.map {
                EmployeeSnapshotEntity(
                    id = it.id, name = it.name, imageUrl = it.imageUrl, open = it.open, available = it.available,
                    status = it.status, snapshotAt = now, profileId = it.profileId, companyId = it.companyId,
                    normalLimit = it.normalLimit, overdraftLimit = it.overdraftLimit, overdue = it.overdue,
                    codeHash = it.codeHash,
                )
            },
        )
        secrets.saveOfflineDirectory(snapshot.authSalt, snapshot.offlineGrant)
    }

    // Recusa do servidor (4xx: código errado, tablet despareado, conta bloqueada)
    // é definitiva — propaga. Sem rede (0) ou servidor fora do ar (5xx) o login
    // é resolvido LOCALMENTE, contra o diretório baixado no último bootstrap:
    // é isso que faz o mercadinho continuar aceitando o código de qualquer
    // funcionário com o Wi-Fi caído, e não só de quem já tinha entrado aqui.
    // ── Login em duas velocidades ───────────────────────────────────────────
    //
    // O diretório local guarda o verificador do código de TODA a equipe, então
    // reconhecer quem digitou custa uma busca indexada no SQLite — menos de um
    // milissegundo. Mesmo assim o login esperava o servidor responder ANTES de
    // deixar a pessoa entrar. Medido no tablet: 5.750 ms, com o endpoint
    // respondendo em ~200 ms — o resto era disputa de rede com o catálogo e as
    // fotos sincronizando ao mesmo tempo.
    //
    // Agora o local decide na hora e o servidor confirma depois (ver
    // `reconciliarSessao` no MarketViewModel). O servidor continua sendo a
    // autoridade: se ele recusar, a sessão cai com o motivo — só que a pessoa
    // não fica olhando pra tela parada enquanto isso.
    suspend fun autenticarLocal(pin: String): AuthenticatedSession? {
        val t0 = android.os.SystemClock.elapsedRealtime()
        val local = sessaoLocal(pin) ?: secrets.offlineSession(pin) ?: return null
        android.util.Log.i("TridiMarketPerf", "login/local=${android.os.SystemClock.elapsedRealtime() - t0}ms")
        return AuthenticatedSession(local, false)
    }

    // Caminho autoritativo. Usado para confirmar em segundo plano o login que já
    // aconteceu, e como caminho único quando o código não está no diretório
    // local (funcionário novo, tablet ainda sem sincronizar).
    suspend fun autenticarNoServidor(pin: String): AuthenticatedSession {
        val t0 = android.os.SystemClock.elapsedRealtime()
        val session = api.session(pin, requireNotNull(secrets.load()).token).also { secrets.saveOfflineSession(pin, it) }
        android.util.Log.i("TridiMarketPerf", "login/servidor=${android.os.SystemClock.elapsedRealtime() - t0}ms")
        return AuthenticatedSession(session, true)
    }

    suspend fun aquecerConexao() = api.aquecer()

    suspend fun authenticate(pin: String) = try {
        autenticarNoServidor(pin)
    } catch (error: Exception) {
        if (error is MarketApiException && error.statusCode in 400..499) throw error
        val local = sessaoLocal(pin) ?: secrets.offlineSession(pin)
        if (local == null) {
            // Diretório baixado e o código não está nele: é código errado
            // mesmo, e a pessoa merece ouvir isso em vez de "sem internet".
            if (dao.directorySize() > 0) throw MarketApiException(401, "invalid_pin")
            throw error
        }
        AuthenticatedSession(local, false)
    }

    // Login offline pelo diretório. O código digitado vira UM hash, procurado
    // no banco local. A "sessão" é a concessão do dispositivo — o servidor
    // aceita a compra por causa dela e marca que a autenticação foi offline.
    private suspend fun sessaoLocal(pin: String): com.tridi.market.net.SessionData? {
        val salt = secrets.authSalt() ?: return null
        val grant = secrets.offlineGrant() ?: return null
        val candidatos = dao.employeesByCodeHash(secrets.codeHash(pin, salt))
        if (candidatos.isEmpty()) return null
        val credentials = secrets.load()
        // Mesmo critério do servidor: se a pessoa tem conta na unidade DESTE
        // tablet, é ela; senão, a de menor id (determinístico).
        val escolhido = candidatos.firstOrNull { it.profileId == credentials?.profileId } ?: candidatos.minByOrNull { it.id }!!
        return com.tridi.market.net.SessionData(
            token = grant,
            expiresAt = Instant.now().plusSeconds(48 * 3600).toString(),
            employee = com.tridi.market.net.EmployeeDto(
                id = escolhido.id, profileId = escolhido.profileId, companyId = escolhido.companyId,
                name = escolhido.name, imageUrl = escolhido.imageUrl, normalLimit = escolhido.normalLimit,
                overdraftLimit = escolhido.overdraftLimit, open = escolhido.open, overdue = escolhido.overdue,
                available = escolhido.available, status = escolhido.status,
            ),
            visitante = escolhido.profileId != credentials?.profileId,
        )
    }

    suspend fun directorySize(): Int = dao.directorySize()

    /**
     * O servidor recusou por conta INATIVA: tira a pessoa do caminho offline.
     *
     * Duas coisas a mantinham entrando: a sessão de 48 h guardada do último
     * login, e o diretório baixado no bootstrap anterior, que ainda tem o hash
     * do código dela. Sem limpar as duas, ela volta a entrar e ser expulsa a
     * cada tentativa — que é exatamente o comportamento que se quer eliminar.
     *
     * O bootstrap é best-effort: sem rede, o diretório continua velho e a
     * recusa acontece na próxima vez que o servidor responder.
     */
    suspend fun esquecerContaInativa() {
        secrets.esquecerSessaoOffline()
        runCatching { refreshSnapshot() }
    }

    // ── Carrinho em andamento ───────────────────────────────────────────────
    // Compra FINALIZADA já era durável (`pending_operations`). O que se perdia
    // era o carrinho ainda sendo montado: ele só existia na memória do
    // ViewModel, então bateria acabando no meio da escolha apagava tudo e a
    // pessoa tinha que catar os produtos de novo — e nesse ponto muita gente
    // desiste da compra.
    //
    // Guardado como texto simples (`produtoId:quantidade` separados por vírgula)
    // junto de quem estava comprando e de quando foi salvo. Sem JSON: são três
    // campos e um parser à mão é menos coisa pra dar errado do que arrastar uma
    // dependência de serialização pra isto.
    suspend fun salvarCarrinho(funcionarioId: Long, itens: Map<Long, Int>) {
        if (itens.isEmpty()) { limparCarrinho(); return }
        val corpo = itens.entries.joinToString(",") { "${it.key}:${it.value}" }
        dao.putMetadata(MarketMetadataEntity(CHAVE_CARRINHO, "$funcionarioId|${System.currentTimeMillis()}|$corpo"))
    }

    suspend fun limparCarrinho() = dao.clearMetadata(CHAVE_CARRINHO)

    // Devolve o carrinho salvo se ele for DESTA pessoa e ainda for recente.
    // Qualquer saída normal (fim de compra, sair, expirar por inatividade)
    // apaga o salvo — então sobrar um carrinho aqui significa que o app morreu
    // sem avisar: bateria, queda de energia, crash. É exatamente o caso que
    // vale recuperar.
    suspend fun carrinhoSalvo(funcionarioId: Long, agoraMs: Long = System.currentTimeMillis()): Map<Long, Int> {
        val cru = dao.metadata(CHAVE_CARRINHO) ?: return emptyMap()
        val partes = cru.split("|", limit = 3)
        if (partes.size < 3) { limparCarrinho(); return emptyMap() }
        val dono = partes[0].toLongOrNull()
        val salvoEm = partes[1].toLongOrNull()
        if (dono != funcionarioId || salvoEm == null || agoraMs - salvoEm > VALIDADE_CARRINHO_MS) {
            limparCarrinho()
            return emptyMap()
        }
        return partes[2].split(",").mapNotNull { item ->
            val (id, qtd) = item.split(":").let { it.getOrNull(0) to it.getOrNull(1) }
            val produto = id?.toLongOrNull() ?: return@mapNotNull null
            val quantidade = qtd?.toIntOrNull()?.takeIf { it > 0 } ?: return@mapNotNull null
            produto to quantidade
        }.toMap()
    }


    suspend fun queuePurchase(employeeId: Long, sessionToken: String, lines: List<CartLine>, rulesVersion: Int = 1): String {
        val operation = createPurchaseOperation(employeeId, lines, dao.nextSequence())
        dao.queuePurchase(
            PendingOperationEntity(operation.operationId, employeeId, operation.localSequence, operation.total, Instant.now().toString(), rulesVersion, sessionToken),
            lines.map { PendingItemEntity(operation.operationId, it.productId, it.quantity, it.unitPrice) },
        )
        return operation.operationId
    }

    // Uma sincronização por vez NO PROCESSO INTEIRO. O worker periódico (15 min)
    // e o imediato (disparado ao finalizar a compra) têm nomes distintos no
    // WorkManager, então podiam rodar ao mesmo tempo e postar a MESMA operação
    // em paralelo. A idempotência do servidor é por operation_id, mas duas
    // chamadas simultâneas disputavam a mesma inserção — risco de cobrar duas
    // vezes. O mutex elimina a disputa na origem.
    suspend fun syncPending(): Int = syncMutex.withLock { syncPendingInterno() }

    private suspend fun syncPendingInterno(): Int {
        val credentials = requireNotNull(secrets.load())
        var synced = 0
        for (operation in dao.pendingOperations()) {
            val items = dao.itemsFor(operation.operationId)
            // Sem itens a compra está corrompida — não envia pela metade.
            if (items.isEmpty()) { dao.updateOperation(operation.operationId, OperationState.REQUIRES_REVIEW.name, "sem_itens"); continue }
            dao.updateOperation(operation.operationId, OperationState.SYNCING.name, null)
            try {
                // companyId vai como placeholder: o servidor SEMPRE reescreve
                // esse campo com a empresa real do funcionário (usuarios_perfil),
                // justamente porque o tablet não sabe de quem é a conta cobrada.
                val result = api.purchase(PurchaseRequest(operation.operationId, operation.localSequence, operation.employeeId, COMPANY_DEFINIDA_PELO_SERVIDOR, operation.deviceOccurredAt, operation.rulesVersion, items.map { PurchaseLineRequest(it.productId, it.quantity, it.unitPrice) }), credentials.token, operation.sessionToken)
                val reduced = reduceSync(LocalOperation(operation.operationId, OperationState.SYNCING), SyncResult(result.operationId, result.status, result.reason))
                dao.updateOperation(operation.operationId, reduced.state.name, reduced.reason)
                if (reduced.state == OperationState.SYNCED) synced++
            } catch (error: Exception) {
                // Volta pra fila: SEMPRE retentável. Nada é apagado localmente
                // enquanto o servidor não confirmar — é isso que garante que uma
                // compra feita offline não some.
                dao.updateOperation(operation.operationId, OperationState.LOCAL_PENDING.name, error.message)
            }
        }
        // Heartbeat é telemetria: falhar aqui não pode invalidar o que já
        // sincronizou (antes derrubava o worker inteiro em Result.retry()).
        runCatching { api.heartbeat(HeartbeatRequest(dao.pendingOperations().size, BuildConfig.VERSION_NAME), credentials.token) }
        return synced
    }

    suspend fun pendingCount(): Int = dao.pendingOperations().size

    private companion object {
        val syncMutex = Mutex()
        const val CHAVE_CARRINHO = "carrinho_em_andamento"
        // Tempo de sobra pra ligar o tablet de novo depois de uma queda. Não é o
        // timeout de inatividade (80s): aquele é sobre alguém que foi embora, e
        // nesse caso o carrinho é apagado na saída, não recuperado.
        const val VALIDADE_CARRINHO_MS = 15 * 60 * 1000L
    }
}
