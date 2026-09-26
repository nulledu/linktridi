-- "Pode ser pedido pelo app" por item do catálogo. Só componentes-peças e peças
-- aparecem no app; este flag deixa o admin escolher quais. Rode no Supabase NOVO.
alter table public.estoque_itens add column if not exists requisitavel boolean not null default true;
