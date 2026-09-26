package com.tridi.estoque.conferencia

// ── "Vai sair papel desta caixa?" ────────────────────────────────────────────
//
// Espelho em Kotlin de lib/estoque-etiquetavel.ts. Lá mora a REGRA (que item
// pode virar etiqueta); aqui moram as FRASES que o galpão lê — e só elas. O
// tablet nunca decide o estado: ele recebe do servidor, no campo `preparo`,
// porque a decisão precisa das colunas do item (`serializado`, `quantidade`,
// `unidade`) e da permissão de quem está mexendo, e nenhuma das duas coisas
// existe aqui dentro.
//
// POR QUE ISTO PRECISAVA EXISTIR. A tela tinha UMA frase pra tudo que não era
// etiquetado — "Este item não é etiquetado — não sai papel" — e ela era falsa
// na maioria dos casos: o item quase sempre PODE ser etiquetado, só ainda não
// foi preparado. O gestor lia aquilo como uma propriedade do item ("esse aí não
// tem etiqueta mesmo") e ia embora; ninguém preparava nada, e a caixa continuava
// entrando no estoque sem código colado. Quatro estados, quatro frases, e três
// delas dizem o que FAZER.
//
// O tablet é conservador de propósito: ele nunca promete papel que não tem
// certeza que vai sair. Prometer e não sair é o gestor de pé na frente da
// impressora esperando; não prometer e sair é uma etiqueta a mais na tela, que
// o aviso de etiquetas prontas já mostra.

/**
 * Em que pé o item está diante da etiqueta.
 *
 * As chaves são o contrato com `EstadoEtiqueta` de lib/estoque-etiquetavel.ts —
 * `EtiquetavelContratoTest` lê o TypeScript e compara uma a uma, como o
 * `ContratoDeChavesTest` já faz com os defeitos.
 */
enum class EstadoDeEtiqueta(val chave: String) {
    /** Tem papel colado: aprovar cunha a caixa e devolve a etiqueta. */
    JA_ETIQUETADO("ja_etiquetado"),

    /** Zerado e contável: dá pra passar a etiquetá-lo — mas só quem tem poder de ajuste. */
    CONVERTER_AGORA("converter_agora"),

    /** Pilha antiga com saldo: alguém precisa decidir se ela é uma caixa ou N peças. */
    PRECISA_PREPARO("precisa_preparo"),

    /** Granel, fração ou unidade desconhecida: nunca vira etiqueta, e ninguém pode mudar isso daqui. */
    NAO_ETIQUETAVEL("nao_etiquetavel");

    companion object {
        fun porChave(chave: String?): EstadoDeEtiqueta? =
            entries.firstOrNull { it.chave == chave?.trim() }
    }
}

/**
 * O que o servidor disse sobre o item, já traduzido.
 *
 * `estado` nulo tem DOIS significados que terminam no mesmo lugar: servidor
 * velho (não manda o campo) e chave que este app ainda não conhece (servidor
 * novo demais). Nos dois casos o tablet volta ao que fazia antes desta feature
 * — quem decide de verdade é o servidor, e a tela não inventa uma promessa.
 */
data class PreparoDoItem(val estado: EstadoDeEtiqueta?, val motivo: String = "") {
    companion object {
        /** `null` quando não veio nada — é o servidor antigo, não um estado. */
        fun de(estado: String?, motivo: String?): PreparoDoItem? {
            val chave = estado?.trim().orEmpty()
            val frase = motivo?.trim().orEmpty()
            if (chave.isEmpty() && frase.isEmpty()) return null
            return PreparoDoItem(EstadoDeEtiqueta.porChave(chave), frase)
        }
    }
}

