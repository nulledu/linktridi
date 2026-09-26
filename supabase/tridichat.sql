-- ═══════════════════════════════════════════════════════════════════════════
-- TridiChat — atendimento e automações por WhatsApp Cloud API / Instagram
-- Messaging API (APIs OFICIAIS da Meta).
--
-- Módulo PRÓPRIO, separado do TridiFlow. Os dois se integram pelo contato:
-- um fluxo do TridiFlow que manda a pessoa pro WhatsApp chega aqui já
-- identificado (tridichat_contatos.tridiflow_sessao_id + origem).
--
-- Rode INTEIRO no SQL Editor do Supabase do Gaius. É idempotente: pode rodar de
-- novo sem quebrar nada.
--
-- SEM RLS, igual ao resto do projeto: quem toca no banco é sempre o servidor com
-- a service_role. O controle de acesso é no app (lib/areas.ts + require-auth),
-- e o webhook da Meta não tem sessão — ele se autentica por assinatura.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Canais ───────────────────────────────────────────────────────────────
-- Uma linha por conta conectada. Tabela NORMAL de propósito: a meta_token tem
-- `check (id = 1)` e por isso lib/meta-tokens.ts precisa serializar um array
-- dentro da coluna. Aqui já nasce multi-conta — custo hoje é zero, e migrar
-- tabela viva depois seria caro.
create table if not exists public.tridichat_canais (
  id                uuid        primary key default gen_random_uuid(),
  tipo              text        not null check (tipo in ('whatsapp','instagram')),
  nome              text        not null,
  status            text        not null default 'desconectado'
                                check (status in ('desconectado','conectado','erro')),

  -- Identificadores da Meta (whatsapp)
  phone_number_id   text,
  waba_id           text,                    -- WhatsApp Business Account
  telefone          text,                    -- E.164, só para exibir

  -- Identificadores da Meta (instagram)
  ig_user_id        text,
  page_id           text,                    -- página do Facebook vinculada

  app_id            text,

  -- SEGREDOS. Nunca saem numa resposta de API — ver lib/tridichat/canais.ts,
  -- que só devolve os 4 últimos caracteres.
  token             text,
  verify_token      text,
  app_secret        text,

  conectado_em      timestamptz,
  ultima_sync_em    timestamptz,
  erro              text,
  ativo             boolean     not null default true,
  criado_por        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Um phone_number_id / ig_user_id pertence a UM canal. Parcial porque o outro
-- tipo deixa a coluna nula.
create unique index if not exists tridichat_canais_wa_idx
  on public.tridichat_canais (phone_number_id) where phone_number_id is not null;
create unique index if not exists tridichat_canais_ig_idx
  on public.tridichat_canais (ig_user_id) where ig_user_id is not null;

-- ── 2) Contatos ─────────────────────────────────────────────────────────────
-- NÃO existe tabela de clientes neste sistema (cliente é texto solto dentro do
-- pedido). Então o contato é o cadastro de pessoa: dedupe por identificador do
-- canal, com ligação OPCIONAL pro lead e pro pedido do ERP legado.
create table if not exists public.tridichat_contatos (
  id                  uuid        primary key default gen_random_uuid(),
  canal_id            uuid        not null references public.tridichat_canais(id) on delete cascade,
  identificador       text        not null,  -- wa_id (telefone sem +) ou IGSID
  nome                text,
  telefone            text,
  instagram_usuario   text,
  foto_url            text,

  lead_id             uuid,                  -- comercial_leads.id
  pedido_ref          text,                  -- id do pedido no ERP legado (texto)
  responsavel_id      uuid,                  -- profiles.id

  origem              text,                  -- whatsapp | instagram | tridiflow | manual
  tridiflow_sessao_id uuid,                  -- ponte TridiFlow → TridiChat
  observacoes         text,
  ultima_interacao_em timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Evita contato duplicado: é ESTE índice que segura a corrida de duas mensagens
-- chegando em 200ms (não há transação nem lock neste projeto — a trava é o UNIQUE).
create unique index if not exists tridichat_contatos_ident_idx
  on public.tridichat_contatos (canal_id, identificador);
create index if not exists tridichat_contatos_telefone_idx
  on public.tridichat_contatos (telefone) where telefone is not null;
create index if not exists tridichat_contatos_lead_idx
  on public.tridichat_contatos (lead_id) where lead_id is not null;

-- ── 3) Conversas ────────────────────────────────────────────────────────────
create table if not exists public.tridichat_conversas (
  id                  uuid        primary key default gen_random_uuid(),
  canal_id            uuid        not null references public.tridichat_canais(id) on delete cascade,
  contato_id          uuid        not null references public.tridichat_contatos(id) on delete cascade,

  status              text        not null default 'aberta'
                                  check (status in ('aberta','aguardando','em_atendimento','resolvida','arquivada')),

  -- 'bot' = automação pode falar. 'humano' = alguém assumiu e o robô CALA.
  -- A automação faz UPDATE ... WHERE modo='bot' antes de enviar (CAS otimista):
  -- se a vendedora assumiu no meio, o update não casa e o bot não fala por cima.
  modo                text        not null default 'bot' check (modo in ('bot','humano')),
  responsavel_id      uuid,                  -- profiles.id
  assumida_por        uuid,                  -- profiles.id de quem assumiu
  assumida_em         timestamptz,
  automacao_pausada   boolean     not null default false,

  nao_lidas           integer     not null default 0,
  ultima_mensagem_em  timestamptz,
  ultima_mensagem_previa text,

  -- JANELA DE 24H DO WHATSAPP. `ultima_entrada_em` vem do timestamp que a META
  -- manda no payload — NUNCA de now(): o webhook pode chegar minutos depois ou
  -- ser reprocessado, e errar isso faz o envio falhar com 131047 ou pagar por
  -- uma conversa que estava aberta.
  ultima_entrada_em   timestamptz,
  janela_expira_em    timestamptz,

  resolvida_em        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Uma conversa por contato por canal — a trava contra thread duplicada.
create unique index if not exists tridichat_conversas_unica_idx
  on public.tridichat_conversas (canal_id, contato_id);
-- Acesso da caixa de entrada: filtra por status, ordena por atividade.
create index if not exists tridichat_conversas_caixa_idx
  on public.tridichat_conversas (status, ultima_mensagem_em desc);
create index if not exists tridichat_conversas_resp_idx
  on public.tridichat_conversas (responsavel_id, ultima_mensagem_em desc) where responsavel_id is not null;
-- "Quais conversas vão fechar a janela?" — sem índice isso vira varredura.
create index if not exists tridichat_conversas_janela_idx
  on public.tridichat_conversas (janela_expira_em) where janela_expira_em is not null;

-- ── 4) Mensagens ────────────────────────────────────────────────────────────
create table if not exists public.tridichat_mensagens (
  id                  uuid        primary key default gen_random_uuid(),
  conversa_id         uuid        not null references public.tridichat_conversas(id) on delete cascade,
  canal_id            uuid        not null references public.tridichat_canais(id) on delete cascade,

  provider_message_id text,                  -- wamid da Meta
  direcao             text        not null check (direcao in ('recebida','enviada')),
  remetente           text        not null check (remetente in ('contato','atendente','automacao','sistema')),
  autor_id            uuid,                  -- profiles.id quando remetente='atendente'

  tipo                text        not null default 'texto'
                                  check (tipo in ('texto','imagem','video','audio','documento',
                                                  'botao','lista','template','localizacao','desconhecido')),
  texto               text,
  midia_path          text,                  -- caminho no bucket PRIVADO tridichat-midia
  midia_mime          text,
  midia_nome          text,
  midia_tamanho       integer,
  template_nome       text,

  status              text        not null default 'pendente'
                                  check (status in ('pendente','enviada','entregue','lida','falhou')),
  erro_codigo         text,
  erro                text,
  payload             jsonb,                 -- payload original do evento

  -- Chave de idempotência do ENVIO (gerada pelo cliente/motor antes de mandar).
  -- Impede que um retry crie duas mensagens para o cliente.
  idempotencia        text,

  enviada_em          timestamptz,
  entregue_em         timestamptz,
  lida_em             timestamptz,
  created_at          timestamptz not null default now()
);

