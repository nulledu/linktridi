-- Página de status: foto ao vivo, linha do tempo de incidentes e
-- disponibilidade por dia. Quem escreve é o coletor da VPS do gedux (a cada
-- 5 min, lendo o Gatus); quem lê é o Gaius, no SERVIDOR, com a service role.
--
-- Por que no Supabase e não direto do Gatus pro navegador (como era):
--   · a página /status é pública, e a API do Gatus aberta entregava a qualquer
--     um o nome de todo funil e toda a infraestrutura. Agora o Gatus fica
--     atrás de senha e o público recebe só "plataforma no ar / com problema";
--   · o Gatus guarda poucas horas; aqui fica 7, 30 dias e o relatório semanal;
--   · o custo em anúncio de uma queda cruza com meta_ad_insights_daily, que já
--     mora aqui.
--
-- Segurança: RLS ligado e NENHUMA policy nas quatro tabelas — anon e
-- authenticated não leem nem escrevem nada. O coletor só entra pela função
-- status_registrar, que confere um token guardado em status_segredo (a VPS
-- não recebe a service role). Idempotente: pode rodar de novo sem erro.

create table if not exists public.status_itens (
  key           text primary key,          -- chave do Gatus (ex.: funis_chancela)
  nome          text not null,
  grupo         text,
  plataforma    text,
  estado        text not null default 'ok', -- ok | caiu
  tipo          text,                       -- tipo da ocorrência (funil) ou null
  motivo        text,
  ms            int,
  verificado_em timestamptz,
  trilha        jsonb not null default '[]'::jsonb,  -- últimas 30: 1 = ok, 0 = falha
  atualizado_em timestamptz not null default now()
);

create table if not exists public.status_incidentes (
  id         bigserial primary key,
  key        text not null,
  nome       text not null,
  plataforma text,
  tipo       text,
  motivo     text,
  inicio     timestamptz not null,
  fim        timestamptz,
  duracao_s  int
);
create index if not exists status_incidentes_inicio_idx on public.status_incidentes (inicio desc);
create index if not exists status_incidentes_aberto_idx on public.status_incidentes (key) where fim is null;

-- Uma linha por item por dia (fuso de São Paulo): amostras boas e ruins.
create table if not exists public.status_dia (
  key   text not null,
  dia   date not null,
  ok    int  not null default 0,
  falha int  not null default 0,
  primary key (key, dia)
);

create table if not exists public.status_segredo (
  id    int primary key default 1 check (id = 1),
  token text not null
);

alter table public.status_itens      enable row level security;
alter table public.status_incidentes enable row level security;
alter table public.status_dia        enable row level security;
alter table public.status_segredo    enable row level security;

create or replace function public.status_registrar(p_token text, p_itens jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  it       jsonb;
  v_key    text;
  v_estado text;
  v_quando timestamptz;
  v_dia    date := (now() at time zone 'America/Sao_Paulo')::date;
  n        int := 0;
begin
  if p_token is null or not exists (select 1 from status_segredo where id = 1 and token = p_token) then
    raise exception 'token inválido' using errcode = '28000';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_key := it->>'key';
    if v_key is null or v_key = '' then continue; end if;
    v_estado := case when it->>'estado' = 'caiu' then 'caiu' else 'ok' end;
    v_quando := coalesce(nullif(it->>'verificado_em', '')::timestamptz, now());

    insert into status_itens (key, nome, grupo, plataforma, estado, tipo, motivo, ms, verificado_em, trilha, atualizado_em)
    values (v_key, coalesce(nullif(it->>'nome', ''), v_key), it->>'grupo', it->>'plataforma', v_estado,
            nullif(it->>'tipo', ''), nullif(it->>'motivo', ''), nullif(it->>'ms', '')::int, v_quando,
            coalesce(it->'trilha', '[]'::jsonb), now())
    on conflict (key) do update set
      nome = excluded.nome, grupo = excluded.grupo, plataforma = excluded.plataforma,
      estado = excluded.estado, tipo = excluded.tipo, motivo = excluded.motivo, ms = excluded.ms,
      verificado_em = excluded.verificado_em, trilha = excluded.trilha, atualizado_em = now();

    -- Disponibilidade: cada chamada do coletor é uma amostra do dia.
    insert into status_dia (key, dia, ok, falha)
    values (v_key, v_dia, case when v_estado = 'ok' then 1 else 0 end, case when v_estado = 'caiu' then 1 else 0 end)
    on conflict (key, dia) do update set
      ok = status_dia.ok + excluded.ok, falha = status_dia.falha + excluded.falha;

    -- Linha do tempo: abre no primeiro "caiu", fecha no primeiro "ok".
    if v_estado = 'caiu' then
      if exists (select 1 from status_incidentes where key = v_key and fim is null) then
        update status_incidentes set motivo = coalesce(nullif(it->>'motivo', ''), motivo)
        where key = v_key and fim is null;
      else
        insert into status_incidentes (key, nome, plataforma, tipo, motivo, inicio)
        values (v_key, coalesce(nullif(it->>'nome', ''), v_key), it->>'plataforma',
                nullif(it->>'tipo', ''), nullif(it->>'motivo', ''), v_quando);
      end if;
    else
      update status_incidentes
         set fim = v_quando, duracao_s = greatest(0, extract(epoch from v_quando - inicio)::int)
       where key = v_key and fim is null;
    end if;
    n := n + 1;
  end loop;

  -- Faxina barata, na mesma ida: item que sumiu do Gatus (funil sem visita,
  -- domínio desmarcado na ficha), dia além de 120 dias e incidente fechado com
  -- mais de um ano.
  --
  -- 2 HORAS e não 2 dias: quem desmarca "Domínio ativo" quer o cartão limpo
  -- hoje, não depois de amanhã — e até aqui o endereço continuava vermelho na
  -- tela, congelado, por dois dias depois de sair do monitor. Encurtar é
  -- seguro porque o corte só roda QUANDO chega foto, e a foto que acabou de
  -- passar renovou `atualizado_em` de todo item vivo: o que sobra velho é o
  -- que saiu da lista do Gatus.
  delete from status_itens where atualizado_em < now() - interval '2 hours';

  -- Queda aberta de item que saiu da lista não fecharia nunca: sem foto não
  -- vem o "ok" que fecha, e a linha do tempo mostraria "ainda fora do ar" pra
  -- sempre num endereço que ninguém mais verifica.
  update status_incidentes i
     set fim = now(), duracao_s = greatest(0, extract(epoch from now() - i.inicio)::int)
   where i.fim is null
     and not exists (select 1 from status_itens s where s.key = i.key);
  delete from status_dia where dia < v_dia - 120;
  delete from status_incidentes where fim is not null and inicio < now() - interval '365 days';
  return n;
end;
$$;

revoke all on function public.status_registrar(text, jsonb) from public;
grant execute on function public.status_registrar(text, jsonb) to anon, authenticated, service_role;
