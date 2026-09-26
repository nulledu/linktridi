package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// A aritmética que decide se uma etiqueta sai legível. Cada teste aqui vale um
// lote de etiquetas que não foi impresso errado.
class EtiquetaLayoutTest {

    private val CODIGO = "MDF6MM-BR-18-000042"

    private fun layout(
        alturaMm: Int = EtiquetaLayout.ALTURA_PADRAO_MM,
        temLocal: Boolean = true,
        ehCaixa: Boolean = false,
    ) = EtiquetaLayout.montar(CODIGO, temLocal = temLocal, ehCaixa = ehCaixa, alturaMm = alturaMm)

    private val TODAS_AS_ALTURAS = EtiquetaLayout.ALTURA_MINIMA_MM..EtiquetaLayout.ALTURA_MAXIMA_MM

    /**
     * A menor altura em que a barra ainda sai nos 8mm.
     *
     * Não é constante do desenho, é consequência dele: faixa do topo + vão +
     * 8mm de barra. Como o selo faz a faixa do topo crescer, a caixa precisa de
     * um milímetro a mais que a etiqueta comum.
     */
    private fun pisoDaAltura(ehCaixa: Boolean) = if (ehCaixa) 15 else 14

    // ── Milímetro ↔ ponto ────────────────────────────────────────────────────

    @Test fun `oito pontos por milimetro - a resolucao da 80mm a 203 dpi`() {
        assertEquals(8, EtiquetaLayout.PONTOS_POR_MM)
        assertEquals(120, EtiquetaLayout.mmParaPontos(15))
        assertEquals(576, EtiquetaLayout.LARGURA_PADRAO_PONTOS)
        // 576 pontos ÷ 8 = 72mm, a área imprimível do papel de 80mm.
        assertEquals(72f, EtiquetaLayout.pontosParaMm(576), 0.01f)
    }

    // ── O que este redesenho existe pra fazer ────────────────────────────────

    @Test fun `a 72mm o modulo do codigo do galpao e de DOIS pontos - a barra que o dono aprovou`() {
        // ESTE É O TESTE DA FRENTE INTEIRA.
        //
        // "MDF6MM-BR-18-000042" gasta 264 módulos. No desenho de três colunas as
        // barras ficavam presas num teto de 60% da largura útil — (560 × 3/5) ÷
        // 264 = 1 ponto por módulo, 0,125mm, o mínimo absoluto da cabeça
        // térmica. Empilhado, elas levam os 560 pontos inteiros: 560 ÷ 264 = 2.
        //
        // 0,25mm é exatamente o módulo da impressão livre, que é a tira que o
        // dono comparou e chamou de boa.
        val l = layout()
        assertEquals("264 módulos é o código real do galpão", 264, Code128.totalDeModulos(CODIGO))
        assertEquals("módulo em pontos", 2, l.moduloPontos)
        assertEquals("módulo em mm", 0.25f, EtiquetaLayout.pontosParaMm(l.moduloPontos), 0.001f)
        assertEquals("o mesmo módulo da etiqueta livre", EtiquetaLivreLayout.MODULO_MINIMO_PONTOS, l.moduloPontos)
        assertTrue(l.moduloNoAlvo)
    }

    @Test fun `as barras levam a largura util INTEIRA, sem teto de 60 por cento`() {
        // O teto de 60% era o que espremia o módulo, e ele saiu junto com as
        // colunas. O que sobra dos dois lados é papel branco de centralização —
        // menos que um módulo inteiro de cada lado.
        val l = layout()
        val util = l.larguraPontos - 2 * l.margem
        assertTrue(
            "as barras ocupam ${l.faixaBarras.largura} de $util",
            l.faixaBarras.largura > (util * 3) / 5,
        )
        assertTrue("dentro da margem esquerda", l.faixaBarras.x >= l.margem)
        assertTrue("dentro da margem direita", l.faixaBarras.fim <= l.larguraPontos - l.margem)
        // Centradas: a sobra é igual dos dois lados, a menos de um ponto.
        val esquerda = l.faixaBarras.x - l.margem
        val direita = (l.larguraPontos - l.margem) - l.faixaBarras.fim
        assertTrue("sobra $esquerda à esquerda e $direita à direita", Math.abs(esquerda - direita) <= 1)
    }

