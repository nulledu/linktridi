package com.tridi.estoque.conferencia

// ── A conferência de qualidade, em Kotlin puro ───────────────────────────────
//
// Este arquivo não conhece Compose, Room nem OkHttp de propósito: o que decide
// se a caixa entra no estoque (ou volta pro operador refazer) são duas listas
// fechadas e uma escolha binária, e isso se confere em teste de unidade na JVM.
//
// O momento que o desenho serve: o gestor está DE PÉ na frente da caixa, com o
// tablet numa mão e a luva na outra, olhando as peças. Ele não digita número,
// não escreve defeito por extenso e não espera a rede — diz CERTO ou ERRADO.
//
// A QUANTIDADE NÃO É DELE. Quem disse quantas peças fez foi a pessoa que
// produziu, quando concluiu a atividade; o tablet só mostra o número. Isso é o
// ciclo do galpão inteiro: a caixa de material lacrada foi bipada no COMEÇO do
// trabalho (saiu do estoque naquele instante, amarrada à atividade), virou
// peça, e agora ou nasce UMA caixa nova com a quantidade que a pessoa
// registrou, ou não nasce nada e ela refaz. Nos dois casos ninguém lança
// número nenhum: a perda do errado já está contabilizada pela baixa da
// entrada.

/**
 * O veredito. Duas opções, e é o ponto: "mediano" não dizia o que fazer com a
 * caixa.
 *
 * As chaves são o contrato — `RESULTADOS` em lib/estoque-qualidade.ts e o
 * `check` de `estoque_conferencias.resultado` no SQL. Divergir aqui é 400
 * `resultado_invalido` na cara de quem confere (ver
 * ContratoDeChavesTest.kt, que lê o TypeScript e compara chave a chave).
 */
enum class ResultadoConferencia(val chave: String, val rotulo: String, val explicacao: String) {
    CERTO("certo", "Certo", "Etiqueta a caixa e entra no estoque"),
    ERRADO("errado", "Errado", "Nada entra — volta pra pessoa refazer");

    companion object {
        fun porChave(chave: String?): ResultadoConferencia? = entries.firstOrNull { it.chave == chave }
    }
}

/**
 * O que houve de errado. Lista FECHADA de novo, e desta vez o motivo é o mais
 * importante do arquivo: defeito digitado à mão nunca vira estatística. Sete
 * pessoas escrevem "peça suja", "peças sujas", "sujeira", "veio sujo" e o
 * relatório do fim do mês não consegue somar nenhum dos quatro.
 *
 * As CHAVES têm que ser byte a byte as de `DEFEITOS` em lib/estoque-qualidade.ts:
 * o servidor valida cada uma com `defeitoValido()` e recusa a conferência
 * INTEIRA com 400 `defeito_invalido` se uma só não estiver na lista dele — o
 * gestor perde o preenchimento e lê "um dos defeitos marcados saiu da lista do
 * sistema". Três destas sete divergiam (`pecas_sujas`/`acabamento`/
 * `falta_quantidade` contra `peca_suja`/`acabamento_ruim`/`faltou_quantidade`),
 * e como as outras quatro passavam a falha parecia intermitente: a mesma tela
 * gravava ou recusava dependendo de qual chip o gestor tocasse.
 *
 * Quem manda é o TypeScript, não este arquivo: é ele que valida na entrada e
 * grava a coluna `defeitos`. A coluna é `text[]` sem `check` — ou seja, o banco
 * NÃO pegaria esse erro, e por isso ele passou pelo SQL, pelo build e pelos
 * testes dos dois lados. Agora não passa mais calado: `ContratoDeChavesTest`
 * lê lib/estoque-qualidade.ts e quebra o build do app quando as listas se
 * separam.
 */
