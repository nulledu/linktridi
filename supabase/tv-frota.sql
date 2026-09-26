-- ── Frota de TV box — gestão remota (atualização + comandos) ────────────────
-- A caixa é device owner do próprio app e fala HTTPS com o servidor de
-- qualquer WiFi. Aqui vivem: os aparelhos, as versões publicadas do APK e a
-- fila de comandos por aparelho.
--
-- Rodar no SQL Editor do Supabase. Idempotente. O código é tolerante à
-- ausência destas tabelas — sem elas o console diz "nenhum aparelho" e as
-- rotas do device respondem vazio, em vez de quebrar.

-- ── Aparelhos ───────────────────────────────────────────────────────────────
create table if not exists public.tv_dispositivos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                         -- "TV Produção 1"
  -- Autenticação sem sessão de usuário: o aparelho carrega um Bearer token
  -- opaco, o servidor só guarda o HASH — mesmo desenho de `devices` e
  -- `estoque_dispositivos`.
  token_hash text,
  codigo_ativacao text,                       -- uso único, trocado por token no activate
  codigo_expira_em timestamptz,
  ativo boolean not null default true,
  -- O que a caixa reporta a cada ciclo:
  versao_code int,                            -- versionCode do APK instalado
  versao_nome text,
  modelo text,
  ip text,
  visto_em timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists tv_disp_token_uk on public.tv_dispositivos (token_hash) where token_hash is not null;
create unique index if not exists tv_disp_codigo_uk on public.tv_dispositivos (codigo_ativacao) where codigo_ativacao is not null;

-- ── Versões publicadas do APK ───────────────────────────────────────────────
-- A "versão atual da frota" é a `publicada = true` de maior `version_code`.
-- O APK tem de ser assinado com a MESMA keystore interna, senão o device owner
-- recusa o update silencioso (é update, não instalação nova).
create table if not exists public.tv_versoes (
  id uuid primary key default gen_random_uuid(),
  version_code int not null,
  version_name text not null,
  url text not null,                          -- APK acessível por HTTPS
  sha256 text not null,                       -- a caixa confere antes de instalar
  notas text,
  obrigatoria boolean not null default false, -- true = instala assim que baixa
  publicada boolean not null default true,
  por_nome text,                              -- quem publicou (auditoria)
  criada_em timestamptz not null default now()
);
create index if not exists tv_versoes_atual_ix on public.tv_versoes (publicada, version_code desc);

-- ── Fila de comandos (por aparelho) ─────────────────────────────────────────
-- Broadcast ("todas as TVs") é expandido pelo servidor em uma linha por
-- aparelho — assim o status de entrega/execução é rastreável por caixa, e um
-- aparelho offline simplesmente pega o comando quando voltar.
create table if not exists public.tv_comandos (
  id uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null references public.tv_dispositivos(id) on delete cascade,
  tipo text not null,                         -- conjunto FECHADO (ver lib/tv-frota.ts)
  args jsonb not null default '{}'::jsonb,
  -- pendente → entregue (a caixa recebeu) → concluido | erro
  status text not null default 'pendente',
  resultado jsonb,                            -- print/log/erro que a caixa devolve
  lote uuid,                                  -- agrupa um broadcast
  por_nome text,                              -- quem mandou (auditoria)
  criado_em timestamptz not null default now(),
  entregue_em timestamptz,
  concluido_em timestamptz
);
create index if not exists tv_comandos_fila_ix on public.tv_comandos (dispositivo_id, status, criado_em);

-- ── Bucket do APK (Storage) ─────────────────────────────────────────────────
-- O console sobe o APK aqui (por URL assinada) e a caixa baixa por HTTPS.
-- Público na LEITURA (a caixa não tem sessão); a ESCRITA é só por URL assinada,
-- que o servidor cria com service_role. APK não é segredo — é o mesmo que você
-- poria num pen drive.
insert into storage.buckets (id, name, public)
values ('apks', 'apks', true)
on conflict (id) do update set public = true;
