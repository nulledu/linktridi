package com.tridi.estoque.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.tridi.estoque.conferencia.ConferenciaNaFila
import com.tridi.estoque.sync.ResumoDaFila
import kotlinx.coroutines.flow.Flow

// ── O retrato de uma fila, em UMA consulta ───────────────────────────────────
//
// As três filas (baixa, recebimento, conferência) têm as mesmas colunas de
// controle, então o SQL é o mesmo texto com outro nome de tabela. Montado por
// concatenação de `const val` — que o compilador dobra num literal antes de o
// Room ver — em vez de três blocos copiados: colar o mesmo agregado três vezes
// é como um deles fica pra trás numa mudança e a faixa passa a mentir só numa
// das operações.
//
// As colunas SAEM com o nome dos campos de `ResumoDaFila`; Room casa por nome.
private const val RESUMO_INICIO =
    "SELECT COALESCE(SUM(CASE WHEN falhouDefinitivo = 0 THEN 1 ELSE 0 END), 0) AS pendentes, " +
        "COALESCE(SUM(CASE WHEN falhouDefinitivo = 1 THEN 1 ELSE 0 END), 0) AS recusadas, " +
        "MIN(CASE WHEN falhouDefinitivo = 0 THEN criadoEm END) AS maisAntigaEm, " +
        "COALESCE(MAX(CASE WHEN falhouDefinitivo = 0 THEN tentativas END), 0) AS tentativas, " +
        "(SELECT ultimoErro FROM "

// O `ultimoErro` é o da mais ANTIGA que ainda espera, não o de qualquer uma: é
// ele que diz se o aparelho perdeu o acesso (401 `invalid_device`) ou se o
// servidor é que está fora.
private const val RESUMO_FIM =
    " WHERE falhouDefinitivo = 0 ORDER BY criadoEm ASC LIMIT 1) AS ultimoErro FROM "

private const val RESUMO_BAIXAS = RESUMO_INICIO + "pending_baixas" + RESUMO_FIM + "pending_baixas"
private const val RESUMO_RECEBIMENTOS = RESUMO_INICIO + "pending_recebimentos" + RESUMO_FIM + "pending_recebimentos"
private const val RESUMO_CONFERENCIAS = RESUMO_INICIO + "pending_conferencias" + RESUMO_FIM + "pending_conferencias"
private const val RESUMO_ENTRADAS = RESUMO_INICIO + "pending_entradas" + RESUMO_FIM + "pending_entradas"

// ── A tomada do trabalho de impressão, em UMA instrução ──────────────────────
//
// `internal` e não `private` porque é o texto que o teste confere: a garantia
// de "uma etiqueta, um papel" está inteira no `WHERE ... IS NULL` desta linha,
// e um refactor que a transformasse em `WHERE id = :id` compilaria, passaria em
// tudo, e só apareceria como papel repetido no galpão.
internal const val SQL_RESERVA_TRABALHO =
    "UPDATE trabalhos_impressao SET impressoEm = :agora, erro = :marca " +
        "WHERE id = :id AND impressoEm IS NULL"

@Dao
interface EstoqueDao {
    // ── Chave/valor genérico (sal do diretório offline, motivos, compras) ───
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMetadata(linha: EstoqueMetadataEntity)

    @Query("SELECT value FROM estoque_metadata WHERE key = :chave")
    suspend fun metadata(chave: String): String?

    @Query("DELETE FROM estoque_metadata WHERE key = :chave")
    suspend fun clearMetadata(chave: String)

    // ── Operadores (diretório offline) ───────────────────────────────────────
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putOperadores(lista: List<OperadorEntity>)

    @Query("DELETE FROM estoque_operadores")
    suspend fun limparOperadores()

    @Query("SELECT * FROM estoque_operadores ORDER BY nome")
    suspend fun operadores(): List<OperadorEntity>

    // ── Catálogo em cache ("quantos temos disso?") ───────────────────────────
    //
    // A troca é ATÔMICA por transação (`substituirCatalogo`): apagar e reinserir
    // em duas chamadas soltas deixaria uma janela em que a busca responde
    // "nenhum item neste tablet" — e a tela leria isso como "o catálogo nunca
    // foi baixado", mandando a pessoa procurar Wi-Fi que ela não precisa.

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putItensDoCatalogo(lista: List<ItemCatalogoEntity>)

