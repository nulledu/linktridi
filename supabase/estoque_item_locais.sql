-- ── Estoque em mais de um lugar ──────────────────────────────────────────────
--
-- Roda NA MÃO no SQL Editor do Supabase (produção), como os demais arquivos
-- desta pasta. Re-rodável: `if not exists` / `drop ... if exists` em tudo.
-- Pré-requisito: supabase/estoque_hierarquia_unidades.sql já rodado
-- (estoque_locais e estoque_itens.local_id existem).
--
-- O item deixou de morar num lugar só. `estoque_item_locais` guarda QUANTAS
-- peças de cada item estão em cada lugar. `estoque_itens.local_id` continua
-- existindo como o lugar PRINCIPAL (o de maior saldo, mantido por gatilho) —
-- é o que as telas antigas leem, e nenhuma delas precisa mudar.
--
-- Invariante: sum(estoque_item_locais.quantidade) ≤ estoque_itens.quantidade.
-- A diferença é o balde "sem lugar definido" — não é linha, é a subtração.

create table if not exists public.estoque_item_locais (
  id            uuid primary key default gen_random_uuid(),
  -- cascade nos dois lados DE PROPÓSITO: alocação é dado derivado, não razão.
  -- Lugar apagado → as peças voltam pro balde "sem lugar" sozinhas.
  item_id       uuid not null references public.estoque_itens(id)  on delete cascade,
  local_id      uuid not null references public.estoque_locais(id) on delete cascade,
  quantidade    int  not null,
  atualizado_em timestamptz not null default now(),
  unique (item_id, local_id)
);

-- check com nome próprio (mesmo padrão de estoque_unidades_quantidade_chk):
-- linha zerada é APAGADA, nunca fica registrada com zero.
alter table public.estoque_item_locais drop constraint if exists estoque_item_locais_qtd_chk;
alter table public.estoque_item_locais add constraint estoque_item_locais_qtd_chk
  check (quantidade > 0);

create index if not exists estoque_item_locais_local_idx
  on public.estoque_item_locais (local_id);

-- Como o resto do módulo: RLS ligado sem policy = só o service_role lê/escreve.
alter table public.estoque_item_locais enable row level security;

-- ── Semente: o dado de hoje nasce 100% alocado ───────────────────────────────
insert into public.estoque_item_locais (item_id, local_id, quantidade)
select i.id, i.local_id, i.quantidade
  from public.estoque_itens i
 where i.local_id is not null and coalesce(i.quantidade, 0) > 0
on conflict (item_id, local_id) do nothing;

-- ── Gatilho 1: o lugar principal acompanha a repartição ──────────────────────
-- Sem linha nenhuma o local_id NÃO é mexido: preserva o "mora aqui" de item
-- com estoque zero, que existe hoje e as etiquetas usam.
create or replace function public.estoque_item_locais_sincroniza_principal()
returns trigger language plpgsql as $$
declare
  v_item uuid := coalesce(new.item_id, old.item_id);
  v_principal uuid;
begin
  select l.local_id into v_principal
    from public.estoque_item_locais l
   where l.item_id = v_item
   order by l.quantidade desc, l.local_id
   limit 1;
  if v_principal is not null then
    update public.estoque_itens set local_id = v_principal
     where id = v_item and local_id is distinct from v_principal;
  end if;
  return null;
end $$;

drop trigger if exists estoque_item_locais_principal_tg on public.estoque_item_locais;
create trigger estoque_item_locais_principal_tg
after insert or update or delete on public.estoque_item_locais
for each row execute function public.estoque_item_locais_sincroniza_principal();

-- ── Gatilho 2: quando o total cai POR FORA, a sobra sai do(s) maior(es) ──────
-- Tablet, ajuste antigo, baixa de unidade: nenhum caminho legado conhece a
-- repartição, e mesmo assim a invariante vale. Determinístico (maior saldo,
-- desempate por local_id), sem divergência muda.
create or replace function public.estoque_itens_apara_alocacao()
returns trigger language plpgsql as $$
declare
  v_sobra int;
  v_tira  int;
  r record;
begin
  select coalesce(sum(quantidade), 0) - greatest(coalesce(new.quantidade, 0), 0)
    into v_sobra
    from public.estoque_item_locais where item_id = new.id;
  if v_sobra <= 0 then return null; end if;
  for r in
    select id, quantidade from public.estoque_item_locais
     where item_id = new.id
     order by quantidade desc, local_id
  loop
    exit when v_sobra <= 0;
    v_tira := least(r.quantidade, v_sobra);
    if v_tira >= r.quantidade then
      delete from public.estoque_item_locais where id = r.id;
    else
      update public.estoque_item_locais
         set quantidade = quantidade - v_tira, atualizado_em = now()
       where id = r.id;
    end if;
    v_sobra := v_sobra - v_tira;
  end loop;
  return null;
end $$;

drop trigger if exists estoque_itens_apara_alocacao_tg on public.estoque_itens;
create trigger estoque_itens_apara_alocacao_tg
after update of quantidade on public.estoque_itens
for each row when (new.quantidade is distinct from old.quantidade)
execute function public.estoque_itens_apara_alocacao();

-- ── Transferir: atômico, com trava na linha do item ──────────────────────────
-- p_de = null  → tira do balde "sem lugar" (alocar).
-- p_para = null → devolve pro balde (desalocar).
-- Erros com mensagem-código; a rota traduz em frase
-- (fraseDoErroDeTransferencia em lib/estoque-transferencia.ts).
create or replace function public.estoque_transferir(
  p_item uuid, p_de uuid, p_para uuid, p_qtd int
) returns void language plpgsql as $$
declare
  v_total   int;
  v_alocado int;
  v_origem  int;
begin
  if p_qtd is null or p_qtd <= 0 then
    raise exception 'quantidade_invalida';
  end if;
  if p_de is not distinct from p_para then
    raise exception 'origem_igual_destino';
  end if;

  select quantidade into v_total
    from public.estoque_itens where id = p_item for update;
  if not found then raise exception 'item_inexistente'; end if;

  if p_de is null then
    select coalesce(sum(quantidade), 0) into v_alocado
      from public.estoque_item_locais where item_id = p_item;
    if coalesce(v_total, 0) - v_alocado < p_qtd then
      raise exception 'sem_lugar_insuficiente';
    end if;
  else
    select quantidade into v_origem
      from public.estoque_item_locais
     where item_id = p_item and local_id = p_de;
    if coalesce(v_origem, 0) < p_qtd then
      raise exception 'saldo_insuficiente_na_origem';
    end if;
    if v_origem = p_qtd then
      delete from public.estoque_item_locais
       where item_id = p_item and local_id = p_de;
    else
      update public.estoque_item_locais
         set quantidade = quantidade - p_qtd, atualizado_em = now()
       where item_id = p_item and local_id = p_de;
    end if;
  end if;

  if p_para is not null then
    if not exists (select 1 from public.estoque_locais where id = p_para) then
      raise exception 'destino_inexistente';
    end if;
    insert into public.estoque_item_locais (item_id, local_id, quantidade)
    values (p_item, p_para, p_qtd)
    on conflict (item_id, local_id) do update
      set quantidade = public.estoque_item_locais.quantidade + excluded.quantidade,
          atualizado_em = now();
  end if;
end $$;
