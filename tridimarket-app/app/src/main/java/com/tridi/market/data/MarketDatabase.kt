package com.tridi.market.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [ProductEntity::class, EmployeeSnapshotEntity::class, PendingOperationEntity::class, PendingItemEntity::class, MarketMetadataEntity::class],
    version = 6,
    exportSchema = true,
)
abstract class MarketDatabase : RoomDatabase() {
    abstract fun marketDao(): MarketDao

    companion object {
        @Volatile private var instance: MarketDatabase? = null

        // v2: diretório de funcionários para login offline.
        // ALTER TABLE preserva as linhas — nada de recriar a tabela.
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE employee_snapshots ADD COLUMN profileId TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE employee_snapshots ADD COLUMN companyId INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE employee_snapshots ADD COLUMN normalLimit REAL NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE employee_snapshots ADD COLUMN overdraftLimit REAL NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE employee_snapshots ADD COLUMN overdue REAL NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE employee_snapshots ADD COLUMN codeHash TEXT NOT NULL DEFAULT ''")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_employee_snapshots_codeHash ON employee_snapshots(codeHash)")
            }
        }

        // v3: produto sem código de barras (categoria própria na busca do totem).
        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE products ADD COLUMN semCodigo INTEGER NOT NULL DEFAULT 0")
            }
        }

        // v4: produto escondido da lista de busca (segue vendável ao bipar).
        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE products ADD COLUMN ocultoBusca INTEGER NOT NULL DEFAULT 0")
            }
        }

        // v5: impressão digital visual das fotos, para reconhecer o produto pela
        // aparência quando o código de barras não sai.
        //
        // Tabela à parte porque `products` é substituída inteira a cada sync, e
        // esta assinatura é calculada no tablet — guardá-la junto do produto
        // faria cada sincronização apagar o trabalho.
        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS product_signatures (
                        productId INTEGER NOT NULL PRIMARY KEY,
                        imagemUrl TEXT NOT NULL,
                        assinatura BLOB NOT NULL,
                        calculadoEm INTEGER NOT NULL
                    )
                    """.trimIndent(),
                )
            }
        }

        // A leitura por câmera saiu do totem, e com ela o reconhecimento por
        // APARÊNCIA — a tabela de assinaturas não tem mais quem a leia nem quem
        // a escreva. Some de verdade em vez de ficar ocupando disco no tablet:
        // eram 240 blobs recalculados a cada troca de foto do catálogo.
        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("DROP TABLE IF EXISTS product_signatures")
            }
        }

        fun get(context: Context): MarketDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, MarketDatabase::class.java, "tridimarket.db")
                // NUNCA destrutivo: este banco guarda compras feitas offline que
                // ainda não chegaram ao servidor. Apagar na troca de versão seria
                // perder venda. Toda mudança de schema exige migração explícita —
                // se faltar uma, o app falha na cara do desenvolvedor em vez de
                // sumir com o dinheiro do mercadinho.
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6)
                // TABLET SEM BATERIA NÃO PODE PERDER COMPRA.
                //
                // O padrão do Room é WAL com `synchronous = NORMAL`: a transação
                // é dada por confirmada assim que o sistema aceita a escrita, mas
                // o conteúdo ainda pode estar só no cache do sistema de arquivos.
                // Isso sobrevive ao app morrer — NÃO sobrevive ao aparelho
                // desligar na hora (bateria acabando, tomada caindo no kiosk).
                // Como cada linha em `pending_operations` é uma venda que ainda
                // não chegou ao servidor, perder a última é perder dinheiro real.
                //
                // FULL força o fsync a cada commit: quando `queuePurchase`
                // retorna, a compra está NO DISCO. Custa alguns milissegundos por
                // gravação — irrelevante para o punhado de escritas por minuto
                // de um mercadinho, e barato perto de uma venda sumindo.
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onOpen(db: SupportSQLiteDatabase) {
                        db.execSQL("PRAGMA synchronous = FULL")
                    }
                })
                .build()
                .also { instance = it }
        }
    }
}