enum class DefeitoConferencia(val chave: String, val rotulo: String) {
    PECAS_SUJAS("peca_suja", "Peça suja"),
    AVARIA("avaria", "Avaria"),
    MEDIDA_ERRADA("medida_errada", "Medida errada"),
    ACABAMENTO("acabamento_ruim", "Acabamento ruim"),
    MONTAGEM_INCOMPLETA("montagem_incompleta", "Montagem incompleta"),
    PECA_TROCADA("peca_trocada", "Peça trocada"),
    FALTA_QUANTIDADE("faltou_quantidade", "Faltou quantidade");

    companion object {
        fun porChave(chave: String?): DefeitoConferencia? = entries.firstOrNull { it.chave == chave }
    }
}

/**
 * O item do catálogo que vai RECEBER as peças.
 *
 * A atividade quase nunca diz qual é: das 104 concluídas em produção, 103
 * nasceram só com a tarefa em texto ("Colar EVA na chapa 3 mm"), porque quem
 * lança o trabalho não conhece o catálogo de 231 linhas. Quem sabe é o gestor,
 * de pé na frente da caixa — e é por isso que a escolha mora na conferência e
 * não no cadastro da atividade.
 *
 * `serializado` só muda a PROMESSA da tela ("sai uma etiqueta" × "a quantidade
 * é somada"): prometer papel pra um item que não é etiquetado deixa o gestor
 * esperando na frente da impressora.
 *
 * `preparo` é a versão fina dessa mesma promessa, e existe porque `serializado`
 * misturava dois mundos: o item que NUNCA vira caixa (granel) e o que ainda não
 * foi preparado — que é a maioria, e o que alguém consegue resolver hoje. Nulo
 * quando o servidor não manda o campo, ou quando o destino veio da busca no
 * catálogo local (que não guarda essas colunas).
 */
data class DestinoDaConferencia(
    val id: String,
    val nome: String,
    val serializado: Boolean = true,
    val preparo: PreparoDoItem? = null,
)

/**
 * O que o gestor montou na tela antes de confirmar.
 *
 * `quantidadeFeita` está aqui SÓ pra tela escrever o número e pro botão dizer
 * quantas peças a caixa vai ter — não é editável e não vai no envio. O servidor
 * relê a quantidade da atividade na hora de gravar (ver
 * `registrarConferencia`), justamente pra não existir uma segunda fonte da
 * verdade viajando pela fila offline.
 */
