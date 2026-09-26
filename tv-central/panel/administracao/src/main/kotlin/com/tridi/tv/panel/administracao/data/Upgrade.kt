package com.tridi.tv.panel.administracao.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/**
 * Troca pelas telas NOVAS os slides que ainda estão exatamente como saíram de
 * fábrica — o port fiel de `comTelasAtualizadas` (`lib/painel-layout.ts`).
 *
 * É a peça que faltava para a parede nativa ser IGUAL ao navegador. A empresa
 * tem os cinco slides gravados no banco no desenho ANTIGO (título de largura
 * inteira, `periodo: "mes"`, sem a fileira de abas). O web não renderiza esse
 * JSON cru: na LEITURA ele reconhece o desenho de fábrica pela ASSINATURA — a
 * lista de tipos e posições — e o substitui pelo desenho novo (abas + ciclo +
 * as partes do slide clássico), via `separarEmBlocos`. Sem este port, a TV
 * mostrava o layout salvo (mês, sem pílulas) enquanto o site mostrava o novo
 * (ciclo, com pílulas) — a divergência que fazia a parede "ficar diferente".
 *
 * Idempotente: passar duas vezes não muda nada na segunda, porque a assinatura
 * do desenho NOVO não está na lista das antigas. Roda na leitura (não numa
 * migração de banco), como no web — a parede muda no próximo ciclo, sem SQL.
 */

private const val GRADE_COLUNAS = 12
private const val GRADE_LINHAS = 8

/** Uma parte do slide clássico, na grade de 12×8. Espelha `Peca` do web. */
private data class Peca(
    val tipo: String,
    val x: Int,
    val y: Int,
    val w: Int,
    val h: Int,
    val opcoes: Map<String, JsonElement> = emptyMap(),
)

private fun op(vararg pares: Pair<String, Any?>): Map<String, JsonElement> =
    pares.associate { (chave, valor) ->
        chave to when (valor) {
            is String -> JsonPrimitive(valor)
            is Boolean -> JsonPrimitive(valor)
            is Int -> JsonPrimitive(valor)
            is Double -> JsonPrimitive(valor)
            else -> JsonPrimitive(valor.toString())
        }
    }

/**
 * As RECEITAS de cada tela cheia — o que ela tem DENTRO. Cópia exata de
 * `RECEITA_CLASSICA` do web: mudar aqui sem mudar lá faz a TV e o site
 * desenharem telas diferentes a partir do mesmo perfil.
 */
