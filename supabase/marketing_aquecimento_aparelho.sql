-- ══════════════════════════════════════════════════════════════════════════════
-- MARKETING · AQUECIMENTO — FICHA DO APARELHO (rodar 1x; idempotente)
--
-- O `marketing_aquecimento.sql` decidiu, com razão, que APARELHO é campo de
-- texto: caixa física que não aquece, e o agrupamento da visão WhatsApp sai de
-- um `group by aparelho`. Inventar tabela só pra responder "quais números moram
-- neste celular" teria sido cadastro a mais pra pergunta que o group by já
-- responde.
--
-- O que mudou não é a pergunta, é a TELA: o inventário virou bloco com a FOTO do
-- aparelho, e foto não cabe num campo de texto. Então esta tabela pendura no
-- aparelho só o que o texto não carrega — a foto, onde ele está, o que já
-- aconteceu com ele.
--
-- A chave continua sendo o NOME. Não há `aparelho_id` em `aquecimento_ativo` e
-- não há migração de dado: quem agrupa continua sendo o texto, esta ficha só se
-- encaixa nele por igualdade de nome. Duas consequências de propósito:
--
--   • Sem esta tabela o módulo funciona inteiro. A tela cai na ilustração do
--     celular em vez da foto, e nada mais muda — é o mesmo contrato do resto do
--     aquecimento (código tolerante, `semTabela()` devolve vazio).
--   • Renomear o aparelho no ativo desgruda a ficha. É o preço de não ter id, e
--     é barato: a tela renomeia os dois lados junto (`PATCH .../aparelho` com
--     `renomear`), e uma ficha órfã não quebra nada — só deixa de aparecer.
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.aquecimento_aparelho (
  id         uuid primary key default gen_random_uuid(),
  -- Casa com `aquecimento_ativo.aparelho`. UNIQUE porque a tela lê ficha por
  -- nome: duas linhas com o mesmo nome fariam a foto do bloco depender de qual
  -- delas o banco devolvesse primeiro.
  nome       text not null,
  modelo     text,                                -- "Redmi 12", "Moto G54"
  foto_url   text,                                -- pública, no bucket `photos`
  -- `lugar` e não `local`: LOCAL é palavra reservada do Postgres e obrigaria a
  -- aspear a coluna em toda consulta escrita à mão daqui pra frente.
  lugar      text,                                -- "mesa 3", "gaveta do armário"
  obs        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists aquecimento_aparelho_nome
  on public.aquecimento_aparelho (nome);

-- Semeia a ficha dos aparelhos que JÁ existem como texto nos ativos, pra que o
-- bloco nasça com modelo preenchido em vez de ficha vazia. `where not exists`
-- em vez de `on conflict`: rodar de novo não pode sobrescrever a foto que
-- alguém já subiu.
insert into public.aquecimento_aparelho (nome, modelo, lugar)
select distinct
       a.aparelho,
       -- "Moto G54 · mesa 3" → modelo "Moto G54", lugar "mesa 3". O separador é
       -- o que o formulário sugere; sem ele o nome inteiro vira modelo.
       nullif(btrim(split_part(a.aparelho, '·', 1)), ''),
       nullif(btrim(split_part(a.aparelho, '·', 2)), '')
  from public.aquecimento_ativo a
 where a.aparelho is not null
   and btrim(a.aparelho) <> ''
   and not exists (
     select 1 from public.aquecimento_aparelho f where f.nome = a.aparelho
   );

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Igual ao resto do módulo: sem policy = ninguém entra pelo anon. O servidor usa
-- service_role (que ignora RLS) e o gate real é `marketing:aquecimento` na rota.
alter table public.aquecimento_aparelho enable row level security;

-- Confirmação (deve listar a tabela e quantas fichas foram semeadas):
select 'aquecimento_aparelho' as tabela, count(*) as fichas
  from public.aquecimento_aparelho;
