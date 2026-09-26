package com.tridi.market.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface MarketDao {
    @Query("SELECT * FROM products WHERE active = 1 ORDER BY categoryName, name")
    fun observeProducts(): Flow<List<ProductEntity>>

    // REJECTED é decisão definitiva do servidor (tablet revogado, payload
    // divergente) — retentar em loop a cada 15 min nunca ia mudar o resultado.
    // Continua GUARDADA no tablet: nada é apagado, o gestor consegue auditar.
    // REQUIRES_REVIEW continua na fila de propósito: a RPC desfaz tudo quando
    // dá erro, então não há nada gravado no servidor e retentar é seguro.
    @Query("SELECT * FROM pending_operations WHERE state NOT IN ('SYNCED','REJECTED') ORDER BY localSequence")
    suspend fun pendingOperations(): List<PendingOperationEntity>

    @Query("SELECT * FROM pending_items WHERE operationId = :operationId")
    suspend fun itemsFor(operationId: String): List<PendingItemEntity>

    @Query("SELECT COALESCE(MAX(localSequence), 0) + 1 FROM pending_operations")
    suspend fun nextSequence(): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProducts(products: List<ProductEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertEmployees(employees: List<EmployeeSnapshotEntity>)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertOperation(operation: PendingOperationEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertItems(items: List<PendingItemEntity>)

    @Query("UPDATE products SET stock = stock - :quantity WHERE id = :productId")
    suspend fun decrementStock(productId: Long, quantity: Int)

    @Query("UPDATE pending_operations SET state = :state, serverReason = :reason WHERE operationId = :operationId")
    suspend fun updateOperation(operationId: String, state: String, reason: String?)

    @Query("DELETE FROM products") suspend fun clearProducts()
    @Query("DELETE FROM employee_snapshots") suspend fun clearEmployees()


    // Chave/valor pequeno e durável. É onde mora o carrinho em andamento: ele
    // vivia só na memória do ViewModel, então tablet sem bateria perdia o que
    // a pessoa já tinha escolhido.
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMetadata(linha: MarketMetadataEntity)

    @Query("SELECT value FROM market_metadata WHERE key = :chave")
    suspend fun metadata(chave: String): String?

    @Query("DELETE FROM market_metadata WHERE key = :chave")
    suspend fun clearMetadata(chave: String)

    // Login offline: um único hash é calculado a partir do código digitado e
    // procurado aqui. Códigos repetidos são a MESMA pessoa em empresas
    // diferentes (caso comum aqui), por isso pode voltar mais de uma linha.
    @Query("SELECT * FROM employee_snapshots WHERE codeHash = :codeHash AND codeHash != ''")
    suspend fun employeesByCodeHash(codeHash: String): List<EmployeeSnapshotEntity>

    @Query("SELECT COUNT(*) FROM employee_snapshots WHERE codeHash != ''")
    suspend fun directorySize(): Int

    // Busca do leitor de código de barras. Roda no banco LOCAL, então funciona
    // sem internet. As variações (UPC-A × EAN-13, zeros à esquerda) vêm de
    // chavesDeBusca() — daí o `IN` em vez de igualdade simples.
    // Sem LIMIT 1: o mesmo código pode ser de mais de um produto (permitido no
    // painel, mediante confirmação). Quem decide o que fazer com o empate é a
    // tela — aqui só devolvemos tudo que casou, em ordem estável.
    @Query("SELECT * FROM products WHERE barcode IN (:codigos) ORDER BY name")
    suspend fun productsByBarcode(codigos: List<String>): List<ProductEntity>

    // Fotos a garantir no disco do tablet (ver ImagensOffline).
    @Query("SELECT * FROM products WHERE imageUrl IS NOT NULL AND imageUrl != ''")
    suspend fun produtosParaCache(): List<ProductEntity>

    // "Mais comprados" DESTA pessoa, do histórico que já está no tablet: as
    // compras ficam em pending_operations mesmo depois de sincronizadas, então
    // dá pra personalizar sem depender de servidor nem de internet.
    @Query(
        """
        SELECT p.* FROM products p
        JOIN pending_items i ON i.productId = p.id
        JOIN pending_operations o ON o.operationId = i.operationId
        WHERE o.employeeId = :employeeId AND p.active = 1
        GROUP BY p.id
        ORDER BY SUM(i.quantity) DESC, MAX(o.createdAt) DESC
        LIMIT :limite
        """,
    )
    suspend fun maisCompradosPor(employeeId: Long, limite: Int): List<ProductEntity>

    // Quem nunca comprou aqui cai no mais vendido DO TABLET — melhor que uma
    // seção vazia no primeiro acesso.
    @Query(
        """
        SELECT p.* FROM products p
        JOIN pending_items i ON i.productId = p.id
        WHERE p.active = 1
        GROUP BY p.id
        ORDER BY SUM(i.quantity) DESC
        LIMIT :limite
        """,
    )
    suspend fun maisCompradosNoTablet(limite: Int): List<ProductEntity>

    @Transaction
    suspend fun queuePurchase(operation: PendingOperationEntity, items: List<PendingItemEntity>) {
        insertOperation(operation)
        insertItems(items)
        items.forEach { decrementStock(it.productId, it.quantity) }
    }

    @Transaction
    suspend fun replaceSnapshot(products: List<ProductEntity>, employees: List<EmployeeSnapshotEntity>) {
        clearProducts(); clearEmployees(); upsertProducts(products); upsertEmployees(employees)
    }
}
