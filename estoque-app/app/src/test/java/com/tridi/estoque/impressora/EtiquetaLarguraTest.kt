package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// ── A largura ajustável ──────────────────────────────────────────────────────
//
// Até aqui a etiqueta tinha UMA largura possível (576 pontos) e nada nesta
// aritmética podia dar errado por causa dela. Com a largura ajustável entra uma
// física que a altura não tinha:
//
//  · o código de barras se DIMENSIONA, não se estica — o módulo é um número
//    inteiro de pontos, e o menor que a cabeça térmica queima é UM;
//  · logo existe uma largura abaixo da qual o código simplesmente NÃO CABE, e
//    "não cabe" aqui quer dizer barra cortada na borda do papel.
//
// Barra cortada não é código incompleto: é código que escaneia OUTRA COISA. A
// etiqueta sai bonita, alguém cola na peça, e o defeito aparece semanas depois
// quando o leitor devolve um número que não existe no ERP. Cada teste aqui vale
// um lote que não foi impresso assim.
//
// COM O EMPILHADO a largura ganhou um segundo trabalho: ela é quem dá módulo às
// barras. No desenho de colunas o código ficava preso a 60% da largura útil, e
// alargar a tira quase não engordava a barra; agora cada milímetro a mais é
// milímetro de barra.
class EtiquetaLarguraTest {

    private val CODIGO = "MDF6MM-BR-18-000042"

    /** Um código de prateleira — cabe nas tiras estreitas, onde o texto aperta. */
    private val CURTO = "GAL-A3"

    /** A faixa inteira que a tela oferece, de milímetro em milímetro. */
    private val TODAS_AS_LARGURAS = EtiquetaLayout.LARGURA_MINIMA_MM..EtiquetaLayout.LARGURA_MAXIMA_MM

    private fun layout(
        larguraMm: Int,
        temLocal: Boolean = true,
        ehCaixa: Boolean = false,
        codigo: String = CODIGO,
    ) = EtiquetaLayout.montar(
        codigo, temLocal = temLocal, ehCaixa = ehCaixa,
        larguraPontos = EtiquetaLayout.pontosDaLargura(larguraMm),
    )

    /** As larguras em que ESTE código cabe — as outras são recusa, não layout. */
    private fun largurasQueAceitam(codigo: String = CODIGO) =
        TODAS_AS_LARGURAS.filter {
            EtiquetaLayout.problemaDaLargura(codigo, EtiquetaLayout.pontosDaLargura(it)) == null
        }

    /** Todas as vagas de texto que o layout entregou, na ordem da tira. */
    private fun vagas(l: EtiquetaLayout.LayoutEtiqueta) = listOfNotNull(
        l.faixaNome, l.faixaCorDimensoes, l.faixaLocal, l.faixaSelo,
        l.faixaCodigoLegivel, l.faixaDetalheDoLocal, l.faixaRodape,
    )

    // ── O padrão ─────────────────────────────────────────────────────────────

    @Test fun `72mm continua sendo o padrao, e ele imprime a etiqueta cheia`() {
        assertEquals(72, EtiquetaLayout.LARGURA_PADRAO_MM)
        assertEquals(576, EtiquetaLayout.pontosDaLargura(EtiquetaLayout.LARGURA_PADRAO_MM))

        val padrao = EtiquetaLayout.montar(CODIGO, temLocal = true)
        val explicito = layout(72)
        assertEquals(padrao.faixaNome, explicito.faixaNome)
        assertEquals(padrao.faixaCorDimensoes, explicito.faixaCorDimensoes)
        assertEquals(padrao.faixaLocal, explicito.faixaLocal)
        assertEquals(padrao.moduloPontos, explicito.moduloPontos)
        assertEquals(emptyList<EtiquetaLayout.Peca>(), padrao.naoCoube)
    }

