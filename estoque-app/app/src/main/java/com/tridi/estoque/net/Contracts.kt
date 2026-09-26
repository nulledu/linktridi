package com.tridi.estoque.net

import kotlinx.serialization.Serializable

// Contrato do servidor para os tablets do estoque — app/api/estoque/device/*
// (rotas escritas em paralelo, ver docs/superpowers/plans/2026-08-11-estoque-app-tablet.md).
// Substitui as DTOs herdadas do TridiMarket (funcionário com limite de
// crédito, produto com preço, compra com carrinho) — eram do domínio de
// venda, podado do app (ver commit "remove o domínio de venda do mercadinho").
// O galpão baixa material e confere recebimento; não mexe em dinheiro.

@Serializable data class ActivationRequest(val codigo: String)
@Serializable data class ActivationData(val token: String, val deviceId: String, val nome: String)

// Diretório de quem pode bipar, para login OFFLINE: o código de acesso nunca
// sai do servidor — só o verificador, com sal por aparelho (mesmo desenho do
// mercadinho, ver security/OfflineCodes.kt e data/OperadorAuth.kt).
@Serializable data class OperadorDto(val id: String, val nome: String, val verificador: String)

@Serializable data class MotivoDto(val key: String, val label: String)

@Serializable data class CompraDto(
    val id: String,
    val itemNome: String,
    @Serializable(with = IntTolerante::class) val quantidade: Int,
    val fornecedor: String? = null,
    val previsao: String? = null,
)

/**
 * Como o ESCRITÓRIO decidiu que a etiqueta sai.
 *
 * Desce no bootstrap porque o tablet trabalha OFFLINE: ele guarda o que
 * recebeu (ImpressoraPrefs) e imprime com a última configuração conhecida. Uma
 * rota consultada na hora de imprimir falharia exatamente no meio do galpão,
 * onde não há Wi-Fi.
 *
 * `definida = false` é SILÊNCIO, não ordem: ninguém no escritório decidiu ainda
 * (o SQL não rodou), e o aparelho continua mandando no próprio ajuste. Os
 * números vêm preenchidos com o padrão do desenho mesmo assim — gravá-los como
 * se fossem decisão travaria todo tablet num valor que ninguém escolheu.
 *
 * Não descem, de propósito: a folga da guilhotina e qual impressora usar. As
 * duas dependem da lâmina e do rádio DAQUELE aparelho.
 */
@Serializable data class ImpressaoDto(
    val definida: Boolean = false,
    @Serializable(with = IntTolerante::class) val alturaMm: Int = 15,
    /**
     * Largura IMPRIMÍVEL da tira, em mm — o que a cabeça alcança, não a bobina.
     *
     * O padrão 72 é o que o galpão imprime desde sempre, e é ele que faz um
     * servidor antigo (que ainda não manda o campo) continuar valendo: o
     * `ignoreUnknownKeys` do JSON deixa o campo ausente cair aqui em vez de
     * estourar, e a etiqueta sai do tamanho de ontem em vez de não sair.
     */
    @Serializable(with = IntTolerante::class) val larguraMm: Int = 72,
    @Serializable(with = IntTolerante::class) val copias: Int = 1,
    /** SKUs cujo item é CAIXA. Só o que foge do padrão viaja — quase sempre vazio. */
    val caixas: List<String> = emptyList(),
    /**
     * Os campos que o escritório mandou NÃO imprimir — quase sempre vazio.
     *
     * Vem a lista dos DESLIGADOS e não a dos ligados, e isso é o que faz um
     * servidor NOVO conversar com um tablet ANTIGO sem estragar etiqueta: um
     * campo que este app ainda não conhece chega como uma string qualquer,
     * `CampoEtiqueta.deChaves` a descarta, e a etiqueta continua saindo com
     * tudo. Com a lista positiva o padrão seria o contrário — o app leria uma
     * lista de campos e apagaria da tira tudo o que não estivesse nela.
     */
    val ocultos: List<String> = emptyList(),
)

