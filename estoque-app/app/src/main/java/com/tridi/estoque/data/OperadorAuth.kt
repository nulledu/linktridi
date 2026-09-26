package com.tridi.estoque.data

import com.tridi.estoque.security.OfflineCodes

/**
 * Confere o código digitado contra o diretório de operadores em cache — SEM
 * REDE. O código em si nunca é guardado (nem aqui, nem no servidor): compara
 * o HASH com sal contra o `verificador` de cada operador (mesmo desenho do
 * mercadinho — ver OfflineCodes.kt e net/Contracts.kt#OperadorDto).
 *
 * Puro: sem Room, sem Android — só `List<OperadorEntity>` na mão, pra ser
 * testável sem instrumentação.
 */
fun autenticarOperador(pin: String, salt: String, operadores: List<OperadorEntity>): OperadorEntity? {
    if (pin.isBlank() || salt.isBlank() || operadores.isEmpty()) return null
    val verificador = OfflineCodes.hash(pin, salt)
    return operadores.firstOrNull { it.verificador == verificador }
}
