-- Config do Design: quais tipos de item aparecem na tela de "não aprovadas"
-- (o que é personalizável / pode ser reprovado). Editável só pelo admin.
-- Tolerante: sem a tabela, o app usa o padrão (lib/design-config.ts).
-- Rodar no Supabase NOVO (tzariztovuuwyeoogbxg).
create table if not exists public.design_config (
  id  int primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.design_config (id, data)
values (1, '{"tiposPersonalizaveis":["Carimbo","Chancela","Sinete","Clichê","Letreiro 3D","Logo Iluminada","Placa Pix","Rede social"]}'::jsonb)
on conflict (id) do nothing;