data class RascunhoConferencia(
    val quantidadeFeita: Int,
    val resultado: ResultadoConferencia? = null,
    val defeitos: Set<DefeitoConferencia> = emptySet(),
    val obs: String = "",
    /**
     * A atividade NÃO aponta item nenhum: aprovar exige escolher onde as peças
     * entram, senão o servidor recusa com `destino_nao_escolhido`.
     *
     * Nasce `false` porque a minoria das atividades já vem vinculada — e nessas
     * não há escolha a fazer, então o bloco da tela nem aparece.
     */
    val precisaDeDestino: Boolean = false,
    val destino: DestinoDaConferencia? = null,
) {
    val certo: Boolean get() = resultado == ResultadoConferencia.CERTO
    val errado: Boolean get() = resultado == ResultadoConferencia.ERRADO

    /**
     * Errado EXIGE dizer o porquê — um defeito marcado OU o motivo escrito.
     *
     * É a única trava que este rascunho impõe além de escolher o veredito, e
     * ela existe por dois motivos: quem vai REFAZER o trabalho precisa saber o
     * que corrigir, e é o defeito marcado que alimenta o "o que mais dá errado"
     * do fim do mês — que ficaria vazio justamente quando algo deu errado.
     *
     * O chip vale mais (vira estatística; texto livre não soma: sete pessoas
     * escrevem "sujo", "sujeira", "veio sujo"), mas a observação também serve:
     * defeito que não está na lista fechada existe, e travar a tela nele
     * deixaria o gestor sem saída na frente da caixa. Mesma regra da tela do
     * computador (ConferirPainel.tsx) — duas telas exigindo coisas diferentes
     * pro mesmo ato é como uma delas vira "a que não deixa".
     *
     * O servidor NÃO exige (aceita `defeitos: []` no errado): a trava é de
     * tela, e é aqui que ela pertence, com a pessoa ainda olhando a peça.
     *
     * ── A ASSIMETRIA ──
     *
     * APROVAR exige o destino (sem ele não existe onde somar: é literalmente o
     * `ErroDestinoNaoEscolhido` do servidor). REPROVAR não exige nada além do
     * motivo — o material já saiu do estoque quando foi bipado no começo do
     * trabalho, e nada entra na reprovação. Amarrar as duas coisas deixaria
     * presa na fila, pra sempre, a caixa de um produto que ainda não está no
     * catálogo: seria impossível tirá-la de lá dizendo "isto está errado".
     */
    val podeConfirmar: Boolean get() = when (resultado) {
        null -> false
        // Quantidade zero não vira caixa. Quem conta é quem FEZ; a conferência
        // confirma, não estima — e o servidor recusa isso de qualquer jeito
        // (`ErroQuantidadeIndefinida`). Deixar o botão aceso só fazia o gestor
        // preencher a ficha inteira pra levar recusa no fim, com a tela ainda
        // dizendo "Etiquetar a caixa de 0 peças".
        //
        // REPROVAR continua livre: caixa que ninguém contou é justamente a que
        // precisa voltar pra bancada, e amarrar as duas coisas a deixaria presa
        // na fila pra sempre.
        ResultadoConferencia.CERTO -> quantidadeFeita > 0 && (!precisaDeDestino || destino != null)
        ResultadoConferencia.ERRADO -> defeitos.isNotEmpty() || obs.isNotBlank()
    }

    /** Ninguém registrou quanto foi feito — o certo fica bloqueado e a tela diz por quê. */
    val semQuantidade: Boolean get() = quantidadeFeita <= 0

    /**
     * Trocar pra CERTO limpa os defeitos.
     *
     * No certo não há o que marcar, por definição — e um chip esquecido de uma
     * hesitação anterior ficaria escondido (a tela só mostra os chips no
     * errado) mas continuaria viajando no envio. O servidor zera de qualquer
     * jeito; aqui a tela e o que sobe param de discordar.
     */
    fun comResultado(valor: ResultadoConferencia): RascunhoConferencia =
        if (valor == ResultadoConferencia.CERTO) copy(resultado = valor, defeitos = emptySet())
        else copy(resultado = valor)

    /** Toque no chip: marca se estava desmarcado, desmarca se estava marcado. */
    fun alternarDefeito(defeito: DefeitoConferencia): RascunhoConferencia =
        copy(defeitos = if (defeito in defeitos) defeitos - defeito else defeitos + defeito)

    fun comObs(texto: String): RascunhoConferencia = copy(obs = texto)

    /** Escolheu (ou trocou) o item que recebe as peças. `null` desfaz a escolha. */
    fun comDestino(valor: DestinoDaConferencia?): RascunhoConferencia = copy(destino = valor)

    /** As chaves na ordem do enum — a ordem do envio não pode depender de um `Set`. */
    fun chavesDeDefeito(): List<String> =
        if (certo) emptyList() else DefeitoConferencia.entries.filter { it in defeitos }.map { it.chave }

    /**
     * O `destinoId` que viaja no corpo — **só na aprovação**.
     *
     * No errado nada entra no estoque, então mandar um item seria gravar um
     * endereço pra uma peça que não foi a lugar nenhum. Pior: o servidor
     * confere o destino contra o catálogo ANTES de olhar o veredito, e um item
     * apagado entre a tela abrir e a fila subir derrubaria com
     * `item_nao_encontrado` justamente a reprovação — que é o único caminho pra
     * tirar da fila a caixa de um produto que não está cadastrado. Mesma regra
     * do ERP (ConferirPainel.tsx).
     */
    fun destinoParaEnviar(): String? = if (certo) destino?.id else null
}

// ── O que o gestor precisa saber ANTES de dizer certo ou errado ──────────────
//
// Espelho em Kotlin de lib/estoque-conferencia-contexto.ts. As frases são as
// MESMAS de propósito: a mesma caixa é conferida ora no tablet, ora no
// computador, e duas telas contando a mesma coisa com palavras diferentes é
// como uma delas vira "a que está errada".
//
// `ContextoDaConferenciaTest` compara as duas implementações caso a caso.

