package com.tridi.tv.core.design

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import java.util.Locale

/**
 * Tokens do sistema. Um painel nunca escreve `Color(0xFF0A84FF)` nem `18.sp`
 * na mão — é assim que dois painéis param de parecer dois aplicativos.
 */
object Tokens {
    // PELE CLARA — a parede casa com o painel web (lavanda claro, cartão branco,
    // um roxo só). Antes era escuro (fundo preto, texto branco, destaque azul),
    // e por isso o nativo "ficava diferente" do link. As cores de MEDALHA e de
    // ESTADO (ouro/prata/bronze, verde/vermelho/amarelo) NÃO mudam: significam
    // coisa, não são decoração.
    // Valores EXATOS do painel web (--p-* no widgets.css), pra bater pixel.
    val fundo = Color(0xFFF5F4FA)          // --p-fundo (lavanda da parede)
    val superficie = Color(0xFFFFFFFF)     // --p-cartao
    val superficieAlta = Color(0xFFFFFFFF)
    val borda = Color(0x0E14142E)          // --p-aro (rgba(20,20,46,.055))

    // Texto (escuro sobre claro)
    val texto = Color(0xFF14142E)          // --p-texto
    val textoFraco = Color(0xFF9394B1)     // --p-fraco
    val textoApagado = Color(0xFFA9AAC2)   // --p-apagado

    // Semânticas
    val positivo = Color(0xFF17A34A)       // --p-secundaria/ok
    val negativo = Color(0xFFDC2626)       // --p-perigo
    val atencao = Color(0xFFC2830B)        // --p-atencao
    val acento = Color(0xFF6C4CF0)         // --p-primaria (o roxo da web)
    val roxo = Color(0xFF6C4CF0)
    val laranja = Color(0xFFEA7A0A)

    // Peças da pele clara usadas em pódio/chips/trilhos (--p-* do web).
    val roxoClaro = Color(0xFFA78BFA)      // --p-primaria-clara (topo do pedestal 1º)
    val selo = Color(0xFFECE7FE)           // --p-selo (chip lavanda / medalha 2º-3º)
    val trilho = Color(0xFFEAE8F4)         // --p-trilho (aro claro / trilho de barra)
    val lavandaTopo = Color(0xFFDDD6F8)    // topo do pedestal 2º/3º
    val lavandaBase = Color(0xFFECE8FC)    // base do pedestal 2º/3º

    // Pódio. São cores de medalha, não tema — não trocam com a marca.
    val ouro = Color(0xFFFFD60A)
    val prata = Color(0xFFC7C7CC)
    val bronze = Color(0xFFCD7F4F)

    /**
     * 10-ft UI: nada abaixo de 18sp. Estes são os degraus permitidos —
     * quem precisa de um tamanho fora daqui está resolvendo o problema errado.
     */
    object Tipo {
        /**
         * ÚNICA exceção ao piso de 18sp: cabeçalho de coluna de tabela ("#",
         * "VENDEDOR", "FATURAMENTO"). Não é informação — é a legenda de onde o
         * olho já sabe olhar. Nunca use para dado.
         */
        val cabecalhoTabela: TextUnit = 16.sp
        val rotulo: TextUnit = 18.sp
        val corpo: TextUnit = 22.sp
        val titulo: TextUnit = 32.sp
        val numero: TextUnit = 64.sp
        val numeroGrande: TextUnit = 96.sp
    }

    /**
     * Tracking (espaço entre letras) — NUNCA um valor só para todos os tamanhos.
     *
     * A letra não cresce sozinha: cresce o espaço entre elas junto. Um número de
     * 96sp com o mesmo tracking do rótulo de 18sp parece esparramado, e a leitura
     * a 3 metros piora justamente no dado mais importante da tela. O caminho é
     * inverso ao tamanho: **aperta em cima, abre embaixo.**
     *
     * Vale só para o que é grande ou minúsculo; o corpo fica em zero, que é onde
     * a fonte do sistema já foi desenhada para funcionar.
     */
    object Tracking {
        /** Legenda de coluna, versalete: abre um pouco para não empastar. */
        val cabecalhoTabela: TextUnit = 0.06.em
        val rotulo: TextUnit = 0.03.em
        val corpo: TextUnit = 0.sp
        val titulo: TextUnit = (-0.01).em
        val numero: TextUnit = (-0.02).em
        val numeroGrande: TextUnit = (-0.03).em
    }

    object Espaco {
        val xs: Dp = 6.dp
        val s: Dp = 12.dp
        val m: Dp = 20.dp
        val g: Dp = 32.dp
        val xg: Dp = 48.dp
    }

    /**
     * Overscan: TV corta até ~5% da borda. O núcleo aplica isto ao redor do
     * conteúdo do painel — nenhum painel precisa saber que está numa TV.
     */
    val overscan: Dp = 32.dp

    val raio: Dp = 24.dp
}

/** "#RRGGBB" ou "#AARRGGBB" para Color, com fallback seguro. */
fun corHex(hex: String?, fallback: Color = Tokens.acento): Color {
    if (hex.isNullOrBlank()) return fallback
    return try {
        val limpo = hex.removePrefix("#")
        val v = limpo.toLong(16)
        when (limpo.length) {
            6 -> Color(0xFF000000 or v)
            8 -> Color(v)
            else -> fallback
        }
    } catch (e: Exception) {
        fallback
    }
}

private val ptBR = Locale("pt", "BR")

/** Formata em pt-BR sem centavos: R$ 1.234. */
fun fmtBRL(n: Double): String =
    "R$ " + String.format(ptBR, "%,d", n.toLong()).replace(',', '.')

fun fmtNum(n: Double): String =
    String.format(ptBR, "%,d", n.toLong()).replace(',', '.')

fun fmtPct(n: Double): String =
    String.format(ptBR, "%.1f%%", n)

/**
 * Número curto para parede: "R$ 59,9 mil" no lugar de "R$ 59.925".
 *
 * A três metros o dígito da unidade não é informação — é ruído que rouba
 * tamanho de fonte do que importa. Quem confere número contra relatório na tela
 * desliga no perfil. Contraparte de `fmtCurto` em `lib/format.ts`.
 */
fun fmtCurto(n: Double, dinheiro: Boolean): String {
    val sinal = if (n < 0) "-" else ""
    val a = kotlin.math.abs(n)
    val p = if (dinheiro) "R$ " else ""
    fun num(v: Double) = (if (v < 10) "%.1f".format(v) else "%.0f".format(v)).replace('.', ',').removeSuffix(",0")
    return when {
        a >= 1_000_000 -> "$sinal$p${num(a / 1_000_000)} mi"
        a >= 1_000 -> "$sinal$p${num(a / 1_000)} mil"
        dinheiro -> fmtBRL(n)
        else -> fmtNum(n)
    }
}

/** O formatador de dinheiro que o PERFIL pediu — exato ou curto. */
fun moedaDoPerfil(curtos: Boolean): (Double) -> String =
    if (curtos) { n -> fmtCurto(n, true) } else { n -> fmtBRL(n) }
