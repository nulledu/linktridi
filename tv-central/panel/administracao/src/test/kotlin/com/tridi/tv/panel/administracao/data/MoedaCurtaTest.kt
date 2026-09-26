package com.tridi.tv.panel.administracao.data

import com.tridi.tv.core.design.fmtCurto
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * A escala curta tem que ser a MESMA nos dois lados.
 *
 * O perfil é um só: quem marca "números curtos" no ERP espera a mesma leitura
 * na TV do navegador e no aplicativo da televisão. Se as duas contas divergirem,
 * a mesma empresa passa a ter dois faturamentos escritos de jeitos diferentes na
 * mesma parede — e ninguém descobre isso olhando código, só andando pelo prédio.
 *
 * Os casos vêm de `fmtCurto` em `lib/format.ts`, travados lá por
 * `lib/__tests__/painel-classico.test.ts`.
 */
class MoedaCurtaTest {

    @Test
    fun `vira mil a partir de mil`() {
        assertEquals("R$ 1 mil", fmtCurto(1_000.0, true))
        assertEquals("R$ 60 mil", fmtCurto(59_925.0, true))
    }

    @Test
    fun `abaixo de dez a casa decimal ainda informa`() {
        // "R$ 9 mil" para 9.400 esconde quase meio mil; "9,4 mil" não.
        assertEquals("R$ 9,4 mil", fmtCurto(9_400.0, true))
        assertEquals("R$ 1,3 mi", fmtCurto(1_250_000.0, true))
    }

    @Test
    fun `o sinal vem antes do cifrao`() {
        assertEquals("-R$ 2,4 mil", fmtCurto(-2_400.0, true))
    }

    @Test
    fun `contagem nao leva R$`() {
        assertEquals("1,5 mil", fmtCurto(1_500.0, false))
    }
}