    @Test fun `largura fora da faixa e presa na faixa, nunca aceita crua`() {
        assertEquals(EtiquetaLayout.LARGURA_MINIMA_MM * 8, EtiquetaLayout.pontosDaLargura(3))
        assertEquals(EtiquetaLayout.LARGURA_MAXIMA_MM * 8, EtiquetaLayout.pontosDaLargura(900))
        // E pelo `montar` também: pedir 90mm não imprime 90mm — o excedente
        // não sai, em silêncio, e a pessoa só descobre no papel.
        assertEquals(576, EtiquetaLayout.montar(CODIGO, temLocal = true, larguraPontos = 900).larguraPontos)
    }

    // ── A recusa ─────────────────────────────────────────────────────────────

    @Test fun `codigo que nao cabe na largura e RECUSADO com frase, nao impresso torto`() {
        val estreita = EtiquetaLayout.pontosDaLargura(30)
        val frase = EtiquetaLayout.problemaDaLargura(CODIGO, estreita)
        assertNotNull("30mm devia recusar um código de 19 caracteres", frase)
        assertTrue(frase!!, frase.contains("pede"))
        assertTrue(frase, frase.contains("Aumente a largura ou encurte o código"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `montar se recusa a desenhar o que nao cabe`() {
        // Mesmo tratamento do caractere fora do Code128-B: recusa na porta, em
        // vez de devolver um desenho com as barras vazando o papel.
        layout(30)
    }

    @Test fun `codigo curto cabe onde o comprido nao cabe`() {
        assertNull(EtiquetaLayout.problemaDaLargura("A3", EtiquetaLayout.pontosDaLargura(30)))
        assertNotNull(EtiquetaLayout.problemaDaLargura(CODIGO, EtiquetaLayout.pontosDaLargura(30)))
    }

    @Test fun `o teto de caracteres cresce com a largura, e e honesto nas duas pontas`() {
        val teto40 = EtiquetaLayout.maxCaracteresDoCodigo(EtiquetaLayout.pontosDaLargura(40))
        val teto72 = EtiquetaLayout.maxCaracteresDoCodigo(EtiquetaLayout.pontosDaLargura(72))
        assertTrue("$teto40 → $teto72", teto72 > teto40)
        // Exatamente no teto passa; um caractere a mais, não. Um teto que mente
        // pra qualquer um dos lados é pior que teto nenhum.
        assertNull(EtiquetaLayout.problemaDaLargura("A".repeat(teto40), EtiquetaLayout.pontosDaLargura(40)))
        assertNotNull(EtiquetaLayout.problemaDaLargura("A".repeat(teto40 + 1), EtiquetaLayout.pontosDaLargura(40)))
    }

    @Test fun `o piso do modulo continua UM ponto - e um ponto e o que a cabeca queima`() {
        // O ALVO subiu pra 2, e quem o alcança é o desenho empilhado, não esta
        // constante. Ela é a regra de RECUSA: subi-la pra 2 apagaria do catálogo
        // todo código com mais de 20 caracteres, e etiqueta que não sai é pior
        // que etiqueta borrada.
        assertEquals(1, EtiquetaLayout.MODULO_MINIMO_PONTOS)
        assertEquals(2, EtiquetaLayout.MODULO_ALVO_PONTOS)
        largurasQueAceitam().forEach { mm ->
            assertTrue("$mm mm", layout(mm).moduloPontos >= EtiquetaLayout.MODULO_MINIMO_PONTOS)
        }
    }

    @Test fun `o modulo cresce com a largura, e a 72mm chega no alvo`() {
        // A promessa do empilhado: cada milímetro de tira vira milímetro de
        // barra, porque não há mais teto de 60%.
        largurasQueAceitam().zipWithNext().forEach { (menor, maior) ->
            assertTrue(
                "$menor mm dava ${layout(menor).moduloPontos} e $maior mm dá ${layout(maior).moduloPontos}",
                layout(maior).moduloPontos >= layout(menor).moduloPontos,
            )
        }
        assertTrue("a 72mm o código do galpão tinha de chegar no alvo", layout(72).moduloNoAlvo)
    }

    // ── Quem cede quando aperta ──────────────────────────────────────────────

    @Test fun `apertando, o detalhe da prateleira cede antes da cor, e a cor antes do local`() {
        // A ordem está escrita no enum `Peca`, e é o que os três degraus abaixo
        // fixam. "C3 · B2" se acha andando dois metros; a cor se confere
        // olhando a peça; o local é a última coisa que o mundo ainda repete.
        val setentaEDois = layout(72)
        assertTrue("a 72mm cabe tudo", setentaEDois.naoCoube.none { it.porLargura })

        val sessenta = layout(60)
        assertEquals(listOf(EtiquetaLayout.Peca.DETALHE_DO_LOCAL), sessenta.naoCoube.filter { it.porLargura })
        assertNotNull("a cor ficou", sessenta.faixaCorDimensoes)
        assertNotNull("o local ficou", sessenta.faixaLocal)

        // Pra ver a COR ceder é preciso um código CURTO: com o do galpão a tira
        // é recusada por largura antes de o texto apertar. É a ordem certa —
        // barra cortada escaneia outra coisa, texto cortado só informa menos.
        val curtoA30 = layout(30, codigo = CURTO)
        assertEquals(
            listOf(EtiquetaLayout.Peca.DETALHE_DO_LOCAL, EtiquetaLayout.Peca.COR_DIMENSOES),
            curtoA30.naoCoube.filter { it.porLargura },
        )
        assertNull("a cor saiu", curtoA30.faixaCorDimensoes)
        assertNotNull("mas o local ficou", curtoA30.faixaLocal)

        // E o LOCAL só cede no último aperto: tira estreita COM selo, onde o
        // quadro do lacre já levou 10mm e o nome não caberia ao lado dele.
        val curtoCaixa = layout(25, codigo = CURTO, ehCaixa = true)
        assertTrue(curtoCaixa.naoCoube.contains(EtiquetaLayout.Peca.LOCAL))
        assertNull(curtoCaixa.faixaLocal)
        assertNotNull("o selo, esse nunca cede", curtoCaixa.faixaSelo)
        assertTrue(curtoCaixa.faixaNome.largura >= EtiquetaLayout.LARGURA_MINIMA_DO_NOME)
    }

    @Test fun `o nome NUNCA cede por largura - ele e as barras sao a etiqueta`() {
        // No desenho de colunas o nome disputava largura com as barras e havia
        // tiras em que ele não cabia ("nesta largura não cabe o nome ao lado das
        // barras"). Empilhado essa disputa não existe mais.
        largurasQueAceitam().forEach { mm ->
            listOf(true, false).forEach { caixa ->
                val l = layout(mm, ehCaixa = caixa)
                assertTrue(
                    "$mm mm (caixa=$caixa): nome com ${l.faixaNome.largura} pontos",
                    l.faixaNome.largura >= EtiquetaLayout.LARGURA_MINIMA_DO_NOME,
                )
            }
        }
    }

    @Test fun `o selo da caixa nunca cede - o numero do lacre nao tem outro lugar no mundo`() {
        // Uma etiqueta pode valer 50 peças, e quem pega a caixa na prateleira
        // não confere isso sem romper o lacre. No empilhado ele tem vaga própria
        // encostada na borda, então nem a tira mais estreita o expulsa.
        largurasQueAceitam().forEach { mm ->
            val l = layout(mm, ehCaixa = true)
            assertNotNull("$mm mm: o selo sumiu", l.faixaSelo)
            assertNotNull("$mm mm: sem linha de base pro selo", l.baseSelo)
        }
    }

    @Test fun `o aviso separa o que a ALTURA come do que a LARGURA come`() {
        // Dizer "nesta altura não cabe o local" mandaria a pessoa mexer no
        // número errado: ela aumentaria a altura, nada mudaria, e a conclusão
        // seria que o ajuste não funciona.
        val aviso = layout(60).aviso!!
        assertTrue(aviso, aviso.contains("Nesta largura não cabe o detalhe da prateleira."))

        // A 30mm a COR cede por largura; a 15mm a faixa do pé cede por altura.
        // As duas frases têm de sair, cada uma apontando pro seu botão.
        val dosDois = EtiquetaLayout.montar(
            CURTO, temLocal = true, alturaMm = 15,
            larguraPontos = EtiquetaLayout.pontosDaLargura(30),
        ).aviso!!
        assertTrue(dosDois, dosDois.contains("Nesta altura não cabe"))
        assertTrue(dosDois, dosDois.contains("Nesta largura não cabe"))
    }

    @Test fun `largura cheia nunca avisa nada sobre largura`() {
        val l = layout(72, ehCaixa = true)
        assertTrue(l.naoCoube.none { it.porLargura })
    }

    // ── Nada vaza o papel, em largura nenhuma ────────────────────────────────

    @Test fun `nenhuma tinta e desenhada fora do papel, em largura nenhuma`() {
        // O teste que vale o exercício. Uma vaga calculada com sinal trocado não
        // aparece na tela do tablet: aparece como etiqueta com a borda direita
        // faltando, num lote de 40 peças já coladas.
        largurasQueAceitam().forEach { mm ->
            listOf(true, false).forEach { caixa ->
                listOf(true, false).forEach { temLocal ->
                    val l = layout(mm, temLocal = temLocal, ehCaixa = caixa)
                    val caso = "$mm mm, caixa=$caixa, local=$temLocal"
                    val direita = l.larguraPontos - l.margem

                    vagas(l).forEach {
                        assertTrue("$caso: vaga em ${it.x} começa antes da margem", it.x >= l.margem)
                        assertTrue("$caso: vaga termina em ${it.fim}, além de $direita", it.fim <= direita)
                    }
                    // E nenhuma vaga da MESMA faixa invade a vizinha.
                    listOfNotNull(l.faixaNome, l.faixaCorDimensoes, l.faixaLocal, l.faixaSelo)
                        .zipWithNext().forEach { (a, b) ->
                            assertTrue("$caso: vaga em ${b.x} invade a que acaba em ${a.fim}", a.fim <= b.x)
                        }
                    listOfNotNull(l.faixaCodigoLegivel, l.faixaDetalheDoLocal, l.faixaRodape)
                        .zipWithNext().forEach { (a, b) ->
                            assertTrue("$caso: pé em ${b.x} invade o que acaba em ${a.fim}", a.fim <= b.x)
                        }
                    l.barras.forEach { barra ->
                        assertTrue("$caso: barra antes da margem", barra.x >= l.margem)
                        assertTrue("$caso: barra vaza o papel", barra.x + barra.largura <= direita)
                    }
                }
            }
        }
    }

    @Test fun `as barras ficam dentro da propria faixa em qualquer largura`() {
        largurasQueAceitam().forEach { mm ->
            val l = layout(mm)
            val primeira = l.barras.first()
            val ultima = l.barras.last()
            assertEquals("$mm mm", l.faixaBarras.x + Code128.ZONA_QUIETA * l.moduloPontos, primeira.x)
            assertTrue(
                "$mm mm: última barra vaza a faixa",
                ultima.x + ultima.largura <= l.faixaBarras.fim - Code128.ZONA_QUIETA * l.moduloPontos,
            )
        }
    }

    @Test fun `a faixa das barras e sempre um multiplo exato do modulo`() {
        largurasQueAceitam().forEach { mm ->
            val l = layout(mm)
            assertEquals("$mm mm", 0, l.faixaBarras.largura % l.moduloPontos)
            assertEquals("$mm mm", Code128.totalDeModulos(CODIGO) * l.moduloPontos, l.faixaBarras.largura)
        }
    }

    @Test fun `alargar a etiqueta nunca TIRA uma peca dela`() {
        // A monotonicidade que de fato importa, e que custou um degrau real: a
        // primeira versão desta conta perguntava se as vagas cabiam somando os
        // mínimos, mas repartia na proporção — e havia largura em que a
        // proporção dava a uma delas menos que o mínimo dela. O efeito era uma
        // etiqueta que PIORAVA ao ser alargada de um milímetro.
        listOf(true, false).forEach { caixa ->
            largurasQueAceitam().zipWithNext().forEach { (menor, maior) ->
                val antes = layout(menor, ehCaixa = caixa).naoCoube.filter { it.porLargura }.toSet()
                val depois = layout(maior, ehCaixa = caixa).naoCoube.filter { it.porLargura }.toSet()
                assertTrue(
                    "caixa=$caixa: $menor mm perdia $antes e $maior mm perde $depois",
                    antes.containsAll(depois),
                )
            }
        }
    }

    @Test fun `com as mesmas pecas na etiqueta, mais largura e mais nome`() {
        // Dentro de um mesmo degrau a conta tem de ser crescente. Junto com o
        // teste acima, isso fecha a promessa: aumentar a largura ou traz uma
        // vaga de volta, ou dá mais espaço — nunca menos.
        listOf(true, false).forEach { caixa ->
            largurasQueAceitam().zipWithNext().forEach { (menor, maior) ->
                val a = layout(menor, ehCaixa = caixa)
                val b = layout(maior, ehCaixa = caixa)
                if (a.naoCoube.filter { it.porLargura } != b.naoCoube.filter { it.porLargura }) return@forEach
                assertTrue(
                    "caixa=$caixa: nome ${a.faixaNome.largura} a $menor mm virou ${b.faixaNome.largura} a $maior mm",
                    b.faixaNome.largura >= a.faixaNome.largura,
                )
            }
        }
    }

    @Test fun `a vaga do local e RESERVA FIXA, e cabe o que ela promete`() {
        // Ao contrário do nome e da cor, o tamanho do local não depende do
        // cadastro: "GAL-A" tem cinco caracteres por construção (8,9mm) e
        // "GAL-A · C3 · B2" tem quinze (21mm). Por isso ele sai da conta ANTES
        // da proporção — repartido por peso, a 56mm a fatia dele caía abaixo do
        // mínimo e derrubava a COR junto, que é a ordem de sacrifício ao
        // contrário.
        largurasQueAceitam().forEach { mm ->
            listOf(true, false).forEach { caixa ->
                val l = layout(mm, ehCaixa = caixa)
                val caso = "$mm mm (caixa=$caixa)"
                l.faixaLocal?.let {
                    assertEquals("$caso: a vaga do local", EtiquetaLayout.LARGURA_DO_LOCAL, it.largura)
                }
                l.faixaCorDimensoes?.let {
                    assertTrue("$caso: cor com ${it.largura} pontos", it.largura >= EtiquetaLayout.LARGURA_MINIMA_DA_COR)
                }
                assertTrue(
                    "$caso: nome com ${l.faixaNome.largura} pontos",
                    l.faixaNome.largura >= EtiquetaLayout.LARGURA_MINIMA_DO_NOME,
                )
            }
        }
    }

    @Test fun `o detalhe da prateleira nunca sai pela metade - ou tem os 9,6mm dele, ou nao sai`() {
        // "C3 · B…" impresso manda procurar numa baia que não existe, e é por
        // isso que ele é o único da faixa do pé com direito a desistir: o código
        // escrito e o horário cortam com reticências sem enganar ninguém.
        largurasQueAceitam().forEach { mm ->
            val l = layout(mm)
            l.faixaDetalheDoLocal?.let {
                assertTrue(
                    "$mm mm: detalhe com ${it.largura} pontos",
                    it.largura >= EtiquetaLayout.LARGURA_MINIMA_DO_DETALHE,
                )
            }
        }
        // A 72mm ele cabe; a 60 já não — e a tela diz qual dos dois botões mexer.
        assertTrue("a 72mm o detalhe cabe", layout(72).mostraDetalheDoLocal)
        assertFalse("a 60mm não", layout(60).mostraDetalheDoLocal)
        assertTrue(layout(60).aviso!!, layout(60).aviso!!.contains("Nesta largura não cabe o detalhe da prateleira"))
    }

    @Test fun `sem local nao existe detalhe - C3 · B2 sozinho nao quer dizer nada`() {
        largurasQueAceitam().forEach { mm ->
            val l = layout(mm, temLocal = false)
            assertNull("$mm mm", l.faixaDetalheDoLocal)
            assertFalse("$mm mm", l.naoCoube.contains(EtiquetaLayout.Peca.DETALHE_DO_LOCAL))
        }
    }
}