/**
 * O tablet pode prometer que sai etiqueta?
 *
 * `CONVERTER_AGORA` responde **não** aqui, e é a decisão menos óbvia deste
 * arquivo: ligar `serializado` na hora exige poder de ajuste, e a rota do
 * aparelho (app/api/estoque/device/conferencia/route.ts) não tem poder nenhum —
 * é justamente a porta lateral que o servidor fecha de propósito. Se o servidor
 * conseguir converter mesmo assim, a etiqueta aparece no aviso de etiquetas
 * prontas e ninguém se frustra. O contrário — prometer e não sair — é o gestor
 * parado na frente da impressora.
 */
fun saiEtiqueta(preparo: PreparoDoItem?, serializadoConhecido: Boolean): Boolean = when (preparo?.estado) {
    EstadoDeEtiqueta.JA_ETIQUETADO -> true
    EstadoDeEtiqueta.CONVERTER_AGORA -> false
    EstadoDeEtiqueta.PRECISA_PREPARO -> false
    EstadoDeEtiqueta.NAO_ETIQUETAVEL -> false
    // Sem `preparo` no ar, vale o que o tablet sempre soube: a bandeira
    // `serializado` que desce com a sugestão de destino.
    null -> serializadoConhecido
}

/** "em EVA 3 mm" — ou "na contagem", quando ninguém escolheu item ainda. */
private fun onde(nome: String?): String {
    val limpo = nome?.trim().orEmpty()
    return if (limpo.isEmpty()) "na contagem do estoque" else "em $limpo"
}

/**
 * A frase do rodapé da ficha: o que vai acontecer quando o gestor confirmar.
 *
 * Ela existe fora do Compose pelo motivo de sempre neste app — é texto que
 * decide o trabalho de quem está de pé na frente da caixa, e texto assim se
 * confere em teste na JVM, não olhando o tablet.
 *
 * @param serializadoDoDestino a bandeira que desce na sugestão. Só vale quando
 *   `preparo` é nulo (servidor antigo): ela diz se o item é etiquetado, não se
 *   ele PODE passar a ser.
 */
fun promessaDaConferencia(
    resultado: ResultadoConferencia?,
    podeConfirmar: Boolean,
    nomeDoDestino: String?,
    serializadoDoDestino: Boolean = true,
    preparo: PreparoDoItem? = null,
): String = when {
    // Antes de escolher, a frase diz o que CADA lado faz — é a explicação do
    // botão que a pessoa ainda não tocou.
    resultado == null ->
        "Certo etiqueta a caixa e guarda no estoque. Errado devolve pra pessoa refazer."
    resultado == ResultadoConferencia.ERRADO ->
        "Nada entra no estoque. A atividade volta pra pessoa refazer."
    // Escolheu certo e ainda não disse onde entra. A frase repete a assimetria,
    // porque é a saída da caixa cujo produto não está no catálogo: reprovar não
    // pergunta.
    !podeConfirmar ->
        "O sistema soma as peças no item que você escolher. Marcar como errado não precisa disso."
    saiEtiqueta(preparo, serializadoDoDestino) ->
        "Sai UMA etiqueta — a caixa inteira — e o estoque recebe na hora."
    else -> when (preparo?.estado) {
        // Um toque de quem tem acesso resolve — e dizer ONDE se resolve é o que
        // transforma um beco sem saída em pendência de alguém.
        EstadoDeEtiqueta.CONVERTER_AGORA ->
            "As peças são somadas ${onde(nomeDoDestino)} — não sai papel. Este item ainda não é " +
                "etiquetado, e como está zerado quem tem acesso de ajuste liga a etiqueta num " +
                "toque, no computador."
        // A decisão (pilha inteira × peça a peça) é de quem está na frente da
        // prateleira, não do tablet: por isso a frase nomeia a escolha em vez de
        // mandar "prepare o item".
        EstadoDeEtiqueta.PRECISA_PREPARO ->
            "As peças são somadas ${onde(nomeDoDestino)} — não sai papel. Este item tem contagem " +
                "antiga: no computador, alguém escolhe se a pilha inteira vira uma caixa só ou se " +
                "cada peça leva a sua etiqueta."
        // Aqui não há o que pedir a ninguém: peso e medida não cabem numa caixa
        // fechada. A frase fecha o assunto em vez de sugerir uma saída que não
        // existe.
        EstadoDeEtiqueta.NAO_ETIQUETAVEL ->
            "A quantidade é somada ${onde(nomeDoDestino)}. Este item não se conta em caixas " +
                "fechadas — não sai papel, e não é defeito."
        // Servidor antigo com item não serializado: a frase de antes, palavra
        // por palavra. Nada regride.
        else ->
            "A quantidade é somada ${onde(nomeDoDestino)}. Este item não é etiquetado — não sai papel."
    }
}

