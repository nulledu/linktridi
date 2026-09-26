-- ── Auth: LINK de primeiro acesso ────────────────────────────────────────────
-- Rode no Supabase NOVO (o mesmo do ERP / profiles).
-- Idempotente: rodar duas vezes não faz mal. Seguro rodar mesmo que a versão
-- anterior deste arquivo (a da "janela de 72h") já tenha sido aplicada.
--
-- POR QUE: o onboarding era "sem senha até o primeiro login" — a PRIMEIRA senha
-- digitada virava a senha da pessoa. O segredo, na prática, era o NOME DE
-- USUÁRIO; e nome de usuário é o nome da pessoa. Qualquer um adivinhava o de
-- quem ainda não tinha entrado e tomava a conta. Havia 12 contas assim.
--
-- A primeira correção foi dar PRAZO a esse cadastro aberto. Resolvia a
-- segurança, mas criava pressa: com dezenas de pessoas ainda sem conta, virava
-- corrida contra o relógio.
--
-- Este é o desenho definitivo: quem autoriza é um LINK que o admin gera e envia
-- (WhatsApp, pessoalmente, como for). A pessoa abre, escolhe a senha, pronto.
-- Conta pendente deixa de ser conta aberta: sem link gerado, NINGUÉM entra —
-- não importa quantos meses ela fique esperando. Não depende de e-mail, o que
-- importa aqui porque metade das pessoas não tem e-mail cadastrado.
--
-- RODE O ARQUIVO INTEIRO de uma vez.

begin;

-- O banco guarda só o HASH do token; o link em si é mostrado uma vez a quem o
-- gerou e nunca fica salvo. Vazar `profiles` não entrega link utilizável.
alter table public.profiles
  add column if not exists primeiro_acesso_token_hash text,
  add column if not exists primeiro_acesso_usado_em   timestamptz,
  -- Vencimento do link (a coluna é a mesma da versão anterior, com sentido novo:
  -- antes era "até quando qualquer um pode reivindicar", agora é "até quando
  -- ESTE link funciona").
  add column if not exists primeiro_acesso_expira_em  timestamptz;

-- Busca do link é por hash: índice próprio.
create unique index if not exists profiles_primeiro_acesso_token_idx
  on public.profiles (primeiro_acesso_token_hash)
  where primeiro_acesso_token_hash is not null;

-- FECHA O QUE A VERSÃO ANTERIOR TINHA ABERTO. Se a "janela de 72h" chegou a
-- rodar, havia contas com prazo aberto para cadastro ANÔNIMO — que este desenho
-- não usa mais. Zerar é o que garante que ninguém continue reivindicável por um
-- prazo herdado. Quem precisa entrar recebe um link.
update public.profiles
   set primeiro_acesso_expira_em = null
 where primeiro_acesso_token_hash is null
   and primeiro_acesso_expira_em is not null;

commit;

-- ── Conferir depois de rodar ─────────────────────────────────────────────────
-- Quem ainda não tem senha (candidatos a receber um link):
--
--   select username, name, role,
--          case when primeiro_acesso_token_hash is null then 'sem link'
--               when primeiro_acesso_usado_em is not null then 'link já usado'
--               when primeiro_acesso_expira_em <= now() then 'link vencido'
--               else 'link válido até ' || primeiro_acesso_expira_em::text
--          end as situacao
--     from public.profiles
--    where active and password_set is not true
--    order by name;
--
-- Ninguém deve aparecer com prazo aberto sem link — se aparecer, rode de novo.
--
-- Cancelar um link já enviado (a pessoa perdeu o celular, mandou pro contato
-- errado): basta apagar o hash; o link deixa de valer na hora.
--
--   update public.profiles set primeiro_acesso_token_hash = null
--    where username = 'fulano';
