# Estoque no tablet — app Android próprio, TridiMarket como base

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Um app Android dedicado ao Estoque, rodando em kiosk no E1035 do galpão: bipar etiqueta pra dar baixa (com motivo) e conferir recebimento gerando as etiquetas do que chegou. O TridiMarket sai deste aparelho.

**Architecture:** Fork do `tridimarket-app/` para `estoque-app/`, pacote `com.tridi.estoque`. A infraestrutura cara vem inteira: leitor de pistola HID, kiosk com device owner, fila offline (Room + WorkManager) e segredos no Keystore. O que se reescreve é a camada de telas e as rotas do servidor.

**Tech Stack:** Kotlin, Jetpack Compose, Room, WorkManager, OkHttp, DataStore + Android Keystore. Servidor: Next 16 + Supabase.

**Depende de:** `supabase/estoque_hierarquia_unidades.sql` rodado, e as rotas `/api/estoque/unidades` já no ar (plano anterior).

---

## Por que fork, e não um módulo dentro do TridiMarket

Duas responsabilidades sem nada em comum além da carcaça: o mercadinho vende pra funcionário e mexe em dinheiro e limite de crédito; o estoque baixa material e mexe em contagem física. Compartilhar o binário significaria um aparelho ter as duas, e o device owner só aceita **um** pacote — o que já força a escolha.

O que se copia é infraestrutura genérica que não conhece nenhum dos dois domínios. Fork aqui não é duplicação de regra, é reuso de encanamento.

---

## Ordem: o destrutivo por último

O E1035 é hoje um totem provisionado (device owner, kiosk `LOCKED`) com dados reais. Tirar o device owner é o único passo sem volta fácil — **remover exige formatar pra devolver o mercadinho a este aparelho**. Por isso ele é a última etapa, e só acontece com tudo já funcionando.

Etapas 1 a 4 são **não destrutivas**: o app novo convive com o mercadinho no tablet, instalado como aplicativo comum.

---

## Estrutura de arquivos

| Caminho | O que é |
|---|---|
| `estoque-app/` **(criar, fork)** | O app. Pacote `com.tridi.estoque`. |
| `estoque-app/…/scan/` | **Reuso** — leitor de pistola HID, regras de leitura. |
| `estoque-app/…/kiosk/` | **Reuso** — admin receiver, boot, porta de manutenção. |
| `estoque-app/…/security/DeviceSecrets.kt` | **Reuso** — token e concessão offline no Keystore. |
| `estoque-app/…/sync/` | **Adaptar** — worker que drena a fila de baixas. |
| `estoque-app/…/data/` | **Reescrever** — Room com `pending_baixas` e `pending_recebimentos`. |
| `estoque-app/…/ui/` | **Reescrever** — Welcome → PIN → Escolha → Bipar / Receber. |
| `app/api/estoque/device/` **(criar)** | `bootstrap`, `activate`, `session`, `heartbeat`, `baixa`, `recebimento`. |
| `supabase/estoque_dispositivos.sql` **(criar)** | Tabela dos aparelhos do estoque. |

---

# ETAPA 1 — Fork que compila e roda (não destrutivo)

## Task 1: Copiar e renomear

- [ ] **Step 1:** `cp -R tridimarket-app estoque-app`, removendo `build/`, `.gradle/`, `.kotlin/`.
- [ ] **Step 2:** Renomear o pacote `com.tridi.market` → `com.tridi.estoque` em todo o fonte, e mover `java/com/tridi/market` → `java/com/tridi/estoque`.
- [ ] **Step 3:** Em `app/build.gradle.kts`: `namespace` e `applicationId` = `com.tridi.estoque`; `versionName = "0.1.0"`. Mantenha `DEFAULT_API_BASE` apontando para o mesmo host.
- [ ] **Step 4:** `settings.gradle.kts` → `rootProject.name = "estoque-app"`.
- [ ] **Step 5:** Renomear as classes de topo que carregam o nome do domínio: `MarketApp` → `EstoqueApp`, `MarketApi` → `EstoqueApi`, `MarketDatabase` → `EstoqueDatabase`, `MarketRepository` → `EstoqueRepository`, `MarketSyncWorker` → `EstoqueSyncWorker`, `MarketAdminReceiver` → `EstoqueAdminReceiver`, `MarketTheme` → `EstoqueTheme`.

**Atenção:** o `AndroidManifest.xml` referencia o admin receiver pelo nome completo — renomear a classe sem atualizar o manifesto tira o kiosk sem avisar.

**Atenção 2 (já derrubou este app antes):** o manifesto remove o `WorkManagerInitializer`, então a `Application` **precisa** implementar `Configuration.Provider`. Se o fork perder isso, o `SystemJobService` do sistema derruba o app sozinho, sem stack trace útil.

