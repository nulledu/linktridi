-- ═════════════════════════════════════════════════════════════════════════════
-- ANALYTICS DA VITRINE — acessos, origem e faturamento por loja
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. É IDEMPOTENTE: pode
-- rodar de novo sem apagar nada.
--
-- Depende de `supabase/lojas.sql` (cria `public.lojas` e `public.loja_pedidos`).
--
-- Antes disso, a tela de Análises abre, mostra zero e AVISA que falta rodar
-- este arquivo; a vitrine continua funcionando e simplesmente não registra.
-- Nada fica inutilizável esperando esta ida ao SQL Editor.
--
-- ── Quatro decisões que valem explicação ────────────────────────────────────
--
-- 1. A AGREGAÇÃO MORA AQUI, não no aplicativo. Um relatório de 90 dias pode
--    passar por dezenas de milhares de linhas; trazê-las pro Node pra somar
--    seria pagar egress (a conta é cobrada no trecho Supabase → app) por um
--    número de seis dígitos. As funções abaixo devolvem o RESULTADO — dezenas
--    de linhas — e o banco faz o trabalho.
--
-- 2. NÃO SE GUARDA IP. O relatório precisa de estado, dispositivo e origem;
--    nada disso exige guardar o endereço de quem visitou. O IP é resolvido em
--    UF no edge da Vercel e descartado ali. Guardar dado pessoal que não se usa
--    é só assumir risco de graça.
--
-- 3. O DIA É O DE SÃO PAULO. `criado_em` é `timestamptz`; agrupar por
--    `::date` cru daria o dia em UTC, e toda venda depois das 21h cairia no dia
--    seguinte. É o mesmo erro que já mordeu o Financeiro.
--
-- 4. RETENÇÃO DE 90 DIAS, apagada por cron. Acesso cru é dado que cresce
--    sozinho e ninguém olha depois do trimestre. Sem a poda, a tabela vira o
--    maior objeto do banco e a agregação fica lenta pra todo mundo.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Acessos ──────────────────────────────────────────────────────────────
create table if not exists public.loja_acessos (
  id           bigserial primary key,
  loja_id      uuid not null references public.lojas(id) on delete cascade,
  criado_em    timestamptz not null default now(),

  -- Identidade ANÔNIMA, gerada pelo próprio sistema e guardada em cookie
  -- primário. Não é login, não é e-mail, não dá pra chegar numa pessoa a
  -- partir dela — serve só pra separar "duas visitas" de "duas pessoas".
  visitante    uuid not null,
  sessao       uuid not null,
  novo         boolean not null default false,   -- primeira sessão deste visitante
  primeira     boolean not null default false,   -- primeira visualização da sessão

  caminho      text not null,                    -- sem query: `?utm=` não é página
  template     text,                             -- inicio | produto | colecao | busca | carrinho

  uf           text,                             -- só quando o país é BR
  pais         text,
  dispositivo  text,                             -- celular | tablet | computador

  canal        text not null default 'direto',   -- direto | busca | social | indicacao | campanha | email
  fonte        text,
  campanha     text,
  referencia   text                              -- host do referrer, pra auditoria
);

-- O índice que sustenta TODA consulta do relatório: sempre uma loja, sempre um
-- período. Sem ele, cada gráfico varre a tabela inteira.
create index if not exists loja_acessos_loja_data on public.loja_acessos (loja_id, criado_em desc);
-- Contar sessões distintas é a operação mais cara da tela.
create index if not exists loja_acessos_sessao on public.loja_acessos (loja_id, sessao);

alter table public.loja_acessos enable row level security;
-- Sem política: ninguém entra pela sessão do navegador. O aplicativo lê com
-- `service_role`, que passa por cima da RLS — e é justamente por isso que a
-- ausência de política aqui é a trava certa, e não um esquecimento.

comment on table public.loja_acessos is
  'Visualizações da vitrine pública. Sem IP. Retenção de 90 dias (loja_acessos_limpar).';

-- ── 2. Atribuição no pedido ─────────────────────────────────────────────────
-- O pedido guarda de onde veio a PRIMEIRA visita daquela pessoa (janela de 30
-- dias, cookie `la`). Não é a origem da visita em que ela comprou: quem
-- descobre a loja por um anúncio costuma voltar direto pra fechar, e atribuir
-- ao último clique faria todo anúncio parecer que não vendeu nada.
alter table public.loja_pedidos add column if not exists visitante uuid;
alter table public.loja_pedidos add column if not exists sessao    uuid;
alter table public.loja_pedidos add column if not exists uf        text;
alter table public.loja_pedidos add column if not exists canal     text;
alter table public.loja_pedidos add column if not exists fonte     text;
alter table public.loja_pedidos add column if not exists campanha  text;

create index if not exists loja_pedidos_loja_data on public.loja_pedidos (loja_id, feito_em desc);

-- ── 3. Resumo do período ────────────────────────────────────────────────────
create or replace function public.loja_acessos_resumo(
  p_loja uuid, p_de timestamptz, p_ate timestamptz
) returns table (
  visualizacoes bigint, sessoes bigint, visitantes bigint,
  novos bigint, recorrentes bigint, sessoes_de_uma_pagina bigint
) language sql stable as $$
  with base as (
    select * from public.loja_acessos
    where loja_id = p_loja and criado_em >= p_de and criado_em < p_ate
  ), por_sessao as (
    select sessao, bool_or(novo) as novo, count(*) as vistas
    from base group by sessao
  )
  select
    (select count(*) from base),
    (select count(*) from por_sessao),
    (select count(distinct visitante) from base),
    (select count(*) from por_sessao where novo),
    (select count(*) from por_sessao where not novo),
    -- Sessão que viu UMA página e foi embora. É a taxa de rejeição, contada do
    -- jeito honesto: sem evento de saída, não dá pra saber tempo de permanência.
    (select count(*) from por_sessao where vistas = 1);
