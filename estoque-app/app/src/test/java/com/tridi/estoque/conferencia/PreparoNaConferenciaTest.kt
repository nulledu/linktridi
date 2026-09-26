package com.tridi.estoque.conferencia

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * O que a tela PROMETE e o que ela AVISA depois.
 *
 * As duas coisas são texto, e é por isso que elas são testadas: o defeito que
 * este trabalho conserta nunca foi um crash. A tela dizia "este item não é
 * etiquetado — não sai papel" pra um item que podia, sim, ser etiquetado —
 * faltava alguém prepará-lo. Lido como propriedade do item, o gestor ia embora,
 * ninguém preparava nada, e a caixa entrava no estoque sem código colado.
 */
class PreparoNaConferenciaTest {

    private fun preparo(estado: EstadoDeEtiqueta, motivo: String = "") =
        PreparoDoItem(estado, motivo)

    // ── Antes do toque: o rodapé da ficha ────────────────────────────────────

    @Test fun `sem veredito a frase explica os dois lados`() {
        val frase = promessaDaConferencia(null, podeConfirmar = false, nomeDoDestino = null)
        assertTrue(frase.contains("Certo etiqueta a caixa"))
        assertTrue(frase.contains("Errado devolve"))
    }

    @Test fun `errado nunca fala de etiqueta`() {
        val frase = promessaDaConferencia(
            ResultadoConferencia.ERRADO, podeConfirmar = true, nomeDoDestino = "EVA 3 mm",
            preparo = preparo(EstadoDeEtiqueta.JA_ETIQUETADO),
        )
        assertTrue(frase.contains("Nada entra no estoque"))
        assertFalse(frase.contains("etiqueta"))
    }

    @Test fun `certo sem destino escolhido cobra a escolha e lembra que errado nao precisa`() {
        val frase = promessaDaConferencia(
            ResultadoConferencia.CERTO, podeConfirmar = false, nomeDoDestino = null,
        )
        assertTrue(frase.contains("item que você escolher"))
        assertTrue(frase.contains("errado"))
    }

    @Test fun `item etiquetado promete UMA etiqueta`() {
        val frase = promessaDaConferencia(
            ResultadoConferencia.CERTO, podeConfirmar = true, nomeDoDestino = "EVA 3 mm",
            preparo = preparo(EstadoDeEtiqueta.JA_ETIQUETADO),
        )
        assertEquals("Sai UMA etiqueta — a caixa inteira — e o estoque recebe na hora.", frase)
    }

    @Test fun `pilha antiga diz o que fazer, e nomeia a escolha de quem vai preparar`() {
        val frase = promessaDaConferencia(
            ResultadoConferencia.CERTO, podeConfirmar = true, nomeDoDestino = "Alavanca limpa",
            preparo = preparo(EstadoDeEtiqueta.PRECISA_PREPARO),
        )
        assertTrue("a frase precisa dizer que não sai papel", frase.contains("não sai papel"))
        assertTrue("a frase precisa dizer onde as peças entram", frase.contains("Alavanca limpa"))
        // A decisão é de quem está na frente da prateleira — o tablet nomeia as
        // duas saídas em vez de mandar "prepare o item", que não diz nada.
        assertTrue(frase.contains("uma caixa só"))
        assertTrue(frase.contains("cada peça"))
    }

    @Test fun `item zerado manda procurar quem tem acesso — o tablet nao converte nada`() {
        val frase = promessaDaConferencia(
            ResultadoConferencia.CERTO, podeConfirmar = true, nomeDoDestino = "Base PS",
            preparo = preparo(EstadoDeEtiqueta.CONVERTER_AGORA),
        )
        assertTrue(frase.contains("não sai papel"))
        assertTrue("sem poder de ajuste, a frase tem que apontar quem resolve", frase.contains("acesso de ajuste"))
    }

    @Test fun `granel nao manda ninguem preparar nada — nao ha o que preparar`() {
        val frase = promessaDaConferencia(
            ResultadoConferencia.CERTO, podeConfirmar = true, nomeDoDestino = "Cola em galão",
            preparo = preparo(EstadoDeEtiqueta.NAO_ETIQUETAVEL),
        )
        assertTrue(frase.contains("não sai papel"))
        assertFalse("não existe preparo possível aqui", frase.contains("acesso de ajuste"))
        assertTrue(frase.contains("não é defeito"))
    }

    @Test fun `servidor antigo nao regride a tela`() {
        // Sem `preparo` no ar vale o que o tablet sempre soube: a bandeira
        // `serializado` da sugestão. As duas frases são as de antes, palavra por
        // palavra — um servidor velho não pode piorar a tela.
        assertEquals(
            "Sai UMA etiqueta — a caixa inteira — e o estoque recebe na hora.",
            promessaDaConferencia(
                ResultadoConferencia.CERTO, podeConfirmar = true, nomeDoDestino = "EVA 3 mm",
                serializadoDoDestino = true, preparo = null,
            ),
        )
        assertEquals(
            "A quantidade é somada em EVA 3 mm. Este item não é etiquetado — não sai papel.",
            promessaDaConferencia(
                ResultadoConferencia.CERTO, podeConfirmar = true, nomeDoDestino = "EVA 3 mm",
                serializadoDoDestino = false, preparo = null,
            ),
        )
    }

