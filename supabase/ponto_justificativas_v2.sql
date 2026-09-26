-- ─────────────────────────────────────────────────────────────────────────────
-- Justificativas de ponto v2 — tipo, recorte de horas, anexo e aprovação.
--
-- O que existia: uma linha por dia (`unique (pessoa_id, dia)`) com um `abona`
-- booleano. Ou a empresa perdoava o dia inteiro, ou não perdoava nada. Isso
-- cobre "faltou" e mais nada — e o caso comum do RH é o contrário: o atestado
-- que cobre só a manhã, a consulta de 1h, a pessoa que sai 14h e volta 16h.
--
-- O que muda:
--   · `tipo`      — o que aconteceu (atestado, consulta, a serviço da empresa…).
--   · `efeito`    — o que faz com as horas (abona / trabalhada / compensar).
--   · recorte     — `hora_de`/`hora_ate` (janela) ou `minutos` (quantidade).
--                   Tudo NULL = o dia inteiro, que é o significado de sempre.
--   · `arquivo`   — a foto do atestado (`/api/arquivos/atestados/…`, B2).
--   · `status`    — pendente/aprovada/recusada. Só a APROVADA mexe em conta;
--                   é o que deixa o colaborador PEDIR sem se auto-perdoar.
--   · cai o `unique (pessoa_id, dia)` — duas saídas no mesmo dia são dois
--     motivos diferentes, e o modelo antigo obrigava a escolher um.
--
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ─────────────────────────────────────────────────────────────────────────────

alter table ponto_justificativas add column if not exists tipo           text not null default 'outro';
alter table ponto_justificativas add column if not exists efeito         text not null default 'abona';
alter table ponto_justificativas add column if not exists hora_de        time;
alter table ponto_justificativas add column if not exists hora_ate       time;
alter table ponto_justificativas add column if not exists minutos        integer;
alter table ponto_justificativas add column if not exists arquivo        text;
alter table ponto_justificativas add column if not exists arquivo_nome   text;
alter table ponto_justificativas add column if not exists status         text not null default 'aprovada';
alter table ponto_justificativas add column if not exists solicitado_por uuid;
alter table ponto_justificativas add column if not exists decidido_por   uuid;
alter table ponto_justificativas add column if not exists decidido_em    timestamptz;
alter table ponto_justificativas add column if not exists decisao_motivo text;

comment on column ponto_justificativas.tipo     is 'atestado|consulta|acompanhamento|empresa|atraso|saida_antecipada|luto|casamento|doacao_sangue|convocacao|particular|outro';
comment on column ponto_justificativas.efeito   is 'abona = perdoa o déficit · trabalhada = conta como trabalho (a serviço da empresa) · compensar = só registra o motivo';
comment on column ponto_justificativas.minutos  is 'Minutos recortados do dia. NULL + sem janela = o dia inteiro.';
comment on column ponto_justificativas.arquivo  is 'Caminho relativo do app: /api/arquivos/atestados/aaaa/mm/<uuid>.<ext> (Backblaze B2). Nunca URL do B2.';
comment on column ponto_justificativas.status   is 'pendente = o colaborador pediu e ninguém decidiu (NÃO entra na conta) · aprovada · recusada';
comment on column ponto_justificativas.abona    is 'LEGADO. Mantido em sincronia com efeito pelo app; quem lê o cálculo usa efeito.';

-- ── Backfill: o booleano antigo vira efeito ──────────────────────────────────
-- Toda linha que existia nasceu com o default 'abona'. As que tinham abona=false
-- eram exatamente o caso "registra o motivo, mas a pessoa compensa".
update ponto_justificativas set efeito = 'compensar' where abona is false and efeito = 'abona';

-- ── Cai o "uma por dia" ──────────────────────────────────────────────────────
-- O nome da constraint depende de como a tabela nasceu, então procura pelas
-- colunas em vez de chutar o nome.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'ponto_justificativas'
       and con.contype = 'u'
       and (
         -- `attname` é do tipo `name`, não `text`. Sem o cast explícito o
         -- Postgres recusa a comparação inteira com o array literal:
         -- "operator does not exist: name[] = text[]".
         select array_agg(att.attname::text order by att.attname::text)
           from unnest(con.conkey) k
           join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
       ) = array['dia','pessoa_id']::text[]
  loop
    execute format('alter table ponto_justificativas drop constraint %I', c.conname);
  end loop;
end $$;

-- ── Travas de domínio ────────────────────────────────────────────────────────
-- Vocabulário errado aqui não dá erro de tela: vira um dia que o cálculo ignora
-- em silêncio. O banco recusa na porta.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ponto_just_efeito_ck') then
    alter table ponto_justificativas add constraint ponto_just_efeito_ck
      check (efeito in ('abona','trabalhada','compensar'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ponto_just_status_ck') then
    alter table ponto_justificativas add constraint ponto_just_status_ck
      check (status in ('pendente','aprovada','recusada'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ponto_just_janela_ck') then
    alter table ponto_justificativas add constraint ponto_just_janela_ck
      check (hora_de is null or hora_ate is null or hora_ate > hora_de);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ponto_just_minutos_ck') then
    alter table ponto_justificativas add constraint ponto_just_minutos_ck
      check (minutos is null or (minutos > 0 and minutos <= 1440));
  end if;
  -- Anexo é sempre o caminho do app, nunca URL do B2 nem link de fora: a rota
  -- /api/arquivos é quem confere sessão e assina. Gravar a URL assinada aqui
  -- deixaria um link de 10 min guardado pra sempre no banco.
  if not exists (select 1 from pg_constraint where conname = 'ponto_just_arquivo_ck') then
    alter table ponto_justificativas add constraint ponto_just_arquivo_ck
      check (arquivo is null or arquivo like '/api/arquivos/%');
  end if;
end $$;

-- ── Índices ──────────────────────────────────────────────────────────────────
create index if not exists ponto_justificativas_pessoa_dia_idx
  on ponto_justificativas (pessoa_id, dia);

-- A fila do gestor: "quem está esperando decisão". Parcial porque pendente é a
-- minoria absoluta das linhas — o índice fica pequeno e a varredura não olha
-- um ano de justificativa já decidida.
create index if not exists ponto_justificativas_pendentes_idx
  on ponto_justificativas (dia desc)
  where status = 'pendente';

-- Quem pediu (a tela do colaborador lista as próprias) e a checagem de dono
-- quando ele reabre a foto do próprio atestado.
create index if not exists ponto_justificativas_solicitante_idx
  on ponto_justificativas (solicitado_por) where solicitado_por is not null;

-- Dono do anexo: a rota /api/arquivos consulta por `arquivo` pra deixar a
-- pessoa reabrir o atestado que ela mesma subiu.
create index if not exists ponto_justificativas_arquivo_idx
  on ponto_justificativas (arquivo) where arquivo is not null;
