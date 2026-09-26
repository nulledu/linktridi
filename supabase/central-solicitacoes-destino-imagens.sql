-- Central · Solicitações — imagens no pedido e destino por PESSOA
--
-- Duas coisas entram aqui:
--   1. `imagens`  — lista de URLs públicas (bucket `photos`) anexadas ao pedido.
--                   Explicar "a peça que quebrou" com foto poupa três idas e
--                   vindas de mensagem.
--   2. `destino_*` — até agora toda solicitação caía num SETOR. Agora ela pode
--                    ser endereçada a uma PESSOA; quem recebe também resolve,
--                    mesmo sem cargo de aprovador.
--
-- Idempotente: pode rodar quantas vezes quiser. O código tolera a ausência
-- destas colunas (cai no formato antigo), então nada quebra antes de rodar.

alter table public.central_solicitacoes
  add column if not exists imagens jsonb not null default '[]'::jsonb;

alter table public.central_solicitacoes
  add column if not exists destino_tipo text not null default 'setor';   -- setor | pessoa

alter table public.central_solicitacoes
  add column if not exists destinatario_id uuid;

alter table public.central_solicitacoes
  add column if not exists destinatario_nome text;

-- Quem recebe abre a tela filtrando por si: índice parcial, só as endereçadas.
create index if not exists central_solic_destinatario_idx
  on public.central_solicitacoes (destinatario_id)
  where destinatario_id is not null;