    @Test fun `codigo comprido demais sai FINO com aviso, nunca recusado`() {
        // "TESTE-IMPRESSORA-000001" gasta 308 módulos e não cabe a 2 pontos nem
        // com o papel inteiro (616 > 560). Subir o PISO do módulo pra 2
        // recusaria esta etiqueta — e etiqueta que não sai é pior que etiqueta
        // borrada. Ela sai, com a barra no piso físico, e a tela diz por quê.
        val l = EtiquetaLayout.montar("TESTE-IMPRESSORA-000001", temLocal = true)
        assertEquals(308, Code128.totalDeModulos("TESTE-IMPRESSORA-000001"))
        assertEquals(1, l.moduloPontos)
        assertFalse(l.moduloNoAlvo)
        assertTrue(l.aviso!!, l.aviso!!.contains("comprido demais pra esta largura"))
    }

    // ── As faixas empilhadas ─────────────────────────────────────────────────

    @Test fun `as tres faixas empilham sem se invadir e sem passar do papel`() {
        val l = layout(ehCaixa = true)
        val topoDaFaixaDoTopo = l.baseDoTopo - EtiquetaLayout.Fonte.NOME
        assertTrue("faixa do topo dentro do papel", topoDaFaixaDoTopo >= l.margemVertical)
        assertTrue("as barras vêm depois do texto de cima", l.topoBarras >= l.margemVertical + l.alturaDoTopo)
        assertTrue(
            "o pé vem depois das barras",
            l.baseDoPe!! - EtiquetaLayout.Fonte.CODIGO_LEGIVEL >= l.topoBarras + l.alturaBarras,
        )
        assertTrue("o pé não vaza embaixo", l.baseDoPe!! + EtiquetaLayout.descida(EtiquetaLayout.Fonte.CODIGO_LEGIVEL) <= l.limiteDeBaixo)
    }

    @Test fun `na faixa do topo o nome abre, o local fecha, e nada se sobrepoe`() {
        val l = layout(ehCaixa = true)
        val vagas = listOfNotNull(l.faixaNome, l.faixaCorDimensoes, l.faixaLocal, l.faixaSelo)
        vagas.zipWithNext().forEach { (a, b) ->
            assertTrue("vaga em ${b.x} invade a que termina em ${a.fim}", a.fim <= b.x)
        }
        assertEquals("o nome abre na margem", l.margem, l.faixaNome.x)
        assertEquals("o selo fecha na margem", l.larguraPontos - l.margem, l.faixaSelo!!.fim)
    }

    @Test fun `na faixa do pe o codigo abre e o rodape fecha`() {
        val l = layout()
        assertEquals(l.margem, l.faixaCodigoLegivel!!.x)
        assertEquals(l.larguraPontos - l.margem, l.faixaRodape!!.fim)
        assertTrue(l.faixaCodigoLegivel!!.fim <= l.faixaRodape!!.x)
        // O código escrito leva mais espaço porque é MONOESPAÇADO: 1,7mm por
        // caractere contra ~1,4 da sans do rodapé.
        assertTrue(l.faixaCodigoLegivel!!.largura > l.faixaRodape!!.largura)
    }

    @Test fun `o horario mora no canto inferior direito, longe do nome e das barras`() {
        // "ta meio ruim a parte que mostra o horario na etiqueta": ela dividia a
        // coluna 1 com o nome e disputava caractere a caractere com ele. Agora
        // ela fecha a tira, no canto de menos tráfego, sem tocar em nada.
        val l = layout()
        val rodape = l.faixaRodape!!
        assertEquals("encostado na borda direita", l.larguraPontos - l.margem, rodape.fim)
        assertTrue("abaixo das barras", l.baseDoPe!! > l.topoBarras + l.alturaBarras)
        assertTrue("não encosta no nome", rodape.x > l.faixaNome.fim || l.baseDoPe!! > l.baseDoTopo)
        // E continua no piso de letra — discreto pela POSIÇÃO, nunca por
        // encolher abaixo do que o papel térmico imprime.
        assertEquals(EtiquetaLayout.Fonte.PISO, EtiquetaLayout.Fonte.RODAPE)
    }

