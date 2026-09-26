package com.tridi.estoque.data

// O SQL das migrações, separado do banco e sem import de Android.
//
// Está aqui, em Kotlin puro, para poder ser CONFERIDO EM TESTE contra o schema
// que o próprio Room exporta (`app/schemas/.../N.json`). Uma vírgula fora do
// lugar numa migração não estoura no build: estoura na abertura do banco, no
// tablet do galpão, com "migration didn't properly handle" — e aí ou o app não
// abre, ou cai no descarte destrutivo e leva a fila offline junto.
//
// Migração é REGISTRO HISTÓRICO: o texto de uma versão antiga nunca se
// "atualiza" pra nova forma. Um tablet que ficou meses na v2 sobe rodando 2→3
// e depois 3→4, nessa ordem — se o 2→3 criasse a tabela já na forma nova, o
// 3→4 tentaria converter colunas que não existem.

/**
 * A tabela da fila de conferências como ela NASCEU (v2 → v3), com as cinco
 * notas e as duas quantidades. Congelada: é o ponto de partida do 3 → 4.
 */
const val SQL_CRIA_PENDING_CONFERENCIAS_V3: String =
    "CREATE TABLE IF NOT EXISTS `pending_conferencias` (" +
        "`operationId` TEXT NOT NULL, `atividadeId` TEXT NOT NULL, " +
        "`produtoNome` TEXT NOT NULL, `quantidadeAprovada` INTEGER NOT NULL, " +
        "`quantidadeRecusada` INTEGER NOT NULL, `nota` TEXT NOT NULL, " +
        "`defeitosJson` TEXT NOT NULL, `obs` TEXT, `conferidoPorId` TEXT NOT NULL, " +
        "`ocorridoEm` TEXT NOT NULL, `tentativas` INTEGER NOT NULL, " +
        "`ultimoErro` TEXT, `falhouDefinitivo` INTEGER NOT NULL, " +
        "`criadoEm` INTEGER NOT NULL, PRIMARY KEY(`operationId`))"

/** A tabela temporária da conversão 3 → 4, criada com a forma NOVA. */
const val TABELA_CONFERENCIAS_NOVA = "pending_conferencias_v4"

/**
 * A tabela da fila de conferências na forma BINÁRIA (v4): uma coluna
 * `resultado` no lugar de `nota` + `quantidadeAprovada` + `quantidadeRecusada`.
 *
 * A quantidade saiu porque deixou de ser decisão do gestor: a caixa nasce com o
 * que a PESSOA registrou ao concluir, lido pelo servidor na hora de gravar.
 * Guardar o número aqui seria uma segunda fonte da verdade viajando numa fila
 * que pode subir horas depois.
 *
 * Recebe o nome da tabela porque a conversão precisa da MESMA forma com outro
 * nome — uma cópia manual do texto é exatamente o tipo de divergência que este
 * arquivo existe pra impedir.
 */
fun sqlCriaPendingConferenciasV4(tabela: String = "pending_conferencias"): String =
    "CREATE TABLE IF NOT EXISTS `$tabela` (" +
        "`operationId` TEXT NOT NULL, `atividadeId` TEXT NOT NULL, " +
        "`produtoNome` TEXT NOT NULL, `resultado` TEXT NOT NULL, " +
        "`defeitosJson` TEXT NOT NULL, `obs` TEXT, `conferidoPorId` TEXT NOT NULL, " +
        "`ocorridoEm` TEXT NOT NULL, `tentativas` INTEGER NOT NULL, " +
        "`ultimoErro` TEXT, `falhouDefinitivo` INTEGER NOT NULL, " +
        "`criadoEm` INTEGER NOT NULL, PRIMARY KEY(`operationId`))"

