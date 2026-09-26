package com.tridi.estoque.impressora

import com.tridi.estoque.net.EtiquetaDto

/**
 * A etiqueta que o SERVIDOR montou — imprime o que veio, sem re-derivar nada.
 *
 * É o contrário de `ServicoDeImpressao.etiquetaDaUnidade`, e é o ponto do fluxo
 * de conferência. Nas outras filas o tablet recebe só os CÓDIGOS das unidades:
 * sem ficha do produto, o nome impresso vira o SKU (que está dentro do próprio
 * código, e é verdadeiro) e a coluna de local simplesmente não existe.
 *
 * Vindo de uma ATIVIDADE o servidor sabe o item — nome comercial,
 * cor/dimensões, local no galpão. Então ele manda a etiqueta pronta. Tentar
 * "melhorar" aqui, recalculando o nome pelo SKU ou chutando um local, só pode
 * piorar: trocaria um dado verdadeiro por um derivado, e etiqueta com o produto
 * errado escrito é peça perdida no galpão.
 *
 * O app só completa o RODAPÉ quando o servidor não mandou: a data de hoje e
 * quem está com o tablet agora.
 */
fun EtiquetaDto.paraImpressao(responsavelPadrao: String? = null): DadosEtiqueta = DadosEtiqueta(
    codigo = codigo,
    nome = nome.ifBlank { EtiquetaRaster.skuDoCodigo(codigo) },
    // As peças DENTRO da caixa. Quem desenha o selo é o EtiquetaRaster (ver
    // `EtiquetaLayout.textoDaCaixa`); aqui é só a ponte entre o que o servidor
    // mandou e o que vai impresso — e sem ela o selo nunca sairia numa
    // etiqueta de conferência, que é justamente a única que nasce caixa.
    quantidade = quantidade,
    corDimensoes = corDimensoes?.takeIf { it.isNotBlank() },
    local = local?.takeIf { it.isNotBlank() },
    localDetalhe = localDetalhe?.takeIf { it.isNotBlank() },
    responsavel = responsavel?.takeIf { it.isNotBlank() } ?: responsavelPadrao,
    data = data?.takeIf { it.isNotBlank() } ?: hoje(),
)

private fun hoje(): String = agoraNaEtiqueta()
