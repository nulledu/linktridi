-- ── Intervalos automáticos da produção (09:30–09:40 e 15:30–15:40) ──────────
-- Idempotente. Uma linha só (id = true):
--   ativo  → a chave. Desligada: o tablet não pausa/toca e o ponto não lança.
--   desde  → primeiro dia em que os intervalos valem (retroativo a partir dele).
--   janelas→ [{ rotulo, inicio "HH:MM", fim "HH:MM", pessoas: [ponto_pessoas.id] }]
-- As batidas lançadas levam client_id "intervalo-auto:<pessoa>:<dia>:<inicio>:<ini|fim>",
-- então rodar de novo nunca duplica (índice único de ponto_client_id.sql).
create table if not exists public.ponto_intervalos_config (
  id boolean primary key default true check (id),
  ativo boolean not null default true,
  desde date not null default '2026-09-14',
  janelas jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.ponto_intervalos_config enable row level security;

insert into public.ponto_intervalos_config (id, ativo, desde, janelas)
select true, true, '2026-09-14', jsonb_build_array(
  jsonb_build_object('rotulo', 'Manhã', 'inicio', '09:30', 'fim', '09:40', 'pessoas', coalesce((
    select jsonb_agg(id) from public.ponto_pessoas where ativo and nome in
      ('Matheus Dias','Léo Silva','Henrique Campos','Felipe','Davi','Luiz Santos','Bruno','mikael','João Vitor')
  ), '[]'::jsonb)),
  jsonb_build_object('rotulo', 'Tarde', 'inicio', '15:30', 'fim', '15:40', 'pessoas', coalesce((
    select jsonb_agg(id) from public.ponto_pessoas where ativo and nome in
      ('Felipe','Bruno','Davi','Léo Silva','Matheus Dias')
  ), '[]'::jsonb))
)
on conflict (id) do nothing;

-- Quanto cada um demorou pra voltar: o tablet grava o toque de "voltei" com o
-- fim oficial do intervalo. atraso_s = voltou_em - fim_em (negativo não existe:
-- a tela só abre depois do fim).
create table if not exists public.ponto_intervalo_retornos (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,
  dia date not null,
  janela text not null,                 -- "09:30" (início da janela)
  colaborador_id uuid not null,
  colaborador_nome text,
  device_id text,
  fim_em timestamptz not null,
  voltou_em timestamptz not null,
  atraso_s integer not null,
  criado_em timestamptz not null default now()
);
create index if not exists ponto_intervalo_retornos_dia on public.ponto_intervalo_retornos (dia desc);
alter table public.ponto_intervalo_retornos enable row level security;