-- IDEMPOTÊNCIA DO RECEBIMENTO. A Meta retenta por dias; sem isto a mesma
-- mensagem entra duas vezes na thread.
-- Sem `where`: índice parcial não serve para ON CONFLICT (42P10). Não precisa
-- do filtro mesmo — no Postgres dois NULL são DISTINTOS num índice único, então
-- as mensagens de saída (que ainda não têm wamid) não conflitam entre si.
drop index if exists public.tridichat_mensagens_provider_idx;
create unique index if not exists tridichat_mensagens_provider_idx
  on public.tridichat_mensagens (canal_id, provider_message_id);
-- IDEMPOTÊNCIA DO ENVIO. Mesma regra.
drop index if exists public.tridichat_mensagens_idem_idx;
create unique index if not exists tridichat_mensagens_idem_idx
  on public.tridichat_mensagens (idempotencia);
-- Leitura da thread (mais recentes primeiro, com cursor).
create index if not exists tridichat_mensagens_thread_idx
  on public.tridichat_mensagens (conversa_id, created_at desc);

-- ── 5) Eventos recebidos = a FILA ───────────────────────────────────────────
-- O webhook grava aqui e responde 200 na hora. Quem processa é o drenador
-- (after() do Next + o PC que já roda worker/worker.py 24h + cron de segurança).
-- Desenho copiado de market_worker_jobs; a IMPLEMENTAÇÃO de lá está quebrada
-- (insere 'queued' num CHECK que só aceita 'pendente'), então só o desenho vale.
create table if not exists public.tridichat_eventos (
  id              uuid        primary key default gen_random_uuid(),
  canal_id        uuid        references public.tridichat_canais(id) on delete set null,
  -- NOT NULL de propósito: é a chave de deduplicação. Quando o provedor não
  -- manda id, quem enfileira gera um hash do payload — nunca deixa nulo.
  evento_id       text        not null,
  tipo            text        not null default 'desconhecido',  -- mensagem | status | desconhecido
  payload         jsonb       not null,      -- payload ORIGINAL, sempre salvo
  status          text        not null default 'pendente'
                              check (status in ('pendente','processando','ok','erro')),
  tentativas      integer     not null default 0,
  erro            text,
  processar_em    timestamptz not null default now(),   -- backoff: empurra pra frente
  reivindicado_em timestamptz,
  processado_em   timestamptz,
  created_at      timestamptz not null default now()
);