enum class EstadoDaQuantidade {
    /** Saiu exatamente o que foi pedido. */
    BATEU,

    /** Saiu menos. É o caso que muda a decisão, e o que a tela escondia. */
    FALTOU,

    /** Saiu mais do que o pedido. */
    PASSOU,

    /** A atividade nasceu sem alvo — não há o que comparar. */
    SEM_ALVO,

    /** Ninguém registrou quantas fez. Diferente de "fez zero". */
    NAO_INFORMADA,
}

data class DiferencaDeQuantidade(
    val estado: EstadoDaQuantidade,
    val feita: Int,
    val alvo: Int,
    val faltaram: Int,
    val sobraram: Int,
    /** O número principal: "19 de 30", "30 peças". */
    val texto: String,
    /** "faltaram 11" / "5 a mais" / `null` quando não há diferença a contar. */
    val diferenca: String?,
    /**
     * Só a FALTA e a contagem ausente pedem atenção. Produzir a mais não é
     * defeito, e pintar tudo de amarelo é como o amarelo deixa de ser lido.
     */
    val atencao: Boolean,
)

private fun pecas(n: Int): String = if (n == 1) "1 peça" else "$n peças"

/**
 * "19 de 30 — faltaram 11", sem o gestor subtrair de cabeça.
 *
 * `feita <= 0` com alvo é NÃO INFORMADA, não zero: é a leitura do servidor (que
 * cai no alvo nesse caso) e a diferença seria acusatória — "faltaram 30" culpa
 * quem provavelmente só esqueceu de digitar ao concluir.
 */
fun diferencaDeQuantidade(feitaCrua: Int, alvoCru: Int): DiferencaDeQuantidade {
    val feita = feitaCrua.coerceAtLeast(0)
    val alvo = alvoCru.coerceAtLeast(0)
    return when {
        // Sem alvo não existe falta: a atividade nunca pediu um número.
        alvo <= 0 -> DiferencaDeQuantidade(
            EstadoDaQuantidade.SEM_ALVO, feita, alvo, 0, 0, pecas(feita), null, false,
        )
        feita <= 0 -> DiferencaDeQuantidade(
            EstadoDaQuantidade.NAO_INFORMADA, feita, alvo, 0, 0, "— de $alvo", "ninguém contou", true,
        )
        feita < alvo -> {
            val faltaram = alvo - feita
            DiferencaDeQuantidade(
                EstadoDaQuantidade.FALTOU, feita, alvo, faltaram, 0,
                "$feita de $alvo",
                if (faltaram == 1) "faltou 1" else "faltaram $faltaram",
                true,
            )
        }
        feita > alvo -> DiferencaDeQuantidade(
            EstadoDaQuantidade.PASSOU, feita, alvo, 0, feita - alvo,
            "$feita de $alvo", "${feita - alvo} a mais", false,
        )
        else -> DiferencaDeQuantidade(
            EstadoDaQuantidade.BATEU, feita, alvo, 0, 0, "$feita de $alvo", null, false,
        )
    }
}

/**
 * "45 min", "1 h", "1 h 12 min" — nunca "72 min" nem "0,8 h".
 *
 * Quem parte os minutos é o SERVIDOR (`minutosDaAtividade`): o tablet roda com
 * minSdk 24, onde `java.time` não existe sem desugaring, e uma segunda régua de
 * datas em Kotlin seria uma régua a mais pra divergir. Aqui chega um inteiro.
 */
fun duracaoEmPortugues(min: Int?): String? {
    if (min == null || min <= 0) return null
    if (min < 60) return "$min min"
    val h = min / 60
    val m = min % 60
    return if (m == 0) "$h h" else "$h h $m min"
}

