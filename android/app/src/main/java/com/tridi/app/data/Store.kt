package com.tridi.app.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

// Persistência em arquivo (state.json) + StateFlow reativo. Sem banco: o estado
// inteiro do app (token, cache, fila offline) cabe num JSON.
//
// DURABILIDADE — o motivo deste arquivo existir do jeito que é:
// quando a bateria acaba, o desligamento é SUJO. No ext4 do Android, um
// write()+rename() SEM fsync pode deixar o arquivo com 0 bytes depois do boot
// (delayed allocation) — era isso que zerava o state.json E o backup e mandava o
// tablet de volta pra tela de código. Duas defesas:
//   1. TODA gravação passa por fsync (força os bytes pro disco antes do rename).
//   2. A IDENTIDADE (token + mesa) mora num arquivo PRÓPRIO, minúsculo, reescrito
//      só quando muda. Assim nem um crash no meio de um sync (que reescreve o
//      state.json grande) derruba o pareamento — o app recupera pelo identity.json.
class Store(context: Context) {
    private val dir = context.filesDir
    private val file = File(dir, "state.json")
    private val tmp = File(dir, "state.json.tmp")
    private val bak = File(dir, "state.json.bak")
    private val idFile = File(dir, "identity.json")
    private val idTmp = File(dir, "identity.json.tmp")
    val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; coerceInputValues = true }

    private val _state = MutableStateFlow(load())
    val state: StateFlow<AppState> = _state
    // Última identidade em disco — evita reescrever identity.json à toa a cada sync.
    private var lastId: Identity = Identity(_state.value.token, _state.value.nomeMesa, _state.value.setor)

    init {
        // Semeia o identity.json pra tablets JÁ pareados que só atualizaram o app:
        // sem isto, o backup do token só nasceria numa nova troca de código — e o
        // tablet ficaria sem proteção até re-parear.
        val s = _state.value
        if (!s.token.isNullOrBlank()) {
            val want = Identity(s.token, s.nomeMesa, s.setor)
            if (parseId(idFile) != want) {
                runCatching {
                    val t = json.encodeToString(Identity.serializer(), want)
                    writeSynced(idTmp, t)
                    if (!idTmp.renameTo(idFile)) writeSynced(idFile, t)
                    syncDir(); lastId = want
                }
            }
        }
    }

    private fun parseState(f: File): AppState? =
        try { if (f.exists() && f.length() > 0L) json.decodeFromString(AppState.serializer(), f.readText()) else null }
        catch (_: Exception) { null }
    private fun parseId(f: File): Identity? =
        try { if (f.exists() && f.length() > 0L) json.decodeFromString(Identity.serializer(), f.readText()) else null }
        catch (_: Exception) { null }

    // Estado principal → backup → vazio. Se o token tiver se perdido (crash), recupera
    // o pareamento pelo identity.json — que é reescrito raramente e quase nunca corrompe.
    private fun load(): AppState {
        var s = parseState(file) ?: parseState(bak) ?: AppState()
        if (s.token.isNullOrBlank()) {
            val id = parseId(idFile)
            if (id != null && !id.token.isNullOrBlank())
                s = s.copy(token = id.token, nomeMesa = id.nomeMesa ?: s.nomeMesa, setor = id.setor ?: s.setor)
        }
        return s
    }

    // Grava o texto e FORÇA pro disco (fsync). Sem isto, o rename não garante que
    // os dados sobreviveram a um corte de energia.
    private fun writeSynced(target: File, text: String) {
        FileOutputStream(target).use { out ->
            out.write(text.toByteArray(Charsets.UTF_8)); out.flush(); out.fd.sync()
        }
    }
    // fsync do diretório: torna os renames duráveis. Best-effort (algumas ROMs barram).
    private fun syncDir() { runCatching { FileInputStream(dir).use { it.fd.sync() } } }

    @Synchronized
    fun update(transform: (AppState) -> AppState) {
        val next = transform(_state.value)
        _state.value = next

        // 1) IDENTIDADE primeiro, e SÓ se mudou: fixa o pareamento em disco antes de
        //    arriscar a reescrita do estado grande. Como muda ~1x (no pareamento),
        //    isto quase nunca grava — barato e resiliente.
        val id = Identity(next.token, next.nomeMesa, next.setor)
        if (id != lastId && !id.token.isNullOrBlank()) {
            try {
                val t = json.encodeToString(Identity.serializer(), id)
                writeSynced(idTmp, t)
                if (!idTmp.renameTo(idFile)) writeSynced(idFile, t)
                syncDir(); lastId = id
            } catch (_: Exception) {}
        }

        // 2) Estado completo, à prova de crash:
        //    tmp (com fsync) → promove o atual a backup (rename barato) → tmp vira o
        //    principal → fsync do diretório. Em qualquer ponto que caia a energia,
        //    sobra ou o novo (íntegro) ou o backup anterior — nunca 0 bytes.
        try {
            val text = json.encodeToString(AppState.serializer(), next)
            writeSynced(tmp, text)
            if (file.exists()) file.renameTo(bak)
            if (!tmp.renameTo(file)) writeSynced(file, text)
            syncDir()
        } catch (_: Exception) {}
    }

    fun current() = _state.value
}
