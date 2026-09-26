# Sistema de Aquecimento — Marketing

**Data:** 2026-08-11
**Escopo:** Projeto 1 · item 1 — Sistema de Aquecimento (BM → Conta de anúncio + gestão de chips de WhatsApp)

## O problema

Ativo de marketing morre por descuido de ritmo. BM nova que gasta rápido demais toma
restrição; chip novo que dispara lista no dia 2 toma ban. Hoje isso vive na cabeça de
quem cuida, ou numa planilha que ninguém abre — e quando o ativo cai, ninguém sabe
dizer o que foi feito nele, quando, nem por quem.

O que não existe em lugar nenhum do sistema: chip, aparelho, aquecimento. A tabela
`devices` é tablet de produção/ponto, coisa diferente. BM → conta de anúncio existe em
[`FonteSelector.tsx`](../../../app/(plataforma)/trafego/FonteSelector.tsx) via
`/api/meta/connections`, mas só cobre a conta **já conectada** — o ativo em aquecimento
normalmente ainda nem tem token.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Linha do tempo | **Roteiro + log** — previsto × real no mesmo fluxo |
| Onde mora | **4ª aba de `/marketing`** (Painel · Criativos · Desempenho · Aquecimento) |
| Modelo do chip | **1 linha por número**; aparelho e pessoa são campos |
| Motor | **Um só**, dois tipos de ativo (`bm` \| `conta` \| `numero`) |

## A ideia que une as duas metades

O pedido parece duas coisas, mas as duas têm o mesmo formato: um container com itens
dentro, cada item andando num roteiro.

| | container | itens |
|---|---|---|
| Estrutura Meta | BM | contas de anúncio |
| WhatsApp | aparelho | números |

Uma tela, um filtro. Agrupar número por aparelho responde de graça a pergunta que
importa quando algo cai: **o que morreu junto?**

**Assimetria consciente:** BM é linha de ativo (ela mesma aquece, verifica e pode ser
banida → tem roteiro e histórico próprios); aparelho é campo de texto (caixa física,
não aquece). `pai_id` liga conta→BM; número agrupa por `group by aparelho`. Honesto ao
domínio e sem tabela inventada.

## A tela abre no trabalho, não no inventário

Aquecimento é rotina diária. A pergunta das 9h não é "qual o meu parque de ativos", é
**"o que eu faço hoje?"**. Por isso a aba tem três visões, e a padrão é a fila:

### 1. Hoje (padrão)

Fila do dia agrupada **por etapa**, não por ativo — porque a ação é a mesma para todos:

- **Fora do prazo** — etapas vencidas, com quantos dias.
- **Vence hoje** — o trabalho normal.
- **Em risco** — o que costuma virar ban (ver *ritmo* abaixo).

Cada etapa lista os ativos como alvos selecionáveis e marca **em lote**. Seis chips no
mesmo dia 7 é um clique, não seis gavetas.

### 2. Ativos

O inventário: grupos (BM / aparelho) com os filhos dentro, status, progresso, ritmo e
responsável. É o mapa, não a ferramenta — por isso não é a visão padrão.

### 3. Roteiros

O "Configurar Linha do Tempo" do pedido. Etapas com deslocamento em dias (`D+0`, `D+3`),
reordenáveis. Mostra **taxa de sobrevivência** do roteiro: quantos ativos que o seguiram
chegaram a `aquecido` e quantos foram banidos. Uma query, nenhuma tabela nova, e é o que
transforma o cadastro em aprendizado.

## Ritmo — o sinal que ninguém mede

Progresso não é risco. Comparar `marco.feito_em` com `iniciado_em + etapa.dia` dá três
estados:

- `atrasado` (+Nd) — devagar. Seguro, só lento.
- `no ritmo`
- **`apressado` (−Nd)** — etapas cumpridas **antes** do roteiro.

O terceiro é o perigoso e é exatamente o que derruba conta e chip. Nenhuma planilha
mede isso. É o motivo de a ferramenta valer mais que uma planilha.

## Congelamento