- [ ] **Step 6:** `cd estoque-app && ./gradlew assembleDebug` — tem que passar.
- [ ] **Step 7:** `adb install -r estoque-app/app/build/outputs/apk/debug/app-debug.apk`. Ele instala **ao lado** do mercadinho (applicationId diferente). Abra e confirme que sobe.
- [ ] **Step 8:** Commit.

## Task 2: Podar o que é do mercadinho

- [ ] **Step 1:** Apagar as telas e o domínio de venda: `CartScreen`, `ReceiptScreen`, `ReceiptModel`, `EscolhaScreen`, `BuscaScreen`, `ProductImage`, `CatalogBehavior`, `FotoConferencia`, `PareamentoScreen`, e as entidades de produto/compra/funcionário-com-limite.

Manter: `PinScreen`, `Teclado`, `WelcomeScreen`, `SomEfeitos`, `KioskIcons`, `LeitorConectado`, `DigitarCodigoScreen`, `PortaDeManutencaoHost`, `KioskJourney`.

- [ ] **Step 2:** `./gradlew assembleDebug` verde depois da poda. O que sobrar quebrado é sinal de acoplamento que valia cortar mesmo.
- [ ] **Step 3:** Commit.

---

# ETAPA 2 — O servidor conhece os aparelhos do estoque

## Task 3: SQL dos dispositivos

- [ ] **Step 1:** Criar `supabase/estoque_dispositivos.sql`, idempotente, espelhando o que o mercadinho usa:

```sql
create table if not exists public.estoque_dispositivos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  token_hash    text not null unique,   -- nunca o token em claro
  local_id      uuid references public.estoque_locais(id) on delete set null,
  ativo         boolean not null default true,
  ativado_em    timestamptz,
  visto_em      timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.estoque_dispositivos enable row level security;
```

O token **nunca** é gravado em claro: guarda-se o hash, e o aparelho guarda o token no Keystore. É o mesmo desenho do mercadinho.

- [ ] **Step 2:** Commit e **colar o SQL no chat** pro usuário rodar.

## Task 4: Rotas do aparelho

- [ ] **Step 1:** Criar `app/api/estoque/device/_device.ts` — `authorizeDevice(req)` lendo o token do header, comparando por hash, devolvendo o dispositivo ou uma falha tipada. Copie a forma de `app/api/tridimarket/device/_device.ts`.

- [ ] **Step 2:** `activate` (POST) — troca um código de ativação de uso único por um token; `bootstrap` (GET) — devolve o diretório de operadores autorizados a bipar (quem tem `estoque:bipar`) com **verificador** do código, nunca o código; `session` (HEAD) — o aparelho testa a rede barato; `heartbeat` (POST) — carimba `visto_em`.

**O código de acesso nunca sai do servidor.** Vai o verificador derivado com sal por aparelho, exatamente como `_sessao.ts` do mercadinho faz. Assim o tablet autentica offline sem nunca ter tido o segredo.

- [ ] **Step 3:** `baixa` (POST) — recebe o lote `{ codigos, motivo, obs, operadorId, ocorridoEm }` e chama a mesma lógica de `/api/estoque/unidades` PATCH. Idempotente por `operationId`: reenviar a mesma fila não dá baixa duas vezes.

**Idempotência não é enfeite aqui.** A fila offline reenvia quando a rede volta, e sem chave de operação uma chapa sairia do estoque duas vezes.

- [ ] **Step 4:** `recebimento` (POST) — confirma a chegada de uma compra e gera as unidades, reusando `gerarUnidadesEmLotes` de `lib/estoque-unidades-gerar.ts`.
- [ ] **Step 5:** Testes das rotas + `npm test` + `tsc`. Commit.

---

# ETAPA 3 — As duas telas

## Task 5: Bipar

- [ ] **Step 1:** `BiparScreen` em Compose: pilha de etiquetas lidas, motivo escolhido **uma vez** no rodapé, confirmar em lote. Mesmo modelo da tela web, que já foi validada.
- [ ] **Step 2:** Leitura por pistola (`TeclasDoLeitor`, já pronto) **e** por câmera. Na câmera, atenção ao limite medido deste aparelho: a análise trava em 1064×798 e etiqueta de 22mm a 1× fica abaixo do mínimo teórico — exponha o zoom, e deixe claro na tela que a pistola é o caminho confiável.
- [ ] **Step 3:** Fila offline: cada lote confirmado vira uma linha em `pending_baixas` com `operationId` próprio; o worker drena quando há rede.
- [ ] **Step 4:** Feedback por leitura — som e vibração no mesmo quadro do item entrando na pilha.
- [ ] **Step 5:** Testes de unidade das regras (dedupe, código malformado, lote). Commit.

