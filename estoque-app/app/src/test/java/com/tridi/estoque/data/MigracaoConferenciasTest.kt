package com.tridi.estoque.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * As migrações têm que deixar as tabelas EXATAMENTE como o Room as espera.
 *
 * Room compara o schema real com o esperado toda vez que abre o banco. Se
 * divergir uma vírgula, ele recusa a abertura ("migration didn't properly
 * handle") — e como o banco também tem `fallbackToDestructiveMigration()` como
 * rede, o desfecho provável no galpão é a fila offline ser APAGADA em silêncio
 * num tablet que só ia atualizar de versão.
 *
 * Este teste lê o schema que o próprio Room exportou e o compara com o SQL das
 * migrações. É a única forma de pegar o erro antes do tablet.
 */
class MigracaoConferenciasTest {

    // `org.json` aqui é o stub do android.jar, que estoura "not mocked" na
    // primeira chamada. O parser de JSON do teste tem que ser o do kotlinx.
    private fun schema(versao: Int): JsonObject {
        // O diretório de trabalho do teste é o módulo (`app/`).
        val arquivo = File("schemas/com.tridi.estoque.data.EstoqueDatabase/$versao.json")
        assertTrue("schema $versao.json não foi exportado — exportSchema sumiu?", arquivo.exists())
        return Json.parseToJsonElement(arquivo.readText()).jsonObject
    }

    private fun createSql(versao: Int, tabela: String): String? =
        schema(versao)["database"]?.jsonObject?.get("entities")?.jsonArray
            ?.map { it.jsonObject }
            ?.firstOrNull { it["tableName"]?.jsonPrimitive?.content == tabela }
            ?.get("createSql")?.jsonPrimitive?.content
            ?.replace("\${TABLE_NAME}", tabela)

    // ── v2 → v3: a fila de conferências nasce ───────────────────────────────

    @Test fun `o SQL da migracao e o que o Room esperava na v3`() {
        assertEquals(createSql(3, "pending_conferencias"), SQL_CRIA_PENDING_CONFERENCIAS_V3)
    }

    @Test fun `a tabela de conferencias e nova na v3, nao existia na v2`() {
        assertEquals(null, createSql(2, "pending_conferencias"))
    }

    @Test fun `a migracao 2 para 3 nao mexe nas filas que ja estavam la`() {
        // O que a v3 acrescenta é UMA tabela. Se um dia alguém alterar
        // pending_baixas/pending_recebimentos junto, este teste quebra e
        // lembra que a migração precisa tratar a mudança — em vez de o tablet
        // descobrir jogando fora o trabalho de quem estava sem rede.
        listOf("pending_baixas", "pending_recebimentos", "estoque_operadores", "estoque_metadata", "sync_feedback")
            .forEach { tabela ->
                assertEquals("tabela $tabela mudou entre a v2 e a v3", createSql(2, tabela), createSql(3, tabela))
            }
    }

    // ── v3 → v4: a conferência vira binária ─────────────────────────────────

    @Test fun `a tabela convertida e a que o Room espera na v4`() {
        assertEquals(createSql(4, "pending_conferencias"), sqlCriaPendingConferenciasV4())
    }

    @Test fun `a tabela temporaria tem a MESMA forma da definitiva`() {
        // A conversão copia pra uma tabela nova e renomeia. Se a temporária
        // nascesse com uma coluna a menos, o `ALTER TABLE ... RENAME` entregaria
        // ao Room uma tabela torta — e o erro só apareceria na abertura
        // seguinte, no galpão.
        assertEquals(
            sqlCriaPendingConferenciasV4().replace("`pending_conferencias`", "`$TABELA_CONFERENCIAS_NOVA`"),
            sqlCriaPendingConferenciasV4(TABELA_CONFERENCIAS_NOVA),
        )
    }

    // ── v4 → v5: a pilha de bipagem passa a morar no disco ──────────────────

    @Test fun `o SQL da migracao e o que o Room espera na v5`() {
        assertEquals(createSql(5, "pilha_em_aberto"), SQL_CRIA_PILHA_EM_ABERTO_V5)
    }

    @Test fun `a tabela do rascunho e nova na v5, nao existia na v4`() {
        assertEquals(null, createSql(4, "pilha_em_aberto"))
    }

    // A v5 só CRIA. Se um dia alguém mexer numa das filas junto, este teste
    // quebra e lembra que a migração precisa tratar a mudança — em vez de o
    // tablet descobrir caindo no descarte destrutivo e levando a fila junto.
    @Test fun `a migracao 4 para 5 nao toca em nenhuma fila existente`() {
        listOf(
            "pending_baixas", "pending_recebimentos", "pending_conferencias",
            "estoque_operadores", "estoque_metadata", "sync_feedback",
        ).forEach { tabela ->
            assertEquals("tabela $tabela mudou entre a v4 e a v5", createSql(4, tabela), createSql(5, tabela))
        }
    }

    // ── v5 → v6: o catálogo ganha cópia local ───────────────────────────────

    @Test fun `o SQL da migracao e o que o Room espera na v6`() {
        assertEquals(createSql(6, "catalogo_itens"), SQL_CRIA_CATALOGO_ITENS_V6)
    }

    @Test fun `a tabela do catalogo e nova na v6, nao existia na v5`() {
        assertEquals(null, createSql(5, "catalogo_itens"))
    }

    // Mesma guarda das anteriores: a v6 só ACRESCENTA. Se um dia alguém mexer
    // numa fila junto, este teste quebra antes de o tablet descobrir caindo no
    // descarte destrutivo e levando o trabalho de quem estava sem rede.
    @Test fun `a migracao 5 para 6 nao toca em nenhuma fila existente`() {
        listOf(
            "pending_baixas", "pending_recebimentos", "pending_conferencias",
            "estoque_operadores", "estoque_metadata", "sync_feedback", "pilha_em_aberto",
        ).forEach { tabela ->
            assertEquals("tabela $tabela mudou entre a v5 e a v6", createSql(5, tabela), createSql(6, tabela))
        }
    }

    @Test fun `o catalogo guarda a quantidade como REAL, nunca inteiro`() {
        // Item a granel tem meio metro de tecido, 2,5 kg de cola. Guardar
        // INTEGER truncaria em silêncio numa tela cuja única função é dizer
        // QUANTO TEM — e ninguém desconfia de um número que parece redondo.
        val v6 = createSql(6, "catalogo_itens") ?: error("schema 6 sem catalogo_itens")
        assertTrue("a quantidade precisa ser REAL", v6.contains("`quantidade` REAL NOT NULL"))
        // Os dois campos derivados: sem eles a busca não acha "Almofada"
        // digitando "almofada", nem casa a etiqueta bipada com o item.
        assertTrue(v6.contains("`busca` TEXT NOT NULL"))
        assertTrue(v6.contains("`skuBusca` TEXT NOT NULL"))
    }

    // A chave é o CÓDIGO: a pilha é um conjunto (bipar duas vezes a mesma
    // etiqueta não conta duas vezes), então regravar tem que ser inofensivo.
    @Test fun `o rascunho e chaveado pelo codigo, e guarda de quem e`() {
        val v5 = createSql(5, "pilha_em_aberto") ?: error("schema 5 sem pilha_em_aberto")
        assertTrue(v5.contains("PRIMARY KEY(`codigo`)"))
        assertTrue("sem dono, o rascunho atravessaria pro código da próxima pessoa", v5.contains("`operadorId`"))
        assertTrue("sem carimbo não dá pra saber se o rascunho é de hoje", v5.contains("`criadoEm`"))
    }

    @Test fun `a v4 trocou nota e as duas quantidades por um resultado so`() {
        val v3 = createSql(3, "pending_conferencias") ?: error("schema 3 sem pending_conferencias")
        val v4 = createSql(4, "pending_conferencias") ?: error("schema 4 sem pending_conferencias")
        listOf("nota", "quantidadeAprovada", "quantidadeRecusada").forEach {
            assertTrue("v3 deveria ter `$it`", v3.contains("`$it`"))
            assertFalse("v4 não pode mais ter `$it`", v4.contains("`$it`"))
        }
        assertTrue("v4 precisa da coluna `resultado`", v4.contains("`resultado` TEXT NOT NULL"))
    }

    @Test fun `a conversao e copia com traducao, nunca DROP seco`() {
        // O bug que este teste existe pra impedir: "a tabela mudou de forma,
        // então recria" — que apaga a conferência de quem estava sem Wi-Fi. Uma
        // caixa pronta que nunca entra no estoque, descoberta no inventário.
        val passos = PASSOS_MIGRACAO_3_PARA_4
        assertEquals(4, passos.size)
        assertTrue("o 1º passo cria a tabela nova", passos[0].startsWith("CREATE TABLE"))
        assertTrue("o 2º passo copia as linhas", passos[1].startsWith("INSERT INTO"))
        assertTrue("o 2º passo lê a tabela antiga", passos[1].contains("FROM `pending_conferencias`"))
        assertTrue("o 3º passo derruba a antiga — depois de copiar", passos[2].startsWith("DROP TABLE"))
        assertTrue("o 4º passo renomeia", passos[3].startsWith("ALTER TABLE"))
        // O DROP só pode vir DEPOIS do INSERT.
        assertTrue(passos.indexOf(SQL_DERRUBA_CONFERENCIAS_ANTIGA) > passos.indexOf(SQL_COPIA_CONFERENCIAS_V3_PARA_V4))
    }

    @Test fun `a copia leva todas as colunas que a v4 tem`() {
        val v4 = createSql(4, "pending_conferencias") ?: error("schema 4 sem pending_conferencias")
        // Toda coluna do schema novo precisa aparecer na lista do INSERT —
        // faltar uma é uma linha migrada com valor padrão silencioso (ou um
        // NOT NULL estourando no meio da atualização).
        Regex("""`(\w+)` (?:TEXT|INTEGER)""").findAll(v4).map { it.groupValues[1] }.forEach { coluna ->
            assertTrue(
                "a coluna `$coluna` ficou de fora da cópia da migração",
                SQL_COPIA_CONFERENCIAS_V3_PARA_V4.contains("`$coluna`"),
            )
        }
    }

    @Test fun `recusa parcial antiga vira ERRADO, nunca entrada silenciosa`() {
        // No modelo novo não existe "48 de 50 entram". Das duas leituras
        // possíveis, aprovar colocaria as 2 peças ruins no estoque; reprovar não
        // põe nada e devolve a atividade — que é o que o gestor já tinha
        // começado a dizer quando recusou alguma coisa.
        assertTrue(
            SQL_COPIA_CONFERENCIAS_V3_PARA_V4.contains(
                "CASE WHEN `quantidadeRecusada` = 0 THEN 'certo' ELSE 'errado' END",
            ),
        )
    }

    @Test fun `a migracao 3 para 4 nao mexe nas outras filas`() {
        listOf("pending_baixas", "pending_recebimentos", "estoque_operadores", "estoque_metadata", "sync_feedback")
            .forEach { tabela ->
                assertEquals("tabela $tabela mudou entre a v3 e a v4", createSql(3, tabela), createSql(4, tabela))
            }
    }

    // ── v6 → v7: os trabalhos de impressão do escritório ────────────────────

    @Test fun `o SQL da migracao e o que o Room espera na v7`() {
        assertEquals(createSql(7, "trabalhos_impressao"), SQL_CRIA_TRABALHOS_IMPRESSAO_V7)
    }

    @Test fun `a tabela dos trabalhos e nova na v7, nao existia na v6`() {
        assertEquals(null, createSql(6, "trabalhos_impressao"))
    }

    // Mesma guarda das anteriores: a v7 só ACRESCENTA. Quem estiver com o
    // tablet no galpão sem Wi-Fi tem baixa e conferência esperando nessas
    // tabelas — e uma conferência perdida é uma caixa pronta que nunca entra no
    // estoque, descoberta só no inventário.
    @Test fun `a migracao 6 para 7 nao mexe em fila nenhuma`() {
        listOf(
            "pending_baixas", "pending_recebimentos", "pending_conferencias",
            "estoque_operadores", "estoque_metadata", "sync_feedback",
            "pilha_em_aberto", "catalogo_itens",
        ).forEach { tabela ->
            assertEquals("tabela $tabela mudou entre a v6 e a v7", createSql(6, tabela), createSql(7, tabela))
        }
    }

    // ── v7 → v8: a conferência diz em qual item as peças entram ─────────────

    @Test fun `a v8 acrescenta destinoId, que a v7 nao tinha`() {
        val v7 = createSql(7, "pending_conferencias") ?: error("schema 7 sem pending_conferencias")
        val v8 = createSql(8, "pending_conferencias") ?: error("schema 8 sem pending_conferencias")
        assertFalse("`destinoId` não podia existir na v7", v7.contains("`destinoId`"))
        // ANULÁVEL: as linhas que já estavam esperando rede não têm destino, e
        // um NOT NULL faria o `ALTER TABLE` estourar no meio da atualização —
        // com a fila de conferências dentro.
        assertTrue("a v8 precisa da coluna `destinoId` anulável", v8.contains("`destinoId` TEXT"))
        assertFalse(v8.contains("`destinoId` TEXT NOT NULL"))
    }

    /**
     * A migração ACRESCENTA — nunca recria.
     *
     * O `DROP TABLE` seco é o erro que apaga a conferência de quem estava sem
     * Wi-Fi: uma caixa pronta que nunca entra no estoque, descoberta só no
     * inventário. Aqui não há cópia porque não há o que traduzir; um `ALTER`
     * não tem como perder linha.
     */
    @Test fun `a v8 e um ALTER TABLE, nunca um DROP`() {
        assertTrue(SQL_ACRESCENTA_DESTINO_V8.startsWith("ALTER TABLE"))
        assertTrue(SQL_ACRESCENTA_DESTINO_V8.contains("ADD COLUMN `destinoId` TEXT"))
        assertFalse(SQL_ACRESCENTA_DESTINO_V8.contains("DROP"))
        assertFalse(SQL_ACRESCENTA_DESTINO_V8.contains("NOT NULL"))
    }

    @Test fun `a migracao 7 para 8 nao toca em nenhuma outra tabela`() {
        listOf(
            "pending_baixas", "pending_recebimentos", "estoque_operadores", "estoque_metadata",
            "sync_feedback", "pilha_em_aberto", "catalogo_itens", "trabalhos_impressao",
        ).forEach { tabela ->
            assertEquals("tabela $tabela mudou entre a v7 e a v8", createSql(7, tabela), createSql(8, tabela))
        }
    }

    /**
     * O resto da fila de conferências continua idêntico.
     *
     * `ALTER TABLE … ADD COLUMN` só acrescenta: se alguém mexer numa coluna
     * existente achando que a v8 já converte a tabela, este teste quebra e
     * lembra que uma coluna alterada exige a conversão de quatro passos (a da
     * v3 → v4) — não um `ALTER`.
     */
    @Test fun `nenhuma coluna da v7 mudou na v8`() {
        val v7 = createSql(7, "pending_conferencias") ?: error("schema 7 sem pending_conferencias")
        val v8 = createSql(8, "pending_conferencias") ?: error("schema 8 sem pending_conferencias")
        Regex("""`(\w+)` (TEXT|INTEGER)( NOT NULL)?""").findAll(v7).forEach { m ->
            assertTrue("a coluna ${m.groupValues[1]} mudou de forma na v8", v8.contains(m.value))
        }
    }

    @Test fun `a tabela guarda o que a trava contra a segunda tira precisa`() {
        val v7 = createSql(7, "trabalhos_impressao") ?: error("schema 7 sem trabalhos_impressao")
        // A chave é o id do SERVIDOR: é ele que identifica o trabalho que volta
        // porque a confirmação se perdeu na volta.
        assertTrue("a chave tem de ser o id do servidor", v7.contains("PRIMARY KEY(`id`)"))
        // Sem `impressoEm` não há como distinguir "ainda não saiu" de "saiu e o
        // escritório não sabe" — e o segundo caso reimprimiria.
        assertTrue(v7.contains("`impressoEm` INTEGER"))
        assertTrue(v7.contains("`confirmado` INTEGER NOT NULL"))
        // A frase do que deu errado sobe pro escritório; sem ela, "o tablet não
        // conseguiu" obriga alguém a atravessar o galpão pra descobrir o motivo.
        assertTrue(v7.contains("`erro` TEXT"))
    }
}