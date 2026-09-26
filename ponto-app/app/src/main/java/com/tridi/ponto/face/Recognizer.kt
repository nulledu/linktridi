package com.tridi.ponto.face

import com.tridi.ponto.data.PessoaLocal

// Decide QUEM é o rosto da selfie. Compara com TODOS os moldes da pessoa:
// fotos de cadastro + moldes APRENDIDOS por esta câmera (selfies de batidas
// confirmadas) — vale o melhor. Com 1-2 batidas confirmadas, o reconhecimento
// passa a usar imagens da própria câmera e os scores sobem muito.
data class Match(val pessoa: PessoaLocal, val score: Float)

object Recognizer {
    // Limiar de "tenho certeza" (cosseno). Rígido de propósito: num ponto,
    // chutar a pessoa errada é o pior erro. Se não bater com folga, o app manda
    // pra lista manual ("quem é você?") — nunca adivinha.
    //
    // Cada MODELO tem a própria régua — o score de um não vale pro outro. O
    // tamanho do embedding diz qual motor gerou:
    //   · 512 = ArcFace (w600k_mbf): separa muito mais; mesmo rosto costuma dar
    //     0.45–0.75 e rosto diferente fica abaixo de ~0.25. Limiares de partida,
    //     A CALIBRAR com uso real na frente do tablet.
    //   · 192 = MobileFaceNet (fallback): a régua antiga, já calibrada.
    data class Limiares(val confiante: Float, val candidato: Float, val margem: Float)
    fun limiares(dim: Int) = if (dim >= 512) Limiares(0.40f, 0.22f, 0.06f) else Limiares(0.58f, 0.34f, 0.07f)

    fun rank(embedding: FloatArray, pessoas: List<PessoaLocal>, aprendidos: Map<String, List<List<Float>>>): List<Match> =
        pessoas.mapNotNull { p ->
            // Só moldes do MESMO modelo (mesmo tamanho). Os do modelo anterior
            // ficam no cache até o re-sync e não podem virar score.
            val moldes = (p.embeddings + (aprendidos[p.id] ?: emptyList())).filter { it.size == embedding.size }
            if (moldes.isEmpty()) return@mapNotNull null
            Match(p, moldes.maxOf { FaceEngine.similaridade(embedding, it) })
        }.sortedByDescending { it.score }

    // Só é "confiante" se o melhor passa do limiar E vence o 2º por uma folga
    // (evita confundir duas pessoas parecidas). Senão → escolha manual.
    fun confiante(ranked: List<Match>, dim: Int): Boolean {
        val lim = limiares(dim)
        val best = ranked.firstOrNull() ?: return false
        if (best.score < lim.confiante) return false
        val second = ranked.getOrNull(1) ?: return true
        return best.score - second.score >= lim.margem
    }
}
