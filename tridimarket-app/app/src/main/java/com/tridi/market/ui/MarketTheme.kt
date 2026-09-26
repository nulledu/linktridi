package com.tridi.market.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.tridi.market.R

// Acento principal = o MESMO roxo do sistema (#7C3AED). Antes era o índigo da
// marca (#4703EF); o usuário pediu para o app inteiro usar o roxo do sistema,
// sobre fundo branco claro.
val MarketPurple = Color(0xFF7C3AED)
val MarketPurpleSoft = Color(0xFFF1EAFE)   // fundo de selos/badges roxos (mais claro)
val MarketViolet = Color(0xFF9B6DF3)       // variação clara do roxo, p/ secundário
val MarketBrand = Color(0xFF7C3AED)        // roxo do sistema (logo e destaques)
val MarketInk = Color(0xFF171333)
val MarketCanvas = Color(0xFFF4F5F9)
val MarketSurface = Color(0xFFFFFFFF)
val MarketMuted = Color(0xFF6F7180)
val MarketGreen = Color(0xFF16875B)
val MarketAmber = Color(0xFFB96600)
val MarketRed = Color(0xFFC82C3A)
val MarketBorder = Color(0xFFE7E8EF)

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

val MarketDisplayFamily = FontFamily(
    pesoVariavel(R.font.outfit_variable, 400),
    pesoVariavel(R.font.outfit_variable, 500),
    pesoVariavel(R.font.outfit_variable, 600),
    pesoVariavel(R.font.outfit_variable, 700),
    pesoVariavel(R.font.outfit_variable, 800),
)

val MarketBodyFamily = FontFamily(
    pesoVariavel(R.font.inter_variable, 400),
    pesoVariavel(R.font.inter_variable, 500),
    pesoVariavel(R.font.inter_variable, 600),
    pesoVariavel(R.font.inter_variable, 700),
)

private val colors = lightColorScheme(
    primary = MarketPurple,
    onPrimary = Color.White,
    secondary = MarketViolet,
    background = MarketCanvas,
    onBackground = MarketInk,
    surface = MarketSurface,
    onSurface = MarketInk,
    outline = MarketBorder,
    error = MarketRed,
)

private val typography = Typography(
    displayLarge = TextStyle(fontFamily = MarketDisplayFamily, fontWeight = FontWeight.Bold, fontSize = 42.sp),
    headlineLarge = TextStyle(fontFamily = MarketDisplayFamily, fontWeight = FontWeight.Bold, fontSize = 32.sp),
    headlineMedium = TextStyle(fontFamily = MarketDisplayFamily, fontWeight = FontWeight.Bold, fontSize = 26.sp),
    titleLarge = TextStyle(fontFamily = MarketDisplayFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp),
    titleMedium = TextStyle(fontFamily = MarketDisplayFamily, fontWeight = FontWeight.SemiBold, fontSize = 18.sp),
    bodyLarge = TextStyle(fontFamily = MarketBodyFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp),
    bodyMedium = TextStyle(fontFamily = MarketBodyFamily, fontWeight = FontWeight.Normal, fontSize = 14.sp),
    labelLarge = TextStyle(fontFamily = MarketBodyFamily, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
)

@Composable
fun MarketTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