private val RECEITA_CLASSICA: Map<String, List<Peca>> = mapOf(
    // ── Ranking ── `periodo: "ciclo"` nos quatro blocos de vendedor; a fileira
    // de abas diz qual período está no ar. Todos leem o mesmo relógio de parede.
    "classico-ranking" to listOf(
        Peca("texto", 0, 0, 7, 1, op("texto" to "Ranking dos vendedores", "tamanho" to "titulo")),
        Peca("abas", 7, 0, 5, 1, op("periodo" to "ciclo")),
        Peca("podio", 0, 1, 6, 4, op("periodo" to "ciclo")),
        Peca("lidera", 0, 5, 6, 1, op("periodo" to "ciclo")),
        Peca("ranking", 6, 1, 6, 5, op("periodo" to "ciclo", "linhas" to 7, "pular" to 3, "pedidos" to true)),
        Peca("equipe", 0, 6, 12, 2, op("periodo" to "ciclo")),
    ),
    "classico-batalha" to listOf(
        Peca("texto", 0, 0, 12, 1, op("texto" to "Batalha de Vendas", "tamanho" to "titulo")),
        Peca("texto", 0, 1, 12, 1, op("texto" to "Acompanhe o desempenho entre os times", "tamanho" to "subtitulo")),
        Peca("batalha", 0, 2, 12, 3),
        Peca("meta", 0, 5, 12, 3, op("ritmo" to true, "icone" to false)),
    ),
    "classico-financeiro" to listOf(
        Peca("kpi", 0, 0, 6, 3, op("metrica" to "faturamento_mes")),
        Peca("kpi", 6, 0, 2, 3, op("metrica" to "pedidos_mes", "rotulo" to "Pedidos")),
        Peca("kpi", 8, 0, 2, 3, op("metrica" to "ticket_medio", "rotulo" to "Ticket médio")),
        Peca("kpi", 10, 0, 2, 3, op("metrica" to "projecao_mes", "rotulo" to "Projeção do mês")),
        Peca("meta", 0, 3, 12, 3, op("ritmo" to true)),
        Peca("composicao", 0, 6, 12, 2),
    ),
    "classico-trafego" to listOf(
        Peca("texto", 0, 0, 9, 1, op("texto" to "TRÁFEGO PAGO", "tamanho" to "titulo")),
        Peca("abas", 9, 0, 3, 1, op("periodo" to "ciclo")),
        Peca("kpi", 0, 1, 3, 2, op("metrica" to "gasto_trafego", "rotulo" to "Investimento", "periodo" to "ciclo", "variacao" to true, "direcao" to "menor")),
        Peca("kpi", 3, 1, 3, 2, op("metrica" to "receita_paga", "rotulo" to "Vendas do tráfego", "periodo" to "ciclo", "variacao" to true)),
        Peca("kpi", 6, 1, 3, 2, op("metrica" to "roas", "rotulo" to "ROAS (retorno)", "periodo" to "ciclo", "variacao" to true)),
        Peca("kpi", 9, 1, 3, 2, op("metrica" to "pedidos_trafego", "rotulo" to "Vendas atribuídas", "periodo" to "ciclo", "variacao" to true)),
        Peca("barras", 0, 3, 8, 3, op("metrica" to "receita_paga", "linhas" to 12, "rotulo" to "Dia a dia do tráfego", "rotuloSerie" to "Vendas atribuídas", "comparar" to "gasto_trafego", "rotuloComparar" to "Investimento")),
        Peca("meta", 8, 3, 4, 3, op("base" to "trafego", "ritmo" to false, "rotulo" to "Meta de vendas do tráfego", "icone" to "target-arrow")),
        Peca("canais", 0, 6, 9, 2, op("periodo" to "ciclo")),
        Peca("insight", 9, 6, 3, 2),
    ),
    "classico-produtos" to listOf(
        Peca("texto", 0, 0, 12, 1, op("texto" to "Produtos mais vendidos", "tamanho" to "titulo")),
        Peca("produtos", 0, 1, 12, 7, op("metrica" to "quantidade", "linhas" to 6)),
    ),
    // O Comercial enxuto (set/2026): pódio do mês, quatro números e a meta da
    // equipe. Cópia fiel de `RECEITA_CLASSICA["comercial-simples"]` no web.
    "comercial-simples" to listOf(
        Peca("texto", 0, 0, 8, 1, op("texto" to "Dashboard Comercial", "tamanho" to "titulo")),
        Peca("relogio", 8, 0, 4, 1, op("hora" to false, "formato" to "mes")),
        Peca("podio", 2, 1, 8, 4, op("periodo" to "mes", "pedidos" to true, "degrau" to "lugar")),
        Peca("kpi", 0, 5, 3, 2, op("metrica" to "faturamento_mes")),
        Peca("kpi", 3, 5, 3, 2, op("metrica" to "meta_pct")),
        Peca("kpi", 6, 5, 3, 2, op("metrica" to "pedidos_dia")),
        Peca("kpi", 9, 5, 3, 2, op("metrica" to "ticket_medio")),
        Peca("equipe", 0, 7, 12, 1, op("periodo" to "mes", "faltam" to true)),
    ),
)

/**
 * A ASSINATURA de cada desenho de fábrica → o tipo clássico que o substitui.
 * Cópia exata de `ASSINATURA_DE_FABRICA` do web, incluindo as três versões
 * antigas da tela de tráfego. Uma assinatura que não bate = tela DA PESSOA,
 * fica como está.
 */