-- Dedupe do webhook: o mesmo evento reentregue vira no-op.
--
-- NÃO pode ser índice PARCIAL nem incluir coluna nula: `ON CONFLICT (cols)` só
-- casa com índice único TOTAL, e um índice parcial faz o Postgres devolver
-- 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") — o upsert falharia e o dedupe não existiria na prática.
-- O wamid da Meta já é único globalmente, então (evento_id) sozinho basta.
drop index if exists public.tridichat_eventos_dedupe_idx;
create unique index if not exists tridichat_eventos_dedupe_idx
  on public.tridichat_eventos (evento_id);
-- Índice PARCIAL: o drenador só olha o que está pendente e já venceu.
create index if not exists tridichat_eventos_fila_idx
  on public.tridichat_eventos (processar_em) where status = 'pendente';

-- Quem rodou a primeira versão deste arquivo tem `evento_id` nullable: alinha.
-- (Não há linha antiga para migrar; a tabela nasceu vazia.)
delete from public.tridichat_eventos where evento_id is null;
alter table public.tridichat_eventos alter column evento_id set not null;

-- ── 6) Automações ───────────────────────────────────────────────────────────
-- `gatilho` e `etapas` são JSON validado por zod em lib/tridichat/automacao-schema.ts.
-- Publicar CONGELA a versão: execuções em andamento continuam na versão que
-- começaram, senão editar um fluxo mudaria conversa que já está no meio.
create table if not exists public.tridichat_automacoes (
  id            uuid        primary key default gen_random_uuid(),
  nome          text        not null,
  descricao     text,
  canal_id      uuid        references public.tridichat_canais(id) on delete set null,  -- null = qualquer canal
  status        text        not null default 'rascunho'
                            check (status in ('rascunho','publicada','pausada')),
  gatilho       jsonb       not null default '{}'::jsonb,
  etapas        jsonb       not null default '[]'::jsonb,
  versao        integer     not null default 1,
  publicada_em  timestamptz,
  criado_por    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tridichat_automacoes_ativas_idx
  on public.tridichat_automacoes (status) where status = 'publicada';

-- ── 7) Execuções da automação ───────────────────────────────────────────────
create table if not exists public.tridichat_execucoes (
  id                  uuid        primary key default gen_random_uuid(),
  automacao_id        uuid        not null references public.tridichat_automacoes(id) on delete cascade,
  versao              integer     not null default 1,
  conversa_id         uuid        not null references public.tridichat_conversas(id) on delete cascade,
  contato_id          uuid        not null references public.tridichat_contatos(id) on delete cascade,

  etapa_atual         text,
  contexto            jsonb       not null default '{}'::jsonb,   -- variáveis do fluxo
  status              text        not null default 'ativa'
                                  check (status in ('ativa','esperando_resposta','esperando_tempo',
                                                    'concluida','cancelada','erro')),
  proxima_execucao_em timestamptz,            -- "esperar 2 dias" vive aqui, não no navegador
  -- Trava anti-loop: fluxo que se aponta em círculo para no teto em vez de
  -- rodar para sempre gastando envio real.
  passos_executados   integer     not null default 0,
  erro                text,
  reivindicada_em     timestamptz,
  iniciada_em         timestamptz not null default now(),
  concluida_em        timestamptz
);

