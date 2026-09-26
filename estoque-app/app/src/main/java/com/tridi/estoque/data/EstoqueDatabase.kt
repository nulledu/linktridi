package com.tridi.estoque.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

// Versão 8: a conferência passa a dizer EM QUAL ITEM do catálogo as peças
// entram (`pending_conferencias.destinoId`). Sem essa coluna a escolha do
// gestor morreria na tela: a fila é offline, ela sobe minutos ou horas depois,
// e o servidor recusa toda aprovação sem destino nas atividades que só têm a
// tarefa em texto — 103 das 104 concluídas no galpão.
//
// Versão 7: o escritório passa a poder MANDAR IMPRIMIR no galpão, e os
// trabalhos que descem ganham tabela local (`trabalhos_impressao`). Ela não é
// cache: é a TRAVA contra a segunda tira — o aparelho guarda o id de todo
// trabalho que já viu e ignora o que o servidor reoferecer porque a confirmação
// se perdeu na volta.
//
// Versão 6: o catálogo do galpão ganha cópia local (`catalogo_itens`), pra o
// aparelho conseguir responder "quantos temos disso?" sem rede — a única
// função do app que serve ANTES de existir fila de trabalho.
//
// Versão 5: a pilha de bipagem em andamento (`pilha_em_aberto`) passa a ser
// gravada, pra ela sobreviver ao tablet desligar antes do Confirmar.
//
// Versão 4: a conferência virou BINÁRIA (certo/errado) e a fila mudou de forma
// — `resultado` no lugar de `nota` + `quantidadeAprovada` + `quantidadeRecusada`.
// A v3 tinha acrescentado a fila de conferências ao lado das de baixa e
// recebimento.
//
// As duas subidas ganharam MIGRAÇÃO DE VERDADE, e não o descarte destrutivo que
// as anteriores usaram. O motivo mudou junto com o app: da v2 em diante o banco
// deixou de ser só cache — ele guarda as FILAS OFFLINE. Um tablet que sobe de
// versão com três baixas por sincronizar perderia as três em silêncio, e o
// galpão só descobriria semanas depois, no inventário. Converter uma tabela são
// quatro linhas de SQL; apagar trabalho de alguém não tem desfazer.
//
// O `fallbackToDestructiveMigration()` fica como rede para caminhos sem
// migração escrita (a v1, que nunca teve fila).
@Database(
    entities = [
        EstoqueMetadataEntity::class,
        OperadorEntity::class,
        PendingBaixaEntity::class,
        PendingEntradaEntity::class,
        PendingRecebimentoEntity::class,
        PendingConferenciaEntity::class,
        SyncFeedbackEntity::class,
        LeituraEmAbertoEntity::class,
        ItemCatalogoEntity::class,
        TrabalhoImpressaoEntity::class,
    ],
    version = 9,
    exportSchema = true,
)
abstract class EstoqueDatabase : RoomDatabase() {
    abstract fun estoqueDao(): EstoqueDao

