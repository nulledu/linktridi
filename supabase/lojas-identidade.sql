-- ═════════════════════════════════════════════════════════════════════════════
-- IDENTIDADE DA LOJA — logo, favicon e como ela aparece na busca
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. É IDEMPOTENTE.
-- Depende de `supabase/lojas.sql`.
--
-- Antes disso a tela "Dados da loja" abre, mostra tudo e AVISA que não grava.
--
-- ── Por que isto NÃO mora no tema ───────────────────────────────────────────
--
-- Seria tentador guardar logo e favicon junto dos ajustes do tema — o tema já
-- tem um campo `logo` no cabeçalho, afinal. Mas tema é ROUPA e identidade é
-- QUEM A LOJA É: trocar de tema não pode apagar a logo, e aplicar um modelo
-- pronto (que substitui o tema inteiro por um rascunho novo) apagaria.
--
-- Foi exatamente o que aconteceria hoje: a logo vivia só dentro da seção
-- "Cabeçalho" do editor de aparência, e "Aplicar" um modelo em /lojas/<id>/temas
-- teria levado a logo da loja junto.
--
-- Então: a identidade é da LOJA, e o tema a USA. O campo `logo` do cabeçalho
-- continua existindo pra quem quiser uma logo diferente naquele tema — quando
-- ele está vazio, o tema cai na logo da loja.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.lojas add column if not exists logo_url       text;
alter table public.lojas add column if not exists favicon_url    text;
-- Como a loja aparece no Google e no card do WhatsApp. Vazio = usa o nome da
-- loja, que é o que já acontecia.
alter table public.lojas add column if not exists seo_titulo     text;
alter table public.lojas add column if not exists seo_descricao  text;

comment on column public.lojas.logo_url is
  'Logo da LOJA (identidade). O tema a usa quando o campo de logo do cabeçalho está vazio — trocar de tema não pode apagar a logo.';
comment on column public.lojas.favicon_url is
  'Ícone da aba do navegador. Quadrado, idealmente 512×512 — o navegador reduz.';
comment on column public.lojas.seo_titulo is
  'Título da aba e do resultado de busca. Vazio = o nome da loja.';
comment on column public.lojas.seo_descricao is
  'Descrição que aparece embaixo do título na busca e no card de compartilhamento.';
