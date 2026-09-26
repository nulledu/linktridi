package com.tridi.estoque.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.tridi.estoque.R

// ── Paleta do galpão ─────────────────────────────────────────────────────────
//
// O que havia aqui era o roxo-sobre-branco herdado do totem do mercadinho: uma
// cara de loja, desenhada pra um corredor bem iluminado e pra quem está parado
// escolhendo produto. O galpão é outro lugar. A pessoa está de pé, com uma mão
// só (a outra segura a peça), possivelmente de luva, sob luminária de teto que
// bate direto na tela, olhando o aparelho por três segundos entre duas tarefas
// físicas.
//
// Daí as três decisões desta paleta:
//
// 1. FUNDO ESCURO E NEUTRO. Um branco de 800 nits refletindo lâmpada de galpão
//    vira espelho — a pessoa vê a própria sombra, não a tela. Fundo escuro
//    devolve o contraste pro que importa (o texto claro) e some com o brilho
//    difuso.
// 2. UM acento só, RESERVADO pra ação principal. Se tudo é destaque, nada é.
//    Ciano industrial: não colide com verde (ok), âmbar (atenção) nem vermelho
//    (erro), que é o motivo de não ser um amarelo de segurança — amarelo e
//    âmbar são indistinguíveis a um braço de distância.
// 3. STATUS EM DOIS TONS. Superfície escura tingida + texto claro da MESMA
//    família de cor. Preencher um retângulo inteiro de vermelho vivo com texto
//    branco em cima dá 2,6:1 e é o padrão que mais falha na prática.
//
// Todos os pares texto/fundo abaixo passam de 4,5:1 (a maioria acima de 8:1),
// medidos pela fórmula do WCAG contra a superfície em que cada um é usado.
val GalpaoFundo = Color(0xFF0D1117)          // fundo da tela
val GalpaoSuperficie = Color(0xFF161B22)     // cartão, barra, painel
val GalpaoSuperficieAlta = Color(0xFF21262D) // chip, tecla, alvo desabilitado
val GalpaoBorda = Color(0xFF30363D)
val GalpaoTexto = Color(0xFFF0F3F6)          // 17:1 sobre o fundo
val GalpaoTextoFraco = Color(0xFFA9B4C0)     // 8,6:1 sobre o fundo

/** Ação principal — e SÓ ela. Ciano industrial, 9,9:1 sobre o fundo. */
val GalpaoAcento = Color(0xFF00C8E0)
val GalpaoAcentoFundo = Color(0xFF0B333B)    // selo/realce discreto do acento
val GalpaoSobreAcento = Color(0xFF04222A)    // texto sobre o acento cheio, 8,2:1

// Status. Cada um tem o tom CLARO (texto/ícone) e o FUNDO escuro tingido.
val GalpaoOk = Color(0xFF3FD07E)
val GalpaoOkFundo = Color(0xFF0F2E1E)
val GalpaoAtencao = Color(0xFFFFB020)
val GalpaoAtencaoFundo = Color(0xFF3A2A0B)
val GalpaoErro = Color(0xFFFF6B6B)
val GalpaoErroFundo = Color(0xFF3A1418)

// Outfit e Inter são fontes VARIÁVEIS: um arquivo só que contém todos os pesos
// num eixo contínuo (`wght`). Registrar o mesmo .ttf cinco vezes trocando só o
// `weight` não muda nada — sem dizer em que ponto do eixo desenhar, o Android
// usa sempre a instância padrão do arquivo. Era por isso que TODO título
// "Bold"/"ExtraBold" do totem saía fininho: o app pedia negrito e recebia o
// peso padrão, em toda tela.
//
// `variationSettings` é o que move o eixo de verdade (API 26+; abaixo disso o
// sistema ignora e cai no peso padrão, que é o comportamento que já havia).
@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
private fun pesoVariavel(recurso: Int, peso: Int) = Font(
    resId = recurso,
    weight = FontWeight(peso),
    variationSettings = FontVariation.Settings(FontVariation.weight(peso)),
)

val FonteTitulo = FontFamily(
    pesoVariavel(R.font.outfit_variable, 400),
    pesoVariavel(R.font.outfit_variable, 500),
    pesoVariavel(R.font.outfit_variable, 600),
    pesoVariavel(R.font.outfit_variable, 700),
    pesoVariavel(R.font.outfit_variable, 800),
)

val FonteTexto = FontFamily(
    pesoVariavel(R.font.inter_variable, 400),
    pesoVariavel(R.font.inter_variable, 500),
    pesoVariavel(R.font.inter_variable, 600),
    pesoVariavel(R.font.inter_variable, 700),
)

/**
 * Alvo mínimo de toque. 48dp é o mínimo do Material — pensado pra celular na
 * mão, com o dedo nu e a tela a 30cm. Aqui o aparelho é um tablet de 10" preso
 * a uma bancada, a mão pode estar de luva e a pessoa não está olhando enquanto
 * toca. 56dp é o piso; nada nesta interface é menor que isto.
 */
val ALVO_MINIMO = androidx.compose.ui.unit.Dp(56f)

private val colors = darkColorScheme(
    primary = GalpaoAcento,
    onPrimary = GalpaoSobreAcento,
    secondary = GalpaoAcento,
    background = GalpaoFundo,
    onBackground = GalpaoTexto,
    surface = GalpaoSuperficie,
    onSurface = GalpaoTexto,
    surfaceVariant = GalpaoSuperficieAlta,
    onSurfaceVariant = GalpaoTextoFraco,
    outline = GalpaoBorda,
    error = GalpaoErro,
    onError = GalpaoSobreAcento,
)

// Escala de tipo de LEITURA A 60cm, não de celular na mão. O corpo de 16sp do
// Material assume ~30cm; a esta distância ele exige que a pessoa se aproxime, e
// aproximar significa largar a peça. Cada degrau aqui é ~25% maior que o
// equivalente de um app de celular.
private val typography = Typography(
    displayLarge = TextStyle(fontFamily = FonteTitulo, fontWeight = FontWeight.Bold, fontSize = 48.sp),
    headlineLarge = TextStyle(fontFamily = FonteTitulo, fontWeight = FontWeight.Bold, fontSize = 36.sp),
    headlineMedium = TextStyle(fontFamily = FonteTitulo, fontWeight = FontWeight.Bold, fontSize = 30.sp),
    titleLarge = TextStyle(fontFamily = FonteTitulo, fontWeight = FontWeight.SemiBold, fontSize = 26.sp),
    titleMedium = TextStyle(fontFamily = FonteTitulo, fontWeight = FontWeight.SemiBold, fontSize = 22.sp),
    bodyLarge = TextStyle(fontFamily = FonteTexto, fontWeight = FontWeight.Normal, fontSize = 20.sp),
    bodyMedium = TextStyle(fontFamily = FonteTexto, fontWeight = FontWeight.Normal, fontSize = 17.sp),
    labelLarge = TextStyle(fontFamily = FonteTexto, fontWeight = FontWeight.SemiBold, fontSize = 17.sp),
)

@Composable
fun EstoqueTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
