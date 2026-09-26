package com.tridi.estoque.kiosk

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// Onde a leitura do leitor vai parar enquanto a tela de manutenção está aberta.
//
// O leitor HID é interceptado na Activity, ANTES de qualquer tela (é o único
// jeito: ele "digita" no que estiver em foco). Sem este desvio, bipar dentro da
// tela de pareamento jogaria o produto no carrinho de quem estivesse logado —
// justamente enquanto alguém testa o leitor.
object PortaDeManutencao {

    /** Verdadeiro só enquanto a tela de manutenção está na frente. */
    @Volatile
    var ativa: Boolean = false
        private set

    private val _ultimoCodigo = MutableStateFlow<String?>(null)
    val ultimoCodigo: StateFlow<String?> = _ultimoCodigo

    fun abrir() {
        _ultimoCodigo.value = null
        ativa = true
    }

    fun fechar() {
        ativa = false
        _ultimoCodigo.value = null
    }

    /** @return true se a leitura foi consumida aqui (e não deve virar venda). */
    fun consumir(codigo: String): Boolean {
        if (!ativa) return false
        _ultimoCodigo.value = codigo
        return true
    }

    /**
     * Senha da manutenção. Constante no app de propósito, como o token do
     * DestravarReceiver: o pareamento acontece na instalação do totem, às vezes
     * antes de existir Wi-Fi — buscar isto no servidor trancaria a pessoa do
     * lado de fora exatamente quando ela precisa entrar.
     *
     * Não é segurança de verdade e não protege venda nem dinheiro: só evita que
     * um funcionário curioso que descubra a sequência mexa no Bluetooth.
     */
    const val SENHA = "271828"
}