/**
 * Traz a fila que estava esperando rede para a forma nova, SEM perder linha.
 *
 * A tradução da nota para o veredito é uma decisão, não uma conversão óbvia:
 *
 *   nada recusado (`quantidadeRecusada = 0`) → **certo**
 *   qualquer recusa                          → **errado**
 *
 * Uma conferência antiga de "48 aprovadas, 2 recusadas" vira ERRADO, e não
 * "48 entram". É de propósito: no modelo novo a caixa é aprovada ou reprovada
 * INTEIRA, não existe caminho pra admitir 48 de 50. Das duas leituras
 * possíveis, aprovar tudo colocaria as 2 peças ruins no estoque; reprovar não
 * põe nada e devolve a atividade pra pessoa refazer — que é o desfecho que o
 * gestor já tinha começado a descrever quando recusou alguma coisa.
 *
 * A nota some sem tradução: "mediano" não vira certo nem errado, e é justamente
 * por não dizer o que fazer com a caixa que ela deixou de existir.
 */
val SQL_COPIA_CONFERENCIAS_V3_PARA_V4: String =
    "INSERT INTO `$TABELA_CONFERENCIAS_NOVA` (" +
        "`operationId`, `atividadeId`, `produtoNome`, `resultado`, `defeitosJson`, `obs`, " +
        "`conferidoPorId`, `ocorridoEm`, `tentativas`, `ultimoErro`, `falhouDefinitivo`, `criadoEm`) " +
        "SELECT `operationId`, `atividadeId`, `produtoNome`, " +
        "CASE WHEN `quantidadeRecusada` = 0 THEN 'certo' ELSE 'errado' END, " +
        "`defeitosJson`, `obs`, `conferidoPorId`, `ocorridoEm`, `tentativas`, `ultimoErro`, " +
        "`falhouDefinitivo`, `criadoEm` FROM `pending_conferencias`"

const val SQL_DERRUBA_CONFERENCIAS_ANTIGA: String = "DROP TABLE `pending_conferencias`"

val SQL_RENOMEIA_CONFERENCIAS_NOVA: String =
    "ALTER TABLE `$TABELA_CONFERENCIAS_NOVA` RENAME TO `pending_conferencias`"

/**
 * v4 → v5: a pilha de bipagem em andamento passa a morar no disco.
 *
 * Só CRIA tabela — nenhuma fila existente é tocada. É o tipo de migração que
 * não tem como perder trabalho, e é de propósito: a v5 existe justamente
 * porque perder trabalho estava fácil demais do outro lado (a pilha só existia
 * na memória do ViewModel).
 */
const val SQL_CRIA_PILHA_EM_ABERTO_V5: String =
    "CREATE TABLE IF NOT EXISTS `pilha_em_aberto` (" +
        "`codigo` TEXT NOT NULL, `operadorId` TEXT NOT NULL, " +
        "`criadoEm` INTEGER NOT NULL, PRIMARY KEY(`codigo`))"

/**
 * v5 → v6: o catálogo do galpão passa a ter cópia local.
 *
 * Só CRIA tabela, como a v5 — nenhuma fila é tocada, então um tablet no meio
 * do galpão sobe de versão sem perder nada do que estava esperando rede.
 *
 * SEM ÍNDICE de propósito. `LIKE '%termo%'` não usa índice nenhum (o curinga
 * na frente impede), então o índice só cobraria escrita em toda sincronização
 * do catálogo pra não ser lido nunca. Varrer mil linhas de texto curto no
 * SQLite é instantâneo; o dia em que o catálogo do galpão passar de dezenas de
 * milhares de itens, a resposta é FTS, não um índice B-tree que o LIKE ignora.
 */
const val SQL_CRIA_CATALOGO_ITENS_V6: String =
    "CREATE TABLE IF NOT EXISTS `catalogo_itens` (" +
        "`id` TEXT NOT NULL, `nome` TEXT NOT NULL, `sku` TEXT, `categoria` TEXT, " +
        "`unidade` TEXT NOT NULL, `quantidade` REAL NOT NULL, `local` TEXT, " +
        "`busca` TEXT NOT NULL, `skuBusca` TEXT NOT NULL, PRIMARY KEY(`id`))"