// ── A etiqueta que o escritório escreveu à mão ──────────────────────────────
//
// Desce ANEXADA ao bootstrap, e não por rota própria, porque uma fila de
// impressão convida a um poll de dois segundos — e este projeto já caiu duas
// vezes por consumo, a segunda por INVOCAÇÕES (um tick que responde "nada
// mudou" custa uma execução inteira). O bootstrap já roda a cada ciclo do
// worker; no ciclo comum esta lista vem VAZIA.
//
// O preço é o atraso, até ~15 minutos, e ele está escrito na tela do escritório
// antes do clique.
@Serializable data class LinhaLivreDto(
    val texto: String = "",
    /** "grande" | "media" | "pequena". Desconhecido cai no médio. */
    val tamanho: String = "media",
    val negrito: Boolean = false,
)

@Serializable data class ConteudoLivreDto(
    val linhas: List<LinhaLivreDto> = emptyList(),
    val codigo: String? = null,
    /** O TEXTO que vira QR — na prática a URL da página de conferência do
     *  lugar. Default `null`: trabalho enfileirado antes de o campo existir
     *  (ou vindo de um servidor mais velho) imprime exatamente como imprimia. */
    val qr: String? = null,
    /** QR ao LADO do texto (etiqueta deitada, baixa) em vez de embaixo.
     *  Default `false`: trabalho antigo imprime como imprimia. */
    val qrAoLado: Boolean = false,
    val mostrarCodigo: Boolean = true,
    @Serializable(with = IntTolerante::class) val alturaMm: Int = 30,
    /** Largura da tira, em mm. Trabalho enfileirado antes de a largura existir
     *  cai no padrão e imprime como imprimia — nunca deixa de imprimir. */
    @Serializable(with = IntTolerante::class) val larguraMm: Int = 72,
    @Serializable(with = IntTolerante::class) val copias: Int = 1,
)

@Serializable data class TrabalhoImpressaoDto(
    /** O id do SERVIDOR. É ele que impede a segunda tira: o aparelho guarda os
     *  que já viu e ignora o que volta (ver `EstoqueSyncWorker`). */
    val id: String,
    @Serializable(with = IntTolerante::class) val copias: Int = 1,
    val conteudo: ConteudoLivreDto = ConteudoLivreDto(),
)

@Serializable data class ConfirmacaoImpressaoDto(
    val id: String,
    val ok: Boolean,
    /** A frase do que deu errado — é ela que aparece na fila do escritório. */
    val detalhe: String? = null,
)

@Serializable data class ConfirmarImpressaoRequest(val trabalhos: List<ConfirmacaoImpressaoDto>)

@Serializable data class ConfirmarImpressaoResponse(
    val ok: Boolean = true,
    @Serializable(with = IntTolerante::class) val confirmados: Int = 0,
)

@Serializable data class BootstrapData(
    val operadores: List<OperadorDto> = emptyList(),
    val salt: String = "",
    val motivos: List<MotivoDto> = emptyList(),
    val compras: List<CompraDto> = emptyList(),
    /** Ausente quando o servidor é mais velho que esta versão do app. */
    val impressao: ImpressaoDto? = null,
    /** Vazia no ciclo comum — só tem conteúdo quando alguém mandou imprimir. */
    val trabalhos: List<TrabalhoImpressaoDto> = emptyList(),
)

// ── Catálogo ("quantos temos disso?") ───────────────────────────────────────
//
// Não vem no bootstrap de propósito: o bootstrap roda a cada ciclo do worker e
// mandar o catálogo inteiro nele seria pagar ~40 KB por ciclo pra dizer "nada
// mudou" — o padrão que estourou o egress do Supabase em julho. Aqui o
// aparelho manda a assinatura que já tem e a resposta comum é `mudou: false`.
@Serializable data class ItemCatalogoDto(
    val id: String,
    val nome: String = "",
    val sku: String? = null,
    val categoria: String? = null,
    val unidade: String = "un",
    /** Fracionário: item a granel tem meio metro, meia lata (ver DoubleTolerante). */
    @Serializable(with = DoubleTolerante::class) val quantidade: Double = 0.0,
    /** "COR-A · Corredor A" — o servidor já monta; o tablet não conhece local. */
    val local: String? = null,
)

