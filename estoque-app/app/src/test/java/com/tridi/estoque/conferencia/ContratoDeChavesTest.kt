package com.tridi.estoque.conferencia

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * As chaves do Kotlin contra as chaves do TypeScript — lendo o TypeScript.
 *
 * Não é preciosismo: já aconteceu. Três dos sete defeitos divergiam
 * (`pecas_sujas`/`acabamento`/`falta_quantidade` do lado do app contra
 * `peca_suja`/`acabamento_ruim`/`faltou_quantidade` do lado do servidor) e o
 * servidor recusava a conferência INTEIRA com 400 `defeito_invalido`. Como as
 * outras quatro passavam, a falha parecia intermitente: a mesma tela gravava ou
 * não dependendo de qual chip o gestor tocasse, de pé na frente da caixa.
 *
 * Nada pegava isso antes. A coluna `defeitos` é `text[]` sem `check`, então o
 * banco não reclamaria; o build do app não conhece o TypeScript; e o teste
 * antigo comparava as chaves do Kotlin com uma lista COPIADA à mão dentro do
 * próprio teste — que é a mesma cópia errando junto.
 *
 * Este aqui lê o arquivo de verdade, `lib/estoque-qualidade.ts`, e compara.
 * Mudou lá e não mudou aqui: build vermelho, antes do tablet.
 */
class ContratoDeChavesTest {

    /**
     * Sobe a partir do diretório do módulo (`estoque-app/app`) até achar o
     * repositório. Procurar em vez de fixar `../../` é o que mantém o teste de
     * pé se o app mudar de lugar na árvore.
     */
    private fun arquivoDoContrato(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidato = File(dir, "lib/estoque-qualidade.ts")
            if (candidato.isFile) return candidato
            dir = dir.parentFile
        }
        throw AssertionError(
            "lib/estoque-qualidade.ts não foi encontrado a partir de ${File("").absolutePath} — " +
                "o app do tablet vive dentro do repositório do ERP justamente pra este teste existir.",
        )
    }

    private val fonte: String by lazy { arquivoDoContrato().readText() }

    /**
     * As chaves de um `export const NOME: Tipo[] = [ { key: "…" }, … ]`, na
     * ordem em que aparecem. Recorta o bloco pelo NOME antes de varrer: o
     * arquivo tem mais de uma lista de chaves (RESULTADOS e DEFEITOS), e varrer
     * o arquivo inteiro misturaria as duas.
     */
    private fun chavesDe(constante: String): List<String> {
        val inicio = fonte.indexOf("export const $constante")
        assertTrue("`export const $constante` sumiu de lib/estoque-qualidade.ts", inicio >= 0)
        val abre = fonte.indexOf('[', inicio)
        val fecha = fonte.indexOf("];", abre)
        assertTrue("não achei o fim da lista `$constante`", abre in 0 until fecha)
        val bloco = fonte.substring(abre, fecha)
        return Regex("""key:\s*"([^"]+)"""").findAll(bloco).map { it.groupValues[1] }.toList()
    }

    @Test fun `os resultados sao os mesmos do TypeScript, na mesma ordem`() {
        assertEquals(chavesDe("RESULTADOS"), ResultadoConferencia.entries.map { it.chave })
    }

    @Test fun `a conferencia e binaria dos dois lados`() {
        // Se o TypeScript ganhar um terceiro resultado ("parcial", "refazer"…),
        // este teste cai junto com o de cima — mas com a frase certa: o tablet
        // não tem botão pra ele, e uma opção que existe no servidor e não
        // existe na tela é uma decisão que ninguém do galpão consegue tomar.
        assertEquals(listOf("certo", "errado"), chavesDe("RESULTADOS"))
    }

    @Test fun `os sete defeitos sao os mesmos do TypeScript, na mesma ordem`() {
        // A ORDEM importa porque é a ordem dos chips na tela e a do envio
        // (`chavesDeDefeito`), e porque a lista do relatório do mês segue o
        // catálogo. Divergir na ordem não quebra nada hoje — quebra a leitura
        // de quem compara as duas telas.
        assertEquals(chavesDe("DEFEITOS"), DefeitoConferencia.entries.map { it.chave })
    }

    @Test fun `a nota morreu no TypeScript e nao pode voltar pelo app`() {
        // As cinco notas saíram do TypeScript junto com as telas que as usavam.
        // O que este teste guarda é o app não as ressuscitar por conta própria:
        // o corpo do pedido não tem mais o campo (ver ConferenciaRequest) e o
        // servidor responderia `resultado_invalido`.
        assertTrue(
            "o pedido do tablet voltou a falar em nota",
            ResultadoConferencia.entries.none { it.chave in listOf("excelente", "bom", "mediano", "ruim", "pessimo") },
        )
    }
}