// ── Depois que a fila subiu ─────────────────────────────────────────────────
//
// O gestor já saiu da frente da caixa quando a conferência sincroniza. Se
// nenhuma etiqueta voltou, o app não pode ficar calado: as peças ENTRARAM no
// estoque e a caixa está na prateleira sem código colado — quem for bipar
// aquilo semanas depois não vai achar nada.

/**
 * Vale gastar um aviso na tela por esta conferência?
 *
 * `NAO_ETIQUETAVEL` responde **não**, e é o único estado que não avisa: a ficha
 * já tinha dito antes do toque ("não se conta em caixas fechadas"), ninguém
 * pode agir, e um aviso vermelho a cada aprovação de item a granel é o aviso que
 * o galpão aprende a ignorar — inclusive no dia em que ele importa.
 *
 * `JA_ETIQUETADO` sem etiqueta nenhuma avisa SIM: era pra ter saído papel e não
 * saiu, e isso é exatamente o defeito que ficou meses invisível.
 *
 * @param resultado a chave que subiu ("certo"/"errado").
 * @param etiquetas quantas etiquetas o servidor devolveu.
 */
fun mereceAvisoDePreparo(resultado: String?, etiquetas: Int, preparo: PreparoDoItem?): Boolean {
    // Reprovar não põe nada no estoque: não existe caixa sem etiqueta pra avisar.
    if (ResultadoConferencia.porChave(resultado?.trim()) != ResultadoConferencia.CERTO) return false
    if (etiquetas > 0) return false
    return preparo?.estado != EstadoDeEtiqueta.NAO_ETIQUETAVEL
}

/**
 * A frase do aviso — nomeia a CAIXA, porque quando a fila sobe junta são oito
 * conferências e "uma delas não saiu etiqueta" não diz qual.
 *
 * O `motivo` do servidor entra só nos estados que BLOQUEIAM. Nos outros ele
 * descreve a promessa ("ao aprovar, sai a etiqueta") — e se estamos escrevendo
 * este aviso é porque ela não se cumpriu; repeti-la aqui seria o app
 * contradizendo a si mesmo na mesma tela.
 */
fun fraseDoAvisoDePreparo(atividade: String, preparo: PreparoDoItem?): String {
    val caixa = atividade.trim().ifBlank { "Uma caixa conferida" }
    val abertura = "$caixa: as peças entraram no estoque, mas não saiu etiqueta."
    val motivo = preparo?.motivo?.trim().orEmpty()
    val explicacao = when (preparo?.estado) {
        EstadoDeEtiqueta.PRECISA_PREPARO, EstadoDeEtiqueta.NAO_ETIQUETAVEL ->
            motivo.ifBlank {
                "Este item ainda não é etiquetado — peça pra alguém prepará-lo no computador."
            }
        EstadoDeEtiqueta.CONVERTER_AGORA ->
            "Este item ainda não é etiquetado. Como está zerado, quem tem acesso de ajuste liga a " +
                "etiqueta num toque, no computador."
        // Era pra ter saído papel. Não saiu, e ninguém no galpão descobre o
        // porquê — a frase manda chamar quem descobre.
        EstadoDeEtiqueta.JA_ETIQUETADO ->
            "Era pra ter saído — avise a administração antes de guardar a caixa."
        null ->
            "Este item não gerou caixa etiquetada. Confira no computador antes de guardar."
    }
    return "$abertura $explicacao"
}
