package com.tridi.estoque.sync

// ── O que dizer quando o servidor recusou DE VEZ ─────────────────────────────
//
// Um 4xx de conteúdo (ver `classificarFalha`) marca a linha como
// `falhouDefinitivo` e ela nunca mais é reenviada. A conferência já mostrava
// isso na tela; baixa e recebimento não — a linha ficava parada no SQLite, sem
// nenhum lugar no app que a exibisse, e o galpão só descobria no inventário.
//
// Este arquivo é a tradução, e é Kotlin puro de propósito: o código de erro é
// contrato de rota (app/api/estoque/device/*), a frase é o que a pessoa lê de
// pé na frente do palete, e a correspondência entre os dois se confere em
// teste de unidade na JVM.
//
// Regra das frases: dizer O QUE FAZER. "motivo_invalido" não ajuda ninguém;
// "esse motivo saiu do sistema, escolha outro" resolve o turno.

/** Recusa de um lote de baixa — POST /api/estoque/device/baixa. */
fun mensagemDeErroDeBaixa(codigo: String?): String = when (codigo) {
    // O único alcançável só bipando: 201 peças num lote. O app agora barra
    // antes (LOTE_MAXIMO em scan/BipagemState.kt), mas uma fila antiga pode
    // ter uma linha destas guardada.
    "lote_grande" -> "Lote grande demais: no máximo 200 peças por vez. Bipe de novo em duas partes."
    "motivo_invalido" -> "Esse motivo de saída não existe mais no sistema. Bipe de novo e escolha outro."
    "operador_invalido" -> "Seu acesso não está mais ativo no sistema. Fale com a administração."
    "sem_codigos" -> "O lote subiu sem nenhuma etiqueta. Bipe as peças de novo."
    "schema_desatualizado" -> "O sistema ainda não está pronto para receber baixas. Avise o suporte."
    // Tablet numa versão anterior à do servidor: o corpo não bate com o
    // contrato da rota. Bipar de novo repetiria o mesmo envio recusado.
    "dados_invalidos" -> "Este tablet está desatualizado. Atualize o app e bipe o lote de novo."
    // 500 do servidor: o worker trata 5xx como transitório e reenvia sozinho.
    // A frase existe pra não cair na genérica, que manda refazer pelo ERP um
    // lote que ainda está na fila — e daria baixa duas vezes.
    "failed" -> "O sistema falhou ao gravar. O tablet tenta de novo sozinho — se insistir, avise o suporte."
    else -> "O sistema recusou esta baixa. As peças NÃO saíram do estoque — refaça pelo ERP."
}

/** Recusa de um recebimento — POST /api/estoque/device/recebimento. */
fun mensagemDeErroDeRecebimento(codigo: String?): String = when (codigo) {
    // O clássico do toque duplo: o segundo envio leva um operationId novo, e
    // aí a idempotência do servidor não cobre — a compra já foi recebida.
    "compra_ja_recebida" -> "Essa entrega já tinha sido registrada. Não precisa fazer de novo."
    "compra_cancelada" -> "Essa compra foi cancelada no sistema. Não registre a entrega."
    "compra_nao_encontrada" -> "Essa compra não existe mais no sistema."
    // ── As três do recebimento em DUAS ETAPAS ──
    //
    // Chegou pelo mesmo buraco que `destino_nao_escolhido`: a rota devolve
    // estes códigos com `error: msg` (variável, conferida contra `ERROS_COMPRA`
    // em app/api/estoque/device/recebimento/route.ts), então nem o teste antigo
    // nem a primeira versão da varredura os enxergavam. Os três caíam na
    // genérica "refaça pelo ERP" — em cima de uma entrega que, nos três casos,
    // NÃO tem nada pra refazer: o trabalho já foi feito, ou foi feito fora de
    // ordem. Refazer no ERP duplicaria a chegada.
    //
    // As frases dizem em QUAL das duas etapas a pessoa está e qual é a outra:
    // de pé no palete, "chegou" e "guardado" são dois atos distintos, e o erro
    // só faz sentido se disser qual deles já aconteceu.
    "compra_ja_chegou" ->
        "A chegada desta compra já foi registrada por inteiro. Se as caixas ainda " +
            "estão no palete, o que falta é GUARDAR no estoque — não registrar de novo."
    "nada_para_guardar" ->
        "Não há nada desta compra esperando pra ser guardado: ou já foi guardado, " +
            "ou a chegada ainda não foi registrada. Confira a compra na lista."
    "quantidade_maior_que_o_recebido" ->
        "Não dá pra guardar mais do que chegou. Registre a chegada do restante " +
            "primeiro, depois guarde no estoque."
    "operador_invalido" -> "Seu acesso não está mais ativo no sistema. Fale com a administração."
    "tabela_ausente" -> "O sistema ainda não está pronto para receber entregas. Avise o suporte."
    "dados_invalidos" -> "Este tablet está desatualizado. Atualize o app e registre a entrega de novo."
    // Ver a mesma linha em `mensagemDeErroDeBaixa`: 500 é transitório, e a
    // genérica mandaria refazer uma entrega que ainda vai subir sozinha.
    "failed" -> "O sistema falhou ao gravar. O tablet tenta de novo sozinho — se insistir, avise o suporte."
    else -> "O sistema recusou esta entrega. Ela NÃO foi registrada — refaça pelo ERP."
}