## Task 6: Receber

- [ ] **Step 1:** `ReceberScreen`: lista as compras `aguardando_entrega`, a pessoa escolhe uma, confere a quantidade, e confirma.
- [ ] **Step 2:** Ao confirmar, o servidor gera as unidades e devolve os códigos. A tela mostra quantas etiquetas foram criadas e lembra de imprimir no ERP.
- [ ] **Step 3:** Fila offline igual à da baixa. Commit.

---

# ETAPA 4 — A troca no tablet (DESTRUTIVO — confirmar antes)

**Não execute sem o usuário confirmar na hora.** Daqui em diante o mercadinho só volta a este aparelho com formatação.

- [ ] **Step 1:** Reler a fila do mercadinho e **exigir zero não enviadas**:

```bash
adb exec-out run-as com.tridi.market cat databases/tridimarket.db > /tmp/tm.db
sqlite3 /tmp/tm.db "select count(*) from pending_operations where state <> 'SYNCED';"
```
Se der diferente de `0`, **pare** — há venda que ainda não chegou ao servidor.

- [ ] **Step 2:** Guardar uma cópia do banco do mercadinho fora do aparelho, com data no nome. Custa nada e é a única rede embaixo.
- [ ] **Step 3:** O próprio mercadinho tem a porta de saída, e ela é melhor que o `dpm`:

```bash
adb shell am broadcast -a com.tridi.market.DESTRAVAR \
  -n com.tridi.market/.kiosk.DestravarReceiver \
  --es token "tridi-market-destravar" --ez remover_owner true
```

**O `-n` não é opcional.** Desde o Android 8, receiver declarado no manifesto
**não recebe broadcast implícito** — e um `action` custom sem componente é
implícito. Sem o `-n` o `am` responde `Broadcast completed: result=0` como se
tivesse funcionado, o receiver nunca roda, e nada acontece. Perdi várias
tentativas nisso: o sucesso do `am` é sobre a entrega ao sistema, não ao app.
Confirme sempre pelo log: `adb logcat | grep TridiMarketKiosk` tem que mostrar
`device owner removido`.

Ela chama `clearDeviceOwnerApp` de dentro do app — que é o caminho suportado —
enquanto `dpm remove-active-admin` costuma recusar para device owner.

**Duas coisas que já me morderam ao tentar isso com o kiosk vivo:**

1. O `destravarPedido` é `@Volatile var` **em memória**, no companion object.
   `am force-stop` antes do broadcast zera a flag junto com o processo — a
   ordem é broadcast primeiro, e o próprio receiver traz a `MainActivity` pra
   frente pro `onResume` ler a flag.
2. Com o kiosk `LOCKED`, o Android recusa iniciar activity de **qualquer** outro
   pacote (`Attempted Lock Task Mode violation`) — por isso o app novo não pode
   ser aberto na tela enquanto o mercadinho segurar o lock.

Se o broadcast não surtir efeito (confira `adb logcat | grep TridiMarketKiosk`),
o resto é `dpm remove-active-admin` e, em último caso, factory reset —
**volte ao usuário antes de resetar**.
- [ ] **Step 4:** `adb uninstall com.tridi.market`.
- [ ] **Step 5:** `adb shell dpm set-device-owner com.tridi.estoque/com.tridi.estoque.kiosk.EstoqueAdminReceiver`.
- [ ] **Step 6:** Ativar o aparelho com um código de ativação gerado no ERP; conferir que o kiosk trava (`dumpsys activity activities | grep mLockTaskModeState` → `LOCKED`).
- [ ] **Step 7:** Bipar uma etiqueta de verdade e conferir que a baixa aparece no ERP.

---

## Fora de escopo

Catálogo, ficha técnica, fornecedores e localização continuam no ERP web — são telas de cadastro, feitas sentado, e já funcionam. Impressão de etiqueta também: o tablet não tem impressora.

## Riscos anotados

1. **Câmera do E1035 é fraca pra Code128 pequeno** (medido: trava em 1064×798). Pistola USB é o caminho recomendado; a câmera é reserva.
2. **`dpm remove-active-admin` pode recusar** — nesse caso só factory reset devolve o aparelho, e isso apaga tudo. Por isso a cópia do banco no Step 2.
3. **Dois apps disputando o leitor HID** enquanto convivem na Etapa 1: o leitor digita em quem está em foco. Não é problema no uso real (um app só, em kiosk), mas confunde o teste — feche um antes de testar o outro.
