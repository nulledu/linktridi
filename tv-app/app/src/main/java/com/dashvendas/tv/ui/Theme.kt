package com.dashvendas.tv.ui

import androidx.compose.ui.graphics.Color
import java.util.Locale

// Converte "#RRGGBB" em Color, com fallback seguro.
fun hexColor(hex: String?, fallback: Color): Color {
    if (hex.isNullOrBlank()) return fallback
    return try {
        val clean = hex.removePrefix("#")
        val v = clean.toLong(16)
        when (clean.length) {
            6 -> Color(0xFF000000 or v)
            8 -> Color(v)
            else -> fallback
        }
    } catch (e: Exception) {
        fallback
    }
}

fun fmtBRL(n: Double): String {
    // Formata em pt-BR sem centavos: R$ 1.234.
    val s = String.format(Locale("pt", "BR"), "%,d", n.toLong()).replace(',', '.')
    return "R$ $s"
}

fun fmtNum(n: Double): String =
    String.format(Locale("pt", "BR"), "%,d", n.toLong()).replace(',', '.')
