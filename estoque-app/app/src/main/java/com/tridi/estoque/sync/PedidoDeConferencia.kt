package com.tridi.estoque.sync

import com.tridi.estoque.data.PendingConferenciaEntity
import com.tridi.estoque.net.ConferenciaRequest
import kotlinx.serialization.json.Json

// ── A linha da fila virando o corpo do POST ──────────────────────────────────
//
// Uma função de três linhas que ganhou arquivo próprio pelo defeito que ela
// existe pra impedir, e que já aconteceu inteiro: um campo que a tela coleta, o
// banco guarda, e o envio ESQUECE. Do lado de fora não se vê diferença nenhuma
// — a conferência sobe, o servidor recusa por falta do campo, e a recusa chega
// como "o sistema recusou" na frente da caixa.
//
// Aqui ela é pura: sem Room, sem OkHttp, sem WorkManager. Isso é o que permite
// um teste na JVM montar a linha da fila e conferir, campo a campo, que o que
// sai é o que entrou (ver PedidoDeConferenciaTest).

private val jsonDaFila = Json { ignoreUnknownKeys = true }

/**
 * O que sobe pro servidor, montado a partir do que ficou guardado no disco.
 *
 * Duas coisas que NÃO se recalculam aqui, e as duas por segurança:
 *
 *  · o `operationId` é o que a linha já tem. Gerar um novo numa retentativa é
 *    o caminho pra mesma caixa de 50 peças entrar duas vezes no estoque.
 *  · a QUANTIDADE não existe neste corpo. Quem contou as peças foi quem as fez,
 *    e o servidor relê o número da atividade na hora de gravar — mandá-lo daqui
 *    seria uma segunda fonte da verdade viajando numa fila que pode subir horas
 *    depois.
 *
 * `defeitosJson` corrompido vira lista VAZIA em vez de exceção: perder os chips
 * marcados é ruim, perder a reprovação inteira (e deixar a caixa errada presa na
 * fila pra sempre) é pior.
 */
fun pedidoDeConferencia(linha: PendingConferenciaEntity): ConferenciaRequest = ConferenciaRequest(
    operationId = linha.operationId,
    atividadeId = linha.atividadeId,
    resultado = linha.resultado,
    // O ITEM QUE O GESTOR ESCOLHEU. É a única coisa desta linha que o servidor
    // não consegue reconstituir sozinho: a atividade quase nunca aponta
    // produto, então sem este id a aprovação volta com `destino_nao_escolhido`.
    destinoId = linha.destinoId,
    defeitos = runCatching { jsonDaFila.decodeFromString<List<String>>(linha.defeitosJson) }
        .getOrDefault(emptyList()),
    obs = linha.obs,
    conferidoPorId = linha.conferidoPorId,
    ocorridoEm = linha.ocorridoEm,
)
