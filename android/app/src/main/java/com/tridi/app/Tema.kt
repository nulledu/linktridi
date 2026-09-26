package com.tridi.app

import androidx.compose.ui.graphics.Color

// ── Tema de BANCADA: CLARO, sempre claro ─────────────────────────────────────
//
// A tela fica em pé no galpão. O dono pediu tema CLARO fixo (nunca escuro):
// fundo claro, cartão branco, um acento — o roxo da marca, o MESMO `--primary`
// do app web (#7C3AED). Todos os arquivos pintam por ESTES tokens; o tema é
// forçado em MainActivity (lightColorScheme), então o modo escuro do sistema
// não muda nada aqui.
//
// Estados por cor (mesma semântica das telas web):
//   Green  = em andamento / concluir      Red    = urgente
//   Orange = impedida / atenção           Primary = identidade e chamada
internal val Primary = Color(0xFF7C3AED)   // roxo da marca (= --primary do web)
internal val Green = Color(0xFF1FA45C)     // em andamento / concluído (forte no branco)
internal val Red = Color(0xFFE5484D)       // urgente
internal val Orange = Color(0xFFD98324)    // impedida / atenção (legível no branco)
internal val Bg = Color(0xFFEFF1F5)        // o chão da tela (claro)
internal val Card = Color(0xFFFFFFFF)      // superfície (branco)
internal val Ink = Color(0xFF1C1C22)       // texto principal (escuro)
internal val Dim = Color(0xFF6A6F7A)       // texto secundário

// Superfície levemente afundada que o Card (campos, blocos internos).
internal val Well = Color(0xFFEDEFF3)
internal val Disabled = Color(0xFFDDE0E6)
internal val DisabledInk = Color(0xFF9AA0AA)

// A ponta escura do gradiente da marca (TopBar) — banda colorida com texto branco.
internal val PrimaryDeep = Color(0xFF5B21B6)
// Um véu lavanda claro no pé do chamado — dá cara de evento sem escurecer a tela.
internal val PingFundo = Color(0xFFEDE7FB)
// Moldura de FOTO DE PRODUTO: papel fotográfico claro atrás das fotos do catálogo.
internal val Moldura = Color(0xFFF4F5F8)