-- Uma execução VIVA por automação/conversa: impede disparar o mesmo fluxo duas
-- vezes para a mesma pessoa.
create unique index if not exists tridichat_execucoes_unica_idx
  on public.tridichat_execucoes (automacao_id, conversa_id)
  where status in ('ativa','esperando_resposta','esperando_tempo');
create index if not exists tridichat_execucoes_fila_idx
  on public.tridichat_execucoes (proxima_execucao_em)
  where status in ('ativa','esperando_tempo');
create index if not exists tridichat_execucoes_conversa_idx
  on public.tridichat_execucoes (conversa_id);

-- ── 8) Tags ─────────────────────────────────────────────────────────────────
-- Não existe sistema de tags em nenhum domínio do sistema — nasce aqui.
create table if not exists public.tridichat_tags (
  id         uuid        primary key default gen_random_uuid(),
  nome       text        not null,
  cor        text,
  created_at timestamptz not null default now()
);
create unique index if not exists tridichat_tags_nome_idx on public.tridichat_tags (lower(nome));

create table if not exists public.tridichat_contato_tags (
  contato_id uuid        not null references public.tridichat_contatos(id) on delete cascade,
  tag_id     uuid        not null references public.tridichat_tags(id) on delete cascade,
  criada_em  timestamptz not null default now(),
  primary key (contato_id, tag_id)
);

-- ── 9) Templates do WhatsApp (espelho do que está aprovado na Meta) ─────────
create table if not exists public.tridichat_templates (
  id               uuid        primary key default gen_random_uuid(),
  canal_id         uuid        not null references public.tridichat_canais(id) on delete cascade,
  nome             text        not null,
  idioma           text        not null default 'pt_BR',
  categoria        text,
  status           text,                     -- APPROVED | PENDING | REJECTED (como vem da Meta)
  corpo            jsonb,                    -- components da Meta
  variaveis        integer     not null default 0,
  sincronizado_em  timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists tridichat_templates_unico_idx
  on public.tridichat_templates (canal_id, nome, idioma);

-- ── 10) Log estruturado ─────────────────────────────────────────────────────
-- Sem isto, "a mensagem não chegou no cliente" é indebugável. Espelha o padrão
-- de meta_sync_logs (ok, http_status, erro, fbtrace_id, duracao_ms).
create table if not exists public.tridichat_log (
  id           bigserial   primary key,
  canal_id     uuid,
  conversa_id  uuid,
  mensagem_id  uuid,
  acao         text        not null,         -- webhook_recebido | enviar | status | automacao_etapa …
  ok           boolean     not null default true,
  http_status  integer,
  erro_codigo  text,
  erro         text,
  fbtrace_id   text,
  duracao_ms   integer,
  detalhe      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists tridichat_log_recente_idx on public.tridichat_log (created_at desc);
create index if not exists tridichat_log_falhas_idx  on public.tridichat_log (created_at desc) where ok = false;

-- ── 11) Bucket PRIVADO de mídia ─────────────────────────────────────────────
-- Privado de propósito: áudio e documento de cliente não podem ficar acessíveis
-- por URL adivinhável. O bucket `photos` que o /api/upload usa é PÚBLICO.
-- A leitura na tela passa por rota autenticada que gera URL assinada.
insert into storage.buckets (id, name, public)
  values ('tridichat-midia', 'tridichat-midia', false)
  on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- Pronto. Depois de rodar:
--   1. Abra TridiChat → Configurações de canais e cadastre o número.
--   2. SÓ ENTÃO aponte a URL do webhook na Meta. Nesta ordem: se o webhook
--      apontar para um schema que não existe, a Meta retenta, DESATIVA a
--      inscrição e as mensagens daquele intervalo não voltam.
-- ═══════════════════════════════════════════════════════════════════════════