    @Test fun `sem local e sem caixa a vaga da direita some e a largura volta pro nome`() {
        val com = layout(temLocal = true)
        val sem = layout(temLocal = false)
        assertNotNull(com.faixaLocal)
        assertNull(sem.faixaLocal)
        assertTrue(
            "sem local, o nome tinha de ficar mais largo (${sem.faixaNome.largura} vs ${com.faixaNome.largura})",
            sem.faixaNome.largura > com.faixaNome.largura,
        )
    }

    @Test fun `caixa sem local ainda ganha o selo - o numero do lacre nao tem outro lugar`() {
        val l = EtiquetaLayout.montar(CODIGO, temLocal = false, ehCaixa = true)
        assertNotNull("caixa sem local precisa do selo", l.faixaSelo)
        assertNull("mas não inventa um local", l.faixaLocal)
        assertNotNull(l.baseSelo)
    }

    // ── O código de barras ───────────────────────────────────────────────────

    @Test fun `o modulo e sempre um numero INTEIRO de pontos`() {
        // Módulo fracionário faz cada barra arredondar pra um lado diferente e a
        // PROPORÇÃO entre elas, que é o que o leitor mede, deixa de fechar.
        TODAS_AS_ALTURAS.step(7).forEach { mm ->
            val l = layout(alturaMm = mm)
            assertEquals("$mm mm", 0, l.faixaBarras.largura % l.moduloPontos)
        }
    }

    @Test fun `a faixa das barras tem exatamente os modulos que o Code128 pediu`() {
        val l = layout()
        assertEquals(Code128.totalDeModulos(CODIGO) * l.moduloPontos, l.faixaBarras.largura)
    }

    @Test fun `codigo curto ganha modulo mais gordo - barra mais facil de ler`() {
        val curto = EtiquetaLayout.montar("GAL-A3", temLocal = true)
        assertTrue(
            "código curto devia ganhar módulo maior (${curto.moduloPontos} vs ${layout().moduloPontos})",
            curto.moduloPontos > layout().moduloPontos,
        )
    }

    @Test fun `as barras comecam depois da zona quieta e ficam dentro da faixa`() {
        val l = layout()
        val primeira = l.barras.first()
        val ultima = l.barras.last()
        assertEquals(l.faixaBarras.x + Code128.ZONA_QUIETA * l.moduloPontos, primeira.x)
        assertTrue(
            "a última barra invade a zona quieta da direita",
            ultima.x + ultima.largura <= l.faixaBarras.fim - Code128.ZONA_QUIETA * l.moduloPontos,
        )
    }

    @Test fun `nenhuma barra encosta na outra`() {
        val l = layout()
        l.barras.zipWithNext().forEach { (a, b) ->
            assertTrue("barra em ${b.x} colada na que termina em ${a.x + a.largura}", b.x > a.x + a.largura)
        }
    }

    // ── 18mm: o alvo do desenho ──────────────────────────────────────────────

    @Test fun `18mm e o padrao`() {
        assertEquals(18, EtiquetaLayout.ALTURA_PADRAO_MM)
        assertEquals(144, layout().alturaPontos)
    }

    @Test fun `a 18mm cabe TUDO - e e por isso que a etiqueta empilha`() {
        // Este é o teste do exercício inteiro, na altura que o dono fixou. A
        // etiqueta MAIS CHEIA que existe (caixa, com local, detalhe da
        // prateleira, cor, data e código escrito) cabe inteira em 18mm COM a
        // barra de 0,25mm de módulo.
        val l = layout(ehCaixa = true)
        assertNotNull("nome", l.faixaNome)
        assertNotNull("cor · dimensões", l.faixaCorDimensoes)
        assertNotNull("local", l.faixaLocal)
        assertTrue("detalhe da prateleira", l.mostraDetalheDoLocal)
        assertNotNull("e ele tem vaga própria na faixa do pé", l.faixaDetalheDoLocal)
        assertNotNull("selo da caixa", l.baseSelo)
        assertNotNull("código escrito", l.faixaCodigoLegivel)
        assertNotNull("data · responsável", l.faixaRodape)
        assertTrue("barras com ${l.alturaBarrasMm}mm", l.barrasLegiveis)
        assertTrue("módulo de ${l.moduloPontos} pontos", l.moduloNoAlvo)
        assertEquals("nada ficou de fora", emptyList<EtiquetaLayout.Peca>(), l.naoCoube)
        assertNull("e por isso a tela não avisa nada", l.aviso)
    }

