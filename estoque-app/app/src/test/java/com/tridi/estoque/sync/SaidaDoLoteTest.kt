package com.tridi.estoque.sync

import com.tridi.estoque.net.ItemDaSaidaDto
import org.junit.Assert.assertEquals
import org.junit.Test

// O que a pessoa lê depois de bipar. Um erro aqui não estraga um pixel: faz ela
// ir embora acreditando num número de estoque que não existe.
class SaidaDoLoteTest {

    private fun dto(item: String, pecas: Int, saldo: Double, unidade: String = "un") =
        ItemDaSaidaDto(item = item, pecas = pecas, saldo = saldo, unidade = unidade)

    @Test fun `um lote vira uma linha por item, na ordem em que veio`() {
        val r = somarSaidaPorItem(listOf(listOf(dto("Cola branca", 2, 12.5, "L"), dto("Chapa MDF 6 mm", 400, 320.0))))
        assertEquals(listOf("Cola branca", "Chapa MDF 6 mm"), r.map { it.item })
        assertEquals(400, r[1].pecas)
    }

    @Test fun `dois lotes do mesmo item SOMAM as pecas - nao deduplicam`() {
        // A armadilha: `juntarFeedback` deduplica por chave, e reusá-lo aqui
        // faria a segunda baixa do mesmo item sumir da conta. Duas saídas de 50
        // são 100 peças fora da prateleira, não 50.
        val r = somarSaidaPorItem(
            listOf(
                listOf(dto("Chapa MDF 6 mm", 50, 320.0)),
                listOf(dto("Chapa MDF 6 mm", 50, 270.0)),
            ),
        )
        assertEquals(1, r.size)
        assertEquals(100, r[0].pecas)
    }

    @Test fun `o saldo e o do lote mais recente, nunca a soma`() {
        // Saldo é retrato, não parcela. 320 + 270 = 590 é um estoque que nunca
        // existiu; 320 é o de antes da segunda baixa.
        val r = somarSaidaPorItem(
            listOf(
                listOf(dto("Chapa MDF 6 mm", 50, 320.0)),
                listOf(dto("Chapa MDF 6 mm", 50, 270.0)),
            ),
        )
        assertEquals(270.0, r[0].saldo, 0.0001)
    }

    @Test fun `item sem nome nao vira linha`() {
        val r = somarSaidaPorItem(listOf(listOf(dto("", 50, 10.0), dto("   ", 3, 1.0))))
        assertEquals(emptyList<LinhaDaSaida>(), r)
    }

    @Test fun `lote vazio e lista vazia nao inventam linha`() {
        assertEquals(emptyList<LinhaDaSaida>(), somarSaidaPorItem(emptyList()))
        assertEquals(emptyList<LinhaDaSaida>(), somarSaidaPorItem(listOf(emptyList())))
    }

    @Test fun `saldo torto satura em zero em vez de virar NaN na tela`() {
        val r = somarSaidaPorItem(listOf(listOf(dto("Item torto", 1, -5.0), dto("Outro", 1, Double.NaN))))
        assertEquals(0.0, r[0].saldo, 0.0001)
        assertEquals(0.0, r[1].saldo, 0.0001)
    }

    @Test fun `unidade em branco cai em un`() {
        val r = somarSaidaPorItem(listOf(listOf(dto("Chapa", 1, 3.0, "  "))))
        assertEquals("un", r[0].unidade)
    }

    @Test fun `o teto corta itens novos mas nao para de somar os que ja entraram`() {
        val lote = listOf(dto("A", 1, 1.0), dto("B", 1, 1.0), dto("C", 1, 1.0))
        val r = somarSaidaPorItem(listOf(lote, lote), teto = 2)
        assertEquals(listOf("A", "B"), r.map { it.item })
        assertEquals(2, r[0].pecas)
    }

    @Test fun `teto zero nao devolve nada`() {
        assertEquals(emptyList<LinhaDaSaida>(), somarSaidaPorItem(listOf(listOf(dto("A", 1, 1.0))), teto = 0))
    }

    // ── As frases ───────────────────────────────────────────────────────────

    @Test fun `peca no singular, pecas no plural - e nunca etiqueta`() {
        assertEquals("1 peça", frasePecas(1))
        assertEquals("400 peças", frasePecas(400))
        assertEquals("0 peças", frasePecas(0))
    }

    @Test fun `numero inteiro nao mostra casa decimal`() {
        assertEquals("320", numeroCurto(320.0))
        assertEquals("0", numeroCurto(0.0))
    }

    @Test fun `fracionario sai com virgula, porque a tela toda e em portugues`() {
        assertEquals("12,5", numeroCurto(12.5))
        assertEquals("12,25", numeroCurto(12.25))
        // Arredonda em duas casas: "restam 0,3333333 L" não ajuda ninguém.
        assertEquals("0,33", numeroCurto(1.0 / 3.0))
    }

    @Test fun `NaN e infinito viram zero em vez de aparecerem na tela`() {
        assertEquals("0", numeroCurto(Double.NaN))
        assertEquals("0", numeroCurto(Double.POSITIVE_INFINITY))
    }

    @Test fun `a frase da linha diz o que saiu E o que ficou`() {
        val linha = LinhaDaSaida("Chapa MDF 6 mm", 400, 320.0, "un")
        assertEquals("400 peças · restam 320 un", fraseDaSaida(linha))
        assertEquals("restam 320 un", fraseDeSaldo(linha))
        assertEquals("restam 12,5 L", fraseDeSaldo(LinhaDaSaida("Cola", 2, 12.5, "L")))
    }

    @Test fun `o total do lote soma as pecas de todos os itens`() {
        val linhas = listOf(LinhaDaSaida("A", 400, 1.0, "un"), LinhaDaSaida("B", 50, 1.0, "un"))
        assertEquals(450, totalDaSaida(linhas))
        assertEquals(0, totalDaSaida(emptyList()))
    }
}
