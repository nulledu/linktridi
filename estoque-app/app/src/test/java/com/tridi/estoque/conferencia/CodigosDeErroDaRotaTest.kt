package com.tridi.estoque.conferencia

import com.tridi.estoque.sync.mensagemDeErroDeBaixa
import com.tridi.estoque.sync.mensagemDeErroDeRecebimento
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Os códigos de erro do Kotlin contra os códigos das rotas — LENDO as rotas.
 *
 * É o mesmo desenho de `ContratoDeChavesTest` (que lê lib/estoque-qualidade.ts)
 * e existe porque este defeito já custou uma feature inteira em produção:
 *
 *   A rota de conferência ganhou `destino_nao_escolhido` — a recusa que 103 das
 *   104 atividades concluídas do galpão recebiam. O app não conhecia o código,
 *   caía na frase genérica ("o sistema recusou esta conferência, refaça pelo
 *   ERP"), e o dono, lendo isso na frente da caixa, concluiu que o defeito era
 *   do ERP. `estoque_conferencias` ficou com ZERO linhas.
 *
 * O teste que existia (`MensagensDeRecusaTest`) já cobrava frase pra todo
 * código — só que contra uma lista COPIADA à mão dentro do próprio teste. Uma
 * lista copiada não sabe que a rota ganhou um código novo: ela envelhece calada,
 * que é exatamente o que aconteceu. Este aqui lê o arquivo de verdade.
 *
 * ── Se este teste quebrou ──
 *
 * Uma rota ganhou um código que o tablet não sabe traduzir. A resposta NÃO é
 * apagar a rota da lista: é escrever a frase, e escrevê-la dizendo O QUE FAZER
 * — quem lê está de pé, de luva, com a caixa na frente, e "avise o suporte" só
 * serve quando não há mesmo nada a fazer ali.
 */
class CodigosDeErroDaRotaTest {

    /** Sobe da pasta do módulo até o repositório — ver ContratoDeChavesTest. */
    private fun arquivoDaRota(caminho: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidato = File(dir, caminho)
            if (candidato.isFile) return candidato
            dir = dir.parentFile
        }
        throw AssertionError(
            "$caminho não foi encontrado a partir de ${File("").absolutePath} — o app do " +
                "tablet vive dentro do repositório do ERP justamente pra este teste existir.",
        )
    }

    /**
     * Todo `error: "…"` que a rota pode responder.
     *
     * Casa `error: "codigo"` em qualquer das formas que o arquivo usa
     * (`NextResponse.json({ error: "x" }, …)` e `{ error: "x", quantos: … }`).
     * Se um dia alguém montar o código numa variável, esta varredura para de
     * ver — e é por isso que ela pede uma quantidade MÍNIMA de códigos: um
     * regex que deixou de casar devolveria lista vazia e o teste passaria
     * verde sem conferir nada.
     *
     * ── O SEGUNDO REGEX, E POR QUE ELE PRECISOU EXISTIR ──
     *
     * O aviso do parágrafo acima não era hipotético: ele já estava acontecendo
     * na rota ao lado. `recebimento/route.ts` responde `error: msg` — o código
     * numa VARIÁVEL, conferido contra um `Set` (`ERROS_COMPRA`). Só o primeiro
     * regex, a varredura via os 4 literais do arquivo, batia o mínimo de 4, e
     * ficava verde enquanto TRÊS códigos reais (`compra_ja_chegou`,
     * `nada_para_guardar`, `quantidade_maior_que_o_recebido`) chegavam ao
     * tablet sem frase nenhuma — na genérica que manda "refazer pelo ERP", o
     * mesmo texto que fez o dono procurar defeito no lugar errado.
     *
     * Um conjunto chamado `ERROS_*` numa rota de aparelho é, por construção,
     * uma lista de códigos de erro; `ETAPAS` e afins não casam com o nome e
     * continuam de fora.
     */
    private fun codigosDe(caminho: String, minimo: Int): List<String> {
        val fonte = arquivoDaRota(caminho).readText()
        val literais = Regex("""error:\s*"([a-z_]+)"""").findAll(fonte).map { it.groupValues[1] }
        val deConjuntos = Regex("""\bERROS?_[A-Z_]*\s*=\s*new Set(?:<[^>]*>)?\(\[([\s\S]*?)]\)""")
            .findAll(fonte)
            .flatMap { bloco -> Regex(""""([a-z_]+)"""").findAll(bloco.groupValues[1]).map { it.groupValues[1] } }
        val achados = (literais + deConjuntos).distinct().toList()
        assertTrue(
            "só ${achados.size} códigos em $caminho (esperava ao menos $minimo) — o " +
                "`error: \"…\"` mudou de forma e esta varredura parou de enxergar",
            achados.size >= minimo,
        )
        return achados
    }

    private fun generica(f: (String?) -> String) = f("um_codigo_que_nao_existe")

    @Test fun `todo erro da rota de conferencia tem frase propria no tablet`() {
        val padrao = generica(::mensagemDeErroDeConferencia)
        codigosDe("app/api/estoque/device/conferencia/route.ts", minimo = 12).forEach { codigo ->
            assertNotEquals(
                "a rota de conferência responde `$codigo` e o tablet não sabe traduzir: " +
                    "quem confere lê \"$padrao\" e vai procurar defeito no ERP. Escreva a " +
                    "frase em `mensagemDeErroDeConferencia` (conferencia/Conferencia.kt).",
                padrao,
                mensagemDeErroDeConferencia(codigo),
            )
        }
    }

    @Test fun `todo erro da rota de baixa tem frase propria no tablet`() {
        val padrao = generica(::mensagemDeErroDeBaixa)
        codigosDe("app/api/estoque/device/baixa/route.ts", minimo = 6).forEach { codigo ->
            assertNotEquals(
                "a rota de baixa responde `$codigo` sem tradução — escreva a frase em " +
                    "`mensagemDeErroDeBaixa` (sync/MensagensDeRecusa.kt).",
                padrao,
                mensagemDeErroDeBaixa(codigo),
            )
        }
    }

    @Test fun `todo erro da rota de recebimento tem frase propria no tablet`() {
        val padrao = generica(::mensagemDeErroDeRecebimento)
        // 10 = os 4 literais do arquivo + os 6 de `ERROS_COMPRA`. O mínimo de 4
        // que estava aqui era satisfeito só pelos literais, e foi por isso que
        // três códigos sem frase passaram por este teste.
        codigosDe("app/api/estoque/device/recebimento/route.ts", minimo = 10).forEach { codigo ->
            assertNotEquals(
                "a rota de recebimento responde `$codigo` sem tradução — escreva a frase em " +
                    "`mensagemDeErroDeRecebimento` (sync/MensagensDeRecusa.kt).",
                padrao,
                mensagemDeErroDeRecebimento(codigo),
            )
        }
    }

    /**
     * A frase do defeito, conferida pelo que ela precisa DIZER.
     *
     * Ter frase própria não basta: se ela não nomear a ação, o gestor continua
     * sem saber o que fazer com a caixa parada no chão. Duas coisas obrigatórias
     * — escolher o item, e que reprovar não depende disso.
     */
    @Test fun `destino nao escolhido manda escolher o item, e lembra que errado nao precisa`() {
        val frase = mensagemDeErroDeConferencia("destino_nao_escolhido")
        assertTrue(frase, frase.contains("catálogo"))
        assertTrue(frase, frase.contains("escolha") || frase.contains("Escolha"))
        assertTrue("a saída da caixa presa é reprovar — a frase tem de dizer isso", frase.contains("errado"))
        // "Refaça pelo ERP" é o que a genérica dizia, e é o que fez o dono
        // procurar defeito no lugar errado.
        assertTrue("a frase não pode mandar procurar defeito no ERP", !frase.contains("ERP"))
    }

    /**
     * O código existe na rota com o nome que o app procura.
     *
     * A varredura acima só prova que TODO código da rota tem frase. Esta prova
     * o contrário pro código que nasceu deste defeito: que a frase escrita no
     * app corresponde a um código que a rota realmente manda — um erro de digitação
     * aqui repetiria o `ja_conferida`/`atividade_ja_conferida` de antes, que
     * nunca casava com nada.
     */
    @Test fun `o codigo que a rota manda de fato e destino_nao_escolhido`() {
        assertTrue(
            codigosDe("app/api/estoque/device/conferencia/route.ts", minimo = 12)
                .contains("destino_nao_escolhido"),
        )
    }
}
