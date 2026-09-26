package com.tridi.estoque.sync

// ── "Cadê o meu trabalho?" ───────────────────────────────────────────────────
//
// O tablet foi desenhado pra trabalhar offline: bipar, confirmar e devolver a
// tela NA HORA, deixando a fila subir em segundo plano. O efeito colateral é
// que um dia com o Wi-Fi caído é INDISTINGUÍVEL de um dia normal — a pessoa
// bipa a tarde inteira, confirma sete lotes, e nada na tela é diferente.
//
// Duas coisas que a versão anterior desta faixa não sabia dizer, e que são as
// duas em que o trabalho REALMENTE não chega:
//
//   1. A fila presa COM rede. Com internet e fila > 0 a frase era sempre a
//      mesma linha discreta ("N operações esperando enviar"), igual pro tick
//      normal de 15 minutos e pro tablet cujo token foi revogado três dias
//      atrás — o 401 é transitório de propósito (FilaReducer.kt), então um
//      aparelho desativado no ERP reenvia pra sempre, em silêncio.
//   2. A operação RECUSADA de vez. Ela some da fila-alvo do worker e vira
//      cartão vermelho nas telas de operação — mas no hub (a tela "O que você
//      vai fazer?") não havia cartão nenhum, e é por ali que a pessoa passa
//      antes de ir embora.
//
// Esta é a frase que faltava. Kotlin puro: a regra de QUANDO falar é o que
// precisa estar certo, e ela se confere na JVM.

/**
 * O que as três filas locais somam — o único fato que a faixa precisa saber.
 *
 * Room preenche esta classe direto do `SELECT` agregado (uma consulta por
 * tabela, ver `EstoqueDao.resumoDe*`), e `somarFilas` junta as três. Nada aqui
 * é entidade: é o retrato do momento.
 */
data class ResumoDaFila(
    /** Esperando subir — o worker ainda vai tentar. */
    val pendentes: Int = 0,
    /** Recusadas de vez pelo servidor: o worker NÃO tenta mais. */
    val recusadas: Int = 0,
    /** `criadoEm` da operação pendente mais antiga. `null` = nada esperando. */
    val maisAntigaEm: Long? = null,
    /** Maior número de tentativas entre as pendentes — prova de que tentou. */
    val tentativas: Int = 0,
    /** `ultimoErro` da pendente mais antiga (é o que diz se o acesso morreu). */
    val ultimoErro: String? = null,
) {
    /** Há quanto tempo a operação mais antiga espera. `null` = fila vazia. */
    fun paradaHa(agora: Long): Long? = maisAntigaEm?.let { (agora - it).coerceAtLeast(0L) }
}

/**
 * Junta o resumo das três filas (baixa, recebimento, conferência) em um só.
 *
 * `maisAntigaEm` e `ultimoErro` andam JUNTOS: o erro que interessa é o da
 * operação globalmente mais antiga, não o de uma fila qualquer que por acaso
 * tinha um. `tentativas` é o maior de todos de propósito — a pergunta que ele
 * responde é "alguma coisa aqui já tentou e falhou várias vezes?".
 */
fun somarFilas(partes: List<ResumoDaFila>): ResumoDaFila {
    val maisAntiga = partes.filter { it.maisAntigaEm != null }.minByOrNull { it.maisAntigaEm!! }
    return ResumoDaFila(
        pendentes = partes.sumOf { it.pendentes.coerceAtLeast(0) },
        recusadas = partes.sumOf { it.recusadas.coerceAtLeast(0) },
        maisAntigaEm = maisAntiga?.maisAntigaEm,
        tentativas = partes.maxOfOrNull { it.tentativas.coerceAtLeast(0) } ?: 0,
        ultimoErro = maisAntiga?.ultimoErro,
    )
}

/** Qual ícone a faixa usa — quem decide é a regra, não a tela. */
enum class IconeDoAviso {
    /** Nuvem: está subindo, é só questão de tempo. */
    SUBINDO,

    /** Wi-Fi cortado: o tablet está fora da rede. */
    SEM_REDE,

    /** Triângulo: alguém precisa fazer alguma coisa. */
    ATENCAO,
}

/**
 * @param atencao `true` pinta de âmbar (algo mudou e vale olhar), `false` é a
 *   linha discreta de "está tudo andando, só ainda não subiu".
 */
data class AvisoDeTrabalho(
    val texto: String,
    val atencao: Boolean,
    val icone: IconeDoAviso = IconeDoAviso.SUBINDO,
)

private fun operacoes(n: Int) = if (n == 1) "1 operação" else "$n operações"

// O particípio concorda com o número, senão sai "1 operação guardadas".
private fun guardadas(n: Int) = if (n == 1) "1 operação guardada" else "$n operações guardadas"

private fun recusadas(n: Int) = if (n == 1) "1 operação recusada" else "$n operações recusadas"

/**
 * "há quanto tempo", do jeito que se fala — nunca "2700000 ms" nem "45.0 min".
 *
 * Trunca pra baixo e nunca diz "0 min": alguma coisa que acabou de acontecer é
 * "1 min", porque zero soa como "nada" justamente na frase que existe pra dizer
 * que tem alguma coisa parada.
 */
