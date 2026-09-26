# Produção em cadeia: atividades automáticas a partir do estoque

**Data:** 2026-09-04 · **Status:** aprovado

## O problema

O reabastecimento automático existe (`verificarReabastecimento` cria "Produzir
X" quando o item cai ao mínimo, manda pra máquina ou pro tablet), mas ele é
**cego pra cadeia**: cria "Produzir Chancela" sem saber se há folha de borracha,
sem criar a atividade da folha quando falta, e sem liberar a chancela quando a
folha fica pronta. Também não tem liga/desliga por item, e a dispensa de uma
atividade desnecessária não existe — a varredura recria no dia seguinte.

## Decisões (com o dono)

1. **Composição vem da `ficha_tecnica` que já existe** (item × componente ×
   quantidade, escada de hierarquia, checagem de ciclo em /api/ficha-tecnica).
   Nada de cadastro novo.
2. **Falta material comprado → atividade nasce travada + avisa compras.**
3. **Dispensa segura até o estoque mudar**: grava o saldo do momento; só recria
   se o saldo cair abaixo dele.
4. **Só os itens ativados** geram atividade (flag por item, nasce desligada).
5. **Tablet entra no escopo**: dispensar + card com a cadeia + código repartido
   + **redesenho visual**.

## O que JÁ existe e é reusado (não reescrever)

- `verificarReabastecimento` / `atribuirProducao` (lib/requisicoes.ts): falta =
  ideal − saldo − cobertura; cobertura = atividades abertas + fila de máquinas +
  aguardando conferência; dedup; notificação.
- Receita no item (`producao_instrucao/tempo_min/lote_de/tipo/maquina_id`) e
  destino máquina (`programarNaMaquina` → `maquina_programacoes`, TV, aceite).
- Interruptor global + varredura diária (`lib/estoque-automacao.ts`).
- Conferência como única entrada de estoque de produção
  (`lib/estoque-conferencia.ts`).
- Tablet: pull/claim/accept/push com fila offline idempotente (`client_id`),
  bipe de material, devolver/impedir.

## Banco (`supabase/producao_em_cadeia.sql` — roda na mão, re-rodável)

Em `estoque_itens`:
- `producao_automatica boolean not null default false` — o liga/desliga por
  item. **Coluna ausente (SQL não rodado) = comportamento antigo** (todo item
  com `qtd_minima > 0` participa), pra nada quebrar antes do SQL.
- `reposicao_dispensada_saldo int`, `reposicao_dispensada_em timestamptz`,
  `reposicao_dispensada_por text`, `reposicao_dispensada_motivo text` — a
  memória da dispensa. Regra: **não recriar enquanto
  `saldo_atual ≥ reposicao_dispensada_saldo`**; caiu abaixo, a falta é nova e a
  memória é limpa.

Em `atividades`:
- status novo **`aguardando_material`** (ajustar o check de status se houver).
  Atividade nesse status **não sai** no pull do tablet nem vira programação.
- `criada_por_automacao boolean not null default false` — o que habilita o
  botão Dispensar (atividade criada por gente não se dispensa, se devolve).

Em `maquina_programacoes`:
- status novo **`aguardando_material`** (a espera do destino máquina mora na
  própria fila dele; TV e painel já filtram `fila|executando` e não a mostram).

Tabela nova **`producao_esperas`**:
```sql
id uuid pk, atividade_id uuid null references atividades(id) on delete cascade,
programacao_id uuid null references maquina_programacoes(id) on delete cascade,
item_id uuid not null references estoque_itens(id) on delete cascade,
item_nome text not null, falta int not null check (falta > 0),
criado_em timestamptz default now(),
check ((atividade_id is null) <> (programacao_id is null))
```
Índices por `item_id` e pelos dois donos. É o índice da liberação e a
transparência do painel ("aguardando: falta 40 Folha de Borracha").

## Regras puras (`lib/producao-em-cadeia.ts` + testes)

- `explodirNecessidades(quantidade, ficha, saldos)` → por componente:
  `necessario = ceil(quantidade × qtd_ficha)`, `falta = max(0, necessario −
  saldo)`. Quantidade fracionária da ficha (0.013889 chapa/acolchoado) é
  arredondada PRA CIMA no total, nunca por unidade.
- `decidirCadeia(...)` → pra cada item da varredura: `{ estado: "pendente" |
  "aguardando_material", esperas: [{itemId, falta}], filhos: [{itemId,
  quantidade}] }`. Filho só é criado se **produzível** (tem receita OU ficha
  técnica própria) **e ativado**; quantidade do filho = falta que o pai precisa
  + (se o filho também está abaixo do próprio mínimo, completa até o ideal
  dele), descontada a cobertura do filho. Componente não produzível em falta →
  espera + aviso de compra.
- Recursão com guarda: conjunto de visitados (ciclo) e profundidade máxima 8
  (os degraus da hierarquia). Cada item vira NO MÁXIMO uma atividade por
  varredura.
- `dispensaVale(saldoAtual, saldoDispensa)` → boolean (a regra da memória).
- Frases de origem: `"Estoque caiu a 8 (mínimo 20) — repõe até 50."` — é o que
  o painel e o card do tablet mostram.

## Motor (lib/requisicoes.ts, estendido)

`verificarReabastecimento`:
1. Filtra por `producao_automatica` (tolerante a coluna ausente).
2. Pula item com dispensa valendo.
3. Carrega a `ficha_tecnica` dos itens envolvidos numa ida (`in(...)`,
   `.limit()`), os saldos idem.
4. Decide via `decidirCadeia`; cria pai e filhos com estado certo; grava
   `producao_esperas`; destino máquina com falta nasce como programação
   `aguardando_material`.
5. Aviso de compras: notificação (uma por varredura, agrupada) pra quem tem
   `estoque:compras`, listando os materiais comprados em falta.

## Liberação (`lib/producao-liberacao.ts`)

`liberarEsperasDoItem(db, itemId)` — chamada quando estoque **entra**:
- conferência aprovada (`registrarConferencia` certo), Receber (recebimento) e
  ajuste-qr entrada. Fire-and-forget tolerante: falha na liberação não derruba
  a entrada (mesmo princípio do rastro do ajuste-qr).
- Acha esperas do item → por dono (atividade/programação), re-checa TODAS as
  esperas dele contra o saldo atual → só quando **todas** couberem: apaga as
  esperas e promove (`atividade → pendente`, `programação → fila`). Aí cai no
  tablet/TV sozinha — "a máquina fez o componente, a anterior ficou
  disponível".
- Liberação é tudo-ou-nada por ordem (não libera "pra fazer metade").

## Dispensa

- Rota `POST /api/atividades/dispensar` `{ atividadeId, motivo }` (web) e op
  `dispensar` no push do tablet (idempotente por `client_id`). Só atividade
  `criada_por_automacao` e não concluída.
- Efeito: atividade → status `cancelada` (aproveita se existir; senão criar o
  valor), esperas apagadas, memória de dispensa gravada no item.
- Programação de máquina dispensa-se pelo painel de máquinas que já existe
  (cancelar) — o motor passa a gravar a mesma memória quando isso acontece a
  partir do painel novo.

## Painel de controle (Produção do dia, estendido)

- Interruptor **por item** (`producao_automatica`) + mínimo/ideal visíveis.
- A fila do motor com o estado explicado por linha: criada / aguardando (o que
  falta, com números) / dispensada (segura até saldo < N) / coberta / acima do
  mínimo. Nada acontece calado.
- Dispensar dali. Botão "varrer agora" continua.
- Celular 320px+ e dois temas, fundação do globals.css, sem emoji.

## Tablet (android/ com.tridi.app)

**Funções novas**
- Pull: `Atividade` ganha `automatica: Boolean = false`,
  `materiais: List<MaterialDaFicha> = []` (nome, quantidade pro lote),
  `origem_frase: String? = null`. Server manda; app velho ignora (defaults).
- Card: bloco "O que usar" (materiais da ficha com quantidade) e a frase de
  origem quando automática.
- **Dispensar** ("Não precisa fazer") com motivo — só em `automatica`, mesmo
  padrão visual do impedir/devolver; op `dispensar` na fila offline.

**Arrumação de código**
- `MainActivity.kt` (~1.300 linhas) repartido: `ui/Tema.kt`,
  `ui/ProvisionScreen.kt`, `ui/PickerScreen.kt`, `ui/AtividadesScreen.kt`,
  `ui/AtividadeCard.kt`, `ui/CameraCapture.kt`, `ui/Dialogos.kt`. Mesmo
  comportamento; testes de unidade existentes (scan/) intocados.

**Redesenho visual**
- `ui/Tema.kt` central: paleta escura de bancada (fundo grafite, superfície
  elevada, um acento — o roxo da marca), tipografia grande (títulos ≥ 24sp,
  corpo ≥ 16sp — lê-se de pé, a um braço), alvos ≥ 56dp, cantos e espaçamentos
  consistentes.
- Estados por cor: pendente (neutro), chamada de aceite (acento pulsando — o
  "ping Uber" mantido), em andamento (verde), impedida (âmbar), urgente
  (vermelho).
- Sem emoji; ícones Material (vetoriais, padrão do Compose — a regra Tabler é
  do app web).
- Build do APK via gradle e **instalação no tablet conectado via adb** no
  final, com verificação por screenshot.

## Testes e travas

- Regras puras: `lib/__tests__/producao-em-cadeia.test.ts` (explosão, decisão
  de estado, quantidade do filho, ciclo/profundidade, dispensa).
- Liberação: teste da regra tudo-ou-nada.
- Motor: estender `requisicoes-em-andamento.test.ts`/`estoque-automacao.test.ts`
  onde couber sem banco.
- Kotlin: testes de scan continuam verdes (`gradlew test`).
- Tolerância a schema: TODO caminho novo degrada pro comportamento atual
  enquanto o SQL não rodou (padrão `schemaDesatualizado`).

## Fora de escopo

- MRP com reserva de material por ordem (disponibilidade é o saldo do momento).
- Aprendizado de composição por histórico de bipes.
- Compras automáticas (só o aviso).
- Mexer na conferência além do gancho de liberação.