    @Test fun `a conta dos 18mm fecha ponto a ponto - nao sobra um`() {
        // 144 = 2×4 de margem + 35 da faixa do topo com selo + 8 de vão +
        // 66 de barra + 27 da faixa do pé. Se alguém acrescentar uma linha de
        // texto, ela sai daqui — e é a barra que paga.
        val l = layout(ehCaixa = true)
        assertEquals(4, l.margemVertical)
        assertEquals(35, l.alturaDoTopo)
        assertEquals(8, EtiquetaLayout.VAO_ANTES_DAS_BARRAS)
        assertEquals(66, l.alturaBarras)
        assertEquals(27, EtiquetaLayout.caixaDaLinha(EtiquetaLayout.Fonte.CODIGO_LEGIVEL))
        assertEquals(
            l.alturaPontos,
            2 * l.margemVertical + l.alturaDoTopo + EtiquetaLayout.VAO_ANTES_DAS_BARRAS +
                l.alturaBarras + EtiquetaLayout.caixaDaLinha(EtiquetaLayout.Fonte.CODIGO_LEGIVEL),
        )
    }

    @Test fun `o selo e o unico texto que faz a faixa do topo crescer`() {
        val peca = layout(ehCaixa = false)
        val caixa = layout(ehCaixa = true)
        assertEquals(EtiquetaLayout.caixaDaLinha(EtiquetaLayout.Fonte.NOME), peca.alturaDoTopo)
        assertEquals(EtiquetaLayout.Selo.ALTURA, caixa.alturaDoTopo)
        assertTrue("e quem paga é a barra", caixa.alturaBarras < peca.alturaBarras)
    }

    // ── Altura: o ajuste, de 10 a 80mm ───────────────────────────────────────

    @Test fun `altura e ajuste, nao constante - de 10 a 80mm`() {
        TODAS_AS_ALTURAS.step(5).forEach { mm ->
            assertEquals("altura de $mm mm", mm * 8, layout(alturaMm = mm).alturaPontos)
        }
    }

    @Test fun `altura fora da faixa e presa na faixa, nunca aceita crua`() {
        assertEquals(10 * 8, layout(alturaMm = 3).alturaPontos)
        assertEquals(80 * 8, layout(alturaMm = 200).alturaPontos)
    }

    @Test fun `do piso de altura pra cima as barras nunca descem dos 8mm`() {
        // Empilhado, texto e barra disputam a MESMA altura — não há mais como
        // ter as duas coisas numa tira de 10mm. O que o layout garante é o piso
        // a partir do qual a etiqueta é bipável, e ele é consequência do
        // desenho: faixa do topo + vão + 8mm.
        listOf(true, false).forEach { caixa ->
            (pisoDaAltura(caixa)..EtiquetaLayout.ALTURA_MAXIMA_MM).forEach { mm ->
                val l = layout(alturaMm = mm, ehCaixa = caixa)
                assertTrue("caixa=$caixa $mm mm: barras com ${l.alturaBarrasMm}mm", l.barrasLegiveis)
            }
        }
    }

    @Test fun `abaixo do piso a etiqueta nao mente - ela avisa que a barra nao le`() {
        // Antes o desenho de colunas escondia isso: o texto subia AO LADO das
        // barras, então a barra ficava alta e a tira parecia boa em qualquer
        // altura. Agora a tira de 12mm diz, em letras, que não vai bipar.
        listOf(true, false).forEach { caixa ->
            (EtiquetaLayout.ALTURA_MINIMA_MM until pisoDaAltura(caixa)).forEach { mm ->
                val l = layout(alturaMm = mm, ehCaixa = caixa)
                assertFalse("caixa=$caixa $mm mm", l.barrasLegiveis)
                assertTrue(
                    "caixa=$caixa $mm mm não avisou: ${l.aviso}",
                    l.aviso!!.startsWith("Barras com ") && l.aviso!!.endsWith("Aumente a altura."),
                )
            }
        }
    }