fun ha(ms: Long): String {
    val minutos = ms / 60_000
    val horas = ms / 3_600_000
    val dias = ms / 86_400_000
    return when {
        horas < 1 -> "${minutos.coerceAtLeast(1)} min"
        dias < 2 -> "$horas h"
        else -> "$dias dias"
    }
}

/**
 * O tablet parou de ser aceito pelo servidor?
 *
 * `invalid_device` é o que a rota devolve com 401 quando o aparelho foi
 * desativado no ERP (ver `deviceAuthFailure` em app/api/estoque/device/_device.ts),
 * e `nao_autenticado` é o padrão que `classificarFalha` grava quando a resposta
 * vem sem corpo. Nos dois casos a fila gira pra sempre — reenviar não resolve,
 * quem resolve é gente.
 */
private val ERROS_DE_ACESSO = setOf("invalid_device", "nao_autenticado", "unauthorized", "invalid_token")

fun pareceAcessoRevogado(erro: String?): Boolean {
    val chave = erro?.trim()?.lowercase() ?: return false
    return chave in ERROS_DE_ACESSO
}

/**
 * Depois disto, uma fila que não anda deixou de ser "ainda vai subir".
 *
 * O worker roda a cada 15 minutos (EstoqueWorkScheduler), então meia hora são
 * duas janelas. As DUAS condições valem juntas de propósito: `tentativas`
 * sozinho dispararia cedo demais (cada Confirmar chama `enqueueImmediate`, e
 * três lotes seguidos com o servidor fora dão três tentativas em dois minutos),
 * e o tempo sozinho dispararia sem prova de que a operação chegou a ser
 * tentada.
 */
const val PARADA_DEMAIS_MS: Long = 30 * 60_000L
const val TENTATIVAS_DEMAIS: Int = 2

/**
 * O que a faixa do topo diz — `null` quando não há nada a dizer.
 *
 * O silêncio é o caso comum e é intencional: com rede e fila vazia a faixa não
 * existe, senão ela vira papel de parede e ninguém lê justamente no dia em que
 * ela importa.
 *
 * Fora da rede a frase NÃO é de erro. O trabalho está guardado e vai subir —
 * dizer "falhou" faria a pessoa parar de bipar, que é o contrário do certo.
 *
 * A ORDEM das frases é a decisão do arquivo. Recusa vem antes de "sem
 * internet" mesmo sendo a mais rara: ficar sem rede é temporário e a fila
 * sobrevive, enquanto uma recusa é trabalho que NUNCA vai chegar e só sai do
 * lugar com alguém agindo. Quando as duas coexistem, a que precisa de gente
 * ganha a linha; a falta de rede se anuncia sozinha no minuto seguinte, quando
 * a recusa for dispensada.
 *
 * @param agora relógio de fora, pra a regra do tempo caber em teste.
 */
fun avisoDoTrabalho(online: Boolean, resumo: ResumoDaFila, agora: Long): AvisoDeTrabalho? {
    val naFila = resumo.pendentes.coerceAtLeast(0)
    val recusadas = resumo.recusadas.coerceAtLeast(0)
    val paradaHa = resumo.paradaHa(agora)
    val travada = naFila > 0 &&
        paradaHa != null && paradaHa >= PARADA_DEMAIS_MS &&
        resumo.tentativas >= TENTATIVAS_DEMAIS

    return when {
        recusadas > 0 -> AvisoDeTrabalho(
            "${recusadas(recusadas)} pelo sistema — nada disso foi registrado",
            atencao = true,
            icone = IconeDoAviso.ATENCAO,
        )
        // Com rede e nada andando há meia hora, "esperando enviar" virou
        // mentira: a frase passa a dizer o que FAZER, como as de recusa.
        online && travada && pareceAcessoRevogado(resumo.ultimoErro) -> AvisoDeTrabalho(
            "Este tablet perdeu o acesso ao sistema — chame a administração. ${guardadas(naFila)}.",
            atencao = true,
            icone = IconeDoAviso.ATENCAO,
        )
        online && travada -> AvisoDeTrabalho(
            "Nada sobe há ${ha(paradaHa!!)} — chame a administração. ${guardadas(naFila)}.",
            atencao = true,
            icone = IconeDoAviso.ATENCAO,
        )
        !online && naFila > 0 -> AvisoDeTrabalho(
            "Sem internet — ${guardadas(naFila)} no tablet",
            atencao = true,
            icone = IconeDoAviso.SEM_REDE,
        )
        !online -> AvisoDeTrabalho(
            "Sem internet — o trabalho fica guardado no tablet",
            atencao = true,
            icone = IconeDoAviso.SEM_REDE,
        )
        naFila > 0 -> AvisoDeTrabalho(
            "${operacoes(naFila)} esperando enviar",
            atencao = false,
            icone = IconeDoAviso.SUBINDO,
        )
        else -> null
    }
}
