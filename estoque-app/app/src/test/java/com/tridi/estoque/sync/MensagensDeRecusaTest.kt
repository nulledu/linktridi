package com.tridi.estoque.sync

import com.tridi.estoque.conferencia.mensagemDeErroDeConferencia
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A frase da recusa é contrato com as rotas de device do ERP.
 *
 * O que este teste protege é o caso silencioso: um código de erro que NINGUÉM
 * traduziu cai na frase genérica, e a frase genérica de conferência manda
 * "refazer pelo ERP" — que para `atividade_ja_conferida` é exatamente a
 * instrução errada. Era o que acontecia: a rota devolve
 * `atividade_ja_conferida` e o app procurava por `ja_conferida`.
 */
class MensagensDeRecusaTest {

    // Os códigos que cada rota pode devolver com 4xx de conteúdo, copiados do
    // `NextResponse.json({ error: ... })` de cada uma.
    //
    // ATENÇÃO: uma lista COPIADA à mão não sabe quando a rota ganha um código
    // novo — ela envelhece calada, e foi exatamente assim que
    // `destino_nao_escolhido` passou (a rota o devolvia pra 103 das 104
    // atividades do galpão e o tablet caía na frase genérica). Quem cobra o
    // conjunto COMPLETO hoje é `CodigosDeErroDaRotaTest`, que LÊ os arquivos de
    // rota. O que sobrou aqui são os casos com expectativa própria de conteúdo,
    // não a checagem de cobertura.
    private val errosDaBaixa = listOf(
        "lote_grande", "motivo_invalido", "operador_invalido", "sem_codigos",
        "schema_desatualizado", "dados_invalidos",
    )
    private val errosDoRecebimento = listOf(
        "compra_ja_recebida", "compra_cancelada", "compra_nao_encontrada",
        "operador_invalido", "tabela_ausente", "dados_invalidos",
    )
    // `nota_invalida` morreu com as cinco notas; a rota agora devolve
    // `resultado_invalido` (veredito fora de certo/errado),
    // `quantidade_indefinida` (atividade concluída sem dizer quantas peças) e
    // `destino_nao_escolhido` (aprovou sem dizer em qual item as peças entram)
    // — ver app/api/estoque/device/conferencia/route.ts.
    private val errosDaConferencia = listOf(
        "conferente_e_executor", "resultado_invalido", "quantidade_indefinida", "defeito_invalido",
        "schema_desatualizado", "atividade_nao_encontrada", "atividade_ja_conferida",
        "item_nao_encontrado", "operador_invalido", "nome_ambiguo", "dados_invalidos",
        "destino_nao_escolhido",
    )

    private fun generica(f: (String?) -> String) = f("um_codigo_que_nao_existe")

    @Test fun `todo erro conhecido da baixa tem frase propria`() {
        val padrao = generica(::mensagemDeErroDeBaixa)
        errosDaBaixa.forEach { codigo ->
            assertNotEquals("sem frase para $codigo", padrao, mensagemDeErroDeBaixa(codigo))
        }
    }

    @Test fun `todo erro conhecido do recebimento tem frase propria`() {
        val padrao = generica(::mensagemDeErroDeRecebimento)
        errosDoRecebimento.forEach { codigo ->
            assertNotEquals("sem frase para $codigo", padrao, mensagemDeErroDeRecebimento(codigo))
        }
    }

    @Test fun `todo erro conhecido da conferencia tem frase propria`() {
        val padrao = generica(::mensagemDeErroDeConferencia)
        errosDaConferencia.forEach { codigo ->
            assertNotEquals("sem frase para $codigo", padrao, mensagemDeErroDeConferencia(codigo))
        }
    }

    // A regressão que motivou o arquivo: a rota manda `atividade_ja_conferida`,
    // não `ja_conferida`. Com o nome errado a recusa mais comum de todas — duas
    // pessoas conferindo a mesma caixa — caía no "refaça pelo ERP".
    @Test fun `o codigo que a rota manda de fato e atividade_ja_conferida`() {
        assertEquals(
            mensagemDeErroDeConferencia("ja_conferida"),
            mensagemDeErroDeConferencia("atividade_ja_conferida"),
        )
        assertNotEquals(
            generica(::mensagemDeErroDeConferencia),
            mensagemDeErroDeConferencia("atividade_ja_conferida"),
        )
    }

    @Test fun `lote grande diz o teto, porque e o que a pessoa precisa fazer`() {
        assertTrue(mensagemDeErroDeBaixa("lote_grande").contains("200"))
    }

    // Recusa de baixa e de recebimento significam coisas OPOSTAS pro estoque:
    // a baixa não saiu (material sumiu da prateleira e continua no sistema), a
    // entrega não entrou. As frases genéricas têm que dizer isso, senão a
    // pessoa não sabe o que corrigir no ERP.
    @Test fun `a frase generica diz que nada aconteceu no sistema`() {
        assertTrue(generica(::mensagemDeErroDeBaixa).contains("NÃO"))
        assertTrue(generica(::mensagemDeErroDeRecebimento).contains("NÃO"))
    }

    @Test fun `codigo nulo (fila antiga, sem ultimoErro) nao quebra`() {
        listOf(
            mensagemDeErroDeBaixa(null),
            mensagemDeErroDeRecebimento(null),
            mensagemDeErroDeConferencia(null),
        ).forEach { assertFalse(it.isBlank()) }
    }

    // "Já tinha sido registrada" NÃO pode soar como erro a corrigir: é o
    // desfecho do toque duplo, e a entrega está lá. Mandar refazer criaria uma
    // segunda entrada.
    @Test fun `compra ja recebida tranquiliza em vez de mandar refazer`() {
        val frase = mensagemDeErroDeRecebimento("compra_ja_recebida")
        assertTrue(frase.contains("já"))
        assertFalse(frase.contains("ERP"))
    }

    // `nome_ambiguo` caía na genérica "refaça pelo ERP" — e refazer é
    // exatamente o que NÃO resolve: o servidor achou dois itens com o mesmo
    // nome e não tem como escolher. Quem destrava é quem renomeia um deles.
    @Test fun `nome ambiguo manda renomear, nao refazer`() {
        val frase = mensagemDeErroDeConferencia("nome_ambiguo")
        assertTrue(frase.contains("renomear"))
        assertTrue(frase.contains("mais de um item"))
        assertNotEquals(generica(::mensagemDeErroDeConferencia), frase)
    }

    // Tablet numa versão anterior à do servidor. Refazer repetiria o mesmo
    // envio recusado — o que resolve é atualizar o app.
    @Test fun `dados invalidos manda atualizar o app nas tres filas`() {
        listOf(
            mensagemDeErroDeBaixa("dados_invalidos"),
            mensagemDeErroDeRecebimento("dados_invalidos"),
            mensagemDeErroDeConferencia("dados_invalidos"),
        ).forEach { assertTrue(it, it.contains("desatualizado")) }
    }
}