    @Query("DELETE FROM catalogo_itens")
    suspend fun limparCatalogo()

    @androidx.room.Transaction
    suspend fun substituirCatalogo(lista: List<ItemCatalogoEntity>) {
        limparCatalogo()
        putItensDoCatalogo(lista)
    }

    @Query("SELECT COUNT(*) FROM catalogo_itens")
    suspend fun quantosItensNoCatalogo(): Int

    /**
     * A busca da tela — até três palavras, todas exigidas.
     *
     * `AND` e não `OR`: quem digita "mdf 6" quer as chapas de 6mm, não tudo o
     * que tem "6" no nome. As palavras 2 e 3 chegam vazias quando a pessoa
     * digitou menos que isso, e a comparação com `''` as neutraliza — é o que
     * cabe numa consulta fixa do Room sem montar SQL na mão.
     *
     * A ordenação põe na frente quem COMEÇA com o que foi digitado: procurar
     * "cola" tem que trazer "Cola branca" antes de "Manta acolchoada", senão a
     * pessoa rola uma lista de trinta itens pra achar o óbvio.
     *
     * `LIMIT` sempre — sem ele, duas letras devolveriam o catálogo inteiro pra
     * uma tela que mostra sete linhas.
     */
    @Query(
        "SELECT * FROM catalogo_itens WHERE busca LIKE '%' || :p1 || '%' " +
            "AND (:p2 = '' OR busca LIKE '%' || :p2 || '%') " +
            "AND (:p3 = '' OR busca LIKE '%' || :p3 || '%') " +
            "ORDER BY (CASE WHEN busca LIKE :p1 || '%' THEN 0 ELSE 1 END), nome " +
            "LIMIT :limite",
    )
    suspend fun buscarNoCatalogo(p1: String, p2: String, p3: String, limite: Int): List<ItemCatalogoEntity>

    /**
     * O item de uma etiqueta bipada, pelo SKU.
     *
     * A etiqueta é `<SKU>-<sequencial>` e quem bipa quer o ITEM — a unidade
     * específica quase nunca está neste tablet, e a pergunta ("quantos temos?")
     * é sobre o item de qualquer jeito.
     */
    @Query("SELECT * FROM catalogo_itens WHERE skuBusca = :sku AND skuBusca <> '' LIMIT 5")
    suspend fun itensPorSku(sku: String): List<ItemCatalogoEntity>

    /**
     * O catálogo inteiro, pra quando ninguém digitou nada ainda.
     *
     * Sem isto a tela de consulta nascia em branco: ela dizia "221 itens neste
     * tablet" e não mostrava nenhum, porque a busca só respondia com dois
     * caracteres no campo. Num aparelho onde o teclado nem subia, isso era um
     * beco sem saída — e mesmo com o teclado consertado, obrigar a digitar pra
     * ver o que existe é errado nesta tela: as outras três são FILAS (nascem
     * vazias com razão), esta existe pra responder "o que temos disso?".
     *
     * Quem TEM saldo vem na frente porque é a pergunta mais comum de quem está
     * de pé na prateleira. O `LIMIT` não é higiene: é a regra da casa, e o
     * catálogo cresce.
     */
    @Query("SELECT * FROM catalogo_itens ORDER BY (CASE WHEN quantidade > 0 THEN 0 ELSE 1 END), nome LIMIT :limite")
    suspend fun catalogoInteiro(limite: Int): List<ItemCatalogoEntity>

    // ── Rascunho da bipagem (a pilha que ainda não virou lote) ───────────────
    //
    // Uma linha por leitura, gravada NA HORA. O `PRAGMA synchronous = FULL` do
    // banco (ver EstoqueDatabase) é o que faz isso valer: a leitura está no
    // disco antes de a próxima peça ser encostada no leitor.

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun guardarLeitura(linha: LeituraEmAbertoEntity)

    @Query("DELETE FROM pilha_em_aberto WHERE codigo IN (:codigos)")
    suspend fun esquecerLeituras(codigos: List<String>)

    /** O fim do lote (Confirmar) e o fim do turno (Sair) — só o que é da pessoa. */
    @Query("DELETE FROM pilha_em_aberto WHERE operadorId = :operadorId")
    suspend fun limparRascunhoDe(operadorId: String)