    @Test fun `sem nome do item a frase ainda faz sentido`() {
        // Acontece quando a atividade já aponta o item: não há destino escolhido
        // na tela, e ainda assim a frase precisa dizer para onde vai a peça.
        val frase = promessaDaConferencia(
            ResultadoConferencia.CERTO, podeConfirmar = true, nomeDoDestino = null,
            preparo = preparo(EstadoDeEtiqueta.PRECISA_PREPARO),
        )
        assertTrue(frase.contains("na contagem do estoque"))
        assertFalse("nome vazio não pode virar 'em ' pendurado", frase.contains("em  "))
    }

    // ── O que sai etiqueta, e o que não sai ──────────────────────────────────

    @Test fun `so o item ja etiquetado promete papel`() {
        assertTrue(saiEtiqueta(preparo(EstadoDeEtiqueta.JA_ETIQUETADO), serializadoConhecido = false))
        assertFalse(saiEtiqueta(preparo(EstadoDeEtiqueta.CONVERTER_AGORA), serializadoConhecido = true))
        assertFalse(saiEtiqueta(preparo(EstadoDeEtiqueta.PRECISA_PREPARO), serializadoConhecido = true))
        assertFalse(saiEtiqueta(preparo(EstadoDeEtiqueta.NAO_ETIQUETAVEL), serializadoConhecido = true))
    }

    // ── Depois que a fila subiu: o aviso na lista ────────────────────────────

    @Test fun `com etiqueta na mao nao ha aviso nenhum`() {
        assertFalse(mereceAvisoDePreparo("certo", etiquetas = 1, preparo = preparo(EstadoDeEtiqueta.JA_ETIQUETADO)))
    }

    @Test fun `reprovacao nao vira aviso — nada entrou no estoque`() {
        assertFalse(mereceAvisoDePreparo("errado", etiquetas = 0, preparo = null))
    }

    @Test fun `pilha antiga e item zerado viram aviso — alguem precisa agir`() {
        assertTrue(mereceAvisoDePreparo("certo", 0, preparo(EstadoDeEtiqueta.PRECISA_PREPARO)))
        assertTrue(mereceAvisoDePreparo("certo", 0, preparo(EstadoDeEtiqueta.CONVERTER_AGORA)))
    }

    @Test fun `granel nao vira aviso — a ficha ja tinha dito e ninguem pode agir`() {
        assertFalse(mereceAvisoDePreparo("certo", 0, preparo(EstadoDeEtiqueta.NAO_ETIQUETAVEL)))
    }

    @Test fun `prometeu etiqueta e nao veio nenhuma — este e o defeito que ficou meses invisivel`() {
        assertTrue(mereceAvisoDePreparo("certo", 0, preparo(EstadoDeEtiqueta.JA_ETIQUETADO)))
        // E o mesmo vale contra um servidor que não manda `preparo`: a lista
        // vazia era silêncio absoluto, e é o silêncio que estamos matando.
        assertTrue(mereceAvisoDePreparo("certo", 0, null))
    }

    @Test fun `o aviso nomeia a caixa`() {
        val frase = fraseDoAvisoDePreparo("Alavanca limpa", preparo(EstadoDeEtiqueta.PRECISA_PREPARO))
        assertTrue(frase.startsWith("Alavanca limpa:"))
        assertTrue(frase.contains("entraram no estoque"))
        assertTrue(frase.contains("não saiu etiqueta"))
    }

    @Test fun `o aviso usa o motivo do servidor quando ele explica um bloqueio`() {
        val frase = fraseDoAvisoDePreparo(
            "Alavanca limpa",
            preparo(EstadoDeEtiqueta.PRECISA_PREPARO, "Este item ainda tem 191 na contagem antiga."),
        )
        assertTrue(frase.contains("191"))
    }

    @Test fun `o aviso NAO repete um motivo que promete etiqueta`() {
        // O `motivo` do `converter_agora` foi escrito pra tela do computador, e
        // lá ele promete: "ao aprovar, sai a etiqueta". Se estamos escrevendo
        // este aviso é porque a promessa não se cumpriu — repeti-la seria o app
        // se contradizendo na mesma tela.
        val frase = fraseDoAvisoDePreparo(
            "Base PS",
            preparo(EstadoDeEtiqueta.CONVERTER_AGORA, "Ao aprovar, sai a etiqueta da caixa lacrada."),
        )
        assertFalse(frase.contains("Ao aprovar, sai a etiqueta"))
        assertTrue(frase.contains("acesso de ajuste"))
    }

    @Test fun `caixa sem nome ainda vira frase legivel`() {
        val frase = fraseDoAvisoDePreparo("   ", null)
        assertTrue(frase.startsWith("Uma caixa conferida:"))
    }
}
