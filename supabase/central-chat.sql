-- ═══════════════════════════════════════════════════════════════════════════
-- Central · Mensagens — evolução para plataforma de comunicação (canais,
-- threads, anexos, permissões, busca e tempo real).
--
-- 100% ADITIVO e IDEMPOTENTE: nenhuma coluna existente muda de tipo, nenhuma
-- tabela é recriada. Rodar quantas vezes quiser. O código do app tolera a
-- ausência de tudo que está aqui (cai no comportamento antigo).
--
-- Rode inteiro no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Categorias de canal (as seções da sidebar: GERAL, PROJETOS, EQUIPES…) ─
create table if not exists public.central_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null default 0,
  criada_por uuid,
  created_at timestamptz not null default now()
);

-- ── 2. Canais (evolui central_conversas) ────────────────────────────────────
-- tipo continua: direta | grupo | setor  → agora também: canal
alter table public.central_conversas add column if not exists descricao       text;
alter table public.central_conversas add column if not exists topico          text;
alter table public.central_conversas add column if not exists slug            text;
alter table public.central_conversas add column if not exists categoria_id    uuid references public.central_categorias(id) on delete set null;
alter table public.central_conversas add column if not exists privado         boolean not null default false;
alter table public.central_conversas add column if not exists somente_leitura boolean not null default false;
alter table public.central_conversas add column if not exists arquivado       boolean not null default false;
alter table public.central_conversas add column if not exists cor             text;          -- linha de contexto (#7c3aed…)
alter table public.central_conversas add column if not exists contexto_tipo   text;          -- modulo | projeto | equipe | departamento
alter table public.central_conversas add column if not exists contexto_ref    text;          -- chave/ID da entidade do ERP
alter table public.central_conversas add column if not exists atualizado_em   timestamptz not null default now();

create unique index if not exists central_conv_slug_uq on public.central_conversas (slug) where slug is not null;
create index if not exists central_conv_categoria_idx on public.central_conversas (categoria_id);
create index if not exists central_conv_contexto_idx  on public.central_conversas (contexto_tipo, contexto_ref);
create index if not exists central_conv_atualizado_idx on public.central_conversas (atualizado_em desc);

-- ── 3. Membros: papel, notificação, mudo, marcador de leitura ───────────────
alter table public.central_conversa_membros add column if not exists papel      text not null default 'membro'; -- dono | admin | membro
alter table public.central_conversa_membros add column if not exists notificar  text not null default 'todas';  -- todas | mencoes | nenhuma
alter table public.central_conversa_membros add column if not exists mudo_ate   timestamptz;
alter table public.central_conversa_membros add column if not exists entrou_em  timestamptz not null default now();
alter table public.central_conversa_membros add column if not exists oculta     boolean not null default false;

create index if not exists central_membros_user_idx on public.central_conversa_membros (user_id);

-- ── 4. Mensagens: thread, edição, exclusão, anexos, menções, tipo ───────────
alter table public.central_mensagens add column if not exists thread_id   uuid references public.central_mensagens(id) on delete cascade;
alter table public.central_mensagens add column if not exists editada_em  timestamptz;
alter table public.central_mensagens add column if not exists excluida_em timestamptz;
alter table public.central_mensagens add column if not exists tipo        text not null default 'texto';  -- texto | sistema | card
alter table public.central_mensagens add column if not exists anexos      jsonb;   -- [{url,nome,mime,tamanho,largura,altura}]
alter table public.central_mensagens add column if not exists card        jsonb;   -- {tipo,ref,titulo,subtitulo,url,cor,meta}
alter table public.central_mensagens add column if not exists mencoes     uuid[];
alter table public.central_mensagens add column if not exists mencao_todos boolean not null default false;
alter table public.central_mensagens add column if not exists respostas   int not null default 0;   -- contador da thread
alter table public.central_mensagens add column if not exists ultima_resposta_em timestamptz;

create index if not exists central_msg_thread_idx  on public.central_mensagens (thread_id, created_at) where thread_id is not null;
create index if not exists central_msg_fixada_idx  on public.central_mensagens (conversa_id) where fixada;
create index if not exists central_msg_mencoes_idx on public.central_mensagens using gin (mencoes);
-- Janela do canal: o cursor de paginação e o delta do realtime usam esta ordem.
create index if not exists central_msg_janela_idx  on public.central_mensagens (conversa_id, created_at desc, id desc);

-- Busca textual (português). Coluna gerada → nunca fica dessincronizada.
alter table public.central_mensagens add column if not exists busca tsvector
  generated always as (to_tsvector('portuguese', coalesce(texto, ''))) stored;
create index if not exists central_msg_busca_idx on public.central_mensagens using gin (busca);

-- ── 5. Histórico de edições ─────────────────────────────────────────────────
create table if not exists public.central_mensagem_edicoes (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.central_mensagens(id) on delete cascade,
  texto_anterior text,
  editada_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists central_edicoes_msg_idx on public.central_mensagem_edicoes (mensagem_id, created_at desc);

-- ── 6. Anexos (painel "Arquivos" sem varrer a tabela de mensagens) ──────────
create table if not exists public.central_anexos (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.central_mensagens(id) on delete cascade,
  conversa_id uuid not null references public.central_conversas(id) on delete cascade,
  autor_id uuid,
  url text not null,
  nome text,
  mime text,
  tamanho bigint,
  largura int,
  altura int,
  created_at timestamptz not null default now()
);
create index if not exists central_anexos_conv_idx on public.central_anexos (conversa_id, created_at desc);

-- ── 7. Links compartilhados (painel "Links") ────────────────────────────────
create table if not exists public.central_links (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.central_mensagens(id) on delete cascade,
  conversa_id uuid not null references public.central_conversas(id) on delete cascade,
  autor_id uuid,
  url text not null,
  titulo text,
  created_at timestamptz not null default now()
);
create index if not exists central_links_conv_idx on public.central_links (conversa_id, created_at desc);

-- ── 8. Salvos / ler depois ──────────────────────────────────────────────────
create table if not exists public.central_salvos (
  user_id uuid not null,
  mensagem_id uuid not null references public.central_mensagens(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, mensagem_id)
);
create index if not exists central_salvos_user_idx on public.central_salvos (user_id, created_at desc);

-- ── 9. Recibos de leitura por mensagem ("quem visualizou") ─────────────────
-- central_leituras (por conversa) continua sendo a fonte do contador de não
-- lidas; aqui guardamos só o marcador da última mensagem lida por pessoa, que
-- é o suficiente para desenhar "visto por" sem uma linha por mensagem.
alter table public.central_leituras add column if not exists ultima_msg_id uuid;

-- ── 10. Presença (online / ausente / ocupado) ──────────────────────────────
create table if not exists public.central_presenca (
  user_id uuid primary key,
  status text not null default 'online',   -- online | ausente | ocupado | offline
  visto_em timestamptz not null default now()
);

-- ── 11. Trigger: mantém contador de thread e atualizado_em do canal ─────────
create or replace function public.central_msg_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.central_conversas set atualizado_em = new.created_at where id = new.conversa_id;
  if new.thread_id is not null then
    update public.central_mensagens
       set respostas = respostas + 1, ultima_resposta_em = new.created_at
     where id = new.thread_id;
  end if;
  return new;
end $$;

drop trigger if exists central_msg_after_insert_t on public.central_mensagens;
create trigger central_msg_after_insert_t after insert on public.central_mensagens
  for each row execute function public.central_msg_after_insert();

-- ── 12. RLS — necessária para o Realtime do navegador ──────────────────────
-- As rotas do servidor usam service role e IGNORAM RLS: nada quebra. O que
-- estas políticas liberam é só a LEITURA via anon key (WebSocket), e apenas
-- do que a pessoa já poderia ver. Escrita continua exclusivamente pelas rotas.

-- Sem SECURITY DEFINER a política de central_conversa_membros se referenciaria
-- e o Postgres entraria em recursão infinita.
create or replace function public.central_e_membro(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.central_conversa_membros m
     where m.conversa_id = conv and m.user_id = auth.uid()
  );
$$;

alter table public.central_conversas        enable row level security;
alter table public.central_conversa_membros enable row level security;
alter table public.central_mensagens        enable row level security;
alter table public.central_reacoes          enable row level security;
alter table public.central_leituras         enable row level security;
alter table public.central_categorias       enable row level security;
alter table public.central_anexos           enable row level security;
alter table public.central_links            enable row level security;
alter table public.central_salvos           enable row level security;
alter table public.central_presenca         enable row level security;

drop policy if exists central_conv_ler       on public.central_conversas;
drop policy if exists central_membros_ler    on public.central_conversa_membros;
drop policy if exists central_msg_ler        on public.central_mensagens;
drop policy if exists central_reacoes_ler    on public.central_reacoes;
drop policy if exists central_leituras_ler   on public.central_leituras;
drop policy if exists central_categorias_ler on public.central_categorias;
drop policy if exists central_anexos_ler     on public.central_anexos;
drop policy if exists central_links_ler      on public.central_links;
drop policy if exists central_salvos_ler     on public.central_salvos;
drop policy if exists central_presenca_ler   on public.central_presenca;

-- Canal aparece se eu sou membro, ou se é público e não arquivado (para poder
-- ser descoberto e entrar).
create policy central_conv_ler on public.central_conversas for select to authenticated
  using (public.central_e_membro(id) or (privado = false and arquivado = false and tipo <> 'direta'));

create policy central_membros_ler on public.central_conversa_membros for select to authenticated
  using (public.central_e_membro(conversa_id));

create policy central_msg_ler on public.central_mensagens for select to authenticated
  using (public.central_e_membro(conversa_id));

create policy central_reacoes_ler on public.central_reacoes for select to authenticated
  using (exists (select 1 from public.central_mensagens m
                  where m.id = mensagem_id and public.central_e_membro(m.conversa_id)));

create policy central_leituras_ler on public.central_leituras for select to authenticated
  using (public.central_e_membro(conversa_id));

create policy central_categorias_ler on public.central_categorias for select to authenticated using (true);

create policy central_anexos_ler on public.central_anexos for select to authenticated
  using (public.central_e_membro(conversa_id));

create policy central_links_ler on public.central_links for select to authenticated
  using (public.central_e_membro(conversa_id));

create policy central_salvos_ler on public.central_salvos for select to authenticated
  using (user_id = auth.uid());

create policy central_presenca_ler on public.central_presenca for select to authenticated using (true);

-- ── 13. Publicação do Realtime ─────────────────────────────────────────────
-- "digitando" e presença ao vivo NÃO usam tabela: vão por broadcast efêmero.
do $$
declare t text;
begin
  foreach t in array array['central_mensagens','central_reacoes','central_conversas','central_conversa_membros'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when undefined_object then
  raise notice 'publicação supabase_realtime ausente — Realtime desligado neste projeto';
end $$;

-- REPLICA IDENTITY FULL: sem isso o payload de UPDATE/DELETE vem só com a PK,
-- e edição/exclusão de mensagem não chegariam completas no cliente.
alter table public.central_mensagens replica identity full;
alter table public.central_reacoes   replica identity full;

-- ── 14. Busca global de mensagens (usada pelo ⌘K) ──────────────────────────
create or replace function public.central_buscar_mensagens(
  p_user uuid, p_termo text, p_limite int default 30
) returns table (
  id uuid, conversa_id uuid, autor_id uuid, autor_nome text,
  texto text, created_at timestamptz, rank real
)
language sql stable security definer set search_path = public as $$
  select m.id, m.conversa_id, m.autor_id, m.autor_nome, m.texto, m.created_at,
         ts_rank(m.busca, websearch_to_tsquery('portuguese', p_termo)) as rank
    from public.central_mensagens m
    join public.central_conversa_membros mb
      on mb.conversa_id = m.conversa_id and mb.user_id = p_user
   where m.excluida_em is null
     and m.busca @@ websearch_to_tsquery('portuguese', p_termo)
   order by rank desc, m.created_at desc
   limit greatest(1, least(p_limite, 100));
$$;

-- ── 15. Bucket de arquivos do chat ─────────────────────────────────────────
-- Público para leitura (o link do anexo é direto), escrita só pela rota
-- /api/upload, que roda com service role depois de checar a sessão.
insert into storage.buckets (id, name, public)
select 'chat', 'chat', true
 where not exists (select 1 from storage.buckets where id = 'chat');

drop policy if exists central_chat_arquivos_ler on storage.objects;
create policy central_chat_arquivos_ler on storage.objects for select
  to public using (bucket_id = 'chat');

-- ── 16. Backfill leve ──────────────────────────────────────────────────────
-- Conversas antigas herdam atualizado_em da última mensagem (senão nascem
-- todas com "agora" e a ordenação da sidebar sai errada no primeiro load).
update public.central_conversas c
   set atualizado_em = coalesce(
     (select max(m.created_at) from public.central_mensagens m where m.conversa_id = c.id),
     c.created_at)
 where c.atualizado_em is null or c.atualizado_em = c.created_at;

-- Quem criou a conversa vira dono; o resto continua membro.
update public.central_conversa_membros mb
   set papel = 'dono'
  from public.central_conversas c
 where c.id = mb.conversa_id and c.criada_por = mb.user_id and mb.papel = 'membro';

-- Anexos das mensagens antigas (imagem_url) entram no painel de Arquivos.
insert into public.central_anexos (mensagem_id, conversa_id, autor_id, url, nome, mime, created_at)
select m.id, m.conversa_id, m.autor_id, m.imagem_url, 'imagem', 'image/*', m.created_at
  from public.central_mensagens m
 where m.imagem_url is not null
   and not exists (select 1 from public.central_anexos a where a.mensagem_id = m.id)
on conflict do nothing;