    companion object {
        @Volatile private var instance: EstoqueDatabase? = null

        /**
         * v2 → v3: só cria a tabela da fila de conferências.
         *
         * O SQL mora em `MigracoesSql.kt`, sem import de Android, e um teste o
         * confere contra o schema que o próprio Room exportou
         * (`app/schemas/.../3.json`). Uma letra fora do lugar aqui não estoura
         * no build: estoura na abertura do banco, no tablet do galpão.
         */
        val MIGRACAO_2_PARA_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(SQL_CRIA_PENDING_CONFERENCIAS_V3)
            }
        }

        /**
         * v3 → v4: a conferência vira certo/errado e a fila é CONVERTIDA.
         *
         * SQLite não deixa apagar coluna com segurança nas versões que rodam
         * nos tablets do galpão, então é o caminho canônico de quatro passos:
         * cria a tabela nova, copia traduzindo, derruba a velha, renomeia. Os
         * quatro moram em `MigracoesSql.kt`, testados contra o schema que o
         * próprio Room exportou.
         *
         * O que NÃO se faz aqui é o mais importante: nada de
         * `DROP TABLE pending_conferencias` seco. Quem está com o tablet no
         * galpão sem Wi-Fi tem conferência esperando nessa tabela — e uma
         * conferência perdida é uma caixa pronta que nunca entra no estoque,
         * descoberta só no inventário.
         */
        val MIGRACAO_3_PARA_4 = object : androidx.room.migration.Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                PASSOS_MIGRACAO_3_PARA_4.forEach { db.execSQL(it) }
            }
        }

        /**
         * v4 → v5: cria a tabela do rascunho da bipagem. Nada mais.
         *
         * Nenhuma fila é convertida nem derrubada — quem estiver com o tablet
         * no galpão sobe de versão sem perceber, e a pilha que ele bipar
         * DEPOIS é a primeira a sobreviver a uma queda de bateria.
         */
        val MIGRACAO_4_PARA_5 = object : androidx.room.migration.Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(SQL_CRIA_PILHA_EM_ABERTO_V5)
            }
        }

        /**
         * v5 → v6: cria a tabela do catálogo em cache. Nada mais.
         *
         * Mesma forma da v5 e pelo mesmo motivo: é acréscimo puro. O catálogo
         * é CACHE — se ele se perdesse não haveria dano, a próxima
         * sincronização o traz de volta. As filas, que são trabalho de gente,
         * continuam intocadas.
         */
        val MIGRACAO_5_PARA_6 = object : androidx.room.migration.Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(SQL_CRIA_CATALOGO_ITENS_V6)
            }
        }

        /**
         * v6 → v7: cria a tabela dos trabalhos de impressão. Nada mais.
         *
         * Acréscimo puro, como a v5 e a v6. As filas — que são trabalho de
         * gente esperando rede — continuam intocadas.
         */
        val MIGRACAO_6_PARA_7 = object : androidx.room.migration.Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(SQL_CRIA_TRABALHOS_IMPRESSAO_V7)
            }
        }

        /**
         * v7 → v8: a fila de conferências ganha o item de destino.
         *
         * Uma coluna anulável acrescentada — nada é copiado nem derrubado. Um
         * tablet que sobe de versão com conferências esperando Wi-Fi mantém as
         * linhas intactas: elas sobem com `destinoId` nulo, que é o
         * comportamento de antes (o servidor resolve o item por `produto_nome`).
         */
        val MIGRACAO_7_PARA_8 = object : androidx.room.migration.Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(SQL_ACRESCENTA_DESTINO_V8)
            }
        }

        /** v8 → v9: só cria a fila da entrada por bipagem. Nada é convertido. */
        val MIGRACAO_8_PARA_9 = object : androidx.room.migration.Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(SQL_CRIA_PENDING_ENTRADAS_V9)
            }
        }

        fun get(context: Context): EstoqueDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, EstoqueDatabase::class.java, "tridiestoque.db")
                // TABLET SEM BATERIA NÃO PODE PERDER DADO.
                //
                // O padrão do Room é WAL com `synchronous = NORMAL`: a transação
                // é dada por confirmada assim que o sistema aceita a escrita, mas
                // o conteúdo ainda pode estar só no cache do sistema de arquivos.
                // Isso sobrevive ao app morrer — NÃO sobrevive ao aparelho
                // desligar na hora (bateria acabando, tomada caindo no kiosk).
                // FULL força o fsync a cada commit — herdado do TridiMarket
                // porque a garantia vale igual pra qualquer fila offline que
                // este banco vier a guardar.
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onOpen(db: SupportSQLiteDatabase) {
                        db.execSQL("PRAGMA synchronous = FULL")
                    }
                })
                .addMigrations(
                    MIGRACAO_2_PARA_3, MIGRACAO_3_PARA_4, MIGRACAO_4_PARA_5,
                    MIGRACAO_5_PARA_6, MIGRACAO_6_PARA_7, MIGRACAO_7_PARA_8,
                    MIGRACAO_8_PARA_9,
                )
                .fallbackToDestructiveMigration()
                .build()
                .also { instance = it }
        }
    }
}
