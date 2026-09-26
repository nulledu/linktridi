-- Por padrão NADA pode ser pedido pelo app. Quando liberar, escolhe-se o SETOR
-- que pode pedir: Logística, Produção ou Máquinas. Rode no Supabase NOVO.
alter table public.estoque_itens add column if not exists setor_requisicao text;
alter table public.estoque_itens alter column requisitavel set default false;
-- Desliga tudo (o admin religa item a item, escolhendo o setor).
update public.estoque_itens set requisitavel = false;