private val ASSINATURA_DE_FABRICA: Map<String, String> = mapOf(
    "texto:0,0,12,1|podio:0,1,6,4|lidera:0,5,6,1|ranking:6,1,6,5|equipe:0,6,12,2" to "classico-ranking",
    "texto:0,0,12,1|batalha:0,1,12,5|meta:0,6,12,2" to "classico-batalha",
    "kpi:0,0,6,3|anel:6,0,2,3|kpi:8,0,2,3|kpi:10,0,2,3|kpi:0,3,4,3|meta:4,3,8,3|composicao:0,6,12,2" to "classico-financeiro",
    "texto:0,0,12,1|kpi:0,1,3,3|kpi:3,1,3,3|kpi:6,1,3,3|kpi:9,1,3,3|curva:0,4,12,4" to "classico-trafego",
    "texto:0,0,9,1|abas:9,0,3,1|texto:0,1,12,1|kpi:0,2,3,2|kpi:3,2,3,2|kpi:6,2,3,2|kpi:9,2,3,2|curva:0,4,8,3|meta:8,4,4,3|insight:0,7,12,1" to "classico-trafego",
    "texto:0,0,9,1|abas:9,0,3,1|texto:0,1,12,1|kpi:0,2,3,2|kpi:3,2,3,2|kpi:6,2,3,2|kpi:9,2,3,2|curva:0,4,8,2|meta:8,4,4,2|canais:0,6,9,2|insight:9,6,3,2" to "classico-trafego",
    "texto:0,0,9,1|abas:9,0,3,1|kpi:0,1,3,2|kpi:3,1,3,2|kpi:6,1,3,2|kpi:9,1,3,2|curva:0,3,8,3|meta:8,3,4,3|canais:0,6,9,2|insight:9,6,3,2" to "classico-trafego",
)

/**
 * As assinaturas que viram uma TELA CHEIA, e não um conjunto de blocos.
 *
 * O perfil da doca nasceu como dois slides de blocos soltos — quatro números e
 * a lista de faltas numa tela, o "o que trava" na outra. Nenhum dos dois
 * mostrava a semana, e a fila de pedidos velhos não existia em lugar nenhum,
 * embora a rota já devolvesse as duas coisas. O desenho novo é uma tela em pé
 * só, com tudo na ordem em que se pergunta.
 *
 * Vale a mesma regra do resto do `comTelasAtualizadas`: só troca quem está
 * EXATAMENTE como saiu de fábrica. Quem moveu um bloco fica com o próprio
 * arranjo.
 */
private val ASSINATURA_DE_TELA_CHEIA: Map<String, String> = mapOf(
    "texto:0,0,8,1|relogio:8,0,4,1|kpi:0,1,6,2|kpi:6,1,6,2|kpi:0,3,6,2|kpi:6,3,6,2|expedicao:0,5,12,3"
        to "classico-logistica",
    "texto:0,0,12,1|kpi:0,1,12,2|falta:0,3,12,5" to "classico-logistica",
    // O TRÁFEGO também virou tela desenhada: as versões de fábrica (a antiga,
    // de quatro cartões e uma curva, e as três em blocos que vieram depois)
    // apontam todas para o mesmo desenho novo.
    "texto:0,0,12,1|kpi:0,1,3,3|kpi:3,1,3,3|kpi:6,1,3,3|kpi:9,1,3,3|curva:0,4,12,4" to "classico-trafego-tela",
    "texto:0,0,9,1|abas:9,0,3,1|texto:0,1,12,1|kpi:0,2,3,2|kpi:3,2,3,2|kpi:6,2,3,2|kpi:9,2,3,2|curva:0,4,8,3|meta:8,4,4,3|insight:0,7,12,1" to "classico-trafego-tela",
    "texto:0,0,9,1|abas:9,0,3,1|texto:0,1,12,1|kpi:0,2,3,2|kpi:3,2,3,2|kpi:6,2,3,2|kpi:9,2,3,2|curva:0,4,8,2|meta:8,4,4,2|canais:0,6,9,2|insight:9,6,3,2" to "classico-trafego-tela",
    "texto:0,0,9,1|abas:9,0,3,1|kpi:0,1,3,2|kpi:3,1,3,2|kpi:6,1,3,2|kpi:9,1,3,2|curva:0,3,8,3|meta:8,3,4,3|canais:0,6,9,2|insight:9,6,3,2" to "classico-trafego-tela",
    /*
     * PRODUÇÃO: as duas telas de gente ("Turno" e "Quem está produzindo") viram
     * a MESMA tela nova — o pódio do turno, os destaques e os contadores. Eram
     * duas telas sobre a mesma pergunta, uma com os números soltos e outra com
     * os cartões de operador; juntas viravam repetição no rodízio. O dedupe
     * logo abaixo colapsa as duas em uma.
     *
     * A tela de "Estoque e avisos" NÃO entra aqui: é outro assunto e continua
     * como está.
     */
    "texto:0,0,8,1|relogio:8,0,4,1|kpi:0,1,4,2|kpi:4,1,4,2|kpi:8,1,4,2|kpi:0,3,4,2|kpi:4,3,4,2|kpi:8,3,4,2|pessoas:0,5,12,3"
        to "classico-producao-equipe",
    "texto:0,0,8,1|relogio:8,0,4,1|pessoas:0,1,12,7" to "classico-producao-equipe",
)