/**
 * O tempo como APOIO: "34 min · estimado 40 min".
 *
 * Sem cor e sem alerta — serve pra explicar um número baixo de peças sem
 * acusar ninguém. Um cronômetro pintado de vermelho na tela de conferência
 * viraria outra coisa em uma semana.
 */
fun frasesDoTempo(realMin: Int?, estimadoMin: Int?): String? {
    val real = duracaoEmPortugues(realMin)
    val estimado = duracaoEmPortugues(estimadoMin)
    return when {
        real != null && estimado != null -> "$real · estimado $estimado"
        real != null -> real
        estimado != null -> "estimado $estimado"
        else -> null
    }
}

/**
 * A FRASE INTEIRA do tempo — "Levou 34 min · estimado 40 min" — ou `null`.
 *
 * Espelho de `fraseDeApoio` (lib/estoque-conferencia-contexto.ts), e existe
 * pelo defeito que ela consertou: a tela juntava "Levou " com o resultado de
 * `frasesDoTempo`, que devolve "estimado 40 min" quando só há estimativa. Numa
 * atividade sem `iniciada_at` — concluída sem nunca ter sido iniciada, e o
 * servidor manda `tempoRealMin = 0` — o tablet escrevia **"Levou estimado 40
 * min"**: a estimativa contada como fato, sobre uma caixa em que ninguém sabe
 * quanto tempo levou. E o ERP, na MESMA caixa, não escrevia nada. Era a
 * divergência que este arquivo inteiro existe pra impedir.
 *
 * Sem duração real não sai frase. A estimativa sozinha é o plano, não o que
 * aconteceu, e este bloco só existe pra explicar um número baixo de peças.
 *
 * `real * 2 > estimado * 3` é `real > estimado * 1,5` sem ponto flutuante — a
 * mesma conta do `demorou` do TypeScript, em inteiros.
 */
fun fraseDeApoioDoTempo(realMin: Int?, estimadoMin: Int?): String? {
    val real = realMin?.takeIf { it > 0 } ?: return null
    val estimado = estimadoMin?.takeIf { it > 0 }
    val texto = duracaoEmPortugues(real) ?: return null
    val referencia = duracaoEmPortugues(estimado)
    return buildString {
        append("Levou ").append(texto)
        if (referencia != null) append(" · estimado ").append(referencia)
        if (estimado != null && real * 2 > estimado * 3) append(" — bem mais que o previsto")
    }
}

/**
 * Uma linha da fila local de conferências, reduzida ao que decide a LISTA.
 *
 * Sem anotação de Room de propósito — este arquivo continua sem conhecer
 * biblioteca nenhuma. Room preenche a classe casando os nomes das colunas
 * (`SELECT atividadeId, falhouDefinitivo FROM pending_conferencias`).
 */
data class ConferenciaNaFila(val atividadeId: String, val falhouDefinitivo: Boolean)

/**
 * Quais atividades a lista do tablet deve ESCONDER porque já foram conferidas
 * aqui e ainda não subiram.
 *
 * A regra tem uma exceção, e ela é o motivo de esta função existir: uma
 * conferência que o servidor recusou EM DEFINITIVO (`falhouDefinitivo`) não
 * segura mais nada. O worker não a reenvia, ela virou cartão vermelho na tela
 * — e o cartão manda, com todas as letras, "ajuste no ERP e confira de novo"
 * (ver `mensagemDeErroDeConferencia`). Enquanto ela contava aqui, a atividade
 * nunca mais voltava à lista: o gestor apertava Atualizar, não aparecia nada, e
 * a caixa pronta ficava parada no chão. A única saída era descobrir sozinho que
 * tocar no "x" do cartão a trazia de volta.
 *
 * O mesmo raciocínio já valia do lado do recebimento, onde a compra recusada
 * volta no bootstrap seguinte.
 */
fun atividadesSeguradasPelaFila(fila: List<ConferenciaNaFila>): Set<String> =
    fila.asSequence().filterNot { it.falhouDefinitivo }.map { it.atividadeId }.toSet()

