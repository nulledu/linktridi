package com.tridi.market.ui

import com.tridi.market.data.ProductEntity
import com.tridi.market.net.EmployeeDto
import com.tridi.market.net.SessionData

enum class DebugPreviewTarget {
    WELCOME,
    PIN,
    CATALOG,
    CART,
    FOTO,
    RECEIPT,
}

data class DebugPreviewData(
    val session: SessionData,
    val products: List<ProductEntity>,
    val target: DebugPreviewTarget,
    val pin: String = "2458",
)

fun debugPreviewData(mode: String?, enabled: Boolean): DebugPreviewData? {
    if (!enabled) return null

    val target = when (mode) {
        "welcome" -> DebugPreviewTarget.WELCOME
        "pin" -> DebugPreviewTarget.PIN
        "catalog" -> DebugPreviewTarget.CATALOG
        "cart" -> DebugPreviewTarget.CART
        "foto" -> DebugPreviewTarget.FOTO
        "receipt" -> DebugPreviewTarget.RECEIPT
        else -> return null
    }

    val now = System.currentTimeMillis()
    return DebugPreviewData(
        session = SessionData(
            token = "debug-preview-only",
            expiresAt = "2099-12-31T23:59:59Z",
            // Conta de TESTE de verdade (usuarios_perfil id 102, unidade do
            // tablet). Antes era um nome inventado: além de parecer uma pessoa
            // real nas capturas de tela, o preview consultava o histórico de
            // compras daquele id no banco local.
            employee = EmployeeDto(
                id = 102,
                profileId = "4770ee82-b6f4-4e85-865f-606e7a0b519c",
                companyId = 4,
                name = "Teste",
                normalLimit = 500.0,
                overdraftLimit = 0.0,
                open = 120.5,
                overdue = 0.0,
                available = 379.5,
                status = "good",
            ),
        ),
        products = listOf(
            ProductEntity(9001, "Água Mineral 500ml", "789100000001", 2.5, "https://images.unsplash.com/photo-1561041695-d2fadf9f318c?auto=format&fit=crop&w=600&q=80", "Bebidas", 32, 5, true, now),
            ProductEntity(9002, "Coca-Cola 350ml", "789100000002", 5.0, "https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=600&q=80", "Bebidas", 3, 5, true, now),
            ProductEntity(9003, "Suco Natural 300ml", "789100000003", 4.5, "https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=600&q=80", "Bebidas", 18, 5, true, now),
            ProductEntity(9004, "Energético 250ml", "789100000004", 6.5, "https://images.unsplash.com/photo-1642532560930-77d5018c68f7?auto=format&fit=crop&w=600&q=80", "Bebidas", 9, 4, true, now),
            // Estoque ZERADO de propósito: é o item que exercita o aviso de
            // conferência no carrinho, na confirmação e no recibo — o caminho
            // que mais quebra e o que menos aparece por acaso.
            ProductEntity(9005, "Salgadinho Queijo 50g", "789100000005", 4.5, "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80", "Lanches", 0, 6, true, now),
            ProductEntity(9006, "Chá Gelado 300ml", "789100000006", 4.0, "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=600&q=80", "Bebidas", 14, 5, true, now),
            // SEM código de barras (granel/caseiro): aparecem na categoria própria
            // da busca. barcode = null e semCodigo = true.
            ProductEntity(9007, "Brigadeiro caseiro", null, 3.0, null, "Doces", 20, 0, true, now, semCodigo = true),
            ProductEntity(9008, "Pão de queijo (unid.)", null, 2.5, null, "Salgados", 15, 0, true, now, semCodigo = true),
        ),
        target = target,
    )
}
