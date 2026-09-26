package com.tridi.estoque.sync

// ── A trava contra a segunda tira ────────────────────────────────────────────
//
// O caso perigoso não é o reenvio da web. É a CONFIRMAÇÃO que se perde na
// volta: o tablet imprime, manda "saiu", e a resposta morre no Wi-Fi do galpão.
// No servidor o trabalho continua `fila`, então ele desce de novo no ciclo
// seguinte — e sai um segundo papel, quinze minutos depois, sem ninguém pedir.
//
// É o espelho de `estoque_operacoes` com os papéis invertidos: lá o servidor
// guarda a operação pra não PROCESSAR duas vezes; aqui o aparelho guarda o id
// do trabalho pra não IMPRIMIR duas vezes.
//
// ── POR QUE ISTO É UMA FUNÇÃO, e não só o `OnConflictStrategy.IGNORE` ───────
//
// O IGNORE do Room já resolveria — e é a segunda linha, continua lá. Mas ele é
// uma ANOTAÇÃO: some num refactor sem quebrar compilação, sem quebrar teste, e
// o defeito aparece como papel saindo sozinho num galpão, semanas depois, sem
// ninguém ligar uma coisa à outra.
//
// Escrita como decisão pura, a regra tem nome, tem teste, e o teste falha na
// hora em que alguém a inverte. Este projeto já aprendeu essa lição duas vezes
// por outro caminho (ver a trava de orçamento de execução no CLAUDE.md):
// documentação não segura, teste segura.

/**
 * O que de fato precisa ser guardado (e depois impresso), dado o que o servidor
 * ofereceu e o que este aparelho JÁ CONHECE.
 *
 * "Conhece" é mais forte que "imprimiu": um trabalho que chegou e ainda não saiu
 * também está na lista, e reguardá-lo zeraria o que já se sabe sobre ele.
 *
 * A ordem de chegada é preservada — quem mandou primeiro imprime primeiro.
 */
fun trabalhosNovos(vindos: List<String>, jaConhecidos: Set<String>): List<String> {
    val vistos = HashSet<String>(jaConhecidos)
    return vindos.filter { id -> id.isNotBlank() && vistos.add(id) }
}

/**
 * O trabalho já saiu no papel e o escritório ainda não sabe?
 *
 * É a única coisa que precisa ser refeita depois de uma confirmação perdida — e
 * é o que separa "reenviar a confirmação" de "reimprimir a etiqueta". Confundir
 * os dois é o bug inteiro.
 */
fun precisaConfirmar(impressoEm: Long?, confirmado: Boolean): Boolean =
    impressoEm != null && !confirmado

/**
 * Pode apagar esta linha da tabela local?
 *
 * Só depois de impressa E confirmada E de o prazo da fila do servidor ter
 * passado. Enquanto o servidor ainda puder reoferecer o trabalho, a linha é a
 * trava; depois, ela não protege de nada e só ocupa espaço.
 *
 * O que NUNCA é podado é o que ainda não foi confirmado: essa linha é a única
 * memória de um papel que saiu e o escritório não sabe.
 */
fun podeSerPodado(impressoEm: Long?, confirmado: Boolean, agora: Long, validadeMs: Long): Boolean =
    confirmado && impressoEm != null && impressoEm < agora - validadeMs