    @Test fun `a altura que sobra vai toda pras barras`() {
        // Nenhuma fonte cresce com a etiqueta. Então etiqueta mais alta é barra
        // mais alta, que é leitor pegando de mais longe e mais torto.
        val dezoito = layout(alturaMm = 18)
        val trinta = layout(alturaMm = 30)
        assertEquals(12 * 8, trinta.alturaBarras - dezoito.alturaBarras)
        assertEquals("e nenhum texto muda de lugar", dezoito.faixaNome, trinta.faixaNome)
    }

    // ── A degradação por ALTURA: só a faixa do pé cede ───────────────────────

    @Test fun `a faixa do pe e a unica que a altura come - e cai INTEIRA`() {
        // Ela é a única coisa que mora abaixo das barras, então é a única que
        // devolve altura pra elas. O código escrito e a data dividem a mesma
        // linha: meia linha não existe.
        val com = layout(alturaMm = 17)
        val sem = layout(alturaMm = 16)
        assertNotNull(com.faixaCodigoLegivel)
        assertNotNull(com.faixaRodape)
        assertNull(sem.faixaCodigoLegivel)
        assertNull(sem.faixaRodape)
        assertEquals(
            listOf(EtiquetaLayout.Peca.CODIGO_LEGIVEL, EtiquetaLayout.Peca.DATA_E_RESPONSAVEL),
            sem.naoCoube,
        )
        // O detalhe da prateleira mora nessa linha e cai com ela — mas não vira
        // uma terceira perda na frase: a linha inteira sumiu, e o botão a mexer
        // é o mesmo.
        assertNull(sem.faixaDetalheDoLocal)
        // O espaço não evapora: vira barra. Os 27 pontos da faixa, menos os 8
        // que a etiqueta encolheu.
        assertEquals(27 - 8, sem.alturaBarras - com.alturaBarras)
    }

    @Test fun `o nome e o local NUNCA caem por altura - eles sao a etiqueta`() {
        listOf(true, false).forEach { caixa ->
            TODAS_AS_ALTURAS.forEach { mm ->
                val l = layout(alturaMm = mm, ehCaixa = caixa)
                assertTrue("caixa=$caixa $mm mm: sem nome", l.faixaNome.largura > 0)
                assertNotNull("caixa=$caixa $mm mm: sem local", l.faixaLocal)
                assertTrue("caixa=$caixa $mm mm: sem barras", l.barras.isNotEmpty())
            }
        }
    }

    @Test fun `etiqueta de uma peca nao reserva nada pro selo`() {
        assertNull(layout(ehCaixa = false).baseSelo)
        assertNull(layout(ehCaixa = false).faixaSelo)
    }

    // ── Nada vaza o papel ────────────────────────────────────────────────────

    @Test fun `nenhuma tinta e desenhada fora do papel, em altura nenhuma`() {
        TODAS_AS_ALTURAS.forEach { mm ->
            listOf(true, false).forEach { caixa ->
                val l = layout(alturaMm = mm, ehCaixa = caixa)
                val teto = l.margemVertical
                val piso = l.limiteDeBaixo

                assertTrue("$mm mm: barras começam antes do topo", l.topoBarras >= teto)
                assertTrue("$mm mm: barras vazam embaixo", l.topoBarras + l.alturaBarras <= piso)

                val linhas = buildList {
                    add(l.baseDoTopo to EtiquetaLayout.Fonte.NOME)
                    l.baseDoPe?.let { add(it to EtiquetaLayout.Fonte.CODIGO_LEGIVEL) }
                }
                listOfNotNull(l.faixaCodigoLegivel, l.faixaDetalheDoLocal, l.faixaRodape)
                    .zipWithNext().forEach { (a, b) ->
                        assertTrue("$mm mm: o pé se atropela", a.fim <= b.x)
                    }
                linhas.forEach { (base, fonte) ->
                    assertTrue("$mm mm: linha de base $base sobe acima do topo", base - fonte >= teto)
                    assertTrue(
                        "$mm mm: linha de base $base desce abaixo de $piso",
                        base + EtiquetaLayout.descida(fonte) <= piso,
                    )
                }
                l.baseSelo?.let { base ->
                    assertTrue("$mm mm: selo vaza embaixo", base <= piso)
                    assertTrue("$mm mm: selo sobe acima do topo", base - EtiquetaLayout.Selo.ALTURA >= teto)
                    assertTrue("$mm mm: selo invade as barras", base <= l.topoBarras)
                }
                listOfNotNull(l.faixaNome, l.faixaCorDimensoes, l.faixaLocal, l.faixaSelo,
                    l.faixaCodigoLegivel, l.faixaDetalheDoLocal, l.faixaRodape, l.faixaBarras).forEach {
                    assertTrue("$mm mm: vaga em ${it.x} começa antes da margem", it.x >= l.margem)
                    assertTrue("$mm mm: vaga termina em ${it.fim}, fora do papel", it.fim <= l.larguraPontos - l.margem)
                }
            }
        }
    }

