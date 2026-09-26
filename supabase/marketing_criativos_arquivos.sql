-- ══════════════════════════════════════════════════════════════════════════════
-- MARKETING · GERAL — BIBLIOTECA DE CRIATIVOS (rodar 1x; idempotente)
--
-- O `marketing_criativos.sql` dizia, em letras maiúsculas, "NADA de arquivo no
-- banco", e o `VideoCriativo.tsx` chamava o campo `video_url` de "gancho pro
-- dia em que o upload nascer dentro do Gaius". Este arquivo é esse dia.
--
-- Continua valendo que NADA de bytes entra no Postgres: o arquivo mora no
-- Backblaze B2, no bucket privado, e aqui fica só o ENDEREÇO dele mais o que a
-- tela precisa pra listar sem baixar nada (tipo, tamanho, dimensão, duração,
-- formato). A diferença pro `video_url` de antes é que o endereço agora é
-- NOSSO: `/api/arquivos/criativos/aaaa/mm/<uuid>.<ext>`, que só abre com sessão
-- e permissão de marketing, em vez de um link do Drive que qualquer um abre.
--
-- ── Por que tabela FILHA e não colunas em marketing_criativos ────────────────
-- Uma peça quase nunca é um arquivo só: a mesma campanha sai em 1:1 pro feed,
-- 4:5 pro Instagram e 9:16 pro story, e às vezes com duas versões de corte.
-- Coluna única forçaria escolher uma e perder o resto, ou criar
-- arquivo1/arquivo2/arquivo3 — que é o mesmo erro com mais passos.
--
-- ── Por que `chave` E `url` ─────────────────────────────────────────────────
-- `url` é o que a tela usa (img src, video src, download). `chave` é o que
-- APAGA o objeto no B2. Guardar só a url obrigaria a fatiar string na hora de
-- excluir, e string fatiada errado apaga o arquivo de outra pessoa.
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.marketing_criativos_arquivos (
  id           uuid primary key default gen_random_uuid(),
  criativo_id  uuid not null references public.marketing_criativos(id) on delete cascade,

  -- Endereço servido pela rota autenticada. É isto que vai em `src`/`href`.
  url          text not null,
  -- Chave crua no B2 (`criativos/aaaa/mm/<uuid>.<ext>`) — usada só pra apagar.
  chave        text not null,

  nome         text not null,                     -- nome original do arquivo
  mime         text not null,
  tipo         text not null,                     -- imagem|video
  tamanho      bigint not null,                   -- bytes (o teto é do app: 8 MB imagem, 30 MB vídeo)

  -- Medidos no navegador antes de subir. Ficam nulos quando o navegador não
  -- consegue decodificar — arquivo sem medida ENTRA na biblioteca do mesmo
  -- jeito, só aparece sem rótulo de formato.
  largura      integer,
  altura       integer,
  duracao      numeric(6,1),                      -- segundos (só vídeo)
  formato      text not null default 'outro',     -- 1:1|4:5|9:16|16:9|outro

  -- A peça que representa o criativo na lista e na capa. No máximo uma por
  -- criativo — a trava é o índice único parcial lá embaixo.
  principal    boolean not null default false,

  autor_id     uuid,
  autor_nome   text,
  created_at   timestamptz not null default now()
);

-- Listagem por criativo, mais novo primeiro.
create index if not exists marketing_criativos_arquivos_ref
  on public.marketing_criativos_arquivos (criativo_id, created_at desc);

-- Uma capa por criativo. Índice PARCIAL: só as linhas com principal = true
-- disputam, então continua dando pra ter N arquivos comuns.
create unique index if not exists marketing_criativos_arquivos_principal
  on public.marketing_criativos_arquivos (criativo_id)
  where principal;

-- O mesmo objeto do B2 não pode ser registrado duas vezes (clique duplo no
-- botão de salvar, ou retry da rede depois do POST ter chegado).
create unique index if not exists marketing_criativos_arquivos_chave
  on public.marketing_criativos_arquivos (chave);

-- RLS ligada e SEM policy, igual ao resto do módulo: todo acesso passa pelas
-- rotas /api/marketing/criativos/arquivos, que já conferem a área do marketing
-- e usam service_role. Ligar aqui só fecha a porta da chave anônima.
alter table public.marketing_criativos_arquivos enable row level security;

comment on table public.marketing_criativos_arquivos is
  'Biblioteca de Criativos: arquivos (imagem/vídeo curto) de cada criativo. Bytes no Backblaze B2; aqui só o endereço e os metadados de exibição.';
comment on column public.marketing_criativos_arquivos.chave is
  'Chave no bucket privado do B2. É o que apaga o objeto — não fatiar a url pra obter isto.';
comment on column public.marketing_criativos_arquivos.principal is
  'Capa do criativo (máx. 1 por criativo, garantido por índice único parcial).';
