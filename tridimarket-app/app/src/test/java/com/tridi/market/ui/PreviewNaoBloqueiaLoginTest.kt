package com.tridi.market.ui

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

// O modo de preview já derrubou o login do tablet inteiro: ele comparava o
// código digitado com um PIN falso e recusava todos os outros, e como o Android
// reentrega o intent que criou a tarefa (launchMode singleTask), um único
// `am start --es tridimarket_preview` deixava o aparelho dizendo "Código não
// reconhecido" para TODO MUNDO, até reinstalar.
//
// Estes testes fixam o contrato: o preview monta TELAS, e só. Nada de PIN.
class PreviewNaoBloqueiaLoginTest {

    @Test
    fun `preview desligado nao produz dados de demonstracao`() {
        assertNull(debugPreviewData("catalog", enabled = false))
    }

    @Test
    fun `preview so responde a modos conhecidos`() {
        // Um extra vazio ou desconhecido NÃO pode ligar o modo demonstração.
        assertNull(debugPreviewData(null, enabled = true))
        assertNull(debugPreviewData("", enabled = true))
        assertNull(debugPreviewData("qualquer-coisa", enabled = true))
        assertNotNull(debugPreviewData("catalog", enabled = true))
    }

    @Test
    fun `os dados de preview nao carregam PIN de autenticacao`() {
        // O campo `pin` existe só para a tela de teclado do preview desenhar os
        // pontinhos — nunca para autenticar. Se algum dia alguém voltar a
        // comparar o código com ele, este teste não impede, mas o login em
        // MarketViewModel.login() não tem mais esse ramo (ver comentário lá).
        val preview = debugPreviewData("pin", enabled = true)
        assertNotNull(preview)
        // A sessão de preview é de MENTIRA e precisa ser reconhecível como tal:
        // token fixo, jamais um token assinado pelo servidor.
        assertNotNull(preview?.session?.token)
        org.junit.Assert.assertEquals("debug-preview-only", preview?.session?.token)
    }
}
