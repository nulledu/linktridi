-- ── Coordenada da batida ─────────────────────────────────────────────────────
-- Rodar DEPOIS de ponto.sql. Pode rodar de novo sem estragar nada.
-- Onde a batida aconteceu (última localização conhecida do tablet). Também vai
-- carimbada na selfie de auditoria; aqui fica consultável. null = tablet sem
-- sinal/permissão — a batida vale igual.
alter table public.ponto_registros add column if not exists lat double precision;
alter table public.ponto_registros add column if not exists lon double precision;
