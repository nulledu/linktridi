package com.tridi.market.ui

// De onde veio o produto que está esperando confirmação.
//
// Importa porque as duas origens têm garantias MUITO diferentes: o código de
// barras é lido da embalagem que está na mão da pessoa, então o item cobrado é
// necessariamente o item pego. Escolher pela busca (ou pelos atalhos da home)
// não prova nada — a lista aceita qualquer toque.
enum class OrigemProduto {
    LEITOR,
    BUSCA,
}

// Só o que NÃO passou pelo leitor precisa da foto de conferência.
//
// Pedir foto também de quem bipou seria atrito puro: o código já respondeu pelo
// produto, e o totem existe para ser rápido.
fun exigeFotoDeConferencia(origem: OrigemProduto): Boolean = origem == OrigemProduto.BUSCA

/**
 * A foto é POSSÍVEL neste aparelho?
 *
 * Existe tablet na frota sem câmera nenhuma. Antes isso era irrelevante — sem
 * câmera não havia como bipar, então o aparelho nem servia de totem. Agora que
 * a leitura é do leitor Bluetooth, um tablet sem câmera é um totem perfeitamente
 * bom, e a foto passa a ser a única coisa que não funciona nele.
 *
 * Sem esta checagem a compra TRAVA: o CameraX falha no bind, a tela fica preta e
 * o botão de capturar não faz nada — e é justamente o caminho de todo produto
 * escolhido por toque, que num totem sem leitor de código é a venda inteira.
 *
 * A conferência é uma garantia, não uma trava: quando ela não é possível, a
 * compra segue. Mesma decisão que já valia para permissão negada.
 */
fun fotoDeConferenciaPossivel(temCameraNoAparelho: Boolean, temPermissao: Boolean): Boolean =
    temCameraNoAparelho && temPermissao
