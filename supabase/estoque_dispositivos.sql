-- ── Estoque: aparelho do galpão (leitor Android) ─────────────────────────────
-- Rode no Supabase NOVO (o mesmo do estoque_itens / ponto / recebimento).
-- Idempotente: rodar duas vezes não faz mal.
--
-- Pré-requisito: supabase/estoque_hierarquia_unidades.sql e supabase/recebimento.sql
-- já rodados — este arquivo referencia estoque_locais e é o mesmo domínio de
-- estoque_unidades/compras.
--
-- RODE O ARQUIVO INTEIRO, de uma vez (begin/commit protege contra ficar
-- parado no meio, com uma tabela criada e a outra não).

begin;

-- ── 1. Dispositivos ──────────────────────────────────────────────────────────
-- Um leitor por aparelho físico. Mesmo desenho do device auth do TridiMarket
-- (app/api/tridimarket/device/_device.ts): nunca o token em claro, só o hash —
-- vazar esta tabela não dá a ninguém um token válido, só o que já era público
-- (nome do aparelho).
create table if not exists public.estoque_dispositivos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  token_hash      text unique,              -- nunca o token em claro
  codigo_ativacao text unique,               -- de uso único, some ao ativar
  local_id        uuid references public.estoque_locais(id) on delete set null,
  ativo           boolean not null default true,
  ativado_em      timestamptz,
  visto_em        timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists estoque_dispositivos_local_idx on public.estoque_dispositivos (local_id);

-- ── 2. Idempotência da fila offline ───────────────────────────────────────────
-- O leitor guarda a operação (baixa ou recebimento) numa fila local e reenvia
-- quando a rede volta, com o MESMO operation_id. Sem esta tabela, um reenvio
-- por queda de rede no meio da resposta tiraria a mesma chapa do estoque duas
-- vezes (ou daria entrada em dobro) — o servidor confirma, a confirmação se
-- perde, o leitor reenvia achando que não chegou.
create table if not exists public.estoque_operacoes (
  operation_id   uuid primary key,          -- gerado no aparelho
  dispositivo_id uuid references public.estoque_dispositivos(id) on delete set null,
  tipo           text not null check (tipo in ('baixa','recebimento')),
  resultado      jsonb,                     -- a resposta original, devolvida no replay
  criado_em      timestamptz not null default now()
);
create index if not exists estoque_operacoes_dispositivo_idx on public.estoque_operacoes (dispositivo_id, criado_em desc);

-- ── 3. Código de acesso do operador (login offline no leitor) ────────────────
-- O leitor precisa reconhecer QUEM está bipando sem rede — igual ao totem do
-- TridiMarket, que resolve isto com `funcionarios.codigo_acesso` (ver
-- app/api/tridimarket/device/_sessao.ts). O ERP não tem equivalente: os
-- colaboradores daqui entram pelo login normal (usuário+senha), que não dá
-- pra digitar num leitor de galpão nem verificar offline. Por isso este código
-- curto é UM A MAIS, só para autenticar no aparelho — não substitui a senha do
-- ERP e não abre mais nada além do leitor.
--
-- Único (entre quem tem código): duas pessoas com o mesmo código tornaria a
-- verificação offline ambígua, e aqui — ao contrário do TridiMarket, onde a
-- mesma pessoa tem conta em empresas diferentes de propósito — não há cenário
-- legítimo para a colisão, então a trava vira constraint de banco, não lógica
-- de desempate.
alter table public.employees add column if not exists codigo_acesso text;
create unique index if not exists employees_codigo_acesso_idx
  on public.employees (codigo_acesso) where codigo_acesso is not null;

-- ── 3b. O que o aparelho conta de si mesmo ───────────────────────────────────
-- O leitor já mandava os dois números em todo heartbeat (quantas operações
-- ainda esperam subir, e qual versão do app está instalada) e o servidor jogava
-- fora: a rota nem lia o corpo. Com o tablet no fundo do galpão acumulando 40
-- operações presas há dois dias, ninguém no escritório tinha como saber.
--
-- `alter` e não `create table` porque a tabela acima usa `if not exists` — quem
-- já rodou este arquivo não voltaria a ganhar coluna nenhuma.
alter table public.estoque_dispositivos
  add column if not exists pendencias  integer,
  add column if not exists app_versao  text;

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
-- Acesso só via service role nas rotas /api/* — RLS bloqueia o resto.
alter table public.estoque_dispositivos enable row level security;
alter table public.estoque_operacoes    enable row level security;

commit;

-- ── 5. Seed de exemplo (NÃO rode em produção sem trocar o nome) ──────────────
-- Cria UM dispositivo com código de ativação "123456" para testar o pareamento
-- do leitor. Descomente, rode uma vez, e troque o código antes de ativar o
-- aparelho de verdade (código de ativação é de uso único — some ao ativar).
--
-- insert into public.estoque_dispositivos (nome, codigo_ativacao)
-- select 'Leitor do galpão — teste', '123456'
-- where not exists (select 1 from public.estoque_dispositivos);