    /**
     * TODO o rascunho, de todo mundo — quem separa é `destinoDoRascunho`.
     *
     * Sem `WHERE operadorId = ...` de propósito: a decisão tem três desfechos
     * (volta pra tela, fica guardado pro dono, ou expirou e some) e ela cabe em
     * teste na JVM. Filtrar aqui deixaria o rascunho velho de quem saiu de
     * férias no banco pra sempre.
     */
    @Query("SELECT * FROM pilha_em_aberto ORDER BY criadoEm ASC, codigo ASC")
    suspend fun rascunhoDeBipagem(): List<LeituraEmAbertoEntity>

    // ── Fila de baixas ───────────────────────────────────────────────────────
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putPendingBaixa(linha: PendingBaixaEntity)

    @Update
    suspend fun atualizarPendingBaixa(linha: PendingBaixaEntity)

    @Query("DELETE FROM pending_baixas WHERE operationId = :operationId")
    suspend fun removerPendingBaixa(operationId: String)

    /** Fila-alvo do worker: exclui o que já falhou em definitivo, mais antigo primeiro. */
    @Query("SELECT * FROM pending_baixas WHERE falhouDefinitivo = 0 ORDER BY criadoEm ASC")
    suspend fun pendingBaixasParaEnviar(): List<PendingBaixaEntity>

    @Query("SELECT * FROM pending_baixas ORDER BY criadoEm DESC")
    fun pendingBaixasFlow(): Flow<List<PendingBaixaEntity>>

    /**
     * As que o servidor recusou de vez — é o que vira frase na tela de Bipar.
     *
     * Sem esta consulta a linha ficava parada no SQLite para sempre: o worker
     * não a reenvia (`falhouDefinitivo`) e nenhuma tela a mostrava. O lote não
     * baixava do estoque e a pilha já tinha sido esvaziada com ar de sucesso.
     */
    @Query("SELECT * FROM pending_baixas WHERE falhouDefinitivo = 1 ORDER BY criadoEm DESC LIMIT 5")
    fun baixasRecusadasFlow(): Flow<List<PendingBaixaEntity>>

    /**
     * O retrato da fila de baixas — sem arrastar UM lote sequer.
     *
     * Uma consulta agregada no lugar de um `COUNT` puro porque a faixa do topo
     * precisa de mais que "tem coisa esperando": ela precisa saber HÁ QUANTO
     * TEMPO a mais antiga espera, se ela chegou a ser tentada, e com que erro —
     * senão uma fila presa (token revogado, servidor fora) fica idêntica ao
     * tick normal de 15 minutos. Ver `avisoDoTrabalho` em sync/EstadoDoTrabalho.kt.
     *
     * Continua barata: agregação sobre a tabela inteira, resposta de uma linha,
     * e o `codigosJson` de até 200 etiquetas nunca sai do banco.
     */
    @Query(RESUMO_BAIXAS)
    fun resumoDeBaixasFlow(): Flow<ResumoDaFila>

    // ── Fila de entradas por bipagem ─────────────────────────────────────────
    // As mesmas quatro operações das outras filas, pela mesma razão de cada uma
    // — os porquês estão na fila de baixas, logo acima.
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putPendingEntrada(linha: PendingEntradaEntity)

    @Update
    suspend fun atualizarPendingEntrada(linha: PendingEntradaEntity)

    @Query("DELETE FROM pending_entradas WHERE operationId = :operationId")
    suspend fun removerPendingEntrada(operationId: String)

    @Query("SELECT * FROM pending_entradas WHERE falhouDefinitivo = 0 ORDER BY criadoEm ASC")
    suspend fun pendingEntradasParaEnviar(): List<PendingEntradaEntity>

    @Query("SELECT * FROM pending_entradas WHERE falhouDefinitivo = 1 ORDER BY criadoEm DESC LIMIT 5")
    fun entradasRecusadasFlow(): Flow<List<PendingEntradaEntity>>

    @Query(RESUMO_ENTRADAS)
    fun resumoDeEntradasFlow(): Flow<ResumoDaFila>

    // ── Fila de recebimentos ─────────────────────────────────────────────────
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putPendingRecebimento(linha: PendingRecebimentoEntity)

    @Update
    suspend fun atualizarPendingRecebimento(linha: PendingRecebimentoEntity)

    @Query("DELETE FROM pending_recebimentos WHERE operationId = :operationId")
    suspend fun removerPendingRecebimento(operationId: String)