    @Test fun `o codigo escrito fica embaixo das barras`() {
        val l = layout()
        assertTrue(l.baseDoPe!! > l.topoBarras + l.alturaBarras)
    }

    // ── Repartir a faixa com o que a peça de fato tem ────────────────────────
    //
    // `montar` reserva pelo PIOR caso porque é puro e não mede texto. Quem
    // desenha sabe mais — a peça não tem cor/dimensões — e chama `repartir` de
    // novo. Sem isso a vaga reservada e não usada virava buraco.

    @Test fun `repartir enche a largura exatamente, sem sobrar ponto`() {
        listOf(listOf(5), listOf(5, 4), listOf(5, 4, 4), listOf(3, 2)).forEach { pesos ->
            val faixas = EtiquetaLayout.repartir(8, 560, pesos)
            assertEquals("$pesos: começa na margem", 8, faixas.first().x)
            assertEquals("$pesos: termina no fim", 8 + 560, faixas.last().fim)
            faixas.zipWithNext().forEach { (a, b) ->
                assertEquals("$pesos: o vão entre as vagas", EtiquetaLayout.VAO, b.x - a.fim)
            }
        }
    }

    @Test fun `repartir respeita a proporcao dos pesos`() {
        val (nome, cor, local) = EtiquetaLayout.repartir(8, 560, listOf(5, 4, 4))
        assertEquals(5f / 4f, nome.largura.toFloat() / cor.largura, 0.05f)
        assertEquals(1f, cor.largura.toFloat() / local.largura, 0.05f)
    }

    @Test fun `sem cor e dimensoes, o nome fica com a largura dela`() {
        // O caminho de todo dia do tablet: a etiqueta da unidade imprime o SKU e
        // não tem cor/dimensões. Antes disso existir, o nome ficava preso na
        // vaga reservada e a vaga vazia era papel branco no meio da tira.
        val l = layout()
        val comCor = EtiquetaLayout.repartir(l.margem, l.faixaNome.largura + l.faixaCorDimensoes!!.largura +
            l.faixaLocal!!.largura + 2 * EtiquetaLayout.VAO, listOf(5, 4, 4))
        val semCor = EtiquetaLayout.repartir(l.margem, l.faixaNome.largura + l.faixaCorDimensoes!!.largura +
            l.faixaLocal!!.largura + 2 * EtiquetaLayout.VAO, listOf(5, 4))
        assertTrue(
            "sem a cor o nome tinha de crescer (${semCor[0].largura} vs ${comCor[0].largura})",
            semCor[0].largura > comCor[0].largura,
        )
    }

    @Test fun `repartir de uma vaga so ocupa a largura inteira`() {
        val faixas = EtiquetaLayout.repartir(8, 560, listOf(5))
        assertEquals(1, faixas.size)
        assertEquals(EtiquetaLayout.Faixa(8, 560), faixas.first())
        assertEquals(emptyList<EtiquetaLayout.Faixa>(), EtiquetaLayout.repartir(8, 560, emptyList()))
    }

    // ── O piso da letra ──────────────────────────────────────────────────────

