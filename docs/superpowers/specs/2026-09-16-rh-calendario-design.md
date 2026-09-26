# RH → Calendário — desenho

Data: 2026-09-16. Terceira área do RH. Tela: `/rh/calendario`.

## O que é

Um calendário operacional do RH que reúne, num lugar só, sete tipos de
acontecimento: aniversários (derivados de `rh_fichas.data_nascimento`),
datas dos setores, datas comemorativas, feriados nacionais, estaduais (SP),
municipais (Cerqueira César) e eventos internos. Três visões (mês, ano,
agenda), destaque de "hoje", lista de próximos eventos, filtros compactos que
também são a legenda, detalhe sob demanda em painel lateral.

A referência visual é o Financeiro: `Cabecalho` (tarja RH), `Cartao`,
`TituloCartao`, `Filtro`, `TrocaDeVisao`, `Vazio`, `Selo`, `Etiqueta`,
`PainelLateral centrado soFechaNoX` para formulário, `Fila` para listas. O
componente shadcn enviado (fullscreen-calendar) serve só de **referência
estrutural** (navegação de mês, "Hoje", células com eventos, celular com
pontos + lista do dia). O projeto não tem Tailwind, shadcn, date-fns nem
lucide, e não vai ganhar: a iconografia é Tabler via `Icon.tsx`, a data é
string `AAAA-MM-DD` com helpers próprios, o movimento sai da escala do
`globals.css`.

## Permissões (lib/areas.ts → AREAS.rh.subs)

| Chave | Concede | Implica |
|---|---|---|
| `rh:calendario` | abrir o calendário (já existia) | — |
| `rh:calendario_editar` | criar, editar, apagar evento interno e data comemorativa própria | `calendario` |
| `rh:calendario_setores` | criar, editar, ativar/desativar, apagar data de setor | `calendario` |
| `rh:calendario_feriados` | feriado manual, atualizar da fonte externa | `calendario` |

O pedido listava criar/editar/excluir separados; o padrão do RH junta
escrita numa chave por gaveta ("escrever implica ler"), e o calendário segue
o padrão. Todas `sensivel: true` (escrita). Área continua `restrita`: admin
não recebe nada, só o superusuário (ou quem tem `rh:acessos`) concede.

## Dados

`supabase/rh_calendario.sql` (idempotente, RLS deny-all, `rh_touch`):

- `rh_calendario_eventos`: `id`, `tipo` (`evento` | `setor` | `comemorativa`),
  `categoria` (reunião, treinamento, comemoração, integração, empresa,
  importante — só para `evento`), `nome`, `descricao`, `observacoes`, `dia`
  (primeira ocorrência), `hora`, `hora_fim`, `setor`, `colaboradores uuid[]`,
  `recorrencia` (`nenhuma` | `anual`), `ativo`, autor/created/updated.
- `rh_calendario_feriados`: `id`, `dia`, `nome`, `esfera` (`nacional` |
  `estadual` | `municipal`), `origem` (`api` | `manual`), `ativo`; único em
  `(dia, nome)`.
- `rh_calendario_sync`: `ano` (pk), `fonte`, `atualizado_em`, `ok`, `erro`.

Aniversário NÃO tem tabela: vem de `rh_fichas.data_nascimento` +
`listarColaboradores()`. Desligado não aparece; ativo/férias/afastado sim.

## Feriados: arquitetura em camadas

`lib/rh/calendario/feriados-base.ts` calcula em código, por ano: nacionais
fixos e móveis (Páscoa → Carnaval, Sexta Santa, Corpus Christi), estadual SP
(9 de julho), municipal Cerqueira César (aniversário da cidade, 10/10). É o
piso: o app funciona sem banco e sem rede.

