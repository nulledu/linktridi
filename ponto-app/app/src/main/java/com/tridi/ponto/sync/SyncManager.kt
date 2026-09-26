package com.tridi.ponto.sync

import android.graphics.BitmapFactory
import com.tridi.ponto.data.CacheLocal
import com.tridi.ponto.data.PessoaLocal
import com.tridi.ponto.face.FaceEngine
import com.tridi.ponto.net.Api
import java.io.File

// Sincroniza o cadastro: baixa as pessoas + fotos e converte cada foto em um
// embedding local. Salva a foto de perfil no tablet (aparece offline, sem wi-fi).
// Depois disso o reconhecimento é 100% offline no tablet.
class SyncManager(private val api: Api, private val engine: FaceEngine, private val fotosDir: File) {

    data class Progresso(val atual: Int, val total: Int, val nome: String)

    // `anterior` = cache atual. Quem já tem o reconhecimento preparado E as fotos
    // não mudaram é REAPROVEITADO (não baixa foto nem recalcula embedding) — só
    // prepara os novos/alterados. As amostras do servidor (vetores prontos) são
    // sempre atualizadas (baratas).
    suspend fun sincronizar(token: String, anterior: CacheLocal, onProgresso: (Progresso) -> Unit): CacheLocal {
        val resp = api.sync(token)
        if (resp.error != null) throw RuntimeException(resp.error)
        fotosDir.mkdirs()

        val prevById = anterior.pessoas.associateBy { it.id }
        val locais = mutableListOf<PessoaLocal>()
        resp.pessoas.forEachIndexed { i, p ->
            // ── Caminho rápido: constructos do MAC ──────────────────────────
            // Quando o servidor já manda os vetores prontos DO ESPAÇO ATUAL
            // (gerados no Mac pelo ponto-embeddings.py), não há nada pra
            // "preparar" aqui: o tablet só baixa a foto de perfil pra mostrar
            // na tela. Recalcular embedding de cadastro no tablet é só pra
            // quem ainda NÃO tem constructo (pessoa nova antes de o script
            // rodar no Mac) — aí o caminho antigo, abaixo, assume.
            val doMac = p.amostras.filter { it.size == engine.dim }
            if (doMac.isNotEmpty()) {
                val prev = prevById[p.id]
                var fotoLocal: String? = prev?.fotoLocal
                if (fotoLocal == null && p.fotoUrl != null) {
                    api.baixarFoto(p.fotoUrl, token)?.let { bytes ->
                        try { val f = File(fotosDir, "${p.id}.jpg"); f.writeBytes(bytes); fotoLocal = f.absolutePath } catch (_: Exception) {}
                    }
                }
                onProgresso(Progresso(i + 1, resp.pessoas.size, p.nome))
                locais.add(PessoaLocal(id = p.id, nome = p.nome, fotoUrl = p.fotoUrl, fotoLocal = fotoLocal,
                    embeddings = doMac, cadastroEmbeddings = doMac, fotosSig = "mac${engine.dim}|${doMac.size}", pinHash = p.pinHash))
                return@forEachIndexed
            }
            val fotos = p.fotos.take(6)                              // até 6 fotos por pessoa
            // A assinatura carrega o MODELO: trocar de motor muda o prefixo, a
            // assinatura antiga não casa e todo cadastro é re-embutido no espaço
            // novo. Sem isso o cache "já preparado" seguraria vetores do modelo
            // velho pra sempre.
            val fotosSig = "m${engine.dim}${engine.tag}|" + fotos.joinToString("|")
            val prev = prevById[p.id]

            // Já preparado e fotos idênticas → reaproveita (rápido).
            if (prev != null && prev.fotosSig == fotosSig && prev.cadastroEmbeddings.isNotEmpty()) {
                onProgresso(Progresso(i + 1, resp.pessoas.size, "${p.nome} · já preparado"))
                val cad = prev.cadastroEmbeddings
                locais.add(PessoaLocal(id = p.id, nome = p.nome, fotoUrl = p.fotoUrl, fotoLocal = prev.fotoLocal,
                    embeddings = cad + p.amostras.filter { it.size == engine.dim }, cadastroEmbeddings = cad, fotosSig = fotosSig, pinHash = p.pinHash))
                return@forEachIndexed
            }

            // Novo ou mudou a foto → prepara (baixa + calcula embedding).
            onProgresso(Progresso(i + 1, resp.pessoas.size, "Preparando ${p.nome}…"))
            val embs = mutableListOf<List<Float>>()
            var fotoLocal: String? = prev?.fotoLocal
            fotos.forEachIndexed { idx, url ->
                val bytes = api.baixarFoto(url, token) ?: return@forEachIndexed
                // A 1ª foto (perfil) fica salva no tablet pra mostrar na tela offline.
                if (idx == 0) {
                    try { val f = File(fotosDir, "${p.id}.jpg"); f.writeBytes(bytes); fotoLocal = f.absolutePath } catch (_: Exception) {}
                }
                val opts = BitmapFactory.Options().apply { inSampleSize = calcSample(bytes) }
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return@forEachIndexed
                val e = engine.embeddingDaFoto(bmp)              // null = foto sem rosto detectável
                if (e != null) embs.add(e.toList())
                bmp.recycle()
            }
            // Se falhou baixar/detectar tudo mas já tínhamos algo, mantém o antigo.
            val cad = if (embs.isEmpty() && prev != null) prev.cadastroEmbeddings else embs
            locais.add(PessoaLocal(id = p.id, nome = p.nome, fotoUrl = p.fotoUrl, fotoLocal = fotoLocal,
                embeddings = cad + p.amostras.filter { it.size == engine.dim }, cadastroEmbeddings = cad, fotosSig = fotosSig, pinHash = p.pinHash))
        }
        return CacheLocal(pessoas = locais, syncedAt = resp.syncedAt)
    }

    // Downsample de fotos grandes (decodifica ~1000px — suficiente pro rosto).
    private fun calcSample(bytes: ByteArray): Int {
        val probe = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, probe)
        var sample = 1
        var dim = maxOf(probe.outWidth, probe.outHeight)
        while (dim > 1400) { sample *= 2; dim /= 2 }
        return sample
    }
}
