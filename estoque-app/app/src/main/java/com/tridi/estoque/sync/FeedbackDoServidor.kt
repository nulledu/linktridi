package com.tridi.estoque.sync

// ── O que voltou do servidor quando a fila subiu ─────────────────────────────
//
// O worker drena a fila inteira num `doWork()` só e grava UMA linha de
// `sync_feedback` por operação. As telas liam `firstOrNull()` — a linha mais
// recente — e jogavam as outras fora.
//
// Isso não é caso de laboratório, é o caso que o app diz servir: o gestor
// confere o galpão inteiro sem Wi-Fi e a fila sobe junta quando ele volta pro
// sinal. Nesse dia oito conferências drenam no mesmo ciclo, oito caixas entram
// no estoque e UMA etiqueta chegava na tela — as outras sete caixas ficavam
// fisicamente sem código colado, e o servidor não devolve a etiqueta de novo
// (o `operationId` repetido responde o resultado gravado, mas a fila já tinha
// sido limpa).
//
// Na baixa a perda era de outro tipo e igualmente cara: o resultado é o que
// diz quais códigos vieram `desconhecida`/`ja_baixada`, isto é, quais peças
// NÃO saíram do estoque. Só o lote mais recente contava.
//
// Piorava por um detalhe: `criadoEm` é `System.currentTimeMillis()` gravado em
// rajada, então empate de milissegundo tornava "o mais recente" arbitrário.

/**
 * Teto de itens mostrados de uma vez.
 *
 * Existe pelo lado da impressão: `imprimirEtiquetasDaConferencia` manda a lista
 * inteira pra impressora Bluetooth, uma tira atrás da outra. Um número que
 * ninguém confere vira papel saindo até acabar o rolo — e o botão de parar
 * resolve depois de já ter saído muita coisa. 400 é folgado pro dia mais cheio
 * de galpão que este app viu e ainda assim é um número.
 */
const val TETO_DE_FEEDBACK: Int = 400

/**
 * O tipo da linha de `sync_feedback` que guarda "entrou no estoque, mas sem
 * etiqueta".
 *
 * Tipo PRÓPRIO e não uma linha a mais em "conferencia": as duas listas têm
 * formatos diferentes, e `lotesDe` descarta em silêncio a linha que não
 * decodifica — misturar as duas faria o aviso sumir ou, pior, derrubar a
 * etiqueta da caixa que está ali na frente esperando papel. Dispensar também é
 * por tipo (`removerFeedbacksDoTipo`), então limpar um não apaga o outro.
 *
 * Nenhuma migração: `tipo` é uma coluna de texto que já existe.
 */
const val TIPO_AVISO_DE_PREPARO: String = "conferencia_preparo"

/**
 * Junta o que voltou de VÁRIAS operações do mesmo tipo, na ordem recebida.
 *
 * Sem repetir: o mesmo código pode voltar em dois lotes (o reenvio de uma
 * operação que o servidor já tinha gravado responde o resultado guardado), e
 * imprimir a mesma etiqueta duas vezes gera duas tiras pra uma caixa só — quem
 * cola não tem como saber qual das duas vale.
 *
 * `chave` é o que identifica o item: o código da etiqueta, o código da peça
 * baixada, ou o próprio texto quando o feedback já é uma lista de códigos.
 */
fun <T> juntarFeedback(lotes: List<List<T>>, teto: Int = TETO_DE_FEEDBACK, chave: (T) -> Any?): List<T> {
    if (teto <= 0) return emptyList()
    val vistos = HashSet<Any?>()
    val junto = ArrayList<T>()
    for (lote in lotes) {
        for (item in lote) {
            if (junto.size >= teto) return junto
            if (vistos.add(chave(item))) junto.add(item)
        }
    }
    return junto
}
