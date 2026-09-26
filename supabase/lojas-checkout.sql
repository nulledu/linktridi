-- ═════════════════════════════════════════════════════════════════════════════
-- CRIADOR DE LOJAS — como a vitrine vende
--
-- Roda DEPOIS do supabase/lojas.sql. Idempotente: pode rodar de novo.
--
-- Acrescenta duas coisas e nada mais:
--   1. como cada loja aceita pedido (WhatsApp, checkout próprio, os dois ou
--      nenhum) e o telefone que recebe;
--   2. os dados de contato de quem comprou, no pedido.
--
-- O padrão é `nenhum` DE PROPÓSITO. Vender é escolha do lojista: uma migração
-- que liga a venda sozinha faria toda vitrine já publicada começar a receber
-- pedido sem ninguém ter decidido isso, e sem ninguém preparado pra responder.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Como a loja vende ────────────────────────────────────────────────────
alter table public.lojas add column if not exists checkout text not null default 'nenhum';
-- Só dígitos, com DDI: "5514998544623". A formatação bonita é da tela; o banco
-- guarda o que o link do WhatsApp precisa.
alter table public.lojas add column if not exists whatsapp text not null default '';

do $$ begin
  alter table public.lojas add constraint lojas_checkout_chk
    check (checkout in ('nenhum', 'whatsapp', 'proprio', 'ambos'));
exception when duplicate_object then null; end $$;

-- Vender pelo WhatsApp sem telefone é um botão que leva a lugar nenhum. A
-- constraint é o que impede a loja de ficar publicada nesse estado — a tela
-- avisa antes, mas a tela não é a única porta.
do $$ begin
  alter table public.lojas add constraint lojas_whatsapp_chk
    check (checkout not in ('whatsapp', 'ambos') or whatsapp <> '');
exception when duplicate_object then null; end $$;

-- ── 2. Quem comprou ─────────────────────────────────────────────────────────
-- No pedido, e não numa tabela de clientes: o pedido tem que congelar o
-- contato do momento da compra. Cliente que troca de telefone depois não pode
-- reescrever para onde a encomenda de março ia.
alter table public.loja_pedidos add column if not exists cliente_telefone text not null default '';
alter table public.loja_pedidos add column if not exists cliente_email    text not null default '';
alter table public.loja_pedidos add column if not exists observacao       text not null default '';
-- De onde veio: 'whatsapp' | 'vitrine' | 'manual'. Serve pra saber qual
-- caminho de venda está funcionando antes de investir no outro.
alter table public.loja_pedidos add column if not exists origem text not null default 'manual';

do $$ begin
  alter table public.loja_pedidos add constraint loja_pedidos_origem_chk
    check (origem in ('manual', 'vitrine', 'whatsapp'));
exception when duplicate_object then null; end $$;

-- ── 3. O número do pedido, sem corrida ──────────────────────────────────────
-- `max+1` num SELECT seguido de INSERT tem uma janela: dois pedidos no mesmo
-- instante leem o mesmo máximo e o segundo bate no UNIQUE (loja_id, numero).
-- Numa vitrine pública isso não é hipótese — é o que acontece quando o anúncio
-- roda. A função resolve dentro do banco, com trava por loja: quem chega
-- segundo espera microssegundos em vez de levar erro.
--
-- `pg_advisory_xact_lock` e não uma sequence: sequence é global e deixaria
-- buraco entre lojas ("#1" e depois "#57"), que é justamente o que o lojista
-- não entende ao olhar a lista.
create or replace function public.loja_proximo_numero(p_loja uuid) returns integer
language plpgsql as $$
declare
  proximo integer;
begin
  perform pg_advisory_xact_lock(hashtext('loja_pedido:' || p_loja::text));
  select coalesce(max(numero), 0) + 1 into proximo
    from public.loja_pedidos where loja_id = p_loja;
  return proximo;
end $$;

-- Preenche o número quando o INSERT não manda um. O painel pode continuar
-- gravando um número à mão (importação de histórico); a vitrine não manda.
create or replace function public.loja_pedidos_numero() returns trigger
language plpgsql as $$
begin
  if new.numero is null or new.numero = 0 then
    new.numero := public.loja_proximo_numero(new.loja_id);
  end if;
  return new;
end $$;

drop trigger if exists loja_pedidos_numero_trg on public.loja_pedidos;
create trigger loja_pedidos_numero_trg before insert on public.loja_pedidos
  for each row execute function public.loja_pedidos_numero();

-- `numero` deixa de ser obrigatório no INSERT: quem preenche agora é o gatilho.
do $$ begin
  alter table public.loja_pedidos alter column numero drop not null;
exception when others then null; end $$;
