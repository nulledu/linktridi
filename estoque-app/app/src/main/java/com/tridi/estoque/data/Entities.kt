package com.tridi.estoque.data

import androidx.room.Entity

// Chave/valor pequeno e durável — armazenamento genérico do app (ver
// EstoqueDao.putMetadata/metadata/clearMetadata). As entidades de produto,
// funcionário e compra do TridiMarket saíram na poda do domínio de venda
// (ver docs/superpowers/plans/2026-08-11-estoque-fundacao-catalogo.md); o
// catálogo e as unidades do galpão moram no Postgres do dashvendas, não
// neste banco local do tablet.
@Entity(tableName = "estoque_metadata")
data class EstoqueMetadataEntity(
    @androidx.room.PrimaryKey val key: String,
    val value: String,
)

// Diretório de operadores em cache — permite logar SEM REDE (ver
// data/OperadorAuth.kt). Vem do bootstrap; `verificador` NUNCA é o código de
// acesso em si, é o hash com sal (security/OfflineCodes.kt — o sal fica em
// EstoqueMetadataEntity, chave "operadores_salt").
@Entity(tableName = "estoque_operadores")
data class OperadorEntity(
    @androidx.room.PrimaryKey val id: String,
    val nome: String,
    val verificador: String,
)

// ── O catálogo em cache: "quantos temos disso?" ─────────────────────────────
//
// A ÚNICA tabela deste banco que não é fila nem credencial — e a razão de ela
// existir é que as três filas do galpão (bipar, receber, conferir) nascem
// vazias, então o aparelho não oferecia nada no dia em que a operação ainda
// não começou. Consultar o estoque usa o dado que já existe (192 itens) e
// funciona no primeiro dia.
//
// Cópia local de propósito: a pessoa está no meio do galpão, onde o Wi-Fi
// falha, e uma busca que depende de rede é uma busca que não responde. O
// servidor manda o catálogo inteiro UMA vez (ver `sincronizarCatalogo`) e
// depois só quando a assinatura muda.
//
// `busca` e `skuBusca` são derivados de `nome`/`categoria`/`sku`, gravados
// junto — o `LIKE` do SQLite não tira acento nem baixa caixa fora do ASCII, e
// calcular na hora da consulta significaria varrer a tabela em Kotlin a cada
// tecla digitada. Quem deriva é `catalogo/Catalogo.kt`, em Kotlin puro.
@Entity(tableName = "catalogo_itens")
data class ItemCatalogoEntity(
    @androidx.room.PrimaryKey val id: String,
    val nome: String,
    val sku: String?,
    val categoria: String?,
    val unidade: String,
    /** Peças em estoque. `Double` porque item a granel tem meio metro, meia lata. */
    val quantidade: Double,
    /** "COR-A · Corredor A", montado pelo servidor. `null` = item sem local. */
    val local: String?,
    /** `nome + categoria + sku` normalizados — é onde o LIKE procura. */
    val busca: String,
    /** SKU em caixa alta, "" quando não há: é o que a etiqueta bipada casa. */
    val skuBusca: String,
)

// A pilha de bipagem em andamento — as leituras que a pessoa já fez e ainda
// NÃO confirmou. Vira `pending_baixas` quando ela escolhe o motivo e aperta
// Confirmar; até lá, só existe aqui.
//
// Chave é o próprio código: a pilha é um conjunto (a segunda leitura da mesma
// etiqueta não conta duas vezes — ver `registrarLeitura`), então regravar é
// inofensivo por construção.
//
// `operadorId` porque o rascunho NÃO pode atravessar pro código da próxima
// pessoa: ela assinaria uma baixa que não bipou. Quem decide o que volta pra
// tela é `destinoDoRascunho` (scan/BipagemState.kt), em Kotlin puro.
@Entity(tableName = "pilha_em_aberto")
data class LeituraEmAbertoEntity(
    @androidx.room.PrimaryKey val codigo: String,
    val operadorId: String,
    val criadoEm: Long = System.currentTimeMillis(),
)

// Um lote de baixa pendente de envio. `codigosJson` é a lista de etiquetas
// bipadas serializada — o lote nasce e morre inteiro, não vale uma tabela
// filha só pra isso. Ver sync/EstoqueSyncWorker.kt e sync/FilaReducer.kt.
@Entity(tableName = "pending_baixas")
data class PendingBaixaEntity(
    @androidx.room.PrimaryKey val operationId: String,
    val codigosJson: String,
    val motivo: String,
    val obs: String?,
    val operadorId: String,
    val ocorridoEm: String,
    val tentativas: Int = 0,
    val ultimoErro: String? = null,
    // 4xx que NÃO é de autenticação: o servidor recusou o CONTEÚDO, reenviar
    // não muda o resultado — o worker para de tentar, mas a linha continua
    // aqui pra quem olhar o motivo (ver reduzirEnvio em sync/FilaReducer.kt).
    val falhouDefinitivo: Boolean = false,
    val criadoEm: Long = System.currentTimeMillis(),
)

// Uma LINHA de entrada por bipagem pendente de envio: um código, N peças, o
// motivo. Linha e não lote: o endpoint do servidor (device/entrada) trabalha
// por código, e um lote local que virasse N chamadas com UM operationId
// quebraria a idempotência — a primeira gravaria o resultado e as demais
// seriam "repetidas". Uma linha, um operationId, uma chamada.
@Entity(tableName = "pending_entradas")
data class PendingEntradaEntity(
    @androidx.room.PrimaryKey val operationId: String,
    val codigo: String,
    val quantidade: Int,
    val motivo: String,
    val obs: String?,
    val operadorId: String,
    val ocorridoEm: String,
    val tentativas: Int = 0,
    val ultimoErro: String? = null,
    val falhouDefinitivo: Boolean = false,
    val criadoEm: Long = System.currentTimeMillis(),
)

