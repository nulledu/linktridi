package com.tridi.estoque.scan

import kotlinx.serialization.json.Json

// Pilha de etiquetas bipadas na tela de Baixa — puro, sem Compose nem Room,
// pra testar as regras (dedupe, código malformado, montagem do lote) sem
// depender de Android.

data class PilhaBipagem(val codigos: List<String> = emptyList())

/**
 * O teto do lote — o MESMO do servidor (`LOTE_MAXIMO_BAIXA`, lib/estoque-baixa.ts).
 *
 * Sem ele o tablet aceitava a 201ª peça, esvaziava a pilha com ar de sucesso e
 * a linha morria no SQLite: o servidor recusa o lote inteiro com 400
 * `lote_grande`, que é falha DEFINITIVA — nunca mais é reenviada. Duzentas
 * peças em cima de um palete não baixavam do estoque e ninguém ficava sabendo.
 * Barrar a leitura na hora é a única correção que a pessoa consegue aplicar
 * sozinha: confirma o lote e continua.
 */
const val LOTE_MAXIMO = 200

sealed interface LeituraResultado {
    data class Aceita(val pilha: PilhaBipagem, val codigo: String) : LeituraResultado
    data class Duplicada(val codigo: String) : LeituraResultado
    data class Malformada(val codigo: String) : LeituraResultado

    /** A pilha bateu no teto do servidor. Confirmar a baixa libera o próximo lote. */
    data class Cheia(val maximo: Int) : LeituraResultado
}

/**
 * Uma leitura da pistola (ou digitada) entrando na pilha de baixa.
 *
 * Malformada — sem o grupo numérico no fim — é recusada NA HORA, sem ida e
 * volta ao servidor: `partirCodigoUnidade` é a mesma regra do gerador de
 * etiqueta (lib/estoque-unidades.ts). O mesmo código dentro do lote entra uma
 * vez só — bipar duas vezes a mesma peça por engano não pode virar baixa
 * dupla.
 */
fun registrarLeitura(pilha: PilhaBipagem, bruto: String): LeituraResultado {
    val codigo = normalizarCodigo(bruto)
    if (partirCodigoUnidade(codigo) == null) return LeituraResultado.Malformada(codigo)
    if (codigo in pilha.codigos) return LeituraResultado.Duplicada(codigo)
    // O teto vem DEPOIS do dedupe: rebipar uma peça que já está na pilha não
    // pode virar "lote cheio" — nada seria acrescentado de qualquer jeito.
    if (pilha.codigos.size >= LOTE_MAXIMO) return LeituraResultado.Cheia(LOTE_MAXIMO)
    return LeituraResultado.Aceita(pilha.copy(codigos = pilha.codigos + codigo), codigo)
}

/** Remoção manual — o "x" de 44dp na tela, nunca troca a ordem do resto. */
fun removerLeitura(pilha: PilhaBipagem, codigo: String): PilhaBipagem = pilha.copy(codigos = pilha.codigos - codigo)

// ── O rascunho: a pilha que sobrevive ao tablet morrer ───────────────────────
//
// A pilha vivia só na memória do ViewModel. Entre a primeira leitura e o
// Confirmar — que é onde a pessoa escolhe o motivo — até 200 etiquetas
// existiam apenas na RAM: bateria acabando, kiosk reiniciando ou o Android
// matando o processo em segundo plano apagavam o lote inteiro, sem aviso e sem
// rastro. Some junto a linha do hub ("40 etiquetas bipadas esperando você
// confirmar"), então nem quem voltava pro tablet percebia que existira um lote.
//
// O banco já tinha a garantia certa pra isso (`PRAGMA synchronous = FULL`, com
// o comentário "TABLET SEM BATERIA NÃO PODE PERDER DADO"). Faltava o dado
// chegar nela.

/** Uma leitura gravada no disco, esperando o Confirmar. */
data class LeituraGuardada(val codigo: String, val operadorId: String, val criadoEm: Long)

/**
 * Depois disto o rascunho não é mais "o lote de agora": é lixo de um turno que
 * acabou.
 *
 * Doze horas cobrem o turno mais longo com folga e não chegam no seguinte.
 * Restaurar uma leitura de ontem seria pior que perdê-la — a pessoa confirmaria
 * uma baixa de material que já não está mais na mão dela, e o carimbo
 * (`ocorridoEm`) nasce na HORA do Confirmar, não na da leitura.
 */
const val VALIDADE_DO_RASCUNHO_MS: Long = 12 * 60 * 60_000L

data class DestinoDoRascunho(val restaurar: List<String>, val descartar: List<String>)

/**
 * O que fazer com o rascunho quando alguém entra com o código.
 *
 * Três casos, e o do meio é o que exige cuidado:
 *
 *  - **É meu e é de agora** → volta pra tela. A pessoa reencontra as 40
 *    etiquetas onde parou.
 *  - **É de outra pessoa** → não volta E NÃO SE APAGA. Não pode atravessar pro
 *    código de quem entrou agora (ela assinaria uma baixa que não bipou — a
 *    mesma razão de `endJourney` zerar a pilha), mas apagar seria destruir o
 *    trabalho de quem só foi almoçar. Fica guardado até o dono voltar.
 *  - **Está velho** → some, de quem quer que seja. Ver `VALIDADE_DO_RASCUNHO_MS`.
 *
 * A ordem devolvida é a das leituras (`criadoEm`), porque é a ordem em que a
 * tela desenha a pilha e a que a pessoa reconhece. O teto do lote é respeitado
 * aqui também: um rascunho de 200 já é o máximo que o servidor aceita numa
 * chamada.
 */