/**
 * O que entrou no estoque, dito em caixa E em peça.
 *
 * As duas unidades juntas porque nenhuma sozinha responde a pergunta de quem
 * está com a tira de papel na mão: "1 caixa" não diz quanto material entrou, e
 * "50 peças" faz esperar 50 tiras saindo da impressora — e quando sai uma só, a
 * conclusão é que a impressora falhou.
 *
 * Peça avulsa (caixa de 1) é falada como peça: escrever "1 caixa · 1 peça" pra
 * uma chapa solta é linguagem de sistema, não de galpão.
 */
fun fraseDoQueEntrouNoEstoque(caixas: Int, pecas: Int): String = when {
    caixas <= 0 -> "Nada entrou no estoque"
    caixas == 1 && pecas <= 1 -> "1 peça entrou no estoque"
    caixas == 1 -> "1 caixa entrou no estoque · $pecas peças"
    else -> "$caixas caixas entraram no estoque · $pecas peças"
}

/**
 * A frase que o gestor lê quando o servidor recusou a conferência.
 *
 * `conferente_e_executor` ganha frase PRÓPRIA porque não é defeito do app: é a
 * regra da casa (ninguém aprova o próprio trabalho) e a pessoa precisa entender
 * que tem de chamar outra, não tentar de novo.
 */
fun mensagemDeErroDeConferencia(codigo: String?): String = when (codigo) {
    "conferente_e_executor" -> "Você não pode conferir o próprio trabalho."
    // A conferência de atividade saiu (11/09/2026): o servidor recusa tudo com
    // este código — inclusive o que ficou na fila offline deste tablet.
    "conferencia_desligada" -> "A conferência de atividade foi desligada. As peças entram no estoque pelo próprio Estoque."
    // Substituiu `nota_invalida`, que morreu com as cinco notas. Um tablet
    // parado numa versão antiga ainda pode ter uma fila com nota — o servidor
    // responde isto pra ela.
    "resultado_invalido" -> "Este tablet está desatualizado para conferir. Atualize o app e refaça."
    "defeito_invalido" -> "Um dos defeitos marcados saiu da lista do sistema. Refaça a conferência."
    // A quantidade é a que a PESSOA registrou ao concluir. Sem ela a caixa
    // nasceria vazia — e quem resolve isso é quem lançou a atividade, no ERP,
    // não o gestor de pé na frente da caixa.
    "quantidade_indefinida" -> "Esta atividade não diz quantas peças foram feitas. Ajuste no ERP e confira de novo."
    "schema_desatualizado" -> "O sistema ainda não está pronto para receber conferências. Avise o suporte."
    "atividade_nao_encontrada" -> "Esta atividade não existe mais no sistema."
    "item_nao_encontrado" -> "O item desta atividade saiu do catálogo. Avise a administração."
    // O 409 que caía na frase genérica "refaça pelo ERP" — e refazer não
    // resolve NADA aqui: o servidor achou mais de um item com o mesmo nome e
    // não tem como escolher em qual a caixa entra (ver ErroNomeAmbiguo em
    // lib/estoque-nome.ts). Quem destrava é quem renomeia um deles no catálogo.
    "nome_ambiguo" ->
        "Existe mais de um item com esse nome no catálogo, e o sistema não sabe " +
            "em qual entrar. Peça pra administração renomear um deles — conferir " +
            "de novo não resolve."
    // O DEFEITO QUE ESTA LINHA CONSERTA. O gestor tocava em aprovar, a fila
    // subia e voltava recusada, e a frase genérica dizia "o sistema recusou —
    // refaça pelo ERP": o dono leu isso como defeito do ERP e passou a achar
    // que a impressão da etiqueta é que estava quebrada. Não estava. Faltava
    // dizer em qual item do catálogo aquelas peças entram, e faltava esta
    // frase pra dizer isso. Ela precisa nomear a AÇÃO (escolher o item) e o
    // caminho de saída (reprovar não precisa de destino) — a caixa de um
    // produto que ainda não existe no catálogo só sai da fila por ali.
    "destino_nao_escolhido" ->
        "Faltou dizer em qual item do catálogo estas peças entram. Abra a caixa " +
            "na lista, escolha o item e aprove de novo — marcar como errado não " +
            "precisa de destino."
    "operador_invalido" -> "Seu acesso não está mais ativo no sistema. Fale com a administração."
    // 500 do servidor. O worker trata 5xx como transitório e reenvia sozinho,
    // então esta frase quase nunca aparece — mas existe pra não cair na
    // genérica, que manda refazer pelo ERP um envio que ainda está na fila e
    // viraria conferência em dobro.
    "failed" -> "O sistema falhou ao gravar. O tablet tenta de novo sozinho — se insistir, avise o suporte."
    // Todas as rotas do aparelho podem responder isto quando o corpo não bate
    // com o contrato — na prática, tablet numa versão anterior à do servidor.
    "dados_invalidos" -> "Este tablet está desatualizado. Atualize o app e refaça esta conferência."
    // `atividade_ja_conferida` é o que a rota devolve de verdade
    // (app/api/estoque/device/conferencia/route.ts). O "ja_conferida" que
    // estava sozinho aqui nunca casava com nada: a recusa mais comum de todas
    // — duas pessoas conferindo a mesma caixa — caía na frase genérica
    // "refaça pelo ERP", que manda refazer justamente o que já foi feito.
    "atividade_ja_conferida", "ja_conferida" -> "Esta atividade já tinha sido conferida por outra pessoa."
    else -> "O sistema recusou esta conferência. Refaça pelo ERP."
}

