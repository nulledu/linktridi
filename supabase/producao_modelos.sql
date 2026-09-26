-- Modelos de produção editáveis: substituem a receita fixa (chancela/clichê) por
-- ordens que o admin edita na tela "Gerar produção" — com vínculo de item do
-- estoque, instruções e gif por ordem. Semeado automaticamente da receita fixa
-- na primeira leitura (se a tabela estiver vazia). Rodar no Supabase NOVO.
create table if not exists public.producao_modelos (
  id           uuid primary key default gen_random_uuid(),
  produto      text not null,                         -- 'chancela' | 'cliche' | chave custom
  fase         integer not null default 1,            -- 1 = mais cedo (ordena o pool)
  categoria    text not null default '',
  tarefa       text not null,
  detalhe      text,
  por_meta     numeric not null default 1,            -- quantidade_alvo = round(por_meta * meta)
  controla_qtd boolean not null default true,         -- false = meta só de referência
  produto_id   integer,                               -- item do estoque vinculado (opcional)
  produto_nome text,                                  -- nome do item (usado pra imagem/estoque)
  instrucoes   text,                                  -- o que a pessoa tem que fazer
  demo_url     text,                                  -- foto/gif da demonstração
  ordem        integer not null default 0,            -- ordenação na lista de edição
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists producao_modelos_produto_idx on public.producao_modelos (produto, ordem);
