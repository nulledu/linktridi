package com.tridi.estoque.impressora

import com.tridi.estoque.BuildConfig

// ── A URL que vai dentro do QR de uma placa de lugar ─────────────────────────
//
// Tudo MAIÚSCULO e `HTTP://` de propósito, e cada escolha é milímetro de tira:
//
//  · MAIÚSCULAS porque o modo alfanumérico do QR não tem minúscula — usá-lo
//    derruba a URL de conferência da versão 3 pra 2 (29 → 25 módulos). O host
//    o navegador normaliza sozinho; o caminho /G o middleware do servidor
//    reescreve pra /g.
//  · HTTP e não HTTPS porque o port TS do zxing (quem desenha a folha A4 no
//    escritório) só encoda 37 caracteres na v2 — o "S" era o 38º. O Vercel
//    responde o HTTP com redirect pra HTTPS, então a página continua segura.
//
// A base vem do MESMO BuildConfig que o app usa pra falar com o servidor: a
// placa impressa aponta pro ambiente que a imprimiu, nunca pra um host escrito
// à mão que diverge no dia em que o domínio muda.

fun urlDaConferencia(codigo: String): String {
    val base = BuildConfig.DEFAULT_API_BASE.trimEnd('/')
        .replaceFirst("https://", "http://", ignoreCase = true)
    return "$base/G/${codigo.trim()}".uppercase()
}
