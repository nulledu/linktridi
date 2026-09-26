package com.tridi.estoque.net

import com.tridi.estoque.impressora.paraImpressao
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// O contrato de /api/estoque/device/conferencia* é escrito em paralelo, do
// outro lado do repositório. Estes testes travam o formato que o tablet
// entende — e, principalmente, travam que a etiqueta impressa é a que o
// SERVIDOR mandou, não uma re-derivada do código de barras.
class ConferenciaContratoTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true; isLenient = true }

    @Test fun `le a lista de atividades pendentes`() {
        val corpo = """
            { "atividades": [
              { "id": "a1", "produtoNome": "Folha de alavanca", "itemId": "i9",
                "categoria": "Limpeza", "quantidadeAlvo": 50, "quantidadeFeita": 50,
                "executorId": "op7", "executorNome": "Maria", "concluidaEm": "2026-08-12T18:04:00Z" } ] }
        """.trimIndent()
        val dados = json.decodeFromString<ConferenciasPendentesData>(corpo)
        val atividade = dados.atividades.single()
        assertEquals("a1", atividade.id)
        assertEquals("Folha de alavanca", atividade.produtoNome)
        assertEquals(50, atividade.quantidadeFeita)
        assertEquals("op7", atividade.executorId)
    }

    @Test fun `quantidade entre aspas nao derruba o parsing`() {
        // `numeric` do Postgres às vezes sai como string — já mordeu o app uma
        // vez, num parsing parecido (ver IntTolerante).
        val corpo = """{ "atividades": [ { "id": "a1", "quantidadeAlvo": "50", "quantidadeFeita": "48.00" } ] }"""
        val atividade = json.decodeFromString<ConferenciasPendentesData>(corpo).atividades.single()
        assertEquals(50, atividade.quantidadeAlvo)
        assertEquals(48, atividade.quantidadeFeita)
    }

    @Test fun `lista vazia e resposta legitima, nao erro`() {
        assertTrue(json.decodeFromString<ConferenciasPendentesData>("""{ "atividades": [] }""").atividades.isEmpty())
        assertTrue(json.decodeFromString<ConferenciasPendentesData>("{}").atividades.isEmpty())
    }

    @Test fun `o certo devolve UMA etiqueta — a caixa — com as pecas dentro`() {
        val corpo = """
            { "ok": true, "resultado": "certo", "quantidade": 50, "reaberta": false,
              "unidades": ["ALV-LIMP-01-000001"],
              "etiquetas": [ { "codigo": "ALV-LIMP-01-000001", "nome": "Folha de alavanca",
                               "corDimensoes": "Branco · 2,75×1,83", "quantidade": 50, "local": "GAL-A",
                               "localDetalhe": "C3 · B2", "responsavel": "Maria", "data": "12/08/2026" } ] }
        """.trimIndent()
        val dados = json.decodeFromString<ConferenciaResponseData>(corpo)
        assertEquals("certo", dados.resultado)
        assertEquals(50, dados.quantidade)
        // UMA etiqueta valendo 50 peças — não 50 etiquetas.
        assertEquals(listOf("ALV-LIMP-01-000001"), dados.unidades)
        assertEquals(1, dados.etiquetas.size)
        assertEquals(50, dados.etiquetas.single().quantidade)
        assertEquals("GAL-A", dados.etiquetas.single().local)
    }

    @Test fun `o errado nao devolve etiqueta nenhuma e reabre a atividade`() {
        val corpo = """{ "ok": true, "resultado": "errado", "quantidade": 0, "unidades": [], "etiquetas": [], "reaberta": true }"""
        val dados = json.decodeFromString<ConferenciaResponseData>(corpo)
        assertEquals("errado", dados.resultado)
        assertEquals(0, dados.quantidade)
        assertTrue(dados.etiquetas.isEmpty())
        assertTrue(dados.reaberta)
    }

    @Test fun `etiqueta sem quantidade e peca avulsa, nao caixa vazia`() {
        // Servidor de uma versão anterior, ou peça que não é caixa.
        val corpo = """{ "etiquetas": [ { "codigo": "ALV-LIMP-01-000001", "nome": "Folha" } ] }"""
        assertEquals(1, json.decodeFromString<ConferenciaResponseData>(corpo).etiquetas.single().quantidade)
    }

    @Test fun `o pedido leva o operationId, o veredito e os defeitos — e nenhuma quantidade`() {
        val texto = json.encodeToString(
            ConferenciaRequest.serializer(),
            ConferenciaRequest(
                operationId = "7d2f1f0e-0000-4000-8000-000000000001",
                atividadeId = "a1",
                resultado = "errado",
                defeitos = listOf("peca_suja", "avaria"),
                obs = null,
                conferidoPorId = "op3",
                ocorridoEm = "2026-08-12T18:30:00Z",
            ),
        )
        assertTrue(texto.contains("\"operationId\":\"7d2f1f0e-0000-4000-8000-000000000001\""))
        assertTrue(texto.contains("\"resultado\":\"errado\""))
        assertTrue(texto.contains("\"defeitos\":[\"peca_suja\",\"avaria\"]"))
        // A quantidade da caixa é a que a PESSOA registrou ao concluir, lida
        // pelo servidor. Se ela voltar a viajar no corpo, uma fila offline que
        // sobe horas depois passa a mandar o número que o tablet lembrava.
        assertFalse("o pedido voltou a mandar quantidade", texto.contains("quantidade"))
        assertFalse("o pedido voltou a mandar nota", texto.contains("\"nota\""))
        // Reprovar não leva destino: nada entra no estoque, então não há
        // endereço a gravar — e um item apagado do catálogo derrubaria com
        // `item_nao_encontrado` justamente a reprovação, que é a única saída da
        // caixa presa na fila.
        assertFalse("a reprovação voltou a mandar destino", texto.contains("destinoId"))
    }

    // ── O DESTINO: o campo que faltava ──────────────────────────────────────

    @Test fun `aprovar leva o item do catalogo escolhido pelo gestor`() {
        val texto = json.encodeToString(
            ConferenciaRequest.serializer(),
            ConferenciaRequest(
                operationId = "7d2f1f0e-0000-4000-8000-000000000002",
                atividadeId = "a1",
                resultado = "certo",
                destinoId = "item-eva-3mm",
                conferidoPorId = "op3",
                ocorridoEm = "2026-08-12T18:30:00Z",
            ),
        )
        // Sem esta linha o servidor recusa com `destino_nao_escolhido` toda
        // atividade sem `produto_nome` — 103 das 104 concluídas no galpão.
        assertTrue(texto, texto.contains("\"destinoId\":\"item-eva-3mm\""))
    }

    @Test fun `sem destino o campo nem viaja — o corpo continua o de antes`() {
        val texto = json.encodeToString(
            ConferenciaRequest.serializer(),
            ConferenciaRequest(
                operationId = "7d2f1f0e-0000-4000-8000-000000000003",
                atividadeId = "a1",
                resultado = "certo",
                conferidoPorId = "op3",
                ocorridoEm = "2026-08-12T18:30:00Z",
            ),
        )
        // `explicitNulls = false`: nulo não vira `"destinoId":null` no corpo. A
        // atividade que já aponta produto segue pelo caminho antigo (o servidor
        // resolve o item por nome, COM a guarda de nome ambíguo).
        assertFalse(texto, texto.contains("destinoId"))
    }

    @Test fun `a lista traz as sugestoes de onde a caixa entra`() {
        val corpo = """
            { "atividades": [
              { "id": "a1", "produtoNome": "Colar EVA na chapa 3 mm", "itemId": null,
                "sugestoes": [ { "id": "i1", "nome": "EVA 3 mm", "serializado": true },
                               { "id": "i2", "nome": "Chapa EVA", "serializado": false } ],
                "quantidadeFeita": 2 } ] }
        """.trimIndent()
        val atividade = json.decodeFromString<ConferenciasPendentesData>(corpo).atividades.single()
        assertEquals(2, atividade.sugestoes.size)
        assertEquals("EVA 3 mm", atividade.sugestoes.first().nome)
        assertEquals(false, atividade.sugestoes[1].serializado)
    }

    @Test fun `atividade sem sugestao nenhuma continua legivel`() {
        // O caso em que nada do catálogo bate com a tarefa: a ficha cai direto
        // na busca, e o parse não pode estourar por causa de um campo ausente
        // (um tablet antigo lendo um servidor novo, ou o contrário).
        val corpo = """{ "atividades": [ { "id": "a1", "produtoNome": "Tarefa nova" } ] }"""
        val atividade = json.decodeFromString<ConferenciasPendentesData>(corpo).atividades.single()
        assertTrue(atividade.sugestoes.isEmpty())
        assertNull(atividade.itemId)
        assertNull(atividade.itemSerializado)
    }

    // ── POR QUE não veio etiqueta ───────────────────────────────────────────
    //
    // O tablet instalado no galpão hoje é o 0.1.0 e NÃO vai ser reinstalado
    // agora: o servidor vai passar a mandar `preparo` enquanto lá roda um app
    // que nunca ouviu falar do campo. Os dois sentidos precisam atravessar sem
    // estourar — campo novo num app velho (`ignoreUnknownKeys`) e campo ausente
    // num app novo (o nulo aqui embaixo).

    @Test fun `resposta sem etiqueta explica o motivo`() {
        val corpo = """
            { "ok": true, "resultado": "certo", "quantidade": 191, "unidades": [], "etiquetas": [],
              "preparo": { "estado": "precisa_preparo",
                           "motivo": "Este item ainda tem 191 na contagem antiga." } }
        """.trimIndent()
        val dados = json.decodeFromString<ConferenciaResponseData>(corpo)
        assertTrue(dados.etiquetas.isEmpty())
        assertEquals("precisa_preparo", dados.preparo?.estado)
        assertTrue(dados.preparo?.motivo.orEmpty().contains("191"))
    }

    @Test fun `servidor que ainda nao manda preparo continua sendo lido`() {
        val corpo = """{ "ok": true, "resultado": "certo", "quantidade": 50, "etiquetas": [] }"""
        assertNull(json.decodeFromString<ConferenciaResponseData>(corpo).preparo)
    }

    @Test fun `o estado do item desce junto com a sugestao de destino`() {
        val corpo = """
            { "atividades": [
              { "id": "a1", "produtoNome": "Colar EVA na chapa 3 mm",
                "preparo": { "estado": "nao_etiquetavel", "motivo": "Este item é medido em quilos." },
                "sugestoes": [ { "id": "i1", "nome": "EVA 3 mm", "serializado": false,
                                 "preparo": { "estado": "converter_agora", "motivo": "Está zerado." } } ] } ] }
        """.trimIndent()
        val atividade = json.decodeFromString<ConferenciasPendentesData>(corpo).atividades.single()
        assertEquals("nao_etiquetavel", atividade.preparo?.estado)
        assertEquals("converter_agora", atividade.sugestoes.single().preparo?.estado)
    }

    @Test fun `sugestao sem preparo e o caso comum e nao pode estourar`() {
        val corpo = """{ "atividades": [ { "id": "a1", "sugestoes": [ { "id": "i1", "nome": "EVA 3 mm" } ] } ] }"""
        val atividade = json.decodeFromString<ConferenciasPendentesData>(corpo).atividades.single()
        assertNull(atividade.sugestoes.single().preparo)
        assertNull(atividade.preparo)
    }

    @Test fun `estado novo demais nao derruba o parsing — vira texto que o app nao conhece`() {
        // A defesa vale nos dois sentidos: aqui o app é o velho da história.
        val corpo = """{ "etiquetas": [], "preparo": { "estado": "algo_que_ainda_nao_existe", "motivo": "…", "extra": 3 } }"""
        assertEquals("algo_que_ainda_nao_existe", json.decodeFromString<ConferenciaResponseData>(corpo).preparo?.estado)
    }

    // ── A etiqueta impressa é a que veio ────────────────────────────────────

    @Test fun `imprime o nome e o local do servidor, sem re-derivar do codigo`() {
        val dados = EtiquetaDto(
            codigo = "ALV-LIMP-01-000042",
            nome = "Folha de alavanca",
            corDimensoes = "Branco · 2,75×1,83",
            quantidade = 50,
            local = "GAL-A",
            localDetalhe = "C3 · B2",
            responsavel = "Maria",
            data = "12/08/2026",
        ).paraImpressao(responsavelPadrao = "Quem está com o tablet")

        assertEquals("Folha de alavanca", dados.nome)
        assertEquals("GAL-A", dados.local)
        assertEquals("C3 · B2", dados.localDetalhe)
        // As peças da caixa atravessam até o desenho: é o que faz o selo sair
        // impresso (ver EtiquetaLayout.textoDaCaixa). Sem esta ponte a etiqueta
        // de conferência — a única que nasce caixa — sairia igual à de uma peça
        // avulsa, e quem pega a caixa lacrada na prateleira não tem como saber
        // que tem 50 dentro sem romper o lacre.
        assertEquals(50, dados.quantidade)
        assertTrue(dados.ehCaixa)
        // O responsável do servidor ganha do padrão do tablet.
        assertEquals("Maria", dados.responsavel)
        assertEquals("12/08/2026 · Maria", dados.rodape)
    }

    @Test fun `sem responsavel no servidor entra quem esta com o tablet`() {
        val dados = EtiquetaDto(codigo = "ALV-LIMP-01-000042", nome = "Folha", data = "12/08/2026")
            .paraImpressao(responsavelPadrao = "João")
        assertEquals("João", dados.responsavel)
    }

    @Test fun `campo em branco vira ausente, nao coluna vazia com titulo`() {
        val dados = EtiquetaDto(codigo = "ALV-LIMP-01-000042", nome = "Folha", local = "   ", corDimensoes = "")
            .paraImpressao()
        // Coluna de local vazia é pior que coluna nenhuma — a etiqueta se
        // reorganiza sozinha quando `local` é nulo (ver EtiquetaLayout.montar).
        assertNull(dados.local)
        assertNull(dados.corDimensoes)
    }
}