/** A assinatura de um slide: tipos e posições dos blocos, na ordem salva. */
private fun assinaturaDeSlide(widgets: List<WidgetLayout>): String =
    widgets.joinToString("|") { "${it.tipo}:${it.x},${it.y},${it.w},${it.h}" }

/**
 * Mapeia FRONTEIRAS, não pares (posição, tamanho) — o mesmo cuidado do web.
 * Retorna `null` quando duas fronteiras colidem: a caixa é pequena demais para
 * o desenho, e a resposta é NÃO separar. Numa tela cheia (12×8) a conta é a
 * identidade, que é o caso de `comTelasAtualizadas`.
 */
private fun fronteiras(vals: List<Int>, tam: Int, de: Int, base: Int): Map<Int, Int>? {
    val unicas = vals.toSortedSet()
    val mapa = LinkedHashMap<Int, Int>()
    var anterior = Int.MIN_VALUE
    for (v in unicas) {
        val m = base + Math.round((v.toDouble() * tam) / de).toInt()
        if (m <= anterior) return null
        mapa[v] = m
        anterior = m
    }
    return mapa
}

/** Separa uma tela cheia nas partes que a compõem. Espelha `separarEmBlocos`. */
private fun separarEmBlocos(
    tipo: String,
    bx: Int,
    by: Int,
    bw: Int,
    bh: Int,
    novoId: () -> String,
): List<WidgetLayout> {
    val receita = RECEITA_CLASSICA[tipo] ?: return emptyList()
    val cols = fronteiras(receita.flatMap { listOf(it.x, it.x + it.w) }, bw, GRADE_COLUNAS, bx) ?: return emptyList()
    val linhas = fronteiras(receita.flatMap { listOf(it.y, it.y + it.h) }, bh, GRADE_LINHAS, by) ?: return emptyList()
    return receita.map { p ->
        val x = cols.getValue(p.x)
        val y = linhas.getValue(p.y)
        WidgetLayout(
            id = novoId(),
            tipo = p.tipo,
            x = x,
            y = y,
            w = cols.getValue(p.x + p.w) - x,
            h = linhas.getValue(p.y + p.h) - y,
            opcoes = p.opcoes,
        )
    }
}

/**
 * Troca pelas telas novas os slides ainda idênticos ao de fábrica.
 *
 * Ids novos e estáveis dentro do slide (`w-<slide>-n-<i>`): o Compose usa o id
 * como chave, e dois blocos com o mesmo id em slides diferentes fariam a grade
 * reaproveitar o nó errado ao trocar de tela.
 */
/**
 * Telas de fábrica que saíram de circulação — o par de `ASSINATURA_APOSENTADA`
 * em `lib/painel-layout.ts`, e pelo mesmo motivo: a de produtos mais vendidos
 * nasceu no perfil padrão do telão comercial e empurrava para trás as telas que
 * a equipe usa. Só sai quem está EXATAMENTE como veio de fábrica; tela montada
 * por alguém fica.
 */
private val ASSINATURA_APOSENTADA = setOf("texto:0,0,12,1|produtos:0,1,12,7")

