# Totem do mercadinho: leitor Bluetooth, sem câmera

Data: 2026-08-08 · Atualizado: 2026-08-10 · Estado: **implementado e instalado
no tablet**. Duas afirmações do desenho original se mostraram FALSAS no
aparelho e estão corrigidas abaixo, marcadas com "medido".

## O problema

O totem lê código de barras pela câmera. Na prática a câmera erra onde mais
importa: embalagem congelada sai da geladeira com condensação, lata é curva e
espelhada, saco plástico amassa o código. O leitor laser resolve os três.

O app já aceita leitor HID por cabo ([TeclasDoLeitor.kt](../../../tridimarket-app/app/src/main/java/com/tridi/market/scan/TeclasDoLeitor.kt)),
mas parear um leitor Bluetooth exige os Ajustes do Android — e o totem está em
lock task com device owner, onde os Ajustes não abrem. Hoje **não existe**
caminho pra parear sem cabo adb.

Decisão do dono: o leitor Bluetooth passa a ser o único jeito de bipar, e a
câmera sai do fluxo de identificação por completo.

## O que muda

### 1. Porta secreta na tela do código

Na `PinScreen`, no teclado numérico que já existe:

```
0  0  ⌫  ⌫  0  0  ⌫  ⌫
```

Escolhida porque **não colide com uso real**: o código do funcionário tem 6
dígitos e é enviado sozinho ao completar o sexto; essa sequência nunca passa de
2 dígitos no buffer, então jamais dispara um login.

- Detector é máquina de estado **pura** (`kiosk/SequenciaSecreta.kt`), sem
  dependência de Android — testável em JVM como `LeitorExterno`.
- **5 segundos** de silêncio entre teclas zera o progresso. Sem isso a sequência
  ficaria armada indefinidamente e um funcionário distraído cairia nela.
- A tela não dá nenhum retorno visual de progresso. Retorno é o que transforma
  segredo em brincadeira coletiva.

### 2. Senha de 6 dígitos

Sequência completa → prompt de 6 dígitos, mesmo `TecladoNumerico`, mesmas
regras do `PinState` (5 erros = 60s travado).

A senha é **constante no app**, como `DestravarReceiver.TOKEN`. Motivo: o
pareamento acontece na instalação do totem, às vezes antes do Wi-Fi existir —
buscar a senha no servidor trancaria você do lado de fora exatamente na hora de
precisar. É obscuridade, não criptografia, e está no mesmo nível de proteção que
o destrave já assume.

### 3. Tela de pareamento (`kiosk/PareamentoScreen.kt`)

- Lista pareados + descobertos (`BluetoothAdapter.startDiscovery`).
- Toque pareia (`createBond`), com estado visível: procurando / pareando /
  pareado / falhou.
- Filtra periférico HID por padrão (`BluetoothClass.Device.Major.PERIPHERAL`),
  com "ver todos" — leitor barato às vezes se anuncia com classe errada, e
  esconder o aparelho certo seria pior que mostrar ruído.
- **Campo de teste no rodapé**: bipa ali e o código aparece na tela. É a prova
  de que funcionou antes de sair; sem ele a pessoa desce do totem sem saber.
- Permissões concedidas pelo device owner via `setPermissionGrantState`, sem
  diálogo. **Medido:** neste tablet (Android 10) a permissão que importa é
  `ACCESS_FINE_LOCATION`, não `BLUETOOTH_SCAN/CONNECT` — o conjunto mudou no
  Android 12, e o app pede os dois conforme a versão. O `dumpsys` confirma
  `granted=true flags=[POLICY_FIXED]`, que é a marca da concessão por política.
- Sair da tela volta ao lock task normal.

### 3b. CORREÇÃO: o diálogo do Android é inevitável

O desenho dizia "nenhum diálogo do Android aparece no totem". **É falso.**

Medido no aparelho: responder o pedido de pareamento no lugar do sistema exige
`setPairingConfirmation`, que por sua vez exige `BLUETOOTH_PRIVILEGED` — uma
permissão de sistema que **device owner não concede**. O log é literal:

```
TridiMarketBt: pedido de pareamento variante=3
TridiMarketBt: não consegui responder o pareamento:
  Need BLUETOOTH PRIVILEGED permission: Neither user 10130
  nor current process has android.permission.BLUETOOTH_PRIVILEGED
```

E sem o diálogo o pareamento simplesmente morre: o lock task barrava a abertura
(`Attempted Lock Task Mode violation`) e o vínculo expirava em **20 segundos**.

Por isso a tela agora **libera `com.android.settings` no lock task enquanto está
aberta**, e desfaz ao sair (`permitirDialogoDoSistema`). É uma exceção estreita,
atrás da sequência secreta + senha, e é o preço de parear sem privilégio de
sistema. O app ainda tenta responder sozinho primeiro — em ROM que permita, o
diálogo nem aparece.

Consequência prática: **quem pareia tem 20 segundos** para tocar em "SINCR.".
Não é um detalhe de implementação; é instrução de uso.

### 4. Câmera sai do fluxo

Removidos: `ui/ScannerScreen.kt`, `scan/BarcodeAnalyzer.kt`, `scan/Quadro.kt`,
`scan/ScanRules.kt`, `scan/Aparencia.kt`, `scan/CatalogoVisual.kt`, a rota
`MarketScreen.Scanner`, `reconhecerPelaAparencia` e os pontos que chamam
`onAparencia` em `EscolhaScreen`/`MarketApp`.

