-- ── TridiChat Posto — canal de WhatsApp Web ─────────────────────────────────
-- Idempotente: pode rodar quantas vezes quiser.
--
-- O Posto é o app da máquina que hospeda vários números pelo WhatsApp Web. As
-- conversas dele entram nas MESMAS tabelas do TridiChat, com um tipo de canal
-- novo. Assim caixa unificada, transferir, respostas prontas, busca, métricas e
-- permissões passam a valer para esses números sem código novo — tabelas
-- separadas seriam um segundo TridiChat ao lado do primeiro.

-- 1) O tipo de canal ────────────────────────────────────────────────────────
alter table public.tridichat_canais drop constraint if exists tridichat_canais_tipo_check;
alter table public.tridichat_canais add constraint tridichat_canais_tipo_check
  check (tipo in ('whatsapp', 'instagram', 'whatsapp_web'));

-- 2) Qual número do Posto é este canal ──────────────────────────────────────
-- O id vem do cadastro do app ("comercial", "suporte"). É o que amarra o que a
-- máquina captura ao canal certo aqui.
alter table public.tridichat_canais
  add column if not exists posto_numero_id text;

-- Um canal por número do Posto. Sem isto, uma reinstalação do app criaria um
-- canal novo e a conversa da mesma pessoa apareceria duplicada na caixa.
create unique index if not exists tridichat_canais_posto_idx
  on public.tridichat_canais (posto_numero_id)
  where posto_numero_id is not null;

-- 3) Saúde da captura ───────────────────────────────────────────────────────
-- O Posto reporta o estado de cada número. Fica no canal porque é exatamente
-- o que a tela de Canais precisa mostrar: este número está capturando ou parou?
alter table public.tridichat_canais
  add column if not exists posto_estado text,
  add column if not exists posto_visto_em timestamptz,
  add column if not exists posto_versao_seletores integer;

comment on column public.tridichat_canais.posto_estado is
  'iniciando | qr | capturando | degradado. "degradado" = o DOM do WhatsApp Web mudou e a captura PAROU.';

-- 4) De onde veio a mensagem ────────────────────────────────────────────────
-- Mensagem capturada pelo Posto NÃO é igual à que veio pela API oficial: ela
-- pode ter buraco (o app estava fechado), o carimbo é lido da tela e não há
-- garantia de entrega. Marcar a origem deixa isso explícito para quem lê o
-- histórico depois — e para qualquer relatório que não deva misturar as duas.
alter table public.tridichat_mensagens
  add column if not exists origem_captura text;

create index if not exists tridichat_mensagens_origem_idx
  on public.tridichat_mensagens (origem_captura)
  where origem_captura is not null;