@Serializable data class CatalogoData(
    /** `false` = a assinatura bateu, o catálogo local continua valendo. */
    val mudou: Boolean = true,
    val assinatura: String = "",
    /** O catálogo passou do teto do servidor — a busca não cobre tudo. */
    val truncado: Boolean = false,
    val itens: List<ItemCatalogoDto> = emptyList(),
)

@Serializable data class HeartbeatRequest(val pendingOperations: Int, val appVersion: String)
@Serializable data class HeartbeatResponse(val ok: Boolean = true)

@Serializable data class BaixaRequest(
    val operationId: String,
    val codigos: List<String>,
    val motivo: String,
    val obs: String? = null,
    val operadorId: String,
    val ocorridoEm: String,
)
@Serializable data class EntradaRequest(
    val operationId: String,
    val codigo: String,
    val quantidade: Int,
    val motivo: String,
    val obs: String? = null,
    val operadorId: String,
)
/** O que voltou da entrada: a FRASE já vem pronta do servidor. */
@Serializable data class EntradaResponseData(
    val item: String = "",
    val quantidade: Int = 0,
    val saldo: Int = 0,
    val frase: String = "",
)
@Serializable data class BaixaItemResultado(
    val codigo: String,
    val situacao: String,
    val item: String? = null,
    /**
     * Peças que saíram COM ESTA ETIQUETA. A etiqueta é a CAIXA: uma caixa
     * lacrada de 50 folhas vale 50. O campo já descia do servidor e este app
     * jogava fora — a tela contava etiquetas e chamava de baixa, errando por
     * 50× no número que a pessoa usa pra conferir o que acabou de fazer.
     *
     * 1 no ausente, que é como era antes de a caixa existir; servidor antigo
     * continua respondendo certo.
     */
    @Serializable(with = IntTolerante::class) val pecas: Int = 1,
)

/**
 * O que SAIU, por ITEM, no lote que acabou de subir.
 *
 * A lista de códigos serve pra apontar a etiqueta que não baixou; ela não serve
 * pra conferir trabalho. Quem bipou oito caixas quer ouvir "MDF 6 mm — 400
 * peças, restam 320", e ninguém confere código de barras de cabeça.
 *
 * O SALDO só existe no servidor: ele é mantido por gatilho no banco a partir
 * das etiquetas em estoque, e o tablet nem sabe quantas outras pessoas bipavam
 * o mesmo item no mesmo minuto. Por isso ele DESCE, e não é calculado aqui.
 * Vazio = servidor mais velho que esta versão do app; a tela então diz só o
 * que sempre disse.
 */
@Serializable data class ItemDaSaidaDto(
    val item: String = "",
    @Serializable(with = IntTolerante::class) val pecas: Int = 0,
    /** Fracionário: cola e fita saem em litro e metro (ver DoubleTolerante). */
    @Serializable(with = DoubleTolerante::class) val saldo: Double = 0.0,
    val unidade: String = "un",
)

@Serializable data class BaixaResponseData(
    val resultado: List<BaixaItemResultado> = emptyList(),
    val itens: List<ItemDaSaidaDto> = emptyList(),
)

// ── Conferência de qualidade ────────────────────────────────────────────────
//
// A atividade que o operador terminou e que espera o "ok" de um gestor: quem
// fez, o que fez, quantas peças. A quantidade vem tolerante a string porque
// `numeric` do Postgres às vezes sai entre aspas (ver IntTolerante).
/**
 * Um item do catálogo oferecido como DESTINO da produção.
 *
 * O servidor manda no máximo três por caixa, já ordenadas pelo quanto o nome
 * bate com a tarefa (lib/estoque-sugestao-item.ts): "Colar EVA na chapa 3 mm"
 * traz os itens com "EVA" na frente. É um atalho, nunca uma decisão — um
 * palpite aplicado sozinho põe peça no item errado do estoque e o número fecha,
 * só que no lugar errado.
 *
 * Elas vêm prontas do servidor em vez de calculadas aqui porque a conta precisa
 * do catálogo INTEIRO (231 itens), e baixar 231 linhas a cada abertura de ficha
 * é o padrão de consumo que já derrubou este projeto duas vezes. Três nomes por
 * caixa cabem na resposta que a lista já traz.
 */
