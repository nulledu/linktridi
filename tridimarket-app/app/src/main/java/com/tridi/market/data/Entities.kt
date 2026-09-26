package com.tridi.market.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(tableName = "products")
data class ProductEntity(
    @androidx.room.PrimaryKey val id: Long,
    val name: String,
    val barcode: String?,
    val price: Double,
    val imageUrl: String?,
    val categoryName: String?,
    val stock: Int,
    val minimumStock: Int,
    val active: Boolean,
    val snapshotAt: Long,
    // Marcado no admin (produtos.sem_codigo): produto sem código de barras
    // (granel/doce). Não bipa — aparece numa categoria própria na busca do totem.
    // Último campo + default: os construtores posicionais (preview/testes) seguem.
    val semCodigo: Boolean = false,
    // Escolhido no painel (produtos.oculto_busca): some da lista de busca do
    // totem. NÃO impede a venda — bipar o código continua achando e vendendo.
    val ocultoBusca: Boolean = false,
)

// Diretório local de funcionários. É o que permite reconhecer o código de
// QUALQUER pessoa com o tablet sem internet: `codeHash` é o verificador vindo
// do servidor (o código nunca é gravado aqui). Indexado porque o login é uma
// busca por esse campo.
@Entity(tableName = "employee_snapshots", indices = [Index("codeHash")])
data class EmployeeSnapshotEntity(
    @androidx.room.PrimaryKey val id: Long,
    val name: String,
    val imageUrl: String?,
    val open: Double,
    val available: Double,
    val status: String,
    val snapshotAt: Long,
    val profileId: String = "",
    val companyId: Long = 0,
    val normalLimit: Double = 0.0,
    val overdraftLimit: Double = 0.0,
    val overdue: Double = 0.0,
    val codeHash: String = "",
)

@Entity(tableName = "pending_operations", indices = [Index("localSequence", unique = true)])
data class PendingOperationEntity(
    @androidx.room.PrimaryKey val operationId: String,
    val employeeId: Long,
    val localSequence: Long,
    val total: Double,
    val deviceOccurredAt: String,
    val rulesVersion: Int,
    val sessionToken: String,
    val state: String = "LOCAL_PENDING",
    val serverReason: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)

@Entity(
    tableName = "pending_items",
    primaryKeys = ["operationId", "productId"],
    foreignKeys = [ForeignKey(
        entity = PendingOperationEntity::class,
        parentColumns = ["operationId"],
        childColumns = ["operationId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("operationId")],
)
data class PendingItemEntity(
    val operationId: String,
    val productId: Long,
    val quantity: Int,
    val unitPrice: Double,
)

@Entity(tableName = "market_metadata")
data class MarketMetadataEntity(
    @androidx.room.PrimaryKey val key: String,
    val value: String,
)
