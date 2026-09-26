package com.tridi.market.data

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Carrinho em andamento sobrevive a bateria acabando. A recuperação só vale pra
// MESMA pessoa e por pouco tempo — qualquer saída normal apaga o rascunho, então
// sobrar um aqui significa que o app morreu sem avisar.
class CarrinhoSalvoTest {

    // DAO de mentira: só o par chave/valor importa para esta regra.
    private class FakeDao {
        var valor: String? = null
    }

    // Reimplementa a leitura/escrita do repositório sobre o fake. O parser é o
    // ponto frágil (texto cru), e é ele que este teste protege.
    private class Cofre(private val dao: FakeDao) {
        fun salvar(funcionarioId: Long, itens: Map<Long, Int>, agoraMs: Long) {
            if (itens.isEmpty()) { dao.valor = null; return }
            dao.valor = "$funcionarioId|$agoraMs|" + itens.entries.joinToString(",") { "${it.key}:${it.value}" }
        }
        fun ler(funcionarioId: Long, agoraMs: Long, validadeMs: Long = 15 * 60 * 1000L): Map<Long, Int> {
            val cru = dao.valor ?: return emptyMap()
            val partes = cru.split("|", limit = 3)
            if (partes.size < 3) { dao.valor = null; return emptyMap() }
            val dono = partes[0].toLongOrNull()
            val salvoEm = partes[1].toLongOrNull()
            if (dono != funcionarioId || salvoEm == null || agoraMs - salvoEm > validadeMs) {
                dao.valor = null
                return emptyMap()
            }
            return partes[2].split(",").mapNotNull { item ->
                val campos = item.split(":")
                val produto = campos.getOrNull(0)?.toLongOrNull() ?: return@mapNotNull null
                val qtd = campos.getOrNull(1)?.toIntOrNull()?.takeIf { it > 0 } ?: return@mapNotNull null
                produto to qtd
            }.toMap()
        }
    }

    private fun cofre() = Cofre(FakeDao())

    @Test
    fun `volta o carrinho da mesma pessoa`() = runBlocking {
        val c = cofre()
        c.salvar(7L, mapOf(1L to 2, 5L to 1), agoraMs = 1_000)
        assertEquals(mapOf(1L to 2, 5L to 1), c.ler(7L, agoraMs = 60_000))
    }

    // Outra pessoa fez login: o carrinho não é dela e não pode virar cobrança.
    @Test
    fun `nao volta para outra pessoa`() = runBlocking {
        val c = cofre()
        c.salvar(7L, mapOf(1L to 2), agoraMs = 1_000)
        assertTrue(c.ler(99L, agoraMs = 60_000).isEmpty())
    }

    @Test
    fun `nao volta depois da validade`() = runBlocking {
        val c = cofre()
        c.salvar(7L, mapOf(1L to 2), agoraMs = 0)
        assertTrue(c.ler(7L, agoraMs = 16 * 60 * 1000L).isEmpty())
    }

    // Descartado uma vez, não reaparece na tentativa seguinte.
    @Test
    fun `descartar e definitivo`() = runBlocking {
        val dao = FakeDao()
        val c = Cofre(dao)
        c.salvar(7L, mapOf(1L to 2), agoraMs = 0)
        c.ler(99L, agoraMs = 1_000)
        assertNull(dao.valor)
    }

    @Test
    fun `carrinho vazio apaga o rascunho`() = runBlocking {
        val dao = FakeDao()
        val c = Cofre(dao)
        c.salvar(7L, mapOf(1L to 2), agoraMs = 0)
        c.salvar(7L, emptyMap(), agoraMs = 10)
        assertNull(dao.valor)
    }

    // Linha corrompida (energia caindo no meio da escrita) não derruba o login.
    @Test
    fun `texto quebrado nao explode`() = runBlocking {
        val dao = FakeDao()
        val c = Cofre(dao)
        dao.valor = "lixo"
        assertTrue(c.ler(7L, agoraMs = 1_000).isEmpty())
        dao.valor = "7|100|naoehnumero:x,3:2"
        assertEquals(mapOf(3L to 2), c.ler(7L, agoraMs = 1_000))
    }
}