/**
 * Em que pé o item está diante da ETIQUETA — a régua de lib/estoque-etiquetavel.ts.
 *
 * Vem do servidor porque a decisão precisa de três colunas do item
 * (`serializado`, `quantidade`, `unidade`) e o tablet só guarda o catálogo
 * reduzido ("quanto tem, em que unidade, onde fica"). Traduzir a chave em frase
 * é do app (ver conferencia/Etiquetavel.kt): o `motivo` que desce aqui é escrito
 * pra tela do computador, onde existe o botão de preparar, e no galpão a saída é
 * outra — chamar quem tem acesso.
 *
 * Ausente = servidor mais velho que esta versão do app. Nesse caso a tela volta
 * a se guiar por `serializado`, exatamente como antes desta feature.
 */
@Serializable data class PreparoDto(
    /** "ja_etiquetado" | "converter_agora" | "precisa_preparo" | "nao_etiquetavel". */
    val estado: String = "",
    val motivo: String = "",
)

@Serializable data class SugestaoDestinoDto(
    val id: String,
    val nome: String = "",
    /** Etiquetado (nasce uma caixa) ou só um número somado no catálogo. */
    val serializado: Boolean = true,
    /** Mais fino que `serializado`: separa "não é" de "ainda não foi preparado". */
    val preparo: PreparoDto? = null,
)

@Serializable data class AtividadeConferenciaDto(
    val id: String,
    val produtoNome: String = "",
    /**
     * O item que a atividade JÁ apontava. Quase sempre `null` — e é esse
     * "quase sempre" que define a tela: sem ele, quem confere é que diz onde as
     * peças entram, escolhendo entre `sugestoes`.
     */
    val itemId: String? = null,
    /** Do item acima. `null` quando não há item. Muda a promessa da tela. */
    val itemSerializado: Boolean? = null,
    /**
     * Do item acima, mais fino: dá pra etiquetar, ainda não dá, ou nunca vai dar.
     *
     * Só existe quando a atividade JÁ aponta um item — a minoria. Quando não
     * aponta, quem carrega o estado é a sugestão que o gestor escolher.
     */
    val preparo: PreparoDto? = null,
    /**
     * Onde isto provavelmente entra, do mais provável pro menos.
     *
     * Vazia quando a atividade já aponta um item (não há o que escolher) ou
     * quando nada no catálogo bate com a tarefa — aí só resta procurar.
     */
    val sugestoes: List<SugestaoDestinoDto> = emptyList(),
    val categoria: String? = null,
    /**
     * A INSTRUÇÃO que a pessoa recebeu ("Colar o PS nas 30 bases").
     *
     * "Certo" só significa alguma coisa contra um pedido, e o gestor conferia
     * o resultado sem ter à mão o que tinha sido combinado.
     */
    val detalhe: String? = null,
    @Serializable(with = IntTolerante::class) val quantidadeAlvo: Int = 0,
    @Serializable(with = IntTolerante::class) val quantidadeFeita: Int = 0,
    val executorId: String? = null,
    val executorNome: String? = null,
    /** O ROSTO de quem fez — a lista do galpão se lê por cara, não por nome. */
    val executorFotoUrl: String? = null,
    val concluidaEm: String? = null,
    /**
     * A FOTO DO TRABALHO PRONTO, tirada pela pessoa ao concluir.
     *
     * É a prova que a conferência compara com a caixa na frente do gestor. A
     * LISTA não a baixa (o galpão está em 3G e uma lista de 23 fotos de celular
     * é a tela que nunca abre) — quem baixa é a ficha, uma por decisão.
     */
    val fotoUrl: String? = null,
    /**
     * Quanto levou de verdade, em MINUTOS já partidos pelo servidor. O app roda
     * com minSdk 24, onde `java.time` não existe sem desugaring — e duas réguas
     * de data seriam duas réguas pra divergir.
     */
    @Serializable(with = IntTolerante::class) val tempoRealMin: Int = 0,
    @Serializable(with = IntTolerante::class) val tempoEstimadoMin: Int = 0,
)

