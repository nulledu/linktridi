package com.tridi.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import com.tridi.app.data.Atividade
import com.tridi.app.data.PendingOp
import com.tridi.app.data.PausaDoIntervalo
import com.tridi.app.data.Store
import com.tridi.app.net.Api
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.util.UUID

class Repo(private val ctx: Context, baseUrl: String) {
    val store = Store(ctx)
    private val api = Api(baseUrl)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()

    val online = MutableStateFlow(false)
    val syncing = MutableStateFlow(false)

    // ── Leitor de código de barras ────────────────────────────────────────────
    // O leitor pistola é HID: ele DIGITA o código no que estiver em foco. Quem
    // captura as teclas é a Activity (com.tridi.app.scan.TeclasDoLeitor), antes
    // de qualquer tela; ela joga o código aqui, e a tela que estiver aberta
    // consome. Sem repetição (`replay = 0`): código lido com nenhuma tela
    // esperando não pode ressurgir na próxima que abrir.
    val codigosLidos = kotlinx.coroutines.flow.MutableSharedFlow<String>(extraBufferCapacity = 8)
    fun codigoLido(codigo: String) { codigosLidos.tryEmit(codigo) }

    fun start() {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        try {
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { online.value = true; syncNow() }
                override fun onLost(network: Network) { online.value = false }
            })
        } catch (_: Exception) {}
        syncNow()
    }

    // ── Provisionamento (1x) ──
    suspend fun provision(code: String): String? {
        // Rede/DNS pode falhar (wifi sem internet) — NÃO deixa a exceção subir e
        // crashar o app na tela de código; devolve um erro pra tela tratar.
        val r = runCatching { api.provision(code) }.getOrNull() ?: return "sem_conexao"
        if (r.token != null) {
            store.update { it.copy(token = r.token, nomeMesa = r.device?.nome_mesa, setor = r.device?.setor) }
            syncNow()
            return null
        }
        return r.error ?: "falha"
    }

    // ── Mesa com vários funcionários (sem login). As atividades caem sozinhas. ──
    val claiming = MutableStateFlow(false)

    // Atividade atual de UM funcionário: a em andamento, senão uma DIRIGIDA a ele
    // (atribuída pelo painel: pendente com dono) — que vira oferta/ping pra aceitar.
    fun atividadeDe(workerId: String): Atividade? =
        displayed().firstOrNull { it.para_id == workerId && it.status == "em_andamento" }
            ?: displayed().firstOrNull { it.para_id == workerId && it.status == "pendente" }

    fun poolPendentes(): Int = displayed().count { it.status == "pendente" && it.para_id.isBlank() }

    // Reivindica a próxima do pool PARA um funcionário específico da mesa.
    suspend fun claimPara(workerId: String, nome: String?): Atividade? {
        val token = store.current().token ?: return null
        claiming.value = true
        try {
            val r = runCatching { api.claim(token, workerId, nome) }.getOrNull() ?: return null
            val at = r.atividade
            if (at != null) store.update { st -> st.copy(atividades = (st.atividades.filterNot { it.id == at.id } + at)) }
            return at
        } finally { claiming.value = false; syncNow() }
    }

    // A pessoa tocou "Aceitar" → avisa o servidor pra começar a contar o tempo.
    // Marca iniciada_at localmente na hora (otimista) pra o ping sumir na tela.
    suspend fun aceitar(atividadeId: String, workerId: String): Atividade? {
        val token = store.current().token ?: return null
        val nowIso = nowIso()
        store.update { st -> st.copy(atividades = st.atividades.map { if (it.id == atividadeId && it.iniciada_at == null) it.copy(iniciada_at = nowIso) else it }) }
        val r = runCatching { api.accept(token, atividadeId, workerId) }.getOrNull()
        val at = r?.atividade
        if (at != null) store.update { st -> st.copy(atividades = st.atividades.map { if (it.id == at.id) at else it }) }
        syncNow()
        return at
    }

    // ── Atividades exibidas = snapshot do servidor + fila otimista por cima ──
    fun displayed(): List<Atividade> = overlay(store.current().atividades, store.current().pending)

    private fun overlay(base: List<Atividade>, pending: List<PendingOp>): List<Atividade> {
        val map = base.associateBy { it.id }.toMutableMap()
        for (op in pending) {
            val a = op.atividade_id?.let { map[it] } ?: continue
            map[a.id] = when (op.tipo) {
                "iniciar" -> a.copy(status = "em_andamento", impedida = false, motivo_impedimento = null, iniciada_at = a.iniciada_at ?: nowIso(), quantidade_feita = op.quantidade_feita ?: a.quantidade_feita)
                "pausar" -> a.copy(status = "pendente")
                "bloquear" -> a.copy(status = "pendente", impedida = true, motivo_impedimento = op.motivo)
                // Devolvida: sai do nome da pessoa NA HORA (sem esperar o sync), senão
                // ela continua "ocupada" na tela e não recebe a próxima ordem.
                "devolver" -> a.copy(status = "pendente", para_id = "", para_nome = "", iniciada_at = null, impedida = true, motivo_impedimento = op.motivo)
                // Dispensada some da tela NA HORA — "cancelada" não é status que
                // nenhuma lista mostra (o filtro em displayed() a derruba).
                "dispensar" -> a.copy(status = "cancelada")
                "concluir" -> a.copy(status = "concluida", concluida_at = a.concluida_at ?: nowIso(), quantidade_feita = op.quantidade_feita ?: a.quantidade_feita, foto_url = op.foto_url ?: ("file://" + (op.foto_local ?: "")).takeIf { op.foto_local != null } ?: a.foto_url)
                else -> a
            }
        }
        return map.values
            .filterNot { it.status == "cancelada" }
            .sortedWith(compareBy({ it.status == "concluida" }, { it.tarefa }))
    }

    // ── Enfileira ações (otimista) ──
    private fun enqueue(op: PendingOp) {
        store.update { st ->
            // Colapsa atualizações de contagem/início da MESMA atividade (mantém fila pequena).
            val filtered = if (op.tipo == "iniciar" && op.atividade_id != null)
                st.pending.filterNot { it.tipo == "iniciar" && it.atividade_id == op.atividade_id }
            else st.pending
            st.copy(pending = filtered + op)
        }
        syncNow()
    }

    fun iniciar(at: Atividade, colaboradorId: String, colaboradorNome: String) =
        enqueue(PendingOp(UUID.randomUUID().toString(), "iniciar", at.id, colaboradorId, colaboradorNome, quantidade_feita = at.quantidade_feita, created_at = System.currentTimeMillis()))

    fun somar(at: Atividade, delta: Int, colaboradorId: String, colaboradorNome: String) {
        val novo = (displayedQtd(at.id) + delta).coerceAtLeast(0)
        enqueue(PendingOp(UUID.randomUUID().toString(), "iniciar", at.id, colaboradorId, colaboradorNome, quantidade_feita = novo, created_at = System.currentTimeMillis()))
    }

    fun concluir(at: Atividade, colaboradorId: String, colaboradorNome: String, quantidade: Int, fotoLocal: String?) =
        enqueue(PendingOp(UUID.randomUUID().toString(), "concluir", at.id, colaboradorId, colaboradorNome, quantidade_feita = quantidade.coerceAtLeast(0), foto_local = fotoLocal, created_at = System.currentTimeMillis()))

    fun impedir(at: Atividade, colaboradorId: String, colaboradorNome: String, motivo: String) =
        enqueue(PendingOp(UUID.randomUUID().toString(), "bloquear", at.id, colaboradorId, colaboradorNome, motivo = motivo, created_at = System.currentTimeMillis()))

    // Devolver/dispensar NÃO existem mais como ação direta: só pelo
    // pedirRecusa → supervisor → aprovarRecusa (com vale). Ver TravaRecusa.kt.

    // ── Recusa com código de supervisor ──────────────────────────────────────
    // Ninguém recusa sozinho: pedir a recusa só TRAVA o tablet (TelaTravaRecusa).
    // A operação de devolver/dispensar só entra na fila depois que um supervisor
    // digita o código e aprova — e vai com o vale que o servidor confere.
    fun pedirRecusa(at: Atividade, colaboradorId: String, colaboradorNome: String, tipo: String, motivo: String, motivoChave: String? = null) =
        store.update { it.copy(travaRecusa = com.tridi.app.data.TravaRecusa(
            at.id, at.tarefa, tipo, motivo, colaboradorId, colaboradorNome, System.currentTimeMillis(), motivoChave,
        )) }

    /** Confere o código. Sem rede → AutorizarResp(error = "sem_conexao"). */
    suspend fun conferirCodigo(pin: String): com.tridi.app.data.AutorizarResp {
        val t = store.current().travaRecusa ?: return com.tridi.app.data.AutorizarResp(error = "sem_trava")
        val token = store.current().token ?: return com.tridi.app.data.AutorizarResp(error = "sem_conexao")
        return runCatching {
            api.autorizar(token, com.tridi.app.data.AutorizarReq(
                etapa = "codigo", atividade_id = t.atividade_id, tipo = t.tipo, motivo = t.motivo,
                colaborador_id = t.colaborador_id, colaborador_nome = t.colaborador_nome, pin = pin,
            ))
        }.getOrElse { com.tridi.app.data.AutorizarResp(error = "sem_conexao") }
    }

    /** Supervisor aprovou: a recusa entra na fila com o vale e o tablet destrava. */
    fun aprovarRecusa(vale: String) {
        val t = store.current().travaRecusa ?: return
        if (t.tipo == "bipe") {
            // Justificativa aprovada: é o aceite de sempre, com a dispensa (e o
            // vale, pro livro saber quem liberou) — ver onAceitar do MesaBoard.
            store.update { st -> st.copy(travaRecusa = null, proximaOrdemEm = System.currentTimeMillis() + 60_000L) }
            enqueue(PendingOp(
                UUID.randomUUID().toString(), "consumir", t.atividade_id, t.colaborador_id, t.colaborador_nome,
                dispensa_motivo = t.motivo_chave ?: t.motivo, autorizacao = vale,
                ocorrido_em = nowIso(), created_at = System.currentTimeMillis(),
            ))
            scope.launch { aceitar(t.atividade_id, t.colaborador_id) }
            return
        }
        store.update { st -> st.copy(travaRecusa = null, descansoAte = st.descansoAte - t.colaborador_id) }
        enqueue(PendingOp(
            UUID.randomUUID().toString(), t.tipo, t.atividade_id, t.colaborador_id, t.colaborador_nome,
            motivo = t.motivo, autorizacao = vale, created_at = System.currentTimeMillis(),
        ))
    }

    /** Só quando o servidor não tem os códigos: desfaz o pedido, nada é recusado. */
    fun desistirRecusa() = store.update { it.copy(travaRecusa = null) }

    /** Supervisor negou: a atividade continua com a pessoa; só registra a decisão. */
    fun negarRecusa(vale: String) {
        val t = store.current().travaRecusa ?: return
        store.update { it.copy(travaRecusa = null) }
        val token = store.current().token ?: return
        scope.launch {
            runCatching { api.autorizar(token, com.tridi.app.data.AutorizarReq(
                etapa = "negar", atividade_id = t.atividade_id, tipo = t.tipo, motivo = t.motivo,
                colaborador_id = t.colaborador_id, colaborador_nome = t.colaborador_nome, vale = vale,
            )) }
        }
    }

    // ── Ritmo da fila (persistido — ver AppState.descansoAte/proximaOrdemEm) ──
    fun descansoDe(workerId: String): Long = store.current().descansoAte[workerId] ?: 0L
    fun proximaOrdemEm(): Long = store.current().proximaOrdemEm
    fun marcarConclusao(workerId: String, descansoMs: Long, ritmoMs: Long) {
        val agora = System.currentTimeMillis()
        store.update { st -> st.copy(
            descansoAte = st.descansoAte + (workerId to agora + descansoMs),
            proximaOrdemEm = agora + ritmoMs,
        ) }
    }
    // ── Intervalo da produção ────────────────────────────────────────────────
    // Começou: pausa (fila offline) o que está em andamento de quem para agora
    // e guarda pra devolver no toque. `chave` marca que esta ponta já rodou.
    fun comecarIntervalo(chave: String, j: com.tridi.app.data.JanelaIntervalo, dia: String) {
        val st = store.current()
        if (chave in st.intervaloToques) return
        // TODOS da lista que estão nesta mesa param — com ou sem atividade —
        // e todos têm que tocar pra voltar (é o toque que mede o atraso).
        val quem = st.funcionarios.filter { it.id in j.pessoas && it.presente }
        val disp = displayed()
        val agora = System.currentTimeMillis()
        val pausas = mutableListOf<PausaDoIntervalo>()
        val ops = mutableListOf<PendingOp>()
        for (w in quem) {
            val rodando = disp.filter { it.para_id == w.id && it.status == "em_andamento" && it.iniciada_at != null }
            rodando.forEach { ops += PendingOp(UUID.randomUUID().toString(), "pausar", it.id, w.id, w.nome, created_at = agora) }
            if (rodando.isEmpty()) pausas += PausaDoIntervalo(null, w.id, w.nome, j.inicio, dia, j.fim)
            else rodando.forEach { pausas += PausaDoIntervalo(it.id, w.id, w.nome, j.inicio, dia, j.fim) }
        }
        store.update { s -> s.copy(
            pending = s.pending + ops,
            intervaloToques = (s.intervaloToques + chave).takeLast(20),
            intervaloPausas = s.intervaloPausas.filterNot { p -> quem.any { it.id == p.colaborador_id } } + pausas,
        ) }
        if (ops.isNotEmpty()) syncNow()
    }
    fun marcarToqueIntervalo(chave: String) =
        store.update { s -> if (chave in s.intervaloToques) s else s.copy(intervaloToques = (s.intervaloToques + chave).takeLast(20)) }

    // A pessoa tocou "voltei": registra QUANDO (o servidor calcula o atraso
    // contra o fim oficial) e retoma o que o intervalo pausou dela.
    fun voltarDoIntervalo(colaboradorId: String) {
        val pausas = store.current().intervaloPausas.filter { it.colaborador_id == colaboradorId }
        if (pausas.isEmpty()) return
        val p0 = pausas.first()
        val fimIso = runCatching {
            val f = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US)
            val d = f.parse("${p0.dia} ${p0.fim}")!!
            val o = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
            o.timeZone = java.util.TimeZone.getTimeZone("UTC"); o.format(d)
        }.getOrNull()
        store.update { s -> s.copy(
            intervaloPausas = s.intervaloPausas.filterNot { it.colaborador_id == colaboradorId },
            pending = if (fimIso == null) s.pending else s.pending + PendingOp(
                UUID.randomUUID().toString(), "intervalo_volta", null, colaboradorId, p0.colaborador_nome,
                ocorrido_em = nowIso(), intervalo_fim = fimIso, janela = p0.janela, created_at = System.currentTimeMillis(),
            ),
        ) }
        val disp = displayed().associateBy { it.id }
        for (p in pausas) {
            val at = p.atividade_id?.let { disp[it] } ?: continue
            if (at.status == "concluida" || at.status == "cancelada" || at.para_id != colaboradorId) continue
            iniciar(at, colaboradorId, p.colaborador_nome)
        }
        syncNow()
    }

    fun adiarProximaOrdem(ritmoMs: Long) =
        store.update { it.copy(proximaOrdemEm = System.currentTimeMillis() + ritmoMs) }

    // ── O bipe que abre a atividade ──────────────────────────────────────────
    // A pessoa bipou a etiqueta do material (ou disse por que não deu). Vai
    // pela FILA OFFLINE, não por uma chamada direta: a bancada trabalha sem
    // Wi-Fi, e o trabalho não pode esperar a rede pra começar. O servidor dá
    // baixa das etiquetas e amarra o consumo a esta atividade.
    //
    // `ocorrido_em` é carimbado AGORA, no tablet. Sem ele, uma manhã inteira de
    // bipes represados subiria toda com a hora do flush.
    fun consumir(
        at: Atividade,
        colaboradorId: String,
        colaboradorNome: String,
        codigos: List<String>,
        dispensaMotivo: String?,
    ) = enqueue(PendingOp(
        UUID.randomUUID().toString(), "consumir", at.id, colaboradorId, colaboradorNome,
        codigos = codigos, dispensa_motivo = dispensaMotivo,
        ocorrido_em = nowIso(), created_at = System.currentTimeMillis(),
    ))

    fun pedirInsumo(colaboradorId: String, colaboradorNome: String, produto: String, qtd: Int, obs: String?) =
        enqueue(PendingOp(UUID.randomUUID().toString(), "pedir_insumo", null, colaboradorId, colaboradorNome, produto_nome = produto, quantidade = qtd, observacao = obs, created_at = System.currentTimeMillis()))

    private fun displayedQtd(id: String): Int = displayed().firstOrNull { it.id == id }?.quantidade_feita ?: 0

    val pendingCount: Int get() = store.current().pending.size

    // ── Sync: sobe a foto (se houver), faz push e depois pull ──
    fun syncNow() {
        scope.launch {
            if (store.current().token == null) return@launch
            if (!mutex.tryLock()) return@launch
            syncing.value = true
            try {
                val token = store.current().token ?: return@launch
                // 1) sobe fotos pendentes
                var pend = store.current().pending
                for (op in pend) {
                    if (op.tipo == "concluir" && op.foto_url == null && op.foto_local != null) {
                        val f = File(op.foto_local)
                        if (f.exists()) {
                            val url = runCatching { api.upload(token, f) }.getOrNull()
                            if (url != null) store.update { st -> st.copy(pending = st.pending.map { if (it.client_id == op.client_id) it.copy(foto_url = url) else it }) }
                        }
                    }
                }
                // 2) push da fila — guarda os confirmados, mas NÃO remove ainda.
                pend = store.current().pending
                var okIds = emptySet<String>()
                if (pend.isNotEmpty()) {
                    val itemsJson = store.json.encodeToString(ListSerializer(PendingOp.serializer()), pend)
                    val resp = runCatching { api.push(token, itemsJson) }.getOrNull()
                    if (resp != null) {
                        okIds = resp.results.filter { it.status == "ok" || it.status == "conflito" }.map { it.client_id }.toSet()
                        online.value = true
                    }
                }
                // 3) pull + remove os pendentes confirmados ATOMICAMENTE (base e pending
                // na MESMA atualização) — senão a atividade concluída reaparece entre
                // "remove pendente" e "pull chega" (o bug de piscar).
                val pull = runCatching { api.pull(token, null) }.getOrNull()
                if (pull != null) {
                    store.update { st -> st.copy(
                        funcionarios = pull.colaboradores,
                        atividades = pull.atividades,
                        produtos = pull.produtos,
                        nomeMesa = pull.device?.nome_mesa ?: st.nomeMesa,
                        setor = pull.device?.setor ?: st.setor,
                        // `config` nulo = servidor mais velho: mantém o que já
                        // sabia. Voltar pro padrão aqui desligaria a exigência
                        // no galpão inteiro por causa de um deploy antigo.
                        exigeBipe = pull.config?.exige_bipe ?: st.exigeBipe,
                        motivosDispensa = pull.config?.motivos_dispensa?.takeIf { it.isNotEmpty() } ?: st.motivosDispensa,
                        intervalos = pull.config?.intervalos ?: st.intervalos,
                        lastSync = pull.server_time,
                        pending = st.pending.filterNot { okIds.contains(it.client_id) },
                    ) }
                    online.value = true
                } else if (okIds.isNotEmpty()) {
                    store.update { st -> st.copy(pending = st.pending.filterNot { okIds.contains(it.client_id) }) }
                }
            } catch (_: Exception) {
                online.value = false
            } finally {
                syncing.value = false
                mutex.unlock()
            }
        }
    }

    fun reset() = store.update { com.tridi.app.data.AppState() }

    private fun nowIso(): String {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }
}
