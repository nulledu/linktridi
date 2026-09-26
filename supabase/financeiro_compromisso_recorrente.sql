-- Cria a regra e sua primeira obrigação na MESMA transação.
-- Rode depois de financeiro_contato_empresa.sql.

create or replace function public.fin_criar_compromisso_recorrente(
  p_entrada jsonb,
  p_autor uuid default null
)
returns table (compromisso_id uuid, recorrencia_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresa uuid := nullif(p_entrada->>'empresa_id', '')::uuid;
  v_descricao text := btrim(coalesce(p_entrada->>'descricao', ''));
  v_categoria text := coalesce(nullif(btrim(p_entrada->>'categoria'), ''), 'outros');
  v_valor numeric(14,2) := coalesce((p_entrada->>'valor')::numeric, 0);
  v_vencimento date := (p_entrada->>'vencimento')::date;
  v_competencia date := date_trunc('month', v_vencimento)::date;
  v_periodicidade text := coalesce(nullif(p_entrada->>'periodicidade', ''), 'mensal');
  v_intervalo int := greatest(1, least(60, coalesce((p_entrada->>'intervalo_meses')::int, 1)));
  v_dia int := greatest(1, least(31, coalesce((p_entrada->>'dia_vencimento')::int, extract(day from v_vencimento)::int)));
  v_fim date := nullif(p_entrada->>'fim', '')::date;
  v_conta uuid := nullif(p_entrada->>'conta_id', '')::uuid;
  v_fornecedor uuid := nullif(p_entrada->>'fornecedor_id', '')::uuid;
  v_contato uuid := nullif(p_entrada->>'contato_id', '')::uuid;
  v_passo int;
begin
  if v_empresa is null or v_descricao = '' or v_valor <= 0 then
    raise exception 'Dados inválidos para compromisso recorrente.';
  end if;
  if v_fornecedor is not null and v_contato is not null then
    raise exception 'Escolha somente um favorecido: fornecedor ou contato.';
  end if;
  if v_fim is not null and v_fim < v_vencimento then
    raise exception 'O fim não pode ser antes da primeira ocorrência.';
  end if;

  v_passo := case v_periodicidade
    when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3
    when 'semestral' then 6 when 'anual' then 12 when 'customizada' then v_intervalo
    else 1 end;

  insert into public.fin_recorrencias (
    empresa_id, descricao, categoria, valor, periodicidade, intervalo_meses,
    dia_vencimento, conta_id, fornecedor_id, contato_id, inicio, fim,
    proxima_competencia, status, observacao, created_by
  ) values (
    v_empresa, v_descricao, v_categoria, v_valor, v_periodicidade, v_intervalo,
    v_dia, v_conta, v_fornecedor, v_contato, v_vencimento, v_fim,
    (v_competencia + make_interval(months => v_passo))::date,
    'ativa', nullif(btrim(p_entrada->>'observacao'), ''), p_autor
  ) returning id into recorrencia_id;

  insert into public.fin_compromissos (
    empresa_id, descricao, categoria, valor, vencimento, competencia, status,
    origem, origem_id, conta_id, fornecedor_id, contato_id, idempotency_key,
    observacao, created_by
  ) values (
    v_empresa, v_descricao, v_categoria, v_valor, v_vencimento, v_competencia,
    'pendente', 'recorrencia', recorrencia_id, v_conta, v_fornecedor, v_contato,
    'rec:' || recorrencia_id::text || ':' || to_char(v_competencia, 'YYYY-MM'),
    nullif(btrim(p_entrada->>'observacao'), ''), p_autor
  ) returning id into compromisso_id;

  return next;
end;
$$;

select count(*) as funcao_criada
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'fin_criar_compromisso_recorrente';