$$;

-- ── 4. Série por dia ────────────────────────────────────────────────────────
create or replace function public.loja_acessos_serie(
  p_loja uuid, p_de timestamptz, p_ate timestamptz
) returns table (dia date, sessoes bigint, visualizacoes bigint)
language sql stable as $$
  select
    (criado_em at time zone 'America/Sao_Paulo')::date as dia,
    count(distinct sessao),
    count(*)
  from public.loja_acessos
  where loja_id = p_loja and criado_em >= p_de and criado_em < p_ate
  group by 1
  order by 1;
$$;

-- ── 5. Top por dimensão ─────────────────────────────────────────────────────
-- `p_dim` é resolvido por CASE e não por SQL dinâmico: nome de coluna vindo de
-- fora, concatenado numa string, é injeção esperando acontecer. Dimensão
-- desconhecida devolve vazio, e não a tabela inteira.
create or replace function public.loja_acessos_top(
  p_loja uuid, p_de timestamptz, p_ate timestamptz,
  p_dim text, p_limite int default 20
) returns table (chave text, sessoes bigint, visualizacoes bigint)
language sql stable as $$
  select
    coalesce(
      case p_dim
        when 'uf'          then uf
        when 'pais'        then pais
        when 'dispositivo' then dispositivo
        when 'canal'       then canal
        when 'fonte'       then fonte
        when 'campanha'    then campanha
        when 'caminho'     then caminho
        when 'template'    then template
      end, '—') as chave,
    count(distinct sessao),
    count(*)
  from public.loja_acessos
  where loja_id = p_loja and criado_em >= p_de and criado_em < p_ate
    and p_dim in ('uf','pais','dispositivo','canal','fonte','campanha','caminho','template')
  group by 1
  order by 2 desc, 3 desc
  limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

-- ── 6. Receita por dimensão ─────────────────────────────────────────────────
-- Só pedido PAGO conta como faturamento. Pendente é promessa e estornado é
-- dinheiro que voltou; somar os dois faria o relatório dizer 900 quando
-- entraram 100.
create or replace function public.loja_receita_top(
  p_loja uuid, p_de timestamptz, p_ate timestamptz,
  p_dim text, p_limite int default 20
) returns table (chave text, pedidos bigint, receita numeric)
language sql stable as $$
  select
    coalesce(
      case p_dim
        when 'uf'       then uf
        when 'canal'    then canal
        when 'fonte'    then fonte
        when 'campanha' then campanha
      end, '—') as chave,
    count(*),
    coalesce(sum(total), 0)
  from public.loja_pedidos
  where loja_id = p_loja and feito_em >= p_de and feito_em < p_ate
    and pagamento = 'pago'
    and p_dim in ('uf','canal','fonte','campanha')
  group by 1
  order by 3 desc
  limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

-- ── 6b. Receita por dia ─────────────────────────────────────────────────────
-- Serve pra desenhar faturamento e acesso na MESMA curva. Sem isto, a receita
-- viria da listagem de pedidos, que tem teto de 200 linhas — e um período de 90
-- dias apareceria truncado sem ninguém perceber.
create or replace function public.loja_receita_serie(
  p_loja uuid, p_de timestamptz, p_ate timestamptz
) returns table (dia date, pedidos bigint, receita numeric)
language sql stable as $$
  select
    (feito_em at time zone 'America/Sao_Paulo')::date as dia,
    count(*),
    coalesce(sum(total), 0)
  from public.loja_pedidos
  where loja_id = p_loja and feito_em >= p_de and feito_em < p_ate and pagamento = 'pago'
  group by 1
  order by 1;
$$;

-- ── 7. Faturamento por loja ─────────────────────────────────────────────────
-- A comparação entre lojas, numa consulta só. Uma consulta por loja seria N
-- idas ao banco pra desenhar uma lista.
create or replace function public.lojas_faturamento(
  p_de timestamptz, p_ate timestamptz
) returns table (loja_id uuid, pedidos bigint, receita numeric, sessoes bigint)
language sql stable as $$
  with vendas as (
    select loja_id, count(*) as pedidos, coalesce(sum(total), 0) as receita
    from public.loja_pedidos
    where feito_em >= p_de and feito_em < p_ate and pagamento = 'pago'
    group by loja_id
  ), acessos as (
    select loja_id, count(distinct sessao) as sessoes
    from public.loja_acessos
    where criado_em >= p_de and criado_em < p_ate
    group by loja_id
  )
  select
    l.id,
    coalesce(v.pedidos, 0),
    coalesce(v.receita, 0),
    coalesce(a.sessoes, 0)
  from public.lojas l
  left join vendas  v on v.loja_id = l.id
  left join acessos a on a.loja_id = l.id
  order by coalesce(v.receita, 0) desc;
$$;

-- ── 8. Poda ─────────────────────────────────────────────────────────────────
create or replace function public.loja_acessos_limpar(p_dias int default 90)
returns bigint language plpgsql as $$
declare apagados bigint;
begin
  delete from public.loja_acessos
  where criado_em < now() - (greatest(7, p_dias) || ' days')::interval;
  get diagnostics apagados = row_count;
  return apagados;
end;
$$;
