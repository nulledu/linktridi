package com.tridi.estoque.conferencia

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConferenciaTest {

    private val caixaDe50 = RascunhoConferencia(quantidadeFeita = 50)

    // ── O veredito ──────────────────────────────────────────────────────────

    @Test fun `nasce sem veredito — ninguem confirma sem olhar a caixa`() {
        assertNull(caixaDe50.resultado)
        assertFalse(caixaDe50.podeConfirmar)
    }

    @Test fun `certo confirma com um toque, sem mais nada a preencher`() {
        val certo = caixaDe50.comResultado(ResultadoConferencia.CERTO)
        assertTrue(certo.podeConfirmar)
        assertTrue(certo.certo)
        assertFalse(certo.errado)
    }

    @Test fun `errado sem dizer o porque nao confirma`() {
        val errado = caixaDe50.comResultado(ResultadoConferencia.ERRADO)
        assertFalse(errado.podeConfirmar)
        assertTrue(errado.alternarDefeito(DefeitoConferencia.AVARIA).podeConfirmar)
    }

    @Test fun `defeito fora da lista pode ser escrito, e destrava igual`() {
        // A lista é fechada porque texto livre não vira estatística — mas
        // defeito que não está nela existe, e travar a tela nele deixaria o
        // gestor sem saída na frente da caixa. Mesma regra da tela do
        // computador (ConferirPainel.tsx).
        val errado = caixaDe50.comResultado(ResultadoConferencia.ERRADO)
        assertFalse(errado.comObs("   ").podeConfirmar)
        assertTrue(errado.comObs("veio com a dobra ao contrário").podeConfirmar)
    }

    @Test fun `as duas opcoes do contrato existem e nenhuma a mais`() {
        // A paridade com lib/estoque-qualidade.ts é checada lendo o arquivo,
        // em ContratoDeChavesTest. Aqui fica só o que a tela promete.
        assertEquals(listOf("certo", "errado"), ResultadoConferencia.entries.map { it.chave })
    }

    @Test fun `o resultado se resolve pela chave que vai no envio`() {
        assertEquals(ResultadoConferencia.CERTO, ResultadoConferencia.porChave("certo"))
        assertNull(ResultadoConferencia.porChave("mais_ou_menos"))
        // A nota antiga não pode voltar a existir por uma fila velha.
        assertNull(ResultadoConferencia.porChave("mediano"))
    }

    // ── A quantidade é só leitura ───────────────────────────────────────────

    @Test fun `a quantidade e a que a pessoa registrou — o gestor nao mexe nela`() {
        val certo = caixaDe50.comResultado(ResultadoConferencia.CERTO)
        assertEquals(50, certo.quantidadeFeita)
        // Não existe nenhum caminho no rascunho que mude esse número: é o
        // ponto do modelo novo. Se um dia aparecer um `comQuantidade`, este
        // teste não pega — mas a ausência dele é o que se está guardando aqui.
        assertEquals(50, certo.comObs("qualquer coisa").quantidadeFeita)
    }

    @Test fun `sem quantidade registrada o CERTO fica bloqueado - e a tela diz por que`() {
        // Antes o botão ficava aceso, com a justificativa de que "a tela não
        // pode travar antes de a pessoa ver a frase que explica". Só que a frase
        // vinha do SERVIDOR (`quantidade_indefinida`), depois de a pessoa
        // escolher destino e confirmar — e enquanto isso o botão prometia
        // "Etiquetar a caixa de 0 peças".
        //
        // Agora a frase é o próprio rótulo do botão ("Ninguém registrou quantas
        // peças foram feitas"), então bloquear informa MAIS cedo em vez de
        // informar menos. Quem conta é quem fez; a conferência confirma, não
        // estima.
        val vazia = RascunhoConferencia(quantidadeFeita = 0)
        assertEquals(0, vazia.quantidadeFeita)
        assertTrue("a tela precisa saber pra escrever a frase", vazia.semQuantidade)
        assertFalse(vazia.comResultado(ResultadoConferencia.CERTO).podeConfirmar)
    }

    @Test fun `sem quantidade ainda da pra REPROVAR - senao a caixa fica presa pra sempre`() {
        // Caixa que ninguém contou é justamente a que precisa voltar pra
        // bancada. Amarrar reprovar à quantidade a deixaria na fila sem saída.
        val vazia = RascunhoConferencia(quantidadeFeita = 0)
            .comResultado(ResultadoConferencia.ERRADO)
            .alternarDefeito(DefeitoConferencia.AVARIA)
        assertTrue(vazia.podeConfirmar)
    }

    @Test fun `com peca contada o certo volta a poder confirmar`() {
        val cheia = RascunhoConferencia(quantidadeFeita = 30)
        assertFalse(cheia.semQuantidade)
        assertTrue(cheia.comResultado(ResultadoConferencia.CERTO).podeConfirmar)
    }

    // ── Defeitos ────────────────────────────────────────────────────────────

    @Test fun `tocar no chip marca e tocar de novo desmarca`() {
        val marcado = caixaDe50.alternarDefeito(DefeitoConferencia.AVARIA)
        assertEquals(setOf(DefeitoConferencia.AVARIA), marcado.defeitos)
        assertEquals(emptySet<DefeitoConferencia>(), marcado.alternarDefeito(DefeitoConferencia.AVARIA).defeitos)
    }

    @Test fun `varios defeitos convivem e saem na ordem do catalogo`() {
        val r = caixaDe50
            .comResultado(ResultadoConferencia.ERRADO)
            .alternarDefeito(DefeitoConferencia.FALTA_QUANTIDADE)
            .alternarDefeito(DefeitoConferencia.PECAS_SUJAS)
            .alternarDefeito(DefeitoConferencia.MEDIDA_ERRADA)
        // A ordem do envio não pode depender da ordem de toque nem do `Set`.
        assertEquals(listOf("peca_suja", "medida_errada", "faltou_quantidade"), r.chavesDeDefeito())
    }

    @Test fun `trocar pra certo apaga os defeitos que ficaram marcados`() {
        // A tela esconde os chips no certo. Se eles continuassem no rascunho, o
        // que sobe discordaria do que a pessoa vê — e o servidor zeraria
        // sozinho, escondendo a divergência mais um pouco.
        val hesitou = caixaDe50
            .comResultado(ResultadoConferencia.ERRADO)
            .alternarDefeito(DefeitoConferencia.PECAS_SUJAS)
            .comResultado(ResultadoConferencia.CERTO)
        assertEquals(emptySet<DefeitoConferencia>(), hesitou.defeitos)
        assertEquals(emptyList<String>(), hesitou.chavesDeDefeito())
    }

    @Test fun `sem defeito marcado a lista vai vazia, nunca com um placeholder`() {
        assertEquals(emptyList<String>(), caixaDe50.chavesDeDefeito())
    }

    // ── O que entrou no estoque ─────────────────────────────────────────────

    @Test fun `a caixa e falada em caixa E em peca`() {
        // Nenhuma das duas unidades sozinha responde a pergunta de quem está
        // com a tira na mão: "1 caixa" não diz quanto material entrou, e
        // "50 peças" faz esperar 50 tiras saindo da impressora.
        assertEquals("1 caixa entrou no estoque · 50 peças", fraseDoQueEntrouNoEstoque(caixas = 1, pecas = 50))
        assertEquals("3 caixas entraram no estoque · 150 peças", fraseDoQueEntrouNoEstoque(caixas = 3, pecas = 150))
    }

    @Test fun `peca avulsa e falada como peca, nao como caixa de uma`() {
        assertEquals("1 peça entrou no estoque", fraseDoQueEntrouNoEstoque(caixas = 1, pecas = 1))
    }

    @Test fun `sem etiqueta nenhuma a frase nao inventa entrada`() {
        assertEquals("Nada entrou no estoque", fraseDoQueEntrouNoEstoque(caixas = 0, pecas = 0))
    }

    // ── As frases de recusa ─────────────────────────────────────────────────

    @Test fun `conferente e executor tem frase propria, de regra e nao de defeito`() {
        assertEquals(
            "Você não pode conferir o próprio trabalho.",
            mensagemDeErroDeConferencia("conferente_e_executor"),
        )
    }

    @Test fun `cada erro nomeado do contrato tem frase propria`() {
        val frases = listOf(
            "resultado_invalido", "quantidade_indefinida", "defeito_invalido",
            "conferente_e_executor", "schema_desatualizado", "atividade_ja_conferida",
        ).map { mensagemDeErroDeConferencia(it) }
        assertEquals(frases.size, frases.toSet().size)
        assertTrue(frases.none { it == mensagemDeErroDeConferencia(null) })
    }

    @Test fun `quantidade indefinida manda pro ERP, nao pra tentar de novo`() {
        // A quantidade não é editável no tablet: repetir a conferência daria
        // exatamente o mesmo 400. Quem resolve é quem lançou a atividade.
        val frase = mensagemDeErroDeConferencia("quantidade_indefinida")
        assertTrue(frase.contains("ERP"))
    }

    @Test fun `erro desconhecido nao vira codigo cru na tela`() {
        val frase = mensagemDeErroDeConferencia("erro_que_ninguem_previu")
        assertFalse(frase.contains("erro_que_ninguem_previu"))
        assertTrue(frase.isNotBlank())
    }

    // ── O que a fila local segura da lista de atividades ────────────────────

    @Test fun `atividade com conferencia esperando subir sai da lista`() {
        // Senão o gestor confere a mesma caixa duas vezes: o servidor continua
        // devolvendo a atividade até a fila chegar nele.
        val presas = atividadesSeguradasPelaFila(
            listOf(ConferenciaNaFila("ativ-1", falhouDefinitivo = false)),
        )
        assertEquals(setOf("ativ-1"), presas)
    }

    // O achado: a recusada de vez continuava segurando a atividade PARA
    // SEMPRE. O worker não a reenvia, o cartão vermelho manda "confira de
    // novo", e a atividade nunca mais aparecia — a caixa pronta ficava no chão.
    @Test fun `conferencia recusada de vez devolve a atividade pra lista`() {
        val presas = atividadesSeguradasPelaFila(
            listOf(ConferenciaNaFila("ativ-1", falhouDefinitivo = true)),
        )
        assertTrue("uma recusa definitiva não pode esconder a atividade", presas.isEmpty())
    }

    // A mesma atividade pode ter DUAS linhas: a recusada de ontem e a tentativa
    // de hoje. Enquanto a de hoje espera, a atividade continua fora da lista.
    @Test fun `tentativa nova segura mesmo com uma recusa antiga do lado`() {
        val presas = atividadesSeguradasPelaFila(
            listOf(
                ConferenciaNaFila("ativ-1", falhouDefinitivo = true),
                ConferenciaNaFila("ativ-1", falhouDefinitivo = false),
            ),
        )
        assertEquals(setOf("ativ-1"), presas)
    }

    @Test fun `fila vazia nao esconde nada`() {
        assertTrue(atividadesSeguradasPelaFila(emptyList()).isEmpty())
    }

    // ── O destino: onde as peças entram ─────────────────────────────────────
    //
    // O defeito que esta seção existe pra impedir. Das 104 atividades
    // concluídas em produção, 103 não apontam item nenhum — e o tablet aprovava
    // todas sem perguntar onde as peças entram. O servidor recusava com
    // `destino_nao_escolhido`, `estoque_conferencias` ficou com ZERO linhas, e
    // o dono, lendo a frase genérica, concluiu que era defeito do ERP.

    private val semItemNoCatalogo = RascunhoConferencia(quantidadeFeita = 50, precisaDeDestino = true)
    private val eva = DestinoDaConferencia(id = "it-eva", nome = "EVA 3 mm")

    @Test fun `aprovar sem destino nao confirma quando a atividade nao aponta item`() {
        val certo = semItemNoCatalogo.comResultado(ResultadoConferencia.CERTO)
        assertFalse("aprovar sem destino é o 400 que zerou o histórico", certo.podeConfirmar)
        assertTrue(certo.comDestino(eva).podeConfirmar)
    }

    // A ASSIMETRIA, e é ela que tira a caixa errada da fila: o material já saiu
    // do estoque quando foi bipado no começo do trabalho, então reprovar não
    // depende do catálogo. Exigir destino nos dois lados deixaria presa pra
    // sempre a caixa de um produto que ainda não está cadastrado.
    @Test fun `reprovar continua sem exigir destino nenhum`() {
        val errado = semItemNoCatalogo
            .comResultado(ResultadoConferencia.ERRADO)
            .alternarDefeito(DefeitoConferencia.AVARIA)
        assertNull(errado.destino)
        assertTrue(errado.podeConfirmar)
    }

    @Test fun `atividade que ja aponta item aprova com um toque, sem escolher nada`() {
        // `precisaDeDestino = false` é o caminho antigo: o servidor resolve o
        // item por `produto_nome`. Não há escolha a fazer, e o bloco da tela
        // nem aparece.
        val certo = RascunhoConferencia(quantidadeFeita = 50).comResultado(ResultadoConferencia.CERTO)
        assertTrue(certo.podeConfirmar)
    }

    @Test fun `o destino so viaja na aprovacao`() {
        val base = semItemNoCatalogo.comDestino(eva)
        assertEquals("it-eva", base.comResultado(ResultadoConferencia.CERTO).destinoParaEnviar())
        // No errado nada entra no estoque: mandar um item seria gravar o
        // endereço de uma peça que não foi a lugar nenhum — e um item apagado
        // do catálogo derrubaria com `item_nao_encontrado` justamente a
        // reprovação, que é a única saída da caixa presa.
        assertNull(base.comResultado(ResultadoConferencia.ERRADO).destinoParaEnviar())
        assertNull(base.destinoParaEnviar())
    }

    @Test fun `trocar de ideia sobre o destino e um toque, como escolher`() {
        val base = semItemNoCatalogo.comResultado(ResultadoConferencia.CERTO).comDestino(eva)
        assertEquals(eva, base.destino)
        assertNull(base.comDestino(null).destino)
        assertFalse(base.comDestino(null).podeConfirmar)
    }

    // Trocar o veredito não pode apagar a escolha: quem marcou errado, releu a
    // observação e voltou pro certo perderia o item que já tinha achado.
    @Test fun `ir e voltar entre certo e errado nao perde o destino escolhido`() {
        val voltou = semItemNoCatalogo
            .comDestino(eva)
            .comResultado(ResultadoConferencia.ERRADO)
            .comResultado(ResultadoConferencia.CERTO)
        assertEquals(eva, voltou.destino)
        assertTrue(voltou.podeConfirmar)
    }

    // ── O vazio da escolha de destino ───────────────────────────────────────

    @Test fun `sem catalogo no tablet a saida e o Wi-Fi, nao digitar melhor`() {
        val vazio = vazioDaEscolhaDeDestino(termo = "eva", resultados = 0, itensNoTablet = 0, sincronizando = false)
        assertTrue(vazio!!.alerta)
        assertTrue(vazio.titulo.contains("não está neste tablet"))
        // A saída pra caixa que não tem como entrar no estoque agora.
        assertTrue(vazio.detalhe.contains("errado"))
    }

    @Test fun `baixando o catalogo nao e alerta — e uma vez so`() {
        val vazio = vazioDaEscolhaDeDestino(termo = "", resultados = 0, itensNoTablet = 0, sincronizando = true)
        assertFalse(vazio!!.alerta)
        assertTrue(vazio.titulo.contains("Baixando"))
    }

    @Test fun `com catalogo e sem termo, a tela pede o que fazer`() {
        val vazio = vazioDaEscolhaDeDestino(termo = "  ", resultados = 0, itensNoTablet = 231, sincronizando = false)
        assertFalse(vazio!!.alerta)
        assertTrue(vazio.detalhe.contains("duas letras"))
    }

    @Test fun `uma letra so nao e busca`() {
        val vazio = vazioDaEscolhaDeDestino(termo = "e", resultados = 0, itensNoTablet = 231, sincronizando = false)
        assertEquals("Continue digitando", vazio!!.titulo)
    }

    @Test fun `nada encontrado diz o termo e oferece a saida`() {
        val vazio = vazioDaEscolhaDeDestino(termo = "xyzw", resultados = 0, itensNoTablet = 231, sincronizando = false)
        assertTrue(vazio!!.titulo.contains("xyzw"))
        assertTrue(vazio.detalhe.contains("errado"))
    }

    @Test fun `com resultado na tela nao existe vazio`() {
        assertNull(vazioDaEscolhaDeDestino(termo = "eva", resultados = 3, itensNoTablet = 231, sincronizando = false))
    }
}
