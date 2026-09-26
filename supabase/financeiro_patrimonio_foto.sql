-- ═════════════════════════════════════════════════════════════════════════════
--  FOTO DO BEM
-- ═════════════════════════════════════════════════════════════════════════════
--
--  Patrimônio era o único cadastro do módulo sem cara própria. Empresa, conta,
--  fornecedor, contato, pessoa da folha e recorrência já têm; o bem, que é a
--  única coisa desta lista que existe FISICAMENTE, não tinha.
--
--  E é onde a foto mais serve: "Monitor Gamer Concórdia 23,8\" H238F" descreve
--  o modelo e não distingue os três que estão no escritório. Quem confere
--  patrimônio anda com a lista na mão procurando o objeto — reconhecer é mais
--  rápido que ler um código.
--
--  `logo_url` guarda o CAMINHO no bucket privado, nunca a URL: link assinado
--  vence em uma hora, e coluna cheia de link morto é pior que coluna vazia.
--  Quem monta o link é o servidor, na hora. `icone` é o Tabler que aparece
--  enquanto não há imagem, para o bem nunca ficar sem marca nenhuma.
--
--  Rode DEPOIS de `financeiro.sql`. Idempotente.

alter table public.fin_patrimonio
  add column if not exists logo_url text,
  add column if not exists icone    text;

-- ── Conferência ──────────────────────────────────────────────────────────────
select count(*) as colunas_de_marca
  from information_schema.columns
 where table_schema = 'public' and table_name = 'fin_patrimonio'
   and column_name in ('logo_url', 'icone');
