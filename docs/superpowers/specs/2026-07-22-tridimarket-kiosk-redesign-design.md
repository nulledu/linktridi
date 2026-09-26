# TridiMarket Kiosk Redesign

## Objetivo

Refazer o catálogo Android do TridiMarket seguindo a estrutura visual do totem em `/Users/caiosilva/Documents/appcomercial/cardapio-launcher`, preservando a identidade roxa da Tridi e simplificando o fluxo para um mercadinho interno.

## Direção aprovada

- O tablet permanece em retrato, como o totem de referência.
- Uma barra lateral fixa organiza as categorias; em larguras compactas, ela vira uma faixa horizontal.
- O cabeçalho mostra funcionário, saldo disponível e conectividade sem disputar atenção com os produtos.
- A busca procura somente pelo nome do produto. Não haverá texto, ação ou filtro por código de barras.
- Os cards usam duas colunas no tablet, com a imagem ocupando a maior parte do card. `imageUrl` é exibida quando existe; uma ilustração de embalagem é usada como fallback.
- Tocar em um card não altera o carrinho imediatamente. Abre uma confirmação com imagem, nome, preço e as ações `Cancelar` e `Adicionar ao carrinho`.
- O carrinho aparece em uma barra fixa quando contém itens. A barra abre um painel de revisão inspirado no appcomercial, com quantidade, total, saldo restante e a ação `Adicionar à minha conta`.
- O fluxo de recibo e a persistência offline existentes não mudam.

## Limites

- Não copiar banners promocionais, adicionais, observações, CPF, tipo de pedido ou upsell do app de restaurante.
- Manter o campo de código de barras apenas nos contratos e no cache legado para compatibilidade de dados; ele não participa da experiência do usuário.
- Não adicionar desconto em folha.
- Não introduzir emojis na interface.

## Estados e erros

- Produto sem imagem usa ilustração local por tipo de embalagem.
- Produto sem estoque não abre confirmação e aparece indisponível.
- Falha ao carregar imagem remota cai silenciosamente para a ilustração local.
- Total acima do saldo desabilita a finalização e mostra o saldo em vermelho.

## Verificação

- Testes unitários garantem busca somente por nome e a transição solicitar → confirmar/cancelar.
- APK debug e release devem compilar.
- No emulador, validar card com imagem dominante, confirmação antes da inclusão, barra do carrinho, painel de revisão e recibo.
