package com.tridi.estoque.scan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BipagemStateTest {
    private val codigoA = "MDF6MM-BR-18-000042"
    private val codigoB = "MDF6MM-BR-18-000043"

    @Test fun `leitura valida entra na pilha`() {
        val r = registrarLeitura(PilhaBipagem(), codigoA) as LeituraResultado.Aceita
        assertEquals(listOf(codigoA), r.pilha.codigos)
        assertEquals(codigoA, r.codigo)
    }

    @Test fun `codigo malformado nao entra na pilha`() {
        val r = registrarLeitura(PilhaBipagem(), "sem-grupo-numerico-no-fim-ABC")
        assertTrue(r is LeituraResultado.Malformada)
    }

    @Test fun `mesmo codigo bipado duas vezes entra uma vez so`() {
        val pilha = (registrarLeitura(PilhaBipagem(), codigoA) as LeituraResultado.Aceita).pilha
        val r = registrarLeitura(pilha, codigoA)
        assertTrue(r is LeituraResultado.Duplicada)
        assertEquals(1, pilha.codigos.size)
    }

    @Test fun `lote acumula codigos diferentes na ordem lida`() {
        var pilha = PilhaBipagem()
        pilha = (registrarLeitura(pilha, codigoA) as LeituraResultado.Aceita).pilha
        pilha = (registrarLeitura(pilha, codigoB) as LeituraResultado.Aceita).pilha
        assertEquals(listOf(codigoA, codigoB), pilha.codigos)
    }

    @Test fun `leitura com espacos em volta e normalizada antes de validar`() {
        val r = registrarLeitura(PilhaBipagem(), "  $codigoA  ") as LeituraResultado.Aceita
        assertEquals(codigoA, r.codigo)
    }

    @Test fun `remover tira so o codigo indicado, preserva o resto`() {
        val pilha = removerLeitura(PilhaBipagem(listOf(codigoA, codigoB)), codigoA)
        assertEquals(listOf(codigoB), pilha.codigos)
    }

    // ── O teto do lote ───────────────────────────────────────────────────────
    //
    // O servidor recusa acima de 200 códigos com 400 `lote_grande`, e 4xx de
    // conteúdo é falha DEFINITIVA: o lote nunca mais é reenviado. Sem o teto
    // aqui, a 201ª peça esvaziava a pilha com ar de sucesso e 201 peças
    // deixavam de baixar do estoque em silêncio.

    private fun codigo(n: Int) = "MDF6MM-BR-18-%06d".format(n)

    private fun pilhaCom(quantas: Int) = PilhaBipagem((1..quantas).map(::codigo))

    @Test fun `o teto do app e o mesmo do servidor`() {
        assertEquals(200, LOTE_MAXIMO)
    }

    @Test fun `a ultima peca que cabe ainda entra`() {
        val r = registrarLeitura(pilhaCom(LOTE_MAXIMO - 1), codigo(LOTE_MAXIMO))
        assertTrue(r is LeituraResultado.Aceita)
        assertEquals(LOTE_MAXIMO, (r as LeituraResultado.Aceita).pilha.codigos.size)
    }

    @Test fun `a peca seguinte e recusada com o teto no aviso`() {
        val r = registrarLeitura(pilhaCom(LOTE_MAXIMO), codigo(LOTE_MAXIMO + 1))
        assertTrue(r is LeituraResultado.Cheia)
        assertEquals(LOTE_MAXIMO, (r as LeituraResultado.Cheia).maximo)
    }

    // O dedupe vem ANTES do teto: rebipar uma peça que já está na pilha não
    // acrescenta nada, então chamar isso de "lote cheio" faria a pessoa
    // confirmar um lote por causa de uma leitura que nem contava.
    @Test fun `com a pilha cheia, rebipar uma peca que ja esta la continua sendo duplicada`() {
        val r = registrarLeitura(pilhaCom(LOTE_MAXIMO), codigo(1))
        assertTrue(r is LeituraResultado.Duplicada)
    }

    // E código malformado continua sendo malformado — a peça é que está errada,
    // não o tamanho do lote.
    @Test fun `com a pilha cheia, codigo malformado ainda e malformado`() {
        val r = registrarLeitura(pilhaCom(LOTE_MAXIMO), "isto-nao-e-etiqueta")
        assertTrue(r is LeituraResultado.Malformada)
    }

    // ── A frase que a tela mostra ────────────────────────────────────────────

    @Test fun `leitura aceita e leitura duplicada nao geram aviso`() {
        assertEquals(null, avisoDaLeitura(registrarLeitura(PilhaBipagem(), codigoA)))
        val pilha = (registrarLeitura(PilhaBipagem(), codigoA) as LeituraResultado.Aceita).pilha
        assertEquals(null, avisoDaLeitura(registrarLeitura(pilha, codigoA)))
    }

    @Test fun `o aviso de codigo invalido mostra o codigo lido`() {
        val aviso = avisoDaLeitura(registrarLeitura(PilhaBipagem(), "isto-nao-e-etiqueta"))
        assertTrue(aviso!!.contains("isto-nao-e-etiqueta"))
    }

    // Lote cheio e código inválido pedem reações opostas — confirmar o lote ou
    // separar a peça. Uma frase que servisse pros dois não serve pra nenhum.
    @Test fun `o aviso de lote cheio diz o que fazer, e nao fala em codigo invalido`() {
        val aviso = avisoDaLeitura(registrarLeitura(pilhaCom(LOTE_MAXIMO), codigo(LOTE_MAXIMO + 1)))!!
        assertTrue(aviso.contains("200"))
        assertTrue(aviso.contains("Confirme"))
        assertTrue(!aviso.contains("inválido"))
    }

    // ── A pilha conta ETIQUETAS, e tem que dizer isso ────────────────────────
    //
    // Desde a caixa lacrada, uma etiqueta pode valer 50 peças
    // (`estoque_unidades.quantidade`). O tablet só tem os CÓDIGOS na mão —
    // `PilhaBipagem` não guarda quantidade e o tamanho da caixa mora no
    // servidor —, então todo número que ele mostra sobre a pilha é contagem de
    // etiqueta. Chamar isso de "peça" faz quem bipou 3 caixas de 50 ler "3
    // peças" e confirmar achando que tirou 3 folhas da prateleira, quando saíram
    // 150. É o mesmo erro que a recontagem do banco quase teve com `count(*)`,
    // só que na tela.

    @Test fun `a pilha e contada em etiquetas, no singular e no plural`() {
        assertEquals("1 etiqueta", fraseDeEtiquetas(1))
        assertEquals("3 etiquetas", fraseDeEtiquetas(3))
        assertEquals("0 etiquetas", fraseDeEtiquetas(0))
    }

    @Test fun `nenhuma frase da pilha chama etiqueta de peca`() {
        // O teto do lote conta CÓDIGOS por chamada (LOTE_MAXIMO_BAIXA do
        // servidor), não peças: 200 etiquetas podem ser 10.000 folhas.
        val cheia = avisoDaLeitura(registrarLeitura(pilhaCom(LOTE_MAXIMO), codigo(LOTE_MAXIMO + 1)))!!
        assertTrue("o aviso de lote cheio não pode falar em peça: $cheia", !cheia.contains("peça"))
        assertTrue("o aviso de lote cheio precisa dizer etiqueta: $cheia", cheia.contains("etiqueta"))
        for (n in listOf(0, 1, 2, 50)) {
            assertTrue("fraseDeEtiquetas($n) não pode falar em peça", !fraseDeEtiquetas(n).contains("peça"))
        }
    }

    // ── O estado vazio da tela ───────────────────────────────────────────────
    //
    // Com a pistola desligada, a promessa mais confiante da tela ("Cada leitura
    // aparece aqui na hora") é justamente a que não se cumpre — e a pessoa fica
    // encostando a peça concluindo que o sistema quebrou.

    @Test fun `com leitor, a tela instrui`() {
        val vazio = estadoVazioDaBipagem(leitorConectado = true)
        assertTrue(vazio.titulo.contains("pistola"))
        assertTrue(!vazio.alerta)
    }

    @Test fun `sem leitor, o aviso SUBSTITUI a instrucao em vez de se somar a ela`() {
        val vazio = estadoVazioDaBipagem(leitorConectado = false)
        assertTrue(vazio.alerta)
        assertTrue(vazio.titulo.contains("Nenhum leitor"))
        // A promessa que não se cumpre não pode continuar na tela.
        assertTrue(!vazio.detalhe.contains("aparece aqui"))
        // E o aviso tem que apontar pra saída: ligar a pistola ou parear.
        assertTrue(vazio.detalhe.contains("Manutenção"))
    }

    // ── O tamanho de um lote guardado na fila ────────────────────────────────

    @Test fun `conta os codigos de um lote serializado`() {
        assertEquals(2, contarCodigosDoLote("""["$codigoA","$codigoB"]"""))
        assertEquals(0, contarCodigosDoLote("[]"))
    }

    @Test fun `json quebrado devolve zero em vez de derrubar a tela`() {
        assertEquals(0, contarCodigosDoLote("nao é json"))
        assertEquals(0, contarCodigosDoLote(""))
        assertEquals(0, contarCodigosDoLote("""{"codigos":1}"""))
    }

    // ── O rascunho que sobrevive ao tablet morrer ────────────────────────────

    private val agora = 1_700_000_000_000L
    private fun horas(n: Long) = n * 3_600_000L
    private fun guardada(codigo: String, dono: String = "ana", ha: Long = 0) =
        LeituraGuardada(codigo, dono, agora - ha)

    @Test fun `a pilha da propria pessoa volta pra tela`() {
        val destino = destinoDoRascunho(
            listOf(guardada(codigoA), guardada(codigoB)),
            quemEntrou = "ana",
            agora = agora,
        )
        assertEquals(listOf(codigoA, codigoB), destino.restaurar)
        assertTrue(destino.descartar.isEmpty())
    }

    // Mesma razão de `endJourney` zerar a pilha: quem entra agora assinaria uma
    // baixa que não bipou.
    @Test fun `a pilha de outra pessoa nao volta pra tela`() {
        val destino = destinoDoRascunho(listOf(guardada(codigoA, dono = "ana")), "bruno", agora)
        assertTrue(destino.restaurar.isEmpty())
    }

    // E também NÃO some: quem só foi almoçar reencontra as 40 etiquetas.
    @Test fun `a pilha de outra pessoa tambem nao e apagada`() {
        val destino = destinoDoRascunho(listOf(guardada(codigoA, dono = "ana")), "bruno", agora)
        assertTrue(destino.descartar.isEmpty())
    }

    @Test fun `depois a dona volta e reencontra a pilha dela`() {
        val guardadas = listOf(guardada(codigoA, dono = "ana"), guardada(codigoB, dono = "bruno"))
        assertEquals(listOf(codigoA), destinoDoRascunho(guardadas, "ana", agora).restaurar)
        assertEquals(listOf(codigoB), destinoDoRascunho(guardadas, "bruno", agora).restaurar)
    }

    // Restaurar leitura de ontem é pior que perdê-la: o carimbo da baixa nasce
    // na hora do Confirmar, e o material já não está mais na mão da pessoa.
    @Test fun `rascunho velho e descartado, nao restaurado`() {
        val destino = destinoDoRascunho(listOf(guardada(codigoA, ha = horas(13))), "ana", agora)
        assertTrue(destino.restaurar.isEmpty())
        assertEquals(listOf(codigoA), destino.descartar)
    }

    // O velho some seja de quem for — senão o rascunho de quem entrou de férias
    // fica no banco pra sempre.
    @Test fun `rascunho velho de outra pessoa tambem e descartado`() {
        val destino = destinoDoRascunho(listOf(guardada(codigoA, dono = "ana", ha = horas(30))), "bruno", agora)
        assertEquals(listOf(codigoA), destino.descartar)
    }

    @Test fun `o turno inteiro ainda cabe dentro da validade`() {
        val destino = destinoDoRascunho(listOf(guardada(codigoA, ha = horas(11))), "ana", agora)
        assertEquals(listOf(codigoA), destino.restaurar)
    }

    // A ordem é a das leituras: é a que a tela desenha e a que a pessoa
    // reconhece ao voltar.
    @Test fun `a pilha volta na ordem em que foi bipada`() {
        val destino = destinoDoRascunho(
            listOf(guardada(codigoB, ha = horas(1)), guardada(codigoA, ha = horas(2))),
            "ana",
            agora,
        )
        assertEquals(listOf(codigoA, codigoB), destino.restaurar)
    }

    // O servidor recusa o lote inteiro acima do teto, com 400 — falha
    // DEFINITIVA. Um rascunho gordo não pode reabrir esse buraco.
    @Test fun `o rascunho restaurado respeita o teto do lote`() {
        val muitas = (1..LOTE_MAXIMO + 30).map { guardada("MDF6MM-BR-18-%06d".format(it), ha = it.toLong()) }
        assertEquals(LOTE_MAXIMO, destinoDoRascunho(muitas, "ana", agora).restaurar.size)
    }

    @Test fun `rascunho vazio nao inventa pilha nem descarte`() {
        val destino = destinoDoRascunho(emptyList(), "ana", agora)
        assertTrue(destino.restaurar.isEmpty())
        assertTrue(destino.descartar.isEmpty())
    }

    // Relógio do tablet andando pra trás (NTP, troca de fuso) não pode fazer a
    // pilha de agora parecer velha.
    @Test fun `leitura com carimbo no futuro continua sendo do turno`() {
        val destino = destinoDoRascunho(listOf(guardada(codigoA, ha = -horas(2))), "ana", agora)
        assertEquals(listOf(codigoA), destino.restaurar)
    }
}
