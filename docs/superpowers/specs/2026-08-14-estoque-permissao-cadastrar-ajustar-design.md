# Estoque: separar VER de MEXER — duas permissões novas

**Data:** 2026-08-14
**Área:** `estoque` (lib/areas.ts)

## O problema

Hoje o Estoque tem uma chave só que faz tudo: `estoque:itens`, rotulada
"Ver catálogo / itens". Quem a tem enxerga o catálogo **e** cria, edita e
apaga item, importa planilha, mexe em ficha técnica, gera unidade e ajusta
saldo na mão. Não existe "só olhar" — e não existe como liberar entrada e
saída de material sem entregar junto o poder de apagar o cadastro.

## O desenho

`estoque:itens` volta a ser o que o rótulo já diz: **ver o catálogo, sem
mexer**. Duas subs novas assumem a escrita, separadas pela pergunta que cada
uma responde:

| Chave | Rótulo na grade | Pergunta que responde |
|---|---|---|
| `estoque:cadastrar` | Cadastrar, editar e apagar item | **O que** existe no catálogo |
| `estoque:ajustar` | Adicionar e remover quantidade | **Quanto** tem de cada coisa |

Ambas:

- `sensivel: true` — ficam **fora** do back-compat de `chavesDasAreas()`, que
  concede as subs não-sensíveis a quem tinha a área ligada no modelo antigo.
  É isso que faz a permissão nascer desligada em vez de migrar junto.
- `implica: ["itens"]` — sem ver o catálogo, a tela abre e toda requisição
  volta 403. Mesma armadilha já documentada em `lib/areas.ts`.

`estoque:bipar` não muda: continua sendo a saída operacional do galpão (baixa
por código). `ajustar` é o `+`/`-` na mão e a criação de unidade.

## Mapa das portas de escrita

| Rota / ação | Gate hoje | Gate depois |
|---|---|---|
| `POST /api/estoque-itens` (cria item) | `estoque:itens` | `estoque:cadastrar` |
| `PATCH /api/estoque-itens` (campos de cadastro) | `estoque:itens` | `estoque:cadastrar` |
| `DELETE /api/estoque-itens` | `estoque:itens` | `estoque:cadastrar` |
| `POST /api/estoque-itens/classificar` (triagem em lote) | `estoque:itens` | `estoque:cadastrar` |
| `POST /api/estoque/importar` (planilha) | `estoque:itens` | `estoque:cadastrar` |
| `PUT /api/ficha-tecnica` | `estoque:itens` | `estoque:cadastrar` |
| `PATCH /api/estoque-itens` **com o campo `quantidade`** | `estoque:itens` | `estoque:ajustar` |
| `POST /api/estoque` (ajuste manual, `delta`) | `estoque:itens` | `estoque:ajustar` |
| `POST /api/estoque/unidades` (gera N unidades) | `estoque:itens` | `estoque:ajustar` |
| `POST /api/estoque/reabastecer` | `estoque:itens` | `estoque:ajustar` |
| `PATCH /api/estoque/unidades` (baixa por código) | `estoque:bipar` | `estoque:bipar` (não muda) |

O `PATCH /api/estoque-itens` é a única rota partida em duas: o corpo pode
trazer campos de cadastro e `quantidade` na mesma requisição. A regra é por
campo — quem só tem `cadastrar` tem o `quantidade` **ignorado** (não é 403 no
lote inteiro), e quem só tem `ajustar` só consegue passar `quantidade`.

### O que fica onde está (decisão explícita)

- **Aprovar conferência** (`POST /api/estoque/conferencias`) continua em
  `estoque:itens`. É o que lança a produção no estoque, mas a quantidade vem
  do banco, não do gerente — ele só diz certo ou errado. Exigir chave nova
  pararia a aba Conferir do gerente do galpão no dia seguinte.
- **Imprimir / reimprimir etiqueta** (`POST /api/estoque/etiquetas`,
  `GET /api/estoque/unidades/etiqueta`) continua em `estoque:itens`. Papel de
  unidade que já existe não mexe em saldo.
- **Produção do dia** (`/api/estoque/producao-dia`) continua em
  `estoque:itens`: é interruptor de painel, não escrita de estoque.

## Quem não quebra na segunda-feira

`PAPEIS_DO_ESTOQUE = ["admin", "estoquista", "gerente_producao"]` atravessa
todos os gates por papel, antes de olhar a grade. Essa gente continua mexendo
em tudo sem ninguém ligar quadradinho.

Quem perde escrita é só quem foi **configurado na grade** com `estoque:itens`
e não tem um desses papéis. Para essa pessoa a tela não pode virar 403 mudo:

- As APIs já devolvem `podeGerir` no GET. Ele vira **dois** campos:
  `podeCadastrar` e `podeAjustar`.
- `CatalogoClient` esconde os botões que a pessoa não pode usar e mantém o
  aviso de "peça pro admin liberar em Permissões" que já existe, agora citando
  a sub certa.

## Onde o código muda

1. `lib/areas.ts` — duas subs novas na área `estoque`.
2. `lib/estoque-permissoes.ts` — `podeCadastrarEstoque()` e
   `podeAjustarEstoque()` ao lado do `podeGerirEstoque()` existente. As duas
   mantêm o atalho por papel.
3. Rotas da tabela acima trocam a chamada de `podeGerirEstoque`/`papelOuChave`.
4. `app/(plataforma)/estoque/page.tsx` — lê `estoque:cadastrar` e
   `estoque:ajustar` para `EstoquePerms`.
5. `CatalogoClient` / `ItemEditor` / `UnidadesDoItem` / `ImportarPlanilha` —
   botões condicionados às flags novas.

`podeGerirEstoque()` **não** some: continua sendo o gate das rotas que ficam
em `estoque:itens`.

## Celular

Nenhum layout novo. A grade de permissões (`/colaboradores`) já renderiza subs
em coluna, e o Catálogo só deixa de mostrar botão — nada nasce, então não há
largura nova a conferir. Vale a checagem de praxe a 320px depois da mudança.

## Testes

- `lib/__tests__` ganha trava: quem tem só `estoque:itens` **não** recebe
  `estoque:cadastrar` nem `estoque:ajustar` por back-compat (é o coração da
  decisão "nasce desligada").
- Trava de implicação: ligar `cadastrar` ou `ajustar` traz `estoque:itens`
  junto.
- Trava de paridade página↔API: as chaves lidas em `estoque/page.tsx` são as
  mesmas gateadas nas rotas.

## SQL

Nenhum. As permissões moram no `employees.permissoes` (jsonb) e a grade salva
o mapa completo — chave nova aparece desligada sozinha.