@Serializable data class ConferenciasPendentesData(
    val atividades: List<AtividadeConferenciaDto> = emptyList(),
    /**
     * O servidor NÃO consegue conferir nada: `estoque_conferencias` ainda não
     * existe (falta rodar supabase/estoque_pendente_tudo.sql). A fila vem
     * vazia de propósito — listar tudo e recusar toque a toque seria pior.
     *
     * A rota manda este campo desde que existe; o app é que o ignorava, e o
     * gestor ficava olhando "nada esperando conferência" à espera de um
     * trabalho que nunca ia aparecer.
     */
    val qcDesligado: Boolean = false,
    /**
     * Conferências GRAVADAS cujo estoque não entrou. O trabalho foi feito, as
     * caixas existem, e o número do sistema está menor que a prateleira agora.
     */
    @Serializable(with = IntTolerante::class) val travadas: Int = 0,
    /**
     * Caixas concluidas ANTES da janela da fila. O servidor sempre contou e
     * mandou; o tablet ignorava, e "Nada esperando conferencia" com 83 caixas
     * paradas atras de sete dias fazia o gestor fechar o tablet e ir embora.
     */
    @Serializable(with = IntTolerante::class) val anteriores: Int = 0,
    /** O tamanho da janela em dias, pra frase dizer QUAL corte escondeu o resto. */
    @Serializable(with = IntTolerante::class) val dias: Int = 0,
)

/**
 * O que o tablet manda ao conferir: CERTO ou ERRADO, e nada mais.
 *
 * NÃO EXISTE QUANTIDADE AQUI, de propósito. Quem disse quantas peças fez foi a
 * pessoa que produziu, quando concluiu a atividade — o servidor relê esse
 * número de `atividades.quantidade_feita` na hora de gravar. Mandá-lo de volta
 * criaria uma segunda fonte da verdade viajando por uma fila offline que pode
 * subir horas depois, e a caixa nasceria com o número que o tablet lembrava, não
 * com o que a atividade diz.
 */
@Serializable data class ConferenciaRequest(
    val operationId: String,
    val atividadeId: String,
    /** "certo" | "errado" — ver `RESULTADOS` em lib/estoque-qualidade.ts. */
    val resultado: String,
    /**
     * EM QUAL ITEM DO CATÁLOGO as peças entram — o que o gestor escolheu na
     * ficha, e o campo que faltava.
     *
     * Sem ele o servidor recusa toda aprovação de atividade sem
     * `produto_nome` (`ErroDestinoNaoEscolhido`), que é o caso de 103 das 104
     * atividades concluídas do galpão. A rota já esperava o campo desde que o
     * ERP passou a mandá-lo; o tablet é que não mandava.
     *
     * `null` em dois casos, e nos dois o servidor sabe o que fazer: no ERRADO
     * (nada entra no estoque, então não há endereço a gravar) e na atividade
     * que já aponta produto — aí o item é resolvido por nome, como sempre foi,
     * COM a guarda de nome ambíguo que o `destinoId` pularia. Como o
     * serializador do app roda com `explicitNulls = false`, nulo não viaja: o
     * corpo continua idêntico ao de antes, e um servidor mais velho nem nota.
     */
    val destinoId: String? = null,
    /** Só no errado. No certo o servidor zera, mas o app já manda vazio. */
    val defeitos: List<String> = emptyList(),
    val obs: String? = null,
    val conferidoPorId: String,
    val ocorridoEm: String,
)

/**
 * A etiqueta JÁ MONTADA pelo servidor.
 *
 * É a razão de esta rota existir. Vindo de uma atividade o servidor sabe o
 * item — nome comercial, cor/dimensões, local no galpão —, coisas que o tablet
 * não tem como derivar de um código de barras. Nas outras filas o app imprime
 * o SKU no lugar do nome e sem local (ver ServicoDeImpressao.etiquetaDaUnidade)
 * porque é a única informação verdadeira que ele tem; aqui ele imprime o que
 * veio, sem recalcular nada.
 */
