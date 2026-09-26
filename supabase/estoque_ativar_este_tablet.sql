-- ── Ativar o leitor do galpão — TUDO que falta, numa colada só ───────────────
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode. Ele:
--   1. cria as tabelas do aparelho (o mesmo de estoque_dispositivos.sql);
--   2. cadastra ESTE tablet (E1035) com um código de ativação;
--   3. dá código de leitor aos três admins, pra dar pra logar na hora.
--
-- Idempotente: rodar duas vezes não duplica nada.
--
-- Pré-requisito JÁ ATENDIDO: supabase/estoque_hierarquia_unidades.sql está
-- rodado (conferido — estoque_locais, estoque_unidades e as colunas novas de
-- estoque_itens já existem, com 192 itens no catálogo).

begin;

-- ── 1. Dispositivos ──────────────────────────────────────────────────────────
-- Nunca o token em claro, só o hash: vazar esta tabela não dá a ninguém um
-- token válido, só o nome do aparelho — que já não é segredo.
create table if not exists public.estoque_dispositivos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  token_hash      text unique,
  codigo_ativacao text unique,               -- de uso único, some ao ativar
  local_id        uuid references public.estoque_locais(id) on delete set null,
  ativo           boolean not null default true,
  ativado_em      timestamptz,
  visto_em        timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists estoque_dispositivos_local_idx on public.estoque_dispositivos (local_id);

-- ── 2. Idempotência da fila offline ──────────────────────────────────────────
-- O leitor guarda a operação numa fila local e reenvia com o MESMO
-- operation_id quando a rede volta. Sem esta tabela, o servidor confirma, a
-- confirmação se perde no caminho, o aparelho reenvia achando que não chegou —
-- e a mesma chapa sai do estoque duas vezes.
create table if not exists public.estoque_operacoes (
  operation_id   uuid primary key,
  dispositivo_id uuid references public.estoque_dispositivos(id) on delete set null,
  tipo           text not null check (tipo in ('baixa','recebimento')),
  resultado      jsonb,
  criado_em      timestamptz not null default now()
);
create index if not exists estoque_operacoes_dispositivo_idx
  on public.estoque_operacoes (dispositivo_id, criado_em desc);

-- ── 3. Código do operador (login offline no leitor) ──────────────────────────
-- Curto de propósito: é digitado num teclado de galpão, às vezes de luva. NÃO
-- é a senha do ERP e não abre mais nada além do leitor.
alter table public.employees add column if not exists codigo_acesso text;
create unique index if not exists employees_codigo_acesso_idx
  on public.employees (codigo_acesso) where codigo_acesso is not null;

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
alter table public.estoque_dispositivos enable row level security;
alter table public.estoque_operacoes    enable row level security;

-- ── 5. ESTE tablet ───────────────────────────────────────────────────────────
-- E1035, o que era o totem do mercadinho. Código de ativação de uso único:
--
--                        472913
--
insert into public.estoque_dispositivos (nome, codigo_ativacao)
select 'Leitor do galpão (E1035)', '472913'
where not exists (
  select 1 from public.estoque_dispositivos where nome = 'Leitor do galpão (E1035)'
);

-- ── 6. Códigos dos operadores ────────────────────────────────────────────────
-- Os três admins, pra você conseguir entrar no aparelho hoje mesmo. Troque
-- pelos códigos de quem realmente vai bipar — dá pra fazer pela ficha do
-- colaborador (Código do leitor de estoque), sem SQL.
--
-- `where codigo_acesso is null` de propósito: rodar de novo não sobrescreve um
-- código que alguém já trocou na tela.
update public.employees set codigo_acesso = '4071'
 where id = '862eb118-084d-48cc-a12b-287f87946689' and codigo_acesso is null;  -- Caio
update public.employees set codigo_acesso = '5182'
 where id = 'becf5047-6276-417c-8688-86ea07ba4396' and codigo_acesso is null;  -- Douglas Franco
update public.employees set codigo_acesso = '6293'
 where id = '63588fc9-6386-4f8b-a733-51788da1ab37' and codigo_acesso is null;  -- Emanuelly

commit;

-- ── Confere ──────────────────────────────────────────────────────────────────
-- Deve devolver o aparelho com o código, e três pessoas com código.
select nome, codigo_ativacao, ativado_em from public.estoque_dispositivos;
select p.name, e.codigo_acesso
  from public.employees e join public.profiles p on p.id = e.id
 where e.codigo_acesso is not null;