    @Test fun `nenhuma fonte da etiqueta desce abaixo de 2,8mm`() {
        // Veio de tira impressa conferida na mão: abaixo disso o papel térmico
        // barato com a cabeça usada sai borrão. Quando não cabe, o layout corta
        // TEXTO — nunca encolhe a letra. Vale inclusive pro horário: ele é
        // discreto pela posição, nunca por ser menor que o papel imprime.
        val piso = EtiquetaLayout.mmParaPontos(2.8)
        listOf(
            "nome" to EtiquetaLayout.Fonte.NOME,
            "detalhe" to EtiquetaLayout.Fonte.DETALHE,
            "rodapé" to EtiquetaLayout.Fonte.RODAPE,
            "local" to EtiquetaLayout.Fonte.LOCAL,
            "detalhe do local" to EtiquetaLayout.Fonte.LOCAL_DETALHE,
            "código legível" to EtiquetaLayout.Fonte.CODIGO_LEGIVEL,
            "quantidade" to EtiquetaLayout.Fonte.QUANTIDADE,
        ).forEach { (nome, tamanho) ->
            assertTrue("$nome tem $tamanho pontos, abaixo do piso de $piso", tamanho >= piso)
        }
    }

    // ── O aviso da tela ──────────────────────────────────────────────────────

    @Test fun `a 18mm a tela nao tem nada a avisar`() {
        assertNull(layout(alturaMm = 18, ehCaixa = true).aviso)
        assertNull(layout(alturaMm = 18, ehCaixa = false).aviso)
    }

    @Test fun `o aviso lista exatamente o que sumiu do layout - nem a mais, nem a menos`() {
        // Esta é a trava contra o aviso mentir. Se alguém acrescentar uma peça
        // ao desenho e esquecer de contá-la, os dois lados divergem aqui.
        TODAS_AS_ALTURAS.forEach { mm ->
            val l = layout(alturaMm = mm, ehCaixa = true)
            val esperado = buildList {
                if (l.faixaCodigoLegivel == null) add(EtiquetaLayout.Peca.CODIGO_LEGIVEL)
                if (l.faixaRodape == null) add(EtiquetaLayout.Peca.DATA_E_RESPONSAVEL)
                // O detalhe mora NA faixa do pé: quando ela inteira cai por
                // altura, ele não é uma perda à parte — a frase já diz que a
                // linha de baixo sumiu, e o botão a mexer é o mesmo. Ele só é
                // reportado quando a faixa existe e ele não coube DENTRO dela.
                if (l.baseDoPe != null && !l.mostraDetalheDoLocal) add(EtiquetaLayout.Peca.DETALHE_DO_LOCAL)
                if (l.faixaCorDimensoes == null) add(EtiquetaLayout.Peca.COR_DIMENSOES)
                if (l.faixaLocal == null) add(EtiquetaLayout.Peca.LOCAL)
            }
            assertEquals("$mm mm", esperado, l.naoCoube)

            val aviso = l.aviso
            if (esperado.isEmpty() && l.barrasLegiveis && l.moduloNoAlvo) {
                assertNull("$mm mm não devia avisar nada", aviso)
            } else if (l.barrasLegiveis) {
                assertNotNull("$mm mm perdeu $esperado e não avisou", aviso)
                esperado.forEach {
                    assertTrue("$mm mm: o aviso não cita \"${it.descricao}\"", aviso!!.contains(it.descricao))
                }
            }
        }
    }

    @Test fun `sem local o aviso nunca fala do local nem do detalhe da prateleira`() {
        // Não existe perder o que a etiqueta nunca teve.
        TODAS_AS_ALTURAS.forEach { mm ->
            val l = layout(alturaMm = mm, temLocal = false)
            assertFalse("$mm mm", l.naoCoube.contains(EtiquetaLayout.Peca.DETALHE_DO_LOCAL))
            assertFalse("$mm mm", l.naoCoube.contains(EtiquetaLayout.Peca.LOCAL))
        }
    }

