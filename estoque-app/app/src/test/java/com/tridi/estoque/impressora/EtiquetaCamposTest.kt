package com.tridi.estoque.impressora

import com.tridi.estoque.impressora.EtiquetaLayout.CampoEtiqueta
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// ── O escritório escolhe o que vai impresso ──────────────────────────────────
//
// A promessa que estes testes guardam é uma só, e é o que distingue isto de
// "mais um interruptor": DESLIGAR UM CAMPO DEVOLVE ESPAÇO. Se um dia alguém
// mexer no layout e essa relação sumir, a feature vira preferência decorativa e
// ninguém percebe — o papel continua saindo.
class EtiquetaCamposTest {

    private val CODIGO = "MDF6MM-BR-18-000042"

    private fun layout(
        alturaMm: Int = EtiquetaLayout.ALTURA_PADRAO_MM,
        ocultos: Set<CampoEtiqueta> = emptySet(),
        temLocal: Boolean = true,
        ehCaixa: Boolean = false,
    ) = EtiquetaLayout.montar(
        CODIGO, temLocal = temLocal, ehCaixa = ehCaixa, alturaMm = alturaMm, ocultos = ocultos,
    )

    private val TODAS_AS_ALTURAS = EtiquetaLayout.ALTURA_MINIMA_MM..EtiquetaLayout.ALTURA_MAXIMA_MM

    // ── A trava principal: nada muda pra quem não mexeu ──────────────────────

    @Test fun `sem nada desligado a etiqueta e EXATAMENTE a de antes`() {
        // O galpão inteiro está neste caso hoje. Qualquer diferença aqui é uma
        // etiqueta que mudou de desenho sem ninguém ter pedido.
        TODAS_AS_ALTURAS.forEach { mm ->
            listOf(true, false).forEach { caixa ->
                val semOcultos = layout(alturaMm = mm, ehCaixa = caixa)
                val padrao = EtiquetaLayout.montar(
                    CODIGO, temLocal = true, ehCaixa = caixa, alturaMm = mm,
                )
                assertEquals("$mm mm, caixa=$caixa", padrao, semOcultos)
            }
        }
    }

    @Test fun `os degraus da faixa do pe sao dois - ela cabe, ou nao cabe`() {
        // No empilhado a altura tem UM eixo só, e ele é binário: a faixa do pé
        // cabe (e leva código escrito e data) ou não cabe (e os 27 pontos dela
        // viram barra). A escada de quatro degraus da coluna 1 morreu com as
        // colunas — medido aqui pra que ninguém a "conserte" achando que sumiu
        // por descuido.
        val alcancaveis = TODAS_AS_ALTURAS.map { mm ->
            val l = layout(alturaMm = mm)
            (l.faixaCodigoLegivel != null) to (l.faixaRodape != null)
        }.distinct().sortedBy { (c, _) -> if (c) 1 else 0 }
        assertEquals(listOf(false to false, true to true), alcancaveis)
    }

    // ── O ganho: desligar devolve espaço ─────────────────────────────────────

    @Test fun `desligar O CODIGO E A DATA devolve a faixa do pe inteira pra BARRA`() {
        // O maior ganho da lista, e a razão de os campos existirem junto com o
        // tamanho personalizado: uma tira baixa continua bipável.
        //
        // MUDOU COM O EMPILHADO, e a mudança é honesta: os dois dividem a mesma
        // linha, então desligar UM não devolve altura nenhuma — a faixa continua
        // de pé por causa do outro. Desligar os DOIS devolve os 27 pontos
        // completos. Prometer o contrário faria a tela mandar desligar um campo
        // que não muda nada.
        val ambos = setOf(CampoEtiqueta.CODIGO_LEGIVEL, CampoEtiqueta.DATA_RESPONSAVEL)
        TODAS_AS_ALTURAS.forEach { mm ->
            val com = layout(alturaMm = mm)
            val soUm = layout(alturaMm = mm, ocultos = setOf(CampoEtiqueta.CODIGO_LEGIVEL))
            val sem = layout(alturaMm = mm, ocultos = ambos)

            assertNull("$mm mm: o código escrito não pode ser desenhado", soUm.faixaCodigoLegivel)
            assertNull("$mm mm: nem o rodapé", sem.faixaRodape)
            assertEquals("$mm mm: só um desligado não mexe na barra", com.alturaBarras, soUm.alturaBarras)
            assertTrue(
                "$mm mm: a barra encolheu (${com.alturaBarras} → ${sem.alturaBarras})",
                sem.alturaBarras >= com.alturaBarras,
            )
            if (com.faixaCodigoLegivel != null) {
                assertEquals(
                    "$mm mm: a faixa do pé tinha de virar barra",
                    EtiquetaLayout.caixaDaLinha(EtiquetaLayout.Fonte.CODIGO_LEGIVEL),
                    sem.alturaBarras - com.alturaBarras,
                )
            }
        }
    }

