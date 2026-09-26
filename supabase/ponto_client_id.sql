-- ── Conferência fim-a-fim das batidas do tablet ──────────────────────────────
-- Rodar DEPOIS de ponto.sql. Pode rodar de novo sem estragar nada.
--
-- O client_id (id que o TABLET dá à batida na hora do toque) passa a morar no
-- próprio registro. É o que permite duas coisas:
--   1. O tablet perguntar "dessas batidas que eu enviei, quais VIRARAM registro
--      de verdade?" (/api/ponto/conferir) e reenviar o que faltar.
--   2. A checagem de duplicata ser EXATA: antes ela era "essa pessoa tem alguma
--      batida nas últimas 24h?", que confundia batidas diferentes da mesma pessoa.
alter table public.ponto_registros add column if not exists client_id text;
create unique index if not exists ponto_registros_client_id
  on public.ponto_registros (client_id) where client_id is not null;