    @Test fun `o aviso e uma frase de gente, com o nem do fim`() {
        val aviso = layout(alturaMm = 16).aviso!!
        assertTrue(aviso, aviso.startsWith("Nesta altura não cabe "))
        assertTrue(aviso, aviso.contains(" nem "))
        assertTrue(aviso, aviso.endsWith("."))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `codigo com acento e recusado antes de virar etiqueta`() {
        EtiquetaLayout.montar("café-000001", temLocal = true)
    }

    // ── Empacotamento para o GS v 0 ──────────────────────────────────────────

    @Test fun `bit 1 e ponto PRETO - etiqueta em negativo gastaria o rolo inteiro`() {
        val branco = 0xFFFFFFFF.toInt()
        val preto = 0xFF000000.toInt()
        // Uma linha de 8 pontos: preto nas duas pontas.
        val pixels = intArrayOf(preto, branco, branco, branco, branco, branco, branco, preto)
        val bytes = EtiquetaLayout.empacotar(pixels, largura = 8, altura = 1)
        assertEquals(1, bytes.size)
        assertEquals(0b1000_0001, bytes[0].toInt() and 0xFF)
    }

    @Test fun `o bit mais significativo e o ponto mais a esquerda`() {
        val branco = 0xFFFFFFFF.toInt()
        val preto = 0xFF000000.toInt()
        val pixels = IntArray(8) { branco }.also { it[0] = preto }
        assertEquals(0b1000_0000, EtiquetaLayout.empacotar(pixels, 8, 1)[0].toInt() and 0xFF)
        val pixels2 = IntArray(8) { branco }.also { it[7] = preto }
        assertEquals(0b0000_0001, EtiquetaLayout.empacotar(pixels2, 8, 1)[0].toInt() and 0xFF)
    }

    @Test fun `cada linha comeca num byte novo`() {
        val branco = 0xFFFFFFFF.toInt()
        val preto = 0xFF000000.toInt()
        // 3 pontos de largura (→ 1 byte por linha), 2 linhas.
        val pixels = intArrayOf(preto, branco, branco, branco, preto, branco)
        val bytes = EtiquetaLayout.empacotar(pixels, largura = 3, altura = 2)
        assertEquals(2, bytes.size)
        assertEquals(0b1000_0000, bytes[0].toInt() and 0xFF)
        assertEquals(0b0100_0000, bytes[1].toInt() and 0xFF)
    }

    @Test fun `papel em branco vira bitmap todo zero`() {
        val pixels = IntArray(576 * 4) { 0xFFFFFFFF.toInt() }
        val bytes = EtiquetaLayout.empacotar(pixels, 576, 4)
        assertEquals(72 * 4, bytes.size)
        assertTrue("um bit aceso no papel em branco", bytes.all { it.toInt() == 0 })
    }

    @Test fun `o empacotado tem o tamanho exato que o GS v 0 exige`() {
        val l = layout()
        val pixels = IntArray(l.larguraPontos * l.alturaPontos) { 0xFFFFFFFF.toInt() }
        val bytes = EtiquetaLayout.empacotar(pixels, l.larguraPontos, l.alturaPontos)
        // O mesmo tamanho que o EscPos.raster valida — se divergirem, a
        // impressão explode em IllegalArgumentException em vez de sair torta.
        assertEquals((l.larguraPontos / 8) * l.alturaPontos, bytes.size)
        EscPos.raster(bytes, l.larguraPontos, l.alturaPontos)
    }

    @Test fun `meio-tom cai pro lado certo do limiar`() {
        val cinzaClaro = 0xFFC0C0C0.toInt()
        val cinzaEscuro = 0xFF404040.toInt()
        assertEquals(0, EtiquetaLayout.empacotar(intArrayOf(cinzaClaro), 1, 1)[0].toInt())
        assertEquals(0b1000_0000, EtiquetaLayout.empacotar(intArrayOf(cinzaEscuro), 1, 1)[0].toInt() and 0xFF)
    }

    // ── Dados da etiqueta ────────────────────────────────────────────────────

    @Test fun `rodape junta data e responsavel, e some quando nao ha nem um nem outro`() {
        assertEquals(
            "04/08 18:57 · João",
            DadosEtiqueta(CODIGO, "MDF", data = "04/08 18:57", responsavel = "João").rodape,
        )
        assertEquals("João", DadosEtiqueta(CODIGO, "MDF", responsavel = "João").rodape)
        assertNull(DadosEtiqueta(CODIGO, "MDF").rodape)
        assertNull(DadosEtiqueta(CODIGO, "MDF", responsavel = "  ", data = "").rodape)
    }
}