// ── Escolher o destino: o que a tela diz quando não há lista pra mostrar ─────
//
// O caso comum tem três sugestões calculadas a partir da tarefa e acaba num
// toque. Este bloco é sobre os outros: o gestor abriu a busca e a lista está
// vazia, e "nada aqui" não separa "digite mais uma letra" de "este tablet
// nunca baixou o catálogo" — que pedem coisas opostas de quem está de pé na
// frente da caixa.

/** O vazio da escolha de destino. `alerta` pinta de âmbar: falta alguma coisa. */
data class VazioDoDestino(val titulo: String, val detalhe: String, val alerta: Boolean = false)

/**
 * A frase do vazio, na ordem em que os casos importam.
 *
 * O primeiro é o que trava o galpão inteiro: sem catálogo no tablet não há
 * busca possível, e a saída não é digitar melhor — é levar o aparelho pro
 * Wi-Fi uma vez. Dizer "nada encontrado" nesse estado manda a pessoa tentar
 * sinônimos por cinco minutos.
 *
 * @param itensNoTablet quantos itens a cópia local tem (0 = nunca baixou).
 */
fun vazioDaEscolhaDeDestino(
    termo: String,
    resultados: Int,
    itensNoTablet: Int,
    sincronizando: Boolean,
): VazioDoDestino? {
    if (resultados > 0) return null
    if (itensNoTablet <= 0) {
        return if (sincronizando) {
            VazioDoDestino("Baixando o catálogo…", "É uma vez só. Depois a escolha funciona sem internet.")
        } else {
            VazioDoDestino(
                "O catálogo ainda não está neste tablet",
                "Sem ele não dá pra dizer onde as peças entram. Leve o aparelho pra perto " +
                    "do Wi-Fi uma vez — ou marque como errado, que não precisa de destino.",
                alerta = true,
            )
        }
    }
    if (termo.isBlank()) {
        return VazioDoDestino(
            "Procure o item que recebe as peças",
            "Digite duas letras do nome — “eva”, “alav”, “base”.",
        )
    }
    if (!com.tridi.estoque.catalogo.termoBuscavel(termo)) {
        return VazioDoDestino("Continue digitando", "Com uma letra só a busca traria o galpão inteiro.")
    }
    return VazioDoDestino(
        "Nada com “${termo.trim()}” no catálogo",
        "Tente outra palavra do nome. Se a peça ainda não está cadastrada, ela não pode " +
            "receber estoque — marcar como errado devolve a caixa pra quem fez.",
        alerta = true,
    )
}