    @Test fun `a 17mm, desligar o pe inteiro devolve 3,4mm de barra`() {
        // O número que justifica a feature, fixado. 17mm é a menor etiqueta
        // comum que ainda imprime a faixa do pé, e é onde ela custa mais caro: a
        // barra sai raspando o piso de 8mm. Sem a faixa, a mesma tira dá 11,6mm.
        val ambos = setOf(CampoEtiqueta.CODIGO_LEGIVEL, CampoEtiqueta.DATA_RESPONSAVEL)
        val com = layout(alturaMm = 17)
        val sem = layout(alturaMm = 17, ocultos = ambos)
        assertNotNull("17mm ainda imprime a faixa do pé", com.faixaCodigoLegivel)
        assertEquals(8.25f, com.alturaBarrasMm, 0.01f)
        assertEquals(11.625f, sem.alturaBarrasMm, 0.01f)
        assertTrue(sem.barrasLegiveis)
    }

    @Test fun `sem a cor e as dimensoes, o nome fica com a largura dela`() {
        // A promessa em uma frase — e no empilhado ela mudou de EIXO: cor e
        // dimensões custam LARGURA, não altura, porque moram ao lado do nome.
        val com = layout()
        val sem = layout(ocultos = setOf(CampoEtiqueta.COR_DIMENSOES))
        assertNull(sem.faixaCorDimensoes)
        assertTrue(
            "o nome tinha de crescer (${com.faixaNome.largura} → ${sem.faixaNome.largura})",
            sem.faixaNome.largura > com.faixaNome.largura,
        )
    }

    @Test fun `desligar um campo nunca ENCOLHE o que sobrou`() {
        // A varredura que pega o degrau escondido: aliviar a etiqueta não pode
        // piorá-la. Quem desliga um campo e vê o nome encolher conclui que o
        // ajuste está quebrado, e conclui certo.
        val campos = CampoEtiqueta.entries
        TODAS_AS_ALTURAS.forEach { mm ->
            val base = layout(alturaMm = mm)
            campos.forEach { campo ->
                val menos = layout(alturaMm = mm, ocultos = setOf(campo))
                assertTrue(
                    "$mm mm sem $campo: o nome caiu de ${base.faixaNome.largura} " +
                        "pra ${menos.faixaNome.largura}",
                    menos.faixaNome.largura >= base.faixaNome.largura,
                )
                assertTrue(
                    "$mm mm sem $campo: a barra encolheu de ${base.alturaBarras} pra ${menos.alturaBarras}",
                    menos.alturaBarras >= base.alturaBarras,
                )
            }
        }
    }

    // ── "Não coube" ≠ "não foi pedido" ───────────────────────────────────────

    @Test fun `campo desligado NUNCA aparece no aviso do que nao coube`() {
        // A confusão que este teste impede é cara: a tela mandaria aumentar a
        // altura pra recuperar uma linha que ninguém quer, a pessoa aumentaria,
        // nada mudaria, e a conclusão seria que o ajuste não funciona.
        val porCampo = mapOf(
            CampoEtiqueta.COR_DIMENSOES to EtiquetaLayout.Peca.COR_DIMENSOES,
            CampoEtiqueta.DATA_RESPONSAVEL to EtiquetaLayout.Peca.DATA_E_RESPONSAVEL,
            CampoEtiqueta.CODIGO_LEGIVEL to EtiquetaLayout.Peca.CODIGO_LEGIVEL,
            CampoEtiqueta.LOCAL_DETALHE to EtiquetaLayout.Peca.DETALHE_DO_LOCAL,
        )
        TODAS_AS_ALTURAS.forEach { mm ->
            porCampo.forEach { (campo, peca) ->
                val l = layout(alturaMm = mm, ocultos = setOf(campo))
                assertFalse(
                    "$mm mm: desliguei $campo e o aviso ainda reclama de \"${peca.descricao}\"",
                    l.naoCoube.contains(peca),
                )
                l.aviso?.let {
                    assertFalse("$mm mm: \"$it\" cita ${peca.descricao}", it.contains(peca.descricao))
                }
            }
        }
    }

    @Test fun `com tudo desligado a etiqueta baixa para de avisar por altura`() {
        // Uma etiqueta de 14mm com nome, local e barras é uma etiqueta legítima
        // — e com a faixa do pé ligada ela grita duas perdas. Desligando o que
        // ninguém quer, ela simplesmente cabe.
        //
        // 14mm e não 10mm: no empilhado o texto e a barra dividem a MESMA
        // altura, então abaixo do piso do desenho não existe combinação de
        // campos que salve a barra. Isso não é degradação escondida — a tela diz
        // "Barras com 4,6mm", que é o que a etiqueta de colunas nunca disse.
        val tudo = CampoEtiqueta.entries.toSet()
        val l = layout(alturaMm = 14, ocultos = tudo)
        assertNull("o aviso devia sumir, veio: ${l.aviso}", l.aviso)
        assertTrue(l.naoCoube.isEmpty())
        assertTrue("a barra tem de ficar legível", l.barrasLegiveis)
    }

