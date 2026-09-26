-- Design › Biblioteca: materiais do setor (o que NÃO nasce do pedido).
--
-- Arte do cliente, arte vetorizada, reprovadas e logo já moram no ERP, presos
-- ao pedido — a Biblioteca lê de lá. Esta tabela guarda o resto: templates,
-- fontes, mockups, editáveis, referências, elementos gráficos. O arquivo fica
-- no Backblaze B2 (área `design/`); aqui só a referência `/api/arquivos/<chave>`.
--
-- `pedido_ref` liga o material a um projeto (pedido do ERP) quando fizer
-- sentido — um mockup feito pra um cliente, o editável final de uma arte.
--
-- Idempotente: pode rodar de novo.

create table if not exists public.design_materiais (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  categoria   text not null check (categoria in ('arte','logo','mockup','final','editavel','referencia','template','fonte','elemento')),
  url         text not null,
  mime        text,
  tamanho     bigint,
  tags        text[] not null default '{}',
  descricao   text,
  pedido_id   bigint,
  pedido_ref  text,
  criado_por  uuid references public.profiles(id) on delete set null,
  criado_nome text,
  created_at  timestamptz not null default now()
);

create index if not exists design_materiais_categoria_idx on public.design_materiais (categoria, created_at desc);
create index if not exists design_materiais_pedido_idx on public.design_materiais (pedido_id) where pedido_id is not null;

-- O app lê com service_role; RLS ligada sem política = ninguém de fora lê.
alter table public.design_materiais enable row level security;
