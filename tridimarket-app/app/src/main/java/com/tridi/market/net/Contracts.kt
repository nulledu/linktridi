package com.tridi.market.net

import kotlinx.serialization.Serializable

@Serializable data class ActivationRequest(val code: String, val appVersion: String, val installationId: String)
@Serializable data class ActivationData(val deviceId: String, val profileId: String, val deviceName: String, val token: String, val rulesVersion: Int)
@Serializable data class PinRequest(val pin: String)
@Serializable data class EmployeeDto(val id: Long, val profileId: String, val companyId: Long, val name: String, val imageUrl: String? = null, val normalLimit: Double, val overdraftLimit: Double, val open: Double, val overdue: Double, val available: Double, val status: String)
// `visitante` = a pessoa é de OUTRA empresa que não a dona deste tablet. Como
// qualquer um pode comprar em qualquer tablet, o totem avisa na tela — a dívida
// vai pra carteira da empresa dela, e o estoque sai daqui.
// `empresa` = nome da unidade cuja carteira será cobrada. Aparece na tela porque
// várias pessoas têm conta em mais de uma empresa (mesmo código) — assim ela vê
// exatamente onde a compra vai cair.
@Serializable data class SessionData(val token: String, val expiresAt: String, val employee: EmployeeDto, val visitante: Boolean = false, val empresa: String? = null)
@Serializable data class ProductDto(val id: Long, val companyId: Long, val barcode: String? = null, val name: String, val price: Double, val imageUrl: String? = null, val categoryName: String? = null, val active: Boolean, val stock: Int, val minimumStock: Int, val semCodigo: Boolean = false, val ocultoBusca: Boolean = false)
@Serializable data class ProfileDto(val id: String, val name: String)
// Diretório para login SEM INTERNET: o tablet recebe um verificador por pessoa
// (nunca o código) e resolve o login localmente. Ver _sessao.ts no servidor.
@Serializable data class EmployeeDirectoryDto(
    val id: Long, val profileId: String, val companyId: Long, val name: String, val imageUrl: String? = null,
    val normalLimit: Double, val overdraftLimit: Double, val open: Double, val overdue: Double,
    val available: Double, val status: String, val codeHash: String,
)
@Serializable data class BootstrapData(
    val profile: ProfileDto? = null,
    val products: List<ProductDto>,
    val employees: List<EmployeeDirectoryDto> = emptyList(),
    val authSalt: String = "",
    val offlineGrant: String = "",
    val offlineGrantExpiresAt: String = "",
    val rulesVersion: Int,
    val serverTime: String,
    val maxOfflineHours: Int,
)
@Serializable data class PurchaseLineRequest(val productId: Long, val quantity: Int, val unitPrice: Double)
@Serializable data class PurchaseRequest(val operationId: String, val localSequence: Long, val employeeId: Long, val companyId: Long, val deviceOccurredAt: String, val rulesVersion: Int, val items: List<PurchaseLineRequest>)
@Serializable data class PurchaseResult(val operationId: String, val status: String, val saleId: Long? = null, val reason: String? = null, val serverReceivedAt: String)
@Serializable data class HeartbeatRequest(val pendingOperations: Int, val appVersion: String, val health: Map<String, String> = emptyMap())
@Serializable data class ApiEnvelope<T>(val ok: Boolean, val data: T? = null, val error: String? = null)