`lib/rh/calendario/feriados.ts` (servidor): `FonteDeFeriados` é uma
interface; `brasilApi` é a implementação (`/api/feriados/v1/{ano}`, só
nacionais, timeout curto). `sincronizarFeriados(ano)` grava `origem='api'`
e o carimbo em `rh_calendario_sync`; erro fica registrado e os dados
anteriores continuam valendo. `garantirFeriados(ano)` sincroniza quando
nunca rodou ou passou de 30 dias, com cache em processo de 1h — a página
não paga a rede a cada carga. `feriadosDoAno(ano)` funde
base ∪ tabela (api/manual) ∪ `ponto_feriados` (o que o Ponto já cadastra,
esfera inferida: bate com base nacional/estadual → aquela; senão municipal),
deduplicando por dia+esfera com precedência manual > api > ponto > base.

## Montagem do ano (pura, testável)

`lib/rh/calendario/montar.ts`: `montarAno({ ano, colaboradores, fichas,
eventos, feriados })` → `Acontecimento[]` ordenado. Recorrência anual
expande para o ano pedido; 29/02 cai em 28/02 em ano não bissexto.
Comemorativas fixas em código (Dia das Mães 2º domingo de maio, Dia dos
Pais 2º domingo de agosto, etc.) entram como `origem: "base"`.

`Acontecimento`: `{ chave, tipo, dia, titulo, sub, setor, hora, descricao,
pessoa?, origem, id?, editavel }`. `LEGENDA[tipo]` = `{ label, icone, cor }`
com Tabler (`cake`, `building`, `confetti`, `flag`, `building-bank`,
`map-pin`, `pin`).

## Página

Servidor (`page.tsx`): `requireRh("calendario")`, lê `?ano=`, carrega tudo
do ano numa ida paralela, manda `Acontecimento[]` + `hoje` + `poderes` +
lista de colaboradores/setores para o cliente. Trocar de ano é navegação
(`?ano=`); trocar de mês é estado local. Sem poll, sem GET de API.

Cliente (`CalendarioClient.tsx`):
1. `Cabecalho` tarja RH, ações: Novo evento (`calendario_editar` ou
   `calendario_setores`), Feriados (`calendario_feriados`).
2. Faixa "Hoje": data por extenso + "N acontecimentos hoje" + os itens.
3. Filtros = legenda: `Chips` multi-seleção por tipo (ícone + cor); `Filtro`
   de setor e de colaborador; `LimparFiltros`.
4. Barra de navegação: `TrocaDeVisao` (mês/ano/agenda) + ‹ mês › + Hoje.
5. `Duo`: visão principal + cartão "Próximos eventos" (carimbo de data no
   estilo da `Agenda` do Financeiro, sem valor em dinheiro).
6. Painéis: dia (lista do dia), detalhe do acontecimento (com link para o
   colaborador em `/rh/colaboradores?pessoa=<id>` quando `poderes.ver`),
   formulário de evento, gerenciador de feriados.

Celular (≥320px): grade com célula de 44px, dia com pontos coloridos, dia
escolhido lista embaixo; visão anual em `minmax(min(100%, 200px), 1fr)`;
painéis viram folha presa embaixo; fileiras rolam (`.tab-strip`).

## Estados

Vazio (`Vazio` "Nenhum evento neste período"); carregando (`loading.tsx`
do RH já cobre); erro de sincronização (nota discreta no gerenciador e no
topo: "Não foi possível atualizar os feriados. Os últimos dados disponíveis
continuam sendo exibidos."); schema pendente (`AvisoSchema` apontando
`supabase/rh_calendario.sql`); sem permissão (redirect padrão do gate).

## Travas

- `lib/__tests__/rh-calendario.test.ts`: Páscoa/Carnaval/Corpus Christi,
  9 de julho, 10/10, Dia das Mães/Pais, expansão anual e 29/02, aniversário
  de desligado fora, fusão/precedência de feriados, filtro, grade do mês.
- `rh-area-restrita.test.ts` e `rh-rotas.test.ts` atualizados com as três
  subs e três rotas.
- Banco de provas: `/dev-rh?tela=calendario` (rolagem medida a 320/390/430).