@Serializable data class EtiquetaDto(
    val codigo: String,
    val nome: String = "",
    val corDimensoes: String? = null,
    /**
     * Peças DENTRO desta caixa — a etiqueta vale por todas elas.
     *
     * É o número que muda o significado da tira de papel: uma etiqueta colada
     * numa caixa lacrada de 50 folhas não é "uma peça", é a caixa. Ausente ou
     * `1` é a peça avulsa de sempre (uma chapa é uma caixa de 1).
     */
    @Serializable(with = IntTolerante::class) val quantidade: Int = 1,
    val local: String? = null,
    val localDetalhe: String? = null,
    val responsavel: String? = null,
    val data: String? = null,
)

/**
 * O que a conferência devolveu.
 *
 * `etiquetas` tem NO MÁXIMO UMA: certo faz nascer UMA caixa valendo
 * `quantidade` peças — ninguém etiqueta 50 folhas uma a uma. No errado vem
 * tudo vazio e `reaberta` diz que a atividade voltou pra pessoa refazer.
 */
@Serializable data class ConferenciaResponseData(
    val ok: Boolean = true,
    val resultado: String = "",
    /** Peças que ENTRARAM no estoque. Sempre 0 no errado. */
    @Serializable(with = IntTolerante::class) val quantidade: Int = 0,
    val unidades: List<String> = emptyList(),
    val etiquetas: List<EtiquetaDto> = emptyList(),
    val reaberta: Boolean = false,
    /**
     * POR QUE não veio etiqueta — quando não veio.
     *
     * Lista vazia era silêncio absoluto: o gestor confirmava, a fila subia, as
     * peças entravam no estoque e nada aparecia na tela. A caixa ia pra
     * prateleira sem código colado e ninguém sabia. Este campo é o que o worker
     * grava no feedback pra tela mostrar (ver EstoqueSyncWorker).
     */
    val preparo: PreparoDto? = null,
)

/**
 * O aviso "entrou no estoque, mas sem etiqueta" GUARDADO no tablet.
 *
 * Mora aqui, junto do contrato, porque é o formato gravado em `sync_feedback` —
 * o mesmo caminho que as etiquetas já percorrem (`EtiquetaDto` é contrato e
 * feedback ao mesmo tempo). Guardamos os DADOS, não a frase pronta: a frase é
 * montada na tela por `fraseDoAvisoDePreparo`, e assim um app atualizado
 * escreve melhor um aviso que ficou de ontem.
 */
@Serializable data class AvisoDePreparoDto(
    /** Qual caixa — quando a fila sobe junta são oito, e "uma delas" não serve. */
    val atividade: String = "",
    val estado: String = "",
    val motivo: String = "",
)

@Serializable data class RecebimentoRequest(
    val operationId: String,
    val compraId: String,
    @Serializable(with = IntTolerante::class) val quantidadeRecebida: Int,
    val operadorId: String,
    val ocorridoEm: String,
)
@Serializable data class RecebimentoResponseData(val unidades: List<String> = emptyList())

// O device do mercadinho responde `{ ok, data, error }`; algumas rotas do
// estoque (ex.: POST /api/estoque/unidades) respondem flat, sem "data". O
// decodificador de EstoqueApi tenta os dois formatos — ver `decodificar()`.
@Serializable data class ApiEnvelope<T>(val ok: Boolean = true, val data: T? = null, val error: String? = null)

// ── Os lugares do galpão (tela "Placas do galpão") ───────────────────────────
//
// A árvore rua → seção → prateleira, do jeito que /api/estoque/device/locais
// entrega. Defaults tolerantes como o resto do arquivo: campo novo no servidor
// não derruba app velho, e vice-versa.

@Serializable data class LocalDto(
    val id: String,
    /** O que vai impresso na placa e dentro do QR. */
    val codigo: String,
    val nome: String = "",
    /** `null` = raiz (uma rua). */
    val paiId: String? = null,
    val ativo: Boolean = true,
    @Serializable(with = IntTolerante::class) val ordem: Int = 0,
)

@Serializable data class LocaisData(val locais: List<LocalDto> = emptyList())

@Serializable data class CriarLocalRequest(
    val codigo: String,
    val nome: String,
    val paiId: String? = null,
)

@Serializable data class CriarLocalResponse(
    val ok: Boolean = false,
    val local: LocalDto? = null,
    /** A frase de recusa, pronta pra tela ("já existe…", "código inválido…"). */
    val detalhe: String? = null,
)
