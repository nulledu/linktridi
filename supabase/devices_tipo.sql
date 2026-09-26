-- Tipo de dispositivo: 'producao' (mesa, vários) ou 'ponto' (bater ponto, 1 só).
-- O tablet de ponto mostra TODO mundo que tem cadastro no ponto — não tem opção
-- "aparece ou não". O tipo serve pra: (a) rotular o device, (b) NÃO listar o tablet
-- de ponto no seletor "em quais tablets aparece" da pessoa (isso é só produção).
-- Rodar no Supabase NOVO. Código é tolerante: sem a coluna, tudo vira 'producao'.
alter table public.devices                add column if not exists tipo text not null default 'producao';
alter table public.device_provision_codes add column if not exists tipo text not null default 'producao';
