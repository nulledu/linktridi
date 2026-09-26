# Jornada integrada: Calendário ↔ Ponto ↔ Banco de Horas ↔ Férias

> Spec de 2026-09-17. Estado: aprovado, pronto pra plano.

## O problema

Quatro coisas que falam da mesma pessoa no mesmo dia, e nenhuma se enxerga:

1. **O Ponto só considera feriado o que foi marcado à mão** em `ponto_feriados`.
   O Calendário do RH tem os feriados nacionais (BrasilAPI), o piso calculado
   (`lib/rh/calendario/feriados-base.ts`), o estadual de SP e o municipal de
   Cerqueira César — e **nada disso chega no cálculo**. O fluxo é de mão única:
   o Calendário lê `ponto_feriados`; o Ponto não lê o Calendário.

2. **`rh_ferias` é uma ilha.** Nem `lib/ponto.ts` nem `lib/banco-horas.ts` a
   mencionam. Hoje, 30 dias de férias viram **30 faltas e ~240h de débito** no
   banco de horas, e a pessoa aparece "ausente" no painel todo dia.

3. **`rh_atestados` tem o mesmo buraco**, com outro nome.

4. **Feriado trabalhado não se liga a nada.** `jornada-calendario.ts` já
   distingue `folga` (extra especial, com adicional na folha) de `troca` (extra
   comum, pra ser gasta na folga) — mas o `tipo` é **global da empresa** e
   **nenhum registro liga** o dia trabalhado ao dia folgado. A terça de folga
   entra como falta, o crédito da segunda some no FIFO, e ninguém consegue
   responder "essas 8h foram usadas nessa folga".

## Decisões tomadas

| Pergunta | Decisão |
|---|---|
| Como o feriado do Calendário chega no Ponto | **Automático com janela de revisão**: nacional não-facultativo entra sozinho; estadual, municipal e facultativo nascem **pendentes** até o RH decidir |
| Ponto facultativo (Carnaval, Corpus Christi) | **Dia normal até o RH decidir** — nasce pendente, não folga |
| Escopo da troca/compensação | **Os dois**: o `tipo` global da empresa continua sendo o padrão, e um **par por pessoa** sobrescreve |
| Efeito no banco de horas | **Par fechado com minutos reservados**, fora do FIFO |
| Onde aparece | Camadas no Calendário existente + faixa na ficha do colaborador |
| Painel de Ponto | Rótulos corrigidos **e** registro da compensação de lá também |
| Atestado | **Entra junto** — é o mesmo mecanismo de férias |

## Arquitetura

### A peça central: `diaDaPessoa()`

Hoje quem decide o que um dia vale é `jornadaDoDia()` em
[`lib/jornada-calendario.ts`](../../../lib/jornada-calendario.ts), e ele só sabe
de três coisas: domingo, sábado e feriado. Todo o resto do pedido é "mais um
motivo pra esse dia não dever jornada" — então a resposta é **uma função pura
com uma tabela de precedência**, e não regra espalhada por tela.

Novo diretório `lib/jornada/`, quatro arquivos pequenos:

| arquivo | papel |
|---|---|
| `tipos.ts` | vocabulário: `MotivoSemJornada`, `DiaDaPessoa`, `Compensacao`, `StatusCompensacao`, rótulos + ícones Tabler |
| `dia.ts` | **puro**: `diaDaPessoa(dia, pessoa, ctx)` — a precedência |
| `afastamentos.ts` | servidor: lê `rh_ferias` + `rh_atestados` → `Map<pessoaId, Afastamento[]>` |
| `compensacoes.ts` | servidor: CRUD do par + validação de conflito |

`lib/jornada-calendario.ts` continua existindo e exportando o que já exporta
(`ehDiaUtil`, `jornadaDoDia`, `ehExtraEspecial`, `tipoFeriado`) — dezenas de
chamadas dependem dele. `diaDaPessoa()` o **compõe**, não o substitui.

### A precedência do dia

Do mais forte pro mais fraco. É a regra que o teste trava:

```
1. Férias (status programada|em_gozo, dentro da janela) .... jornada 0 · "Férias"
2. Atestado com status 'aceito' ............................ jornada 0 · "Atestado"
3. Feriado que vale no Ponto ............................... jornada 0 · "Feriado"
4. Folga compensatória APROVADA ............................ jornada devida cai até `minutos`
5. Domingo ................................................. 0
6. Sábado .................................................. só quem tem `trabalha_sabado`
7. Seg–sex ................................................. jornada da pessoa
```

Feriado **dentro** das férias é férias (não prorroga — CLT art. 130). O rótulo
diz "Férias · e feriado de Finados", que é exatamente a informação que o RH
precisa ver ao programar o período.

`DiaDaPessoa` carrega o porquê, não só o número:

```ts
type MotivoSemJornada =
  | "domingo" | "sabado_fora_escala" | "feriado"
  | "ferias" | "atestado" | "folga_compensatoria";

interface DiaDaPessoa {
  dia: string;
  jornadaMin: number;                 // 0 = sem expediente
  motivo: MotivoSemJornada | null;
  feriado: { nome: string; esfera: Esfera; tipo: TipoFeriado } | null;
  extraEspecial: boolean;             // domingo ou feriado "folga" SEM par pessoal
  compensacao: RefCompensacao | null; // este dia é origem ou folga de um par
}
```

### Feriado: como ele passa a valer no Ponto

Tabela nova e mínima, `rh_feriados_ponto`. O status de cada feriado é
**derivado**, não duplicado:

```
tem linha  →  vale / não vale, exatamente como o RH decidiu
sem linha  →  nacional e não-facultativo ? VALE : PENDENTE
```

`ponto_feriados` **não muda**: o que já está lá é decisão manual já tomada,
sempre vale, e continua carregando o `tipo folga|troca` global. Uma função só —
`mapaDeFeriadosDoPonto(periodo)` — funde as duas origens e substitui o
`feriadosMapa()`/`feriadosDoLedger()` que o banco de horas usa hoje.

Carnaval e Corpus Christi nascem pendentes, e o Calendário mostra a faixa
"N feriados esperando sua decisão".

**Orçamento:** `feriadosDoAno()` já roda sob `cached()` de 1h; `rh_feriados_ponto`
entra no mesmo cache, com colunas nomeadas e `.limit()`. Zero requisição nova
por ciclo.

### O par de compensação

Tabela `rh_compensacoes`:

```
id            uuid pk
employee_id   uuid not null          -- profile id (ponte: ponto_pessoas.colaborador_id)
tipo          text not null          -- feriado_trocado | folga_compensatoria | compensacao_jornada
dia_origem    date not null          -- o dia TRABALHADO
dia_folga     date not null          -- o dia NÃO trabalhado
minutos       int  not null          -- os minutos reservados ao par
status        text not null          -- pendente | aprovada | recusada | cancelada
observacao    text
autor_id/autor_nome, aprovador_id/aprovador_nome, aprovado_em
created_at/updated_at
unique (employee_id, dia_folga) where status in ('pendente','aprovada')
```

Três tipos, **um motor só** — a diferença é semântica e validação:

- **`feriado_trocado`** — `dia_origem` precisa ser feriado. É o exemplo do pedido.
- **`folga_compensatoria`** — origem é dia de extra comum (sábado, dia útil esticado).
- **`compensacao_jornada`** — o inverso: `dia_folga < dia_origem` (folgou antes, repõe depois).

**Minutos:** sugestão = `min(trabalhado no dia_origem, jornada prevista do dia_folga)`.
Gravado como snapshot na criação, editável pelo RH. Se ainda não há batida no
`dia_origem`, a sugestão é a jornada do `dia_folga`.

### Efeito no banco de horas: soma zero garantida

- No **`dia_origem`**: `minutos` ficam **reservados ao par** — saem do crédito
  livre e não entram na fila do FIFO. A sobra vira extra normal. E o dia deixa
  de gerar extra **especial**: a hora vai ser devolvida em folga, não paga com
  adicional. É a semântica do `tipo=troca` que já existe, agora **por pessoa**.
- No **`dia_folga`**: a jornada devida cai até o limite de `minutos`. Compensou
  meio período? O resto continua devido.

Nada disso passa pelo FIFO, então o par **não pode ser comido** por um crédito
de outro mês — e o histórico consegue dizer "essas 8h foram usadas nessa folga"
sem mentir. É a diferença entre esta opção e deixar o FIFO resolver.

`LedgerResumo` ganha `compensacoes: ItemCompensacao[]` — o "histórico de
compensações" que o pedido pede, com o par visível e o status.

**Global × pessoal:** `ponto_feriados.tipo='troca'` continua sendo o padrão da
empresa; um par pessoal **aprovado** sobrescreve para aquela pessoa. A tela diz
qual venceu ("Troca da empresa" / "Troca de Fulano"). Par `pendente`,
`recusada` ou `cancelada` **não mexe em conta nenhuma**.

### Conflitos

Criar folga compensatória num dia que já é férias, atestado ou feriado é
**bloqueado** — compensar num dia que já não é de trabalho não é compensação.

Programar férias devolve, **antes de salvar**:
- `feriados[]` do período (o pedido pede mostrar);
- `conflitos[]`: outras férias da mesma pessoa e par aprovado → **bloqueia**;
  atestado no período → **avisa**.

Rota nova: `GET /api/rh/ferias/conflitos?employee_id=&de=&ate=`.

## Telas

