package com.tridi.tv.panel.administracao.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * O layout montado no ERP (Administração → Painéis).
 *
 * Espelha `lib/painel-layout.ts` — mesmo JSON, mesma grade de 12×8. Sem isto o
 * editor seria mentira na parede: a pessoa arrastava os blocos, via a
 * pré-visualização certa, e a TV continuava com os cinco slides fixos que
 * moravam no código. Duas definições de painel divergindo é pior do que não ter
 * editor.
 *
 * `layout` ausente = a TV segue no carrossel de sempre. Nenhuma TV instalada
 * muda de aparência até alguém montar e salvar.
 */

private const val COLUNAS = 12
private const val LINHAS = 8

@Serializable
data class PainelLayout(
    val versao: Int = 1,
    val slides: List<SlideLayout> = emptyList(),
)

@Serializable
data class SlideLayout(
    val id: String = "",
    val nome: String = "",
    /** Tempo próprio deste slide; sem valor, usa o `slideIntervalMs` geral. */
    val duracaoMs: Long? = null,
    val ativo: Boolean = true,
    val widgets: List<WidgetLayout> = emptyList(),
)

@Serializable
data class WidgetLayout(
    val id: String = "",
    val tipo: String = "",
    val x: Int = 0,
    val y: Int = 0,
    val w: Int = 1,
    val h: Int = 1,
    /**
     * Opções livres do widget. `JsonElement` e não um tipo fechado de propósito:
     * quando o web ganhar uma opção nova, a TV ignora o que não conhece em vez
     * de falhar ao desserializar e apagar o painel inteiro.
     */
    val opcoes: Map<String, JsonElement> = emptyMap(),
) {
    fun texto(chave: String, padrao: String = ""): String =
        (opcoes[chave] as? JsonPrimitive)?.contentOrNullSeguro() ?: padrao

    fun numero(chave: String, padrao: Double = 0.0): Double =
        (opcoes[chave] as? JsonPrimitive)?.doubleOrNull ?: padrao

    fun booleano(chave: String, padrao: Boolean): Boolean =
        (opcoes[chave] as? JsonPrimitive)?.booleanOrNull ?: padrao

    /**
     * A opção existe E é um número?
     *
     * Serve para separar "sem alvo" de "alvo zero": o segundo é a meta óbvia de
     * um contador de problema ("nenhuma peça impedida") e, lido com `numero`,
     * era indistinguível do primeiro — a opção virava enfeite.
     */
    fun temNumero(chave: String): Boolean =
        (opcoes[chave] as? JsonPrimitive)?.doubleOrNull != null

    /** Larguras e alturas nunca saem da grade, mesmo com JSON estranho. */
    val larguraSegura: Int get() = w.coerceIn(1, COLUNAS - x.coerceIn(0, COLUNAS - 1))
    val alturaSegura: Int get() = h.coerceIn(1, LINHAS - y.coerceIn(0, LINHAS - 1))
    val xSeguro: Int get() = x.coerceIn(0, COLUNAS - 1)
    val ySeguro: Int get() = y.coerceIn(0, LINHAS - 1)
}

/**
 * `content` de um JsonPrimitive de texto. Um número vira a própria string, o
 * que é o esperado: uma opção "linhas: 6" lida como texto devolve "6".
 */
private fun JsonPrimitive.contentOrNullSeguro(): String? = if (isString) content else content

/** Só os slides que vão ao ar: ligados e com pelo menos um bloco. */
fun PainelLayout?.slidesAtivos(): List<SlideLayout> =
    this?.slides?.filter { it.ativo && it.widgets.isNotEmpty() }.orEmpty()

/**
 * Um PERFIL publicado no ERP — o modelo de tela que esta TV roda.
 *
 * O `layout` solto continua existindo para a TV que nunca escolheu perfil
 * nenhum: ela segue com o desenho de sempre, e não perde a tela porque o ERP
 * ganhou um conceito novo.
 */
@Serializable
data class PerfilLayout(
    val id: String = "",
    val nome: String = "",
    val paraTela: String = "16:9",
    val polegadas: Int = 50,
    /** Números curtos na tela inteira — decisão do perfil, não do bloco. */
    val numeroCurto: Boolean = false,
    val slides: List<SlideLayout> = emptyList(),
)

/**
 * Os slides que vão ao ar nesta TV: os do perfil escolhido; sem perfil (ou com
 * um perfil que foi apagado no ERP), os do layout solto.
 *
 * Apagar um perfil que uma TV usava é o caso que morde: a tela não pode ficar
 * preta porque alguém arrumou a lista no computador. Cair no layout é o mesmo
 * princípio do resto do app — ter algo velho na parede é melhor que nada.
 */
/**
 * Quanto o texto cresce ou encolhe, dada a polegada da TV do perfil.
 *
 * É a MESMA regra do `escalaPorPolegadas` do web (`lib/painel-layout.ts`), e
 * precisa continuar sendo: se as duas divergirem, o editor mostra "texto 112%"
 * e a parede desenha outro tamanho — e ninguém descobre olhando a tela, só
 * medindo com régua.
 *
 * 50" é a referência. A correção é suave de propósito: quem instala tela maior
 * instala mais longe, e as duas coisas quase se cancelam.
 */
fun escalaDaTela(polegadas: Int): Float {
    val p = polegadas.coerceIn(10, 120)
    return 1f + (p - 50) * 0.005f
}

/** As polegadas do perfil escolhido; 50" quando não há perfil. */
fun polegadasDoPerfil(perfis: List<PerfilLayout>?, perfilId: String?): Int =
    perfis?.firstOrNull { it.id == perfilId }?.polegadas ?: 50

/** A tela inteira abrevia? Decisão do perfil; sem perfil, valor exato. */
fun numeroCurtoDoPerfil(perfis: List<PerfilLayout>?, perfilId: String?): Boolean =
    perfis?.firstOrNull { it.id == perfilId }?.numeroCurto ?: false

fun slidesDoPerfil(
    perfis: List<PerfilLayout>?,
    perfilId: String?,
    layout: PainelLayout?,
): List<SlideLayout> {
    val perfil = perfis?.firstOrNull { it.id == perfilId }
    val doPerfil = perfil?.slides?.filter { it.ativo && it.widgets.isNotEmpty() }.orEmpty()
    // `comTelasAtualizadas`: leva o redesenho até a TV como o web faz em
    // `Panel.tsx` (`comTelasAtualizadas(config.perfis)`). Sem isto a parede
    // desenhava o layout de fábrica cru (mês, sem abas) e "ficava diferente"
    // do site, que mostra o desenho novo (ciclo, com abas).
    val telas = doPerfil.ifEmpty { layout.slidesAtivos() }
    // O Comercial ganha a troca de fábrica (5 telas → ranking do mês + batalha)
    // antes do redesenho por assinatura, como o web faz em `comTelasAtualizadas`.
    return if (perfilId == "p-comercial") comercialAtualizado(telas) else telas.comTelasAtualizadas()
}
