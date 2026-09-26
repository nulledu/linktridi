-- ── Controle de Ponto v2 ─────────────────────────────────────────────────────
-- Incremental sobre ponto.sql (rodar DEPOIS dele, no Supabase NOVO):
-- 1. Tipos de batida: entrada / almoço / retorno / saída (era só entrada/saída).
-- 2. PIN opcional por pessoa (hash) — trava anti-fraude do fluxo manual do tablet.
-- 3. Consentimento de uso de biometria (LGPD) no cadastro.

alter table public.ponto_registros drop constraint if exists ponto_registros_tipo_check;
alter table public.ponto_registros
  add constraint ponto_registros_tipo_check check (tipo in ('entrada','saida','almoco','retorno'));

alter table public.ponto_pessoas add column if not exists pin_hash text;
alter table public.ponto_pessoas add column if not exists consentimento boolean not null default false;