Status `restrito` ou `banido` **pausa o roteiro** (`pausado_em`). Sem isso, um chip
banido grita "12 dias atrasado" para sempre e o bloco *Fora do prazo* vira ruído que
ninguém lê — alerta que sempre aparece é alerta que não existe. Ao retomar, o
deslocamento das etapas pendentes é recalculado a partir da data de retomada.

## Modelo de dados — `supabase/marketing_aquecimento.sql`

```
aquecimento_roteiro   id, nome, tipo(bm|conta|numero), ativo, created_at
aquecimento_etapa     id, roteiro_id, ordem, dia, titulo, detalhe, removida_em
aquecimento_ativo     id, tipo, nome, identificador, pai_id→ativo, status,
                      roteiro_id, iniciado_em, pausado_em, responsavel_id/nome,
                      aparelho, operadora, obs, created_at, updated_at
aquecimento_marco     id, ativo_id, etapa_id, feito_em, autor_id/nome     ← previsto cumprido
aquecimento_evento    id, ativo_id, tipo, texto, status_antes/depois,
                      etapa_id, autor_id/nome, created_at                 ← log real
```

Status compartilhado: `novo · aquecendo · aquecido · em_uso · restrito · banido · aposentado`.
Cores por token nos dois temas (há teste que quebra sem isso).

**Editar roteiro não reescreve o passado.** `marco` aponta para `etapa_id` e guarda o
próprio registro. Etapa apagada com marcos vira soft-delete (`removida_em`) — some do
roteiro futuro, permanece no histórico de quem já a cumpriu.

## Movimento

O kit já tem a física certa em [`ui/gestos.ts`](../../../app/(plataforma)/ui/gestos.ts):
`projetar` (momento, d=0.998), `elastico` (k=0.55), `molar` (mola ζ=1 que anima **do valor
atual na tela**, logo interrompível) e `rastro` (janela de velocidade). Nada de lib nova.

- **Gaveta** — `PainelLateral` já arrasta, projeta momento e é interrompível. Zero código novo.
- **Marcar em lote** — resposta no `pointerdown` (`scale(.96)`); os alvos escolhidos
  somem **juntos, numa mola só**. Sem cascata decorativa: é uma confirmação, não um
  arremesso. O bloco recolhe da altura **medida**, nunca de um valor fixo.
- **Travessia do HOJE** — FLIP: mede antes, mede depois, anima o delta com `molar`. A
  etapa sobe fisicamente através da linha do dia em vez de teletransportar.
- **Sem bounce em nenhum dos dois.** Bounce só onde o gesto trouxe momento.
- `prefers-reduced-motion` → crossfade, sem deslocamento.

## Fora de escopo (por ora)

Notificação de atraso no sininho, integração automática com `/api/meta/connections`
(ativo em aquecimento raramente tem token) e disparo/automação de mensagem. O modelo
comporta os três; nenhum é preciso pra tela ficar de pé.

## Convenções obrigatórias do projeto

- **Permissão:** sub `marketing:aquecimento` em `lib/areas.ts`. As rotas
  `/api/marketing/aquecimento/*` gateiam na **mesma chave** (paridade página/API).
- **Dados:** **nenhum poll** — nada aqui muda sozinho. Colunas nomeadas, `.limit()` em tudo.
- **Celular desde 320px:** grupos recolhem, linha vira `CardLinha`, gaveta vira folha,
  filtro no `.tab-strip`. Alvo de toque 44px (`var(--tap)`). Conferir em `/dev-mobile`.
- **Ícones:** Tabler via `<Icon>`. Nenhum emoji.
- **SQL manual:** arquivo em `supabase/` + colado no chat; código tolerante à ausência
  das tabelas (devolve vazio, não estoura).

## Pendências que não bloqueiam

1. **Roteiros reais.** Os do código são semente plausível, marcados como editáveis. Se o
   time já usa um roteiro, ele substitui a semente e a tela nasce útil em vez de vazia.
2. **Item 2 do "Projeto 1".** Este spec cobre só o item 1. A fundação (ativo + roteiro +
   marco + evento) é genérica o bastante para receber outro tipo de ativo sem refazer nada.