    @Query("SELECT * FROM pending_recebimentos WHERE falhouDefinitivo = 0 ORDER BY criadoEm ASC")
    suspend fun pendingRecebimentosParaEnviar(): List<PendingRecebimentoEntity>

    @Query("SELECT * FROM pending_recebimentos ORDER BY criadoEm DESC")
    fun pendingRecebimentosFlow(): Flow<List<PendingRecebimentoEntity>>

    @Query("SELECT * FROM pending_recebimentos WHERE falhouDefinitivo = 1 ORDER BY criadoEm DESC LIMIT 5")
    fun recebimentosRecusadosFlow(): Flow<List<PendingRecebimentoEntity>>

    @Query(RESUMO_RECEBIMENTOS)
    fun resumoDeRecebimentosFlow(): Flow<ResumoDaFila>

    // ── Fila de conferências ─────────────────────────────────────────────────
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putPendingConferencia(linha: PendingConferenciaEntity)

    @Update
    suspend fun atualizarPendingConferencia(linha: PendingConferenciaEntity)

    @Query("DELETE FROM pending_conferencias WHERE operationId = :operationId")
    suspend fun removerPendingConferencia(operationId: String)

    @Query("SELECT * FROM pending_conferencias WHERE falhouDefinitivo = 0 ORDER BY criadoEm ASC")
    suspend fun pendingConferenciasParaEnviar(): List<PendingConferenciaEntity>

    @Query("SELECT * FROM pending_conferencias ORDER BY criadoEm DESC")
    fun pendingConferenciasFlow(): Flow<List<PendingConferenciaEntity>>

    /** As que o servidor recusou de vez — é o que vira frase na tela. */
    @Query("SELECT * FROM pending_conferencias WHERE falhouDefinitivo = 1 ORDER BY criadoEm DESC LIMIT 5")
    fun conferenciasRecusadasFlow(): Flow<List<PendingConferenciaEntity>>

    @Query(RESUMO_CONFERENCIAS)
    fun resumoDeConferenciasFlow(): Flow<ResumoDaFila>

    /**
     * Toda a fila de conferências, reduzida ao que decide a LISTA de atividades.
     *
     * Sem `WHERE`: quem separa o que segura a atividade do que não segura é
     * `atividadesSeguradasPelaFila` (conferencia/Conferencia.kt), que cabe em
     * teste na JVM. A regra morava aqui dentro do SQL, onde nenhum teste
     * chegava — e estava errada: incluía as recusadas de vez, então uma
     * conferência que o servidor negou em definitivo escondia a atividade da
     * lista PARA SEMPRE, enquanto o cartão vermelho mandava conferir de novo.
     */
    @Query("SELECT atividadeId, falhouDefinitivo FROM pending_conferencias")
    suspend fun conferenciasNaFila(): List<ConferenciaNaFila>

    // ── O que voltou do servidor ─────────────────────────────────────────────
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putFeedback(linha: SyncFeedbackEntity)

    /**
     * TODAS as linhas do tipo, não só a última — cada operação drenada gravou a
     * sua, e a tela junta as listas (`juntarFeedback`).
     *
     * `LIMIT` porque esta tabela não tem poda nenhuma: ela só esvazia quando
     * alguém dispensa o aviso, e até lá cresce uma linha por operação
     * sincronizada. O corte é do mais VELHO (a ordem é decrescente), que é o
     * lado certo de perder — e nada fica órfão, porque dispensar apaga o tipo
     * inteiro, inclusive o que passou do teto.
     */
    @Query("SELECT * FROM sync_feedback WHERE tipo = :tipo ORDER BY criadoEm DESC LIMIT 50")
    fun feedbackFlow(tipo: String): Flow<List<SyncFeedbackEntity>>

    /**
     * Dispensar o aviso apaga o TIPO inteiro: a tela mostra o mais recente, não
     * a linha por id.
     *
     * Não existe remoção por id de propósito. O id é o UUID sorteado pelo
     * worker; ninguém na interface o conhece, e as telas que tentaram usá-lo
     * acabaram passando o tipo no lugar — DELETE que não apagava nada.
     */
    @Query("DELETE FROM sync_feedback WHERE tipo = :tipo")
    suspend fun removerFeedbacksDoTipo(tipo: String)

    // ── Trabalhos de impressão vindos do escritório ──────────────────────────

