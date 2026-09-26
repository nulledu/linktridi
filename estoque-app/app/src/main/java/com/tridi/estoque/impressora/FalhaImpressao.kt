package com.tridi.estoque.impressora

// O QUE deu errado ao imprimir, e o que a pessoa faz a respeito.
//
// Arquivo separado — e sem import de Android — por dois motivos:
//
//  1. Estas frases são a interface. Quem está no galpão com uma chapa na mão
//     não lê `java.io.IOException: read failed, socket might closed`; ela lê
//     "impressora desligada ou fora de alcance" e vai apertar o botão da
//     impressora. Uma mensagem que não diz o que FAZER é tão inútil quanto a
//     pilha de exceção.
//  2. Sendo Kotlin puro, dá pra travar em teste que cada motivo tem uma frase
//     própria — o jeito mais comum de estragar isto é colapsar tudo num
//     "Erro ao imprimir" genérico durante um refactor.
enum class MotivoFalha(val mensagem: String) {

    /** Tablet sem rádio Bluetooth. Não tem o que tentar de novo. */
    SEM_BLUETOOTH("Este tablet não tem Bluetooth."),

    /** O rádio existe mas está apagado. */
    DESLIGADO("Bluetooth desligado — ligue o Bluetooth do tablet e tente de novo."),

    /** O Android não deu BLUETOOTH_CONNECT (ou LOCALIZAÇÃO, no Android 11 e abaixo). */
    SEM_PERMISSAO("Faltou a permissão de Bluetooth. Abra a tela da impressora de novo para conceder."),

    /** Nenhuma impressora escolhida ainda. */
    NAO_ESCOLHIDA("Nenhuma impressora escolhida. Abra Configurações da impressora e escolha uma."),

    /** A escolhida não está na lista de pareados do Android. */
    NAO_PAREADA("Impressora não encontrada. Pareie nas configurações do Android."),

    /** O socket abriu e morreu, ou nem abriu: impressora apagada, longe demais. */
    FORA_DE_ALCANCE("Impressora desligada ou fora de alcance. Ligue a impressora e chegue mais perto."),

    /** O socket foi recusado — canal SPP ocupado por outra conexão, ou vínculo velho. */
    RECUSADA("A impressora recusou a conexão. Desligue e ligue a impressora e tente de novo."),

    /** Conectou e caiu no meio do envio. */
    ESCRITA("A conexão caiu no meio da impressão. Confira o papel e imprima de novo."),

    /** Nada acima explica. Fica a mensagem técnica junto, pro log. */
    DESCONHECIDO("Não consegui imprimir. Tente de novo."),
}

/** Resultado de um trabalho de impressão — sucesso mudo ou falha que se explica. */
sealed interface ResultadoImpressao {
    data object Ok : ResultadoImpressao

    data class Falha(val motivo: MotivoFalha, val detalheTecnico: String? = null) : ResultadoImpressao {
        /** O que aparece na tela. O detalhe técnico só vai pro logcat. */
        val mensagem: String get() = motivo.mensagem
    }
}

/** Uma impressora que o Android já tem pareada. */
data class ImpressoraPareada(val endereco: String, val nome: String) {
    /** Nome vazio acontece quando o vínculo é antigo; o MAC ao menos identifica. */
    val rotulo: String get() = nome.ifBlank { endereco }
}