### Calendário do RH (`/rh/calendario`)

Três tipos novos de `Acontecimento`: `ferias`, `folga_compensatoria`,
`feriado_trabalhado`. Como carregam `pessoa`, o `filtrar()` por pessoa/setor
que já existe em [`montar.ts`](../../../lib/rh/calendario/montar.ts) funciona
sem mudança.

**Anti-poluição:** os três nascem **desligados** na legenda e ligam sozinhos
quando há filtro de pessoa ou setor. Sem isso a célula do dia vira sopa numa
empresa de 50 pessoas.

Mais a faixa de pendência de feriados, que abre o `GerenciarFeriados` existente
numa aba de decisão.

### Ficha do colaborador

Faixa "Jornada do ano": fita de 12 meses com os dias marcados (férias, feriado
trabalhado, folga compensatória, atestado), e abaixo a lista de compensações
com status e o par visível — "15/09 trabalhado → 16/09 folgado · aprovada por Caio".

### Painel de Ponto (Administração → Controle de Ponto)

- `DetalheDoDia` / `PessoaDrawer`: o dia diz "Férias", "Feriado — trabalhou",
  "Folga compensatória (ref. 15/09)", "Atestado" em vez de "Falta"/"Ausente".
- `PainelGeral`: quem está de férias/atestado sai de `ausentes` e vai pro balde
  de folga, do mesmo jeito que o feriado já faz.
- Gaveta da pessoa ganha o botão **Registrar compensação**.

## Permissões

- **Ler** compensação e afastamento no RH: `rh:banco_horas` (já existe).
- **Escrever/aprovar**: sub nova `rh:compensacoes_editar`.
- **Decidir feriado**: `rh:calendario_feriados` (já existe).
- No painel de Ponto, a escrita aceita `rh:compensacoes_editar` **ou**
  `administracao` — mesmo padrão de `getProfileForAnyModule()` que
  [`app/api/ponto/feriados/route.ts`](../../../app/api/ponto/feriados/route.ts)
  já usa. Página e API gateiam pela mesma chave (regra do projeto).

## Ordem de entrega

1. **Motor** — `lib/jornada/*`, feriado vale-no-ponto, afastamentos ligados ao
   banco de horas. Invisível, e é onde está o maior estrago em produção.
2. **Compensações** — tabela, API, par reservado no ledger.
3. **RH** — decisão de feriado, camadas no calendário, faixa na ficha,
   conflitos nas férias.
4. **Painel de Ponto** — rótulos e registro.

Cada fase fecha commitável e verde.

## As travas (testes, não esta página)

| teste | o que trava |
|---|---|
| `lib/__tests__/jornada-dia.test.ts` | a tabela-verdade completa da precedência |
| `lib/__tests__/compensacao-par.test.ts` | o exemplo do pedido ponta a ponta: segunda-feriado trabalhada 8h + terça folgada = saldo 0, sem adicional, histórico ligado. E: par pessoal sobrescreve o global; sobra vira extra normal; par pendente/recusado não afeta nada |
| `lib/__tests__/feriado-vale-no-ponto.test.ts` | nacional entra sozinho; estadual/municipal/facultativo pendentes; decisão manual vence; `ponto_feriados` legado sempre vale |
| `lib/__tests__/ferias-nao-e-falta.test.ts` | 30 dias de férias = 0 débito e 0 faltas; conflito bloqueia |
| `rh-rotas` / `rh-area-restrita` | a sub nova entra nas listas |
| `orcamento-de-execucao` | nenhuma query nova sem colunas nomeadas e `.limit()` |

## SQL

`supabase/rh_jornada.sql` — `rh_compensacoes` + `rh_feriados_ponto`, idempotente.
Tudo **tolerante a tabela ausente**, como o resto do RH: sem o SQL rodado o app
se comporta como hoje e a tela avisa via `AvisoSchema`.

Atenção: `supabase/rh_calendario.sql` ainda estava pendente na última anotação.

## Mobile

Faixa da ficha usa `.tab-strip`; a lista de compensações vira card via
`.tab-linha`/`data-l`; registrar compensação é `PainelLateral` (folha presa
embaixo no celular). `minmax(min(100%, Npx), 1fr)` e `dvh` em todo CSS novo.
Conferir em `/dev-rh` a 320/390/430.

## Fora de escopo (de propósito)

- Escalas 12×36, jornadas especiais e turnos rotativos. O `DiaDaPessoa` é a
  costura onde isso entra depois — hoje ninguém tem essa escala cadastrada.
- Aprovação em fluxo (solicitação do colaborador → aprovação da chefia). O RH
  registra e aprova; o `status` já existe pro dia em que isso virar fluxo.
- Feriado por cidade/empresa. Todo mundo é Cerqueira César hoje.