    /**
     * IGNORE, e é o método inteiro da trava contra a segunda tira.
     *
     * O servidor reoferece um trabalho sempre que a confirmação se perde na
     * volta — o que num galpão com Wi-Fi fraco é rotina, não exceção. Com
     * IGNORE, o trabalho que já está aqui (impresso ou não) NÃO é reescrito: o
     * `impressoEm` sobrevive, o worker não o vê como pendente, e a única coisa
     * que se refaz é a confirmação, que é o que de fato faltou.
     *
     * REPLACE aqui seria o bug: zeraria o `impressoEm` e a etiqueta sairia de
     * novo, a cada ciclo, até a rede colaborar.
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun guardarTrabalhos(linhas: List<TrabalhoImpressaoEntity>)

    /**
     * Os ids que este aparelho já conhece — impressos ou não.
     *
     * "Conhece" é mais forte que "imprimiu" de propósito: um trabalho que
     * chegou e ainda não saiu também está aqui, e reguardá-lo zeraria o que já
     * se sabe sobre ele. Só os ids, sem o conteúdo: é uma comparação de chave.
     */
    @Query("SELECT id FROM trabalhos_impressao")
    suspend fun idsDeTrabalhosConhecidos(): List<String>

    /** O que ainda não virou papel, na ordem em que chegou. */
    @Query("SELECT * FROM trabalhos_impressao WHERE impressoEm IS NULL ORDER BY recebidoEm ASC")
    suspend fun trabalhosParaImprimir(): List<TrabalhoImpressaoEntity>

    /**
     * Toma o trabalho ANTES de mandar bytes pro Bluetooth. `1` = é meu, pode
     * imprimir; `0` = alguém já levou, não imprima.
     *
     * `trabalhosParaImprimir` não basta, e a razão é que ela e a escrita do
     * `impressoEm` são dois momentos separados por SEGUNDOS de Bluetooth
     * (conectar a Goldensky leva de 2 a 8s). Nesse vão cabem dois workers:
     * o periódico de 15 minutos e o `enqueueImmediate` que TODO "Confirmar" da
     * tela dispara são filas ÚNICAS DE NOMES DIFERENTES — o WorkManager não as
     * serializa, ele as roda em paralelo no mesmo processo. Os dois liam a
     * mesma linha com `impressoEm IS NULL` e os dois mandavam a tira.
     *
     * Aqui a leitura e a escrita são a MESMA instrução: o `WHERE impressoEm IS
     * NULL` do próprio UPDATE é o compare-and-set, e o SQLite serializa as duas
     * escritas. O segundo worker recebe 0 e passa adiante.
     *
     * E ela grava um ERRO junto, que só é apagado quando o papel sai. Isso
     * cobre a outra metade: o processo morto no meio da impressão (kiosk
     * reiniciado, memória) deixa a linha marcada em vez de voltar pra fila —
     * porque o papel PODE ter saído, e reimprimir por via das dúvidas é
     * exatamente o defeito que estamos evitando. O escritório lê a frase.
     */
    @Query(SQL_RESERVA_TRABALHO)
    suspend fun reservarTrabalho(id: String, agora: Long, marca: String): Int

    /** O que já saiu (ou foi recusado) e o escritório ainda não sabe. */
    @Query("SELECT * FROM trabalhos_impressao WHERE impressoEm IS NOT NULL AND confirmado = 0 ORDER BY impressoEm ASC LIMIT 20")
    suspend fun trabalhosParaConfirmar(): List<TrabalhoImpressaoEntity>

    @Update
    suspend fun atualizarTrabalho(linha: TrabalhoImpressaoEntity)

    /**
     * Poda o que já foi impresso E confirmado há mais de `antesDe`.
     *
     * A tabela é a trava contra a repetição, então ela não pode ser esvaziada
     * assim que o papel sai — o trabalho tem de continuar reconhecível enquanto
     * o servidor ainda puder reoferecê-lo. Como a fila do servidor expira em 6
     * horas, guardar por mais que isso é guardar por nada.
     *
     * O que NÃO é podado: o que ainda não foi confirmado. Essa linha é a única
     * memória de um papel que saiu e o escritório não sabe.
     */
    @Query("DELETE FROM trabalhos_impressao WHERE confirmado = 1 AND impressoEm IS NOT NULL AND impressoEm < :antesDe")
    suspend fun podarTrabalhos(antesDe: Long)
}