Removido também o preparo de assinatura visual em `MarketSyncWorker`, a
entidade `ProductSignatureEntity` e a tabela — com **migração Room 5 → 6**
fazendo o `DROP TABLE`. Deixar a tabela órfã custaria menos código agora e mais
confusão depois.

**Fica**: a câmera frontal da foto de conferência ([FotoConferencia.kt](../../../tridimarket-app/app/src/main/java/com/tridi/market/ui/FotoConferencia.kt))
e, portanto, a permissão `CAMERA` no manifesto.

### 5. Aviso de leitor ausente

Sem câmera e sem leitor conectado, o totem fica mudo e ninguém entende por quê.
A tela de compra ganha uma faixa **"Leitor desconectado"** quando não há leitor
presente (`InputManager`, mesma fonte que `TeclasDoLeitor` já consulta).

**Medido — e o critério óbvio estava errado.** "Existe teclado físico?" não
serve: este tablet expõe `mtk-kpd` e `ACCDET` (teclas de volume e detector de
fone) como `SOURCE_KEYBOARD` não-virtual. Com esse critério a faixa diria
"conectado" num tablet sem leitor nenhum — apagando justamente o aviso que a
torna útil. O que separa é `keyboardType == KEYBOARD_TYPE_ALPHABETIC`: leitor
HID escreve letras e números; botão de volume, não. Travado em teste com os
valores lidos do aparelho (`LeitorPresenteTest`).

Continua existindo a busca por toque (`BuscaScreen`) — que é como o produto sem
código sempre foi vendido. O leitor some, a venda não para.

## Testes

- `SequenciaSecreta`: acerta a sequência; erra no meio e reinicia; expira em 5s;
  sequência não interfere no código de 6 dígitos.
- `PareamentoState` (parte pura da tela): filtro HID, ordenação, transição de
  estado do bond.
- Nada de instrumentado — o resto é Android puro e é conferido no aparelho.

## O que ficou provado no aparelho (2026-08-10)

Instalado por cima, sem desinstalar. Lido do próprio tablet:

- Migração Room 5→6 sem exceção; `product_signatures` sumiu; banco 446 KB → 188 KB.
- Catálogo real: 277 produtos, 35 funcionários no diretório offline.
- **117 vendas na fila, todas `SYNCED`** — nenhuma presa.
- `Z0 barcode scanner` (`DC:0D:30:47:94:CA`) pareado e ativo como dispositivo de
  entrada. O pareamento pela porta secreta funciona de ponta a ponta.
- Lock task de volta em `LOCKED` depois da manutenção.

- **Faixa "Leitor desconectado" no estado âmbar: confirmada pelo dono**, que a
  viu na tela quando o leitor ficou fora do ar. Não é captura minha — é relato
  de quem estava no aparelho.

- **Ciclo completo de compra nesta versão: confirmado pelo dono.** Login, bipar
  no leitor Bluetooth, carrinho e fechamento. Testado por ele no aparelho —
  credenciais de funcionário não são digitadas por terceiros, então esta é a
  única forma honesta de fechar este item.

Com isso, o totem sem câmera está **em operação**: identificar produto, vender e
sincronizar funcionam só com o leitor.

Não verificado, e por quê:

- **Caminho "Bluetooth desligado ao abrir a tela".** Não foi possível desligar o
  rádio neste tablet (`service call` recusado, GMS religa no boot), e o dono
  decidiu **não** desligar o Bluetooth só para testar. Fica como caminho de
  borda conhecido e não exercitado: `enable()` volta na hora mas o rádio demora
  em `TURNING_ON`, e a correção é esperar `ACTION_STATE_CHANGED` → `STATE_ON`.

## Por que o APK segue sendo `debug`

`PREVIEW_ENABLED` é `true` em debug — o modo demonstração existe no aparelho em
campo. Ele só liga por um `am start` explícito via adb, mas está lá.

Trocar para `release` **não é uma troca de APK**: não há `signingConfig`, então
`assembleRelease` sai sem assinatura; e um APK com assinatura diferente não
atualiza por cima — exigiria desinstalar. Desinstalar apaga o banco (vendas
offline) e derruba o device owner, que só volta em aparelho sem conta
cadastrada. Ou seja: é uma **reprovisionamento**, não uma atualização.

Decisão: seguir em debug neste tablet; adotar `release` assinado no próximo
provisionamento, que já parte de aparelho zerado.

## Riscos e ordem

1. ~~**Bloqueio conhecido:** nada disso chega no tablet enquanto o adb estiver
   sem autorização.~~ **Resolvido** — o cabo USB trouxe o diálogo RSA e a
   autorização foi dada. O adb por Wi-Fi seguia `unauthorized`; o cabo é o
   caminho. Atenção: a conexão cai com facilidade neste cabo.
2. Tirar a câmera é irreversível na prática — se o leitor falhar em campo, sobra
   a busca por toque. Aceito pelo dono.
3. A senha constante vaza pra quem lê o repositório. Aceito: o repositório é
   privado e o pior caso é abrir o pareamento, não a venda.
