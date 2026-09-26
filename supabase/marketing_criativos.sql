-- ══════════════════════════════════════════════════════════════════════════════
-- MARKETING · GERAL — Controle de Criativos (rodar 1x; idempotente)
-- Painel do setor de marketing: numeração automática dos criativos, quem
-- produziu, e histórico de alterações.
--
-- A numeração NUNCA duplica nem pula: o servidor lê `max(numero)+1` do prefixo
-- e insere; a UNIQUE (prefixo, numero) abaixo é a trava real — se duas pessoas
-- criarem ao mesmo tempo, a segunda toma erro 23505 e o servidor tenta de novo
-- com o próximo número. Sem a UNIQUE, a corrida geraria dois "JL-007".
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.marketing_criativos (
  id            uuid primary key default gen_random_uuid(),
  prefixo       text not null,                      -- JL, VG, CT… (sempre MAIÚSCULO)
  numero        integer not null,                   -- sequencial POR prefixo
  -- Código de exibição/busca: JL-001. Coluna gerada — nunca sai de sincronia
  -- com prefixo/numero, e dá pra fazer ilike direto nela.
  codigo        text generated always as (prefixo || '-' || lpad(numero::text, 3, '0')) stored,
  nome          text not null,
  editor_id     uuid,                               -- profiles.id do editor responsável
  editor_nome   text,
  produto       text,
  plataforma    text,                               -- meta|tiktok|instagram|youtube|kwai|outro
  tipo          text not null default 'pago',       -- pago|organico
  campanha      text,
  status        text not null default 'producao',   -- producao|revisao|pronto|publicado|arquivado
  observacoes   text,
  data_criacao  date not null default current_date, -- data informada (pode ser retroativa)
  criador_id    uuid,
  criador_nome  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Vídeo do criativo ────────────────────────────────────────────────────────
-- NADA de arquivo no banco. O vídeo aparece de duas formas, ambas por REFERÊNCIA:
--   meta_ad_id → prévia oficial da Meta (iframe assinado, /{ad_id}/previews)
--   video_url  → link externo (Drive, YouTube, storage) pra quando o vídeo
--                nascer dentro do Gaius. Continua sendo um endereço, não bytes.
alter table public.marketing_criativos add column if not exists meta_ad_id text;
alter table public.marketing_criativos add column if not exists video_url  text;

-- A trava contra número duplicado.
create unique index if not exists marketing_criativos_prefixo_numero
  on public.marketing_criativos (prefixo, numero);

create index if not exists marketing_criativos_data   on public.marketing_criativos (data_criacao desc);
create index if not exists marketing_criativos_editor on public.marketing_criativos (editor_id);
create index if not exists marketing_criativos_criado on public.marketing_criativos (created_at desc);

-- Histórico de alterações: quem criou, quem editou, quando e o quê.
create table if not exists public.marketing_criativos_hist (
  id          uuid primary key default gen_random_uuid(),
  criativo_id uuid not null references public.marketing_criativos(id) on delete cascade,
  acao        text not null,                        -- criou|editou|status|observacao
  campo       text,
  detalhe     text,
  autor_id    uuid,
  autor_nome  text,
  created_at  timestamptz not null default now()
);
create index if not exists marketing_criativos_hist_ref
  on public.marketing_criativos_hist (criativo_id, created_at desc);

-- Prefixos cadastrados (a lista que aparece no formulário). Opcional: o
-- formulário também aceita prefixo novo digitado na hora.
create table if not exists public.marketing_criativos_prefixos (
  prefixo    text primary key,
  descricao  text,
  created_at timestamptz not null default now()
);

insert into public.marketing_criativos_prefixos (prefixo, descricao) values
  ('JL', 'Jonathan Lopes'),
  ('VG', 'Vega'),
  ('CT', 'Carimbos Tridi')
on conflict (prefixo) do nothing;

-- RLS: as leituras/escritas passam pelo service role nas rotas /api/marketing/*,
-- que já checam a permissão da área "marketing". Ligamos RLS sem policy para
-- que a chave anônima não alcance a tabela.
alter table public.marketing_criativos          enable row level security;
alter table public.marketing_criativos_hist     enable row level security;
alter table public.marketing_criativos_prefixos enable row level security;
