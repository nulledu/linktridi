-- ═════════════════════════════════════════════════════════════════════════════
-- PÁGINAS EM BLOCOS — o construtor de páginas da vitrine
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. É IDEMPOTENTE.
-- Depende de `supabase/lojas-paginas-menus.sql` (tabela `loja_paginas`).
--
-- Antes disso o construtor abre, monta e AVISA que os blocos não sobem — o
-- resto da página (título, endereço, status, HTML) continua gravando normal.
--
-- ── Por que jsonb, e não uma tabela de blocos ───────────────────────────────
--
-- Porque a ORDEM é a informação, e ordem em linha separada vira uma coluna
-- `posicao` que precisa ser reescrita inteira a cada arrastar. É a mesma
-- decisão já tomada em `loja_menus.itens`, e pelo mesmo motivo.
--
-- O que se perde é consultar bloco por bloco no SQL. Nada no produto faz isso:
-- a página é sempre lida inteira, pelo handle.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.loja_paginas add column if not exists blocos jsonb not null default '[]'::jsonb;

comment on column public.loja_paginas.blocos is
  'Lista ORDENADA de blocos da página (texto, imagem e texto, diferenciais, produtos, chamada, botões, imagem, perguntas). Vazia = a página é o HTML de `conteudo`. Lida com `normalizarBlocos` — bloco de tipo desconhecido é descartado, nunca renderizado pela metade.';
