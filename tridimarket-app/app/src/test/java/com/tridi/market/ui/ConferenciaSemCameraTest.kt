package com.tridi.market.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// A conferência por foto é uma GARANTIA, não uma trava. Quando ela não é
// possível, a compra tem que seguir — senão um tablet sem câmera não vende
// nada escolhido por toque, que é a venda inteira num totem sem código.
class ConferenciaSemCameraTest {

    @Test
    fun `com camera e permissao, fotografa`() {
        assertTrue(fotoDeConferenciaPossivel(temCameraNoAparelho = true, temPermissao = true))
    }

    @Test
    fun `tablet sem camera nenhuma nao fotografa`() {
        assertFalse(fotoDeConferenciaPossivel(temCameraNoAparelho = false, temPermissao = true))
    }

    @Test
    fun `permissao negada nao fotografa`() {
        assertFalse(fotoDeConferenciaPossivel(temCameraNoAparelho = true, temPermissao = false))
    }

    @Test
    fun `permissao concedida num aparelho sem camera continua sem foto`() {
        // O caso traiçoeiro: pedir CAMERA num aparelho sem câmera pode voltar
        // "concedida". Quem decide é o hardware, não a resposta do diálogo.
        assertFalse(fotoDeConferenciaPossivel(temCameraNoAparelho = false, temPermissao = true))
    }

    @Test
    fun `a origem continua mandando em QUEM precisa de foto`() {
        // Bipou: o código já respondeu pelo produto, nada de foto.
        assertFalse(exigeFotoDeConferencia(OrigemProduto.LEITOR))
        assertTrue(exigeFotoDeConferencia(OrigemProduto.BUSCA))
    }
}