/**
 * v7 → v8: a conferência passa a levar EM QUAL ITEM as peças entram.
 *
 * `ALTER TABLE … ADD COLUMN` e nada mais — é a migração de menor risco que o
 * SQLite oferece, e a que a fila merece: a coluna nasce anulável, as linhas que
 * já estavam esperando rede continuam exatamente como estavam (com `destinoId`
 * nulo, que é o comportamento antigo — o servidor resolve o item por nome), e
 * nenhuma delas é copiada, derrubada nem renomeada.
 *
 * A conversão em quatro passos da v3 → v4 existiu porque uma COLUNA SAIU;
 * acrescentar não precisa disso. Room compara as colunas por NOME, então o fato
 * de o `ALTER` pendurar `destinoId` no fim da tabela (e não no meio, onde a
 * entidade a declara) não faz diferença nenhuma na validação de schema.
 */
const val SQL_ACRESCENTA_DESTINO_V8: String =
    "ALTER TABLE `pending_conferencias` ADD COLUMN `destinoId` TEXT"

/** Os quatro passos do 3 → 4, na ordem. Fora do Android pra caber em teste. */
val PASSOS_MIGRACAO_3_PARA_4: List<String> = listOf(
    sqlCriaPendingConferenciasV4(TABELA_CONFERENCIAS_NOVA),
    SQL_COPIA_CONFERENCIAS_V3_PARA_V4,
    SQL_DERRUBA_CONFERENCIAS_ANTIGA,
    SQL_RENOMEIA_CONFERENCIAS_NOVA,
)

/**
 * v6 → v7: os trabalhos de impressão que vieram do escritório.
 *
 * Só CRIA tabela, como a v5 e a v6 — nenhuma fila é tocada, então um tablet no
 * meio do galpão sobe de versão sem perder nada do que estava esperando rede.
 *
 * SEM ÍNDICE, e aqui isso é quase engraçado de tão óbvio: a tabela guarda os
 * trabalhos de impressão de algumas horas. São unidades de linhas. Um índice
 * cobraria escrita em toda sincronização pra economizar uma varredura de dez
 * linhas — a chave primária já resolve o único acesso que importa, que é "eu já
 * conheço este id?".
 */
const val SQL_CRIA_TRABALHOS_IMPRESSAO_V7: String =
    "CREATE TABLE IF NOT EXISTS `trabalhos_impressao` (" +
        "`id` TEXT NOT NULL, `conteudoJson` TEXT NOT NULL, `copias` INTEGER NOT NULL, " +
        "`recebidoEm` INTEGER NOT NULL, `impressoEm` INTEGER, `erro` TEXT, " +
        "`confirmado` INTEGER NOT NULL, `tentativasDeConfirmar` INTEGER NOT NULL, " +
        "PRIMARY KEY(`id`))"

/**
 * A fila da ENTRADA por bipagem (v8 → v9), na forma em que nasce. As colunas
 * de controle (tentativas/ultimoErro/falhouDefinitivo/criadoEm) são as mesmas
 * das outras três filas — é o que deixa o resumo agregado usar o mesmo SQL.
 */
const val SQL_CRIA_PENDING_ENTRADAS_V9: String =
    "CREATE TABLE IF NOT EXISTS `pending_entradas` (" +
        "`operationId` TEXT NOT NULL, `codigo` TEXT NOT NULL, " +
        "`quantidade` INTEGER NOT NULL, `motivo` TEXT NOT NULL, `obs` TEXT, " +
        "`operadorId` TEXT NOT NULL, `ocorridoEm` TEXT NOT NULL, " +
        "`tentativas` INTEGER NOT NULL, `ultimoErro` TEXT, " +
        "`falhouDefinitivo` INTEGER NOT NULL, `criadoEm` INTEGER NOT NULL, " +
        "PRIMARY KEY(`operationId`))"