/** As peças de uma tela cheia, para desenhá-la como grade dentro de uma célula. */
fun pecasDaTelaCheia(tipo: String, prefixo: String): List<WidgetLayout> {
    var n = 0
    return separarEmBlocos(tipo, 0, 0, GRADE_COLUNAS, GRADE_LINHAS) { "$prefixo-${n++}" }
}

private val TIPOS_COMERCIAL_DE_FABRICA = listOf(
    "classico-ranking", "classico-batalha", "classico-financeiro", "classico-trafego", "classico-produtos",
)

private fun assinaturaDaReceita(tipo: String): String =
    assinaturaDeSlide(separarEmBlocos(tipo, 0, 0, GRADE_COLUNAS, GRADE_LINHAS) { "x" })

/**
 * O Comercial de fábrica vira Ranking do mês + Batalha (decisão de 09/09/2026).
 *
 * Mesmo critério do web (`ehComercialDeFabrica` em `lib/painel-layout.ts`):
 * só quando TODAS as telas ainda são as de fábrica, na ordem de fábrica —
 * cinco, ou quatro sem a de produtos, que a leitura aposentou antes. Um bloco
 * movido em qualquer uma e o perfil é da pessoa; fica como está. A conferência
 * é feita ANTES do `comTelasAtualizadas`, sobre o que está gravado.
 */
fun comercialAtualizado(slides: List<SlideLayout>): List<SlideLayout> {
    val n = slides.size
    val deFabrica = (n == 5 || n == 4) && slides.zip(TIPOS_COMERCIAL_DE_FABRICA).all { (s, t) ->
        val a = assinaturaDeSlide(s.widgets)
        ASSINATURA_DE_FABRICA[a] == t || a == assinaturaDaReceita(t)
    }
    if (!deFabrica) return slides.comTelasAtualizadas()
    return listOf(
        SlideLayout(id = "s-c-rank", nome = "Ranking", duracaoMs = null, ativo = true,
            widgets = pecasDaTelaCheia("comercial-simples", "w-rk")),
        SlideLayout(id = "s-c-bat", nome = "Batalha", duracaoMs = null, ativo = true,
            widgets = pecasDaTelaCheia("classico-batalha", "w-bt")),
    )
}

fun List<SlideLayout>.comTelasAtualizadas(): List<SlideLayout> {
    var n = 0
    // Nunca esvaziar o perfil: perfil sem tela é TV preta.
    val vivos = filterNot { assinaturaDeSlide(it.widgets) in ASSINATURA_APOSENTADA }
    val trocados = (if (vivos.isEmpty()) this else vivos).map { slide ->
        val assinatura = assinaturaDeSlide(slide.widgets)
        val prefixo = "${slide.id}-n"

        // Tela cheia: o slide inteiro vira UM bloco que se desenha sozinho.
        ASSINATURA_DE_TELA_CHEIA[assinatura]?.let { tipo ->
            return@map slide.copy(
                widgets = listOf(
                    WidgetLayout(
                        id = "w-$prefixo-${n++}",
                        tipo = tipo,
                        x = 0, y = 0, w = GRADE_COLUNAS, h = GRADE_LINHAS,
                    ),
                ),
            )
        }

        val tipo = ASSINATURA_DE_FABRICA[assinatura] ?: return@map slide
        val novos = separarEmBlocos(tipo, 0, 0, GRADE_COLUNAS, GRADE_LINHAS) { "w-$prefixo-${n++}" }
        if (novos.isEmpty()) slide else slide.copy(widgets = novos)
    }

    /*
     * Slides que viraram a MESMA tela colapsam em um.
     *
     * A doca tinha duas telas de blocos e as duas viram o mesmo desenho novo —
     * sem isto o carrossel trocaria de slide a cada vinte segundos entre duas
     * telas idênticas, e a parede piscaria sozinha sem nada mudar. Compara pela
     * assinatura (tipo e posição), não pelo id, porque os ids são novos por
     * construção.
     */
    return trocados.distinctBy { assinaturaDeSlide(it.widgets) }
        .ifEmpty { trocados }
}
