-- ── Recebimento v2 — palavra-chave / senha de entrega ────────────────────────
-- Alguns pedidos exigem uma palavra-chave/senha para receber (além do código de
-- rastreio/recebimento). Guardamos na ordem e mostramos na aba "Códigos".
-- Idempotente — pode rodar mesmo com dados já existentes.
alter table public.compras add column if not exists palavra_chave text;