@Entity(tableName = "pending_recebimentos")
data class PendingRecebimentoEntity(
    @androidx.room.PrimaryKey val operationId: String,
    val compraId: String,
    val quantidadeRecebida: Int,
    val operadorId: String,
    val ocorridoEm: String,
    val tentativas: Int = 0,
    val ultimoErro: String? = null,
    val falhouDefinitivo: Boolean = false,
    val criadoEm: Long = System.currentTimeMillis(),
)

// Uma conferência de qualidade pendente de envio — o gestor disse CERTO ou
// ERRADO na frente da caixa e a tela voltou NA HORA; isto é o que sobe depois.
//
// `operationId` nasce no enfileiramento e nunca é regenerado: reenviar com o
// mesmo id é o que faz o servidor devolver o resultado já gravado em vez de
// admitir a mesma caixa de 50 peças no estoque duas vezes.
//
// NÃO HÁ QUANTIDADE AQUI. A caixa nasce com o número que a PESSOA registrou ao
// concluir a atividade, lido pelo servidor na hora de gravar; guardá-lo nesta
// linha criaria uma segunda fonte da verdade viajando numa fila que pode subir
// horas (ou dias sem Wi-Fi) depois.
@Entity(tableName = "pending_conferencias")
data class PendingConferenciaEntity(
    @androidx.room.PrimaryKey val operationId: String,
    val atividadeId: String,
    /** Só pra tela conseguir dizer QUAL conferência falhou, sem ir buscar de novo. */
    val produtoNome: String,
    /** "certo" | "errado" — as chaves de `RESULTADOS` em lib/estoque-qualidade.ts. */
    val resultado: String,
    /**
     * O item do catálogo que o gestor escolheu — o `destinoId` do envio.
     *
     * Viaja NA FILA junto do veredito, e não é detalhe: a atividade quase nunca
     * aponta produto, então sem este id a aprovação que subir daqui a três
     * horas será recusada com `destino_nao_escolhido` do mesmo jeito. É a única
     * coisa desta linha que o servidor não consegue reconstituir sozinho.
     *
     * `null` no ERRADO (nada entra no estoque) e na atividade que já aponta
     * produto (o servidor resolve por nome, como sempre fez).
     */
    val destinoId: String? = null,
    /** Lista de chaves serializada — a lista fechada de `DefeitoConferencia`. */
    val defeitosJson: String,
    val obs: String?,
    val conferidoPorId: String,
    val ocorridoEm: String,
    val tentativas: Int = 0,
    val ultimoErro: String? = null,
    val falhouDefinitivo: Boolean = false,
    val criadoEm: Long = System.currentTimeMillis(),
)

// O que o servidor respondeu depois que uma baixa/recebimento sincronizou. A
// tela não fica plantada esperando a resposta (a fila confirma na hora e
// sincroniza em segundo plano) — o resultado fica aqui até a pessoa ver.
@Entity(tableName = "sync_feedback")
data class SyncFeedbackEntity(
    @androidx.room.PrimaryKey val id: String,
    /** "baixa" | "recebimento" | "conferencia" */
    val tipo: String,
    /** Lista serializada — List&lt;BaixaItemResultado&gt;, List&lt;String&gt; (unidades) ou List&lt;EtiquetaDto&gt;. */
    val resumoJson: String,
    val criadoEm: Long = System.currentTimeMillis(),
)

// ── Trabalhos de impressão que vieram do escritório ─────────────────────────
//
// ESTA TABELA É A TRAVA CONTRA A SEGUNDA TIRA, e é o espelho de
// `estoque_operacoes` no servidor com os papéis invertidos: lá o servidor
// guarda a operação pra não PROCESSAR duas vezes; aqui o aparelho guarda o id
// do trabalho pra não IMPRIMIR duas vezes.
//
// O caso que ela resolve não é o reenvio da web — é a confirmação que se perde
// na volta. O tablet imprime, manda "saiu", a resposta morre no Wi-Fi do
// galpão: no servidor o trabalho continua `fila`, e ele desce de novo no ciclo
// seguinte. Sem esta tabela, sai um segundo papel.
//
// Com ela, o trabalho que volta é IGNORADO na entrada (`OnConflictStrategy.
// IGNORE` pela chave, que é o id do servidor) e o que se refaz é só o que de
// fato faltou: a confirmação.
//
// Ela também é o que faz o app não perder trabalho ao morrer entre o download e
// a impressão — o conteúdo já está gravado quando o Bluetooth começa.
@Entity(tableName = "trabalhos_impressao")
data class TrabalhoImpressaoEntity(
    /** O id do SERVIDOR, nunca gerado aqui. É ele que identifica a repetição. */
    @androidx.room.PrimaryKey val id: String,
    /** O JSON do conteúdo, como veio. O app não reinterpreta o que não entende. */
    val conteudoJson: String,
    val copias: Int,
    val recebidoEm: Long = System.currentTimeMillis(),
    /** Saiu no papel (ou foi recusado) — o que ainda é `null` é o que falta imprimir. */
    val impressoEm: Long? = null,
    /** `null` = deu certo. Preenchido = a frase que sobe pro escritório. */
    val erro: String? = null,
    /** O escritório já soube. Enquanto for `false`, a confirmação é reenviada. */
    val confirmado: Boolean = false,
    val tentativasDeConfirmar: Int = 0,
)