fun destinoDoRascunho(
    guardadas: List<LeituraGuardada>,
    quemEntrou: String,
    agora: Long,
): DestinoDoRascunho {
    val (velhas, atuais) = guardadas.partition { agora - it.criadoEm >= VALIDADE_DO_RASCUNHO_MS }
    val minhas = atuais.asSequence()
        .filter { it.operadorId == quemEntrou }
        .sortedBy { it.criadoEm }
        .map { it.codigo }
        .distinct()
        .take(LOTE_MAXIMO)
        .toList()
    return DestinoDoRascunho(restaurar = minhas, descartar = velhas.map { it.codigo })
}

/**
 * A frase que a tela mostra depois de uma leitura — `null` quando não há nada
 * a dizer.
 *
 * Mora aqui, e não na tela, porque a diferença entre "esse código não é de
 * etiqueta" e "a pilha encheu" é a diferença entre jogar a peça fora e
 * confirmar o lote. A tela antes colava "Código inválido:" na frente do que
 * viesse, o que só funcionava enquanto o único aviso possível era esse.
 */
/**
 * O que a tela de Bipar diz quando a pilha está vazia.
 *
 * Sem leitor conectado não há NADA a fazer nesta tela, e a instrução "Aponte a
 * pistola para a etiqueta / Cada leitura aparece aqui na hora" vira a promessa
 * mais confiante da tela sendo justamente a que não se cumpre: a pessoa fica
 * encostando a peça e concluindo que o sistema quebrou. Por isso o aviso
 * SUBSTITUI a instrução em vez de se somar a ela.
 */
data class EstadoVazioDaBipagem(val titulo: String, val detalhe: String, val alerta: Boolean)

fun estadoVazioDaBipagem(leitorConectado: Boolean): EstadoVazioDaBipagem =
    if (leitorConectado) {
        EstadoVazioDaBipagem(
            titulo = "Aponte a pistola para a etiqueta",
            detalhe = "Cada leitura aparece aqui na hora.",
            alerta = false,
        )
    } else {
        EstadoVazioDaBipagem(
            titulo = "Nenhum leitor conectado",
            detalhe = "Ligue a pistola, ou pareie em Manutenção.",
            alerta = true,
        )
    }

/**
 * Quantas etiquetas tinha um lote guardado na fila (o `codigosJson`).
 *
 * A tela precisa disso pra dizer se um lote recusado dá pra refazer na hora
 * (três etiquetas) ou se é caso de abrir o ERP (duzentas). JSON quebrado devolve
 * 0 em vez de estourar: um aviso sem o número continua servindo, um app que
 * fecha ao desenhar o aviso não.
 */
fun contarCodigosDoLote(codigosJson: String): Int =
    runCatching { Json.decodeFromString<List<String>>(codigosJson).size }.getOrDefault(0)

/**
 * "1 etiqueta" / "40 etiquetas" — o jeito de nomear o tamanho de uma pilha de
 * bipagem, num lugar só.
 *
 * ETIQUETA, e nunca "peça". Desde a caixa lacrada, uma etiqueta pode valer 50
 * peças: a pilha com 40 códigos são 40 etiquetas, e podem ser 2000 folhas
 * saindo da prateleira. Chamar isso de "40 peças" erra por 50× justamente no
 * momento em que o número existe pra dar noção de tamanho — quem lê "40 peças"
 * e confirma acha que tirou 40.
 *
 * O tablet NÃO tem como dizer as peças: `PilhaBipagem` guarda código e mais
 * nada, e o tamanho da caixa mora no servidor (a tela web pergunta em
 * `?codigos=`, ver BiparClient.tsx). Bipar é offline-first — o galpão bipa com
 * a rede caída —, então a saída honesta é contar o que se tem em mãos com o
 * nome certo, não chutar o que não se tem.
 */
fun fraseDeEtiquetas(quantas: Int): String =
    if (quantas == 1) "1 etiqueta" else "$quantas etiquetas"

fun avisoDaLeitura(resultado: LeituraResultado): String? = when (resultado) {
    is LeituraResultado.Aceita -> null
    is LeituraResultado.Duplicada -> null
    is LeituraResultado.Malformada -> "Código inválido: ${resultado.codigo}"
    // O teto conta ETIQUETAS (é o `LOTE_MAXIMO_BAIXA` de códigos por chamada),
    // não peças: com caixa no meio, 200 etiquetas podem ser 10.000 folhas.
    is LeituraResultado.Cheia ->
        "Lote cheio (${fraseDeEtiquetas(resultado.maximo)}). Confirme a baixa antes de bipar mais."
}