    @Test fun `sem o detalhe da prateleira, o local continua impresso`() {
        // O que se desliga é o "· C3 · B2" colado no local. Perder "GAL-A" junto
        // seria perder a vaga inteira, que é outra coisa e tem outro dono (a
        // largura).
        val l = layout(ocultos = setOf(CampoEtiqueta.LOCAL_DETALHE))
        assertNotNull("o local em si tem de continuar", l.faixaLocal)
        assertFalse("o detalhe é que sai", l.mostraDetalheDoLocal)
    }

    @Test fun `o selo da caixa nao se desliga - e o unico numero que ninguem confere de fora`() {
        // Não há chave pra ele, e é decisão: quantas peças tem dentro de um
        // lacre não está escrito em nenhum outro lugar do mundo.
        val chaves = CampoEtiqueta.entries.map { it.chave }
        assertFalse(chaves.any { it.contains("selo") || it.contains("quantidade") })
        val l = layout(ehCaixa = true, ocultos = CampoEtiqueta.entries.toSet())
        assertNotNull("o selo sobrevive a tudo desligado", l.baseSelo)
    }

    // ── A chave que atravessa banco, servidor e tablet ───────────────────────

    @Test fun `as chaves sao snake_case e batem com o catalogo do servidor`() {
        assertEquals(
            listOf("cor_dimensoes", "data_responsavel", "codigo_legivel", "local_detalhe"),
            CampoEtiqueta.entries.map { it.chave },
        )
    }

    @Test fun `a lista do escritorio e SUBSTITUIDA, nunca acumulada`() {
        // O empacotamento é o mesmo dos SKUs de caixa, e pela mesma razão: uma
        // lista que só cresce faria religar um campo no escritório não ter
        // efeito nenhum no tablet — ele continuaria escondendo pra sempre.
        assertEquals("codigo_legivel\ncor_dimensoes", empacotarSkus(listOf("codigo_legivel", "cor_dimensoes")))
        assertEquals(
            setOf(CampoEtiqueta.CODIGO_LEGIVEL),
            CampoEtiqueta.deChaves(desempacotarSkus("codigo_legivel")),
        )
        // Vazio é "liga tudo de novo", e tem de ser distinguível de "nunca
        // sincronizou" — por isso a string, e não o Set do DataStore.
        assertEquals(emptySet<CampoEtiqueta>(), CampoEtiqueta.deChaves(desempacotarSkus("")))
        assertEquals(emptySet<CampoEtiqueta>(), CampoEtiqueta.deChaves(desempacotarSkus(null)))
    }

    // ── O que o aparelho faz com a ordem do escritório ───────────────────────

    @Test fun `sem ordem do escritorio a etiqueta sai COMPLETA`() {
        // O silêncio do escritório não pode virar campo apagado: um servidor
        // antigo (ou uma resposta torta) não manda a lista, e a tira tem de sair
        // como sempre saiu.
        val config = ConfigImpressora()
        assertEquals(emptySet<CampoEtiqueta>(), config.ocultosDoEscritorio)
        assertFalse(config.camposVemDoEscritorio)
    }

    @Test fun `com ordem do escritorio a tela mostra o que sumiu`() {
        // Campo que some SEM DIZER POR QUÊ lê como impressora falhando: quem
        // está no galpão compara com a etiqueta da semana passada e conclui que
        // quebrou. É a mesma razão do cadeado da altura.
        val config = ConfigImpressora(ocultosDoEscritorio = setOf(CampoEtiqueta.CODIGO_LEGIVEL))
        assertTrue(config.camposVemDoEscritorio)
    }

    @Test fun `chave desconhecida e IGNORADA - o tablet nao para o lote por uma palavra`() {
        // O oposto do servidor, de propósito: aqui não há ninguém pra corrigir.
        // Uma versão futura do ERP mandando um campo novo não pode derrubar a
        // impressão de um galpão offline.
        val lidos = CampoEtiqueta.deChaves(listOf("codigo_legivel", "campo_do_futuro", "  cor_dimensoes  "))
        assertEquals(setOf(CampoEtiqueta.CODIGO_LEGIVEL, CampoEtiqueta.COR_DIMENSOES), lidos)
        assertEquals(emptySet<CampoEtiqueta>(), CampoEtiqueta.deChaves(emptyList()))
    }
}
