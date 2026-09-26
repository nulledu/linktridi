-- ── TridiChat · mensagem que MUDA precisa voltar no poll ────────────────────
-- Idempotente: pode rodar quantas vezes quiser.
--
-- O problema que este arquivo resolve:
-- a mensagem com foto é INSERIDA primeiro e a mídia baixada DEPOIS, num UPDATE.
-- O poll incremental pedia `created_at > desde`, então a linha já tinha passado
-- (ainda sem `midia_path`) e a atualização nunca mais voltava — a imagem só
-- aparecia recarregando a página. O mesmo valia para os ✓✓: `status` também é
-- um UPDATE numa linha antiga.
--
-- A correção é ter um carimbo de ÚLTIMA ALTERAÇÃO e paginar por ele.

-- 1) Carimbo de alteração ───────────────────────────────────────────────────
alter table public.tridichat_mensagens
  add column if not exists updated_at timestamptz not null default now();

-- Linhas antigas nascem com o carimbo igual ao de criação: sem isto, todas
-- teriam `now()` e o primeiro poll devolveria a conversa inteira de uma vez.
update public.tridichat_mensagens set updated_at = created_at where updated_at > created_at;

create or replace function public.tridichat_marcar_alteracao()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tridichat_mensagens_updated_at on public.tridichat_mensagens;
create trigger tridichat_mensagens_updated_at
  before update on public.tridichat_mensagens
  for each row execute function public.tridichat_marcar_alteracao();

-- O poll pede "o que mudou nesta conversa depois de X": os dois campos juntos.
create index if not exists tridichat_mensagens_conversa_updated_idx
  on public.tridichat_mensagens (conversa_id, updated_at);

-- 2) Figurinha é um tipo próprio ────────────────────────────────────────────
-- Vinha como 'imagem' e era desenhada como foto grande, com fundo. Figurinha é
-- pequena, transparente e não leva balão.
alter table public.tridichat_mensagens drop constraint if exists tridichat_mensagens_tipo_check;
alter table public.tridichat_mensagens add constraint tridichat_mensagens_tipo_check
  check (tipo in ('texto','imagem','figurinha','video','audio','documento',
                  'botao','lista','template','localizacao','desconhecido'));

-- 3) Respostas prontas ──────────────────────────────────────────────────────
-- O atalho é o que o atendente digita: "/entrega" puxa o texto inteiro.
create table if not exists public.tridichat_respostas_prontas (
  id          uuid        primary key default gen_random_uuid(),
  atalho      text        not null,
  titulo      text        not null,
  texto       text        not null,
  -- null = vale para todo mundo. Preenchido = só de quem criou.
  autor_id    uuid,
  usos        integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Atalho é único por dono: duas pessoas podem ter o seu "/oi", mas ninguém
-- tem dois. `coalesce` porque UNIQUE ignora linhas com coluna nula.
create unique index if not exists tridichat_respostas_atalho_idx
  on public.tridichat_respostas_prontas (lower(atalho), coalesce(autor_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists tridichat_respostas_updated_at on public.tridichat_respostas_prontas;
create trigger tridichat_respostas_updated_at
  before update on public.tridichat_respostas_prontas
  for each row execute function public.tridichat_marcar_alteracao();

-- 4) Realtime ───────────────────────────────────────────────────────────────
-- Com a publicação ligada a mensagem chega na hora e o poll vira só reserva.
-- Projeto sem Realtime continua funcionando no poll — por isso o bloco não
-- falha, só avisa.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'tridichat_mensagens'
    ) then
      execute 'alter publication supabase_realtime add table public.tridichat_mensagens';
    end if;
    -- REPLICA IDENTITY FULL: sem isso o UPDATE chega sem as colunas que não
    -- mudaram, e o cliente não sabe de qual conversa é a mensagem.
    execute 'alter table public.tridichat_mensagens replica identity full';
  else
    raise notice 'publicação supabase_realtime ausente — TridiChat segue no poll';
  end if;
end $$;
