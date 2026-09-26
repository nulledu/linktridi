-- ─────────────────────────────────────────────────────────────────────────────
-- Comissão dos gestores de tráfego
-- Rodar no Supabase NOVO (tzariztovuuwyeoogbxg). Idempotente: pode rodar de novo.
--
-- NÃO HÁ MUDANÇA DE SCHEMA nesta feature. Os acordos moram na chave `comissoes`
-- do jsonb `marketing_config.data` (id = 1) — a mesma linha que já guarda teto,
-- custos, metas e regras do Tráfego. O jeito normal de cadastrar é pela tela
-- (Tráfego › card "Comissão do gestor" › engrenagem, só admin).
--
-- Este arquivo existe para três coisas:
--   1) garantir que a tabela está de pé (passo 1);
--   2) ver o que está gravado hoje (passo 2);
--   3) cadastrar/alterar os acordos por SQL, se preferir (passo 4).
--
-- FORMATO DE UM ACORDO
--   id              texto curto e único (ex.: "caio", "g2")
--   nome            o que aparece na tela
--   pessoaId        employees.id (= profiles.id) de quem recebe · null = sem dono
--   pctFaturamento  % sobre o faturamento do TRÁFEGO PAGO   (0.8 = 0,8%)
--   pctEficiencia   % do faturamento TOTAL no fator          (30 = 30%)
--   ativa           false tira da conta sem apagar o histórico
--
--   Comissão = (F_TP × pctFaturamento) × ((pctEficiencia × F_Total) ÷ G_TP)
--   F_TP = faturamento do tráfego · F_Total = da empresa · G_TP = gasto + imposto
--
-- ATENÇÃO AO `pessoaId`: é ele que faz o gestor ver SÓ a comissão dele no
-- Tráfego e o valor aparecer na ficha da pessoa no Financeiro. Acordo sem
-- pessoa vinculada só o admin enxerga, e não aparece no Financeiro.
--
-- E ATENÇÃO À AUSÊNCIA DA CHAVE: `comissoes` ausente (nunca configurado) faz o
-- sistema mostrar o acordo histórico de sempre (0,8% / 30%, sem dono). Uma
-- lista VAZIA (`'[]'`) é escolha diferente: significa "ninguém recebe", e o
-- card passa a mostrar isso. Os dois casos são de propósito.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1) A tabela (já deve existir; roda sem estragar nada) ───────────────────
create table if not exists public.marketing_config (
  id  int primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.marketing_config (id, data)
values (1, '{"teto":0,"contas":{}}'::jsonb)
on conflict (id) do nothing;


-- ── 2) O que está gravado hoje ──────────────────────────────────────────────
-- Sem linha nenhuma = nunca configurado = vale o acordo histórico.
select
  c.value ->> 'id'                        as id,
  c.value ->> 'nome'                      as nome,
  c.value ->> 'pessoaId'                  as pessoa_id,
  (c.value ->> 'pctFaturamento')::numeric as pct_faturamento,
  (c.value ->> 'pctEficiencia')::numeric  as pct_eficiencia,
  (c.value ->> 'ativa')::boolean          as ativa
from public.marketing_config m
cross join lateral jsonb_array_elements(coalesce(m.data -> 'comissoes', '[]'::jsonb)) as c(value)
where m.id = 1;


-- ── 3) Achar o id de cada gestor (é o que vai em `pessoaId`) ────────────────
-- `profiles.id` e `employees.id` são o MESMO id — por isso um campo só serve
-- para o Tráfego e para o Financeiro.
select p.id, p.name, p.username, e.cargo, e.setor
from public.profiles p
left join public.employees e on e.id = p.id
where p.active
  and (p.name ilike '%trafego%' or p.name ilike '%tráfego%'
       or e.cargo ilike '%tráfego%' or e.cargo ilike '%trafego%'
       or e.setor ilike '%marketing%')
order by p.name;
-- Não achou? Tire o WHERE e procure a pessoa na lista inteira.


-- ── 4) Cadastrar os acordos (OPCIONAL — a tela faz o mesmo) ─────────────────
-- Substitui a lista INTEIRA. Troque os ids pelos que saíram no passo 3 e
-- descomente. Deixar `pessoaId` como null é válido, mas aí só o admin vê o
-- acordo e ele não aparece no Financeiro.
--
-- update public.marketing_config
-- set data = jsonb_set(data, '{comissoes}', $$[
--       {
--         "id": "g1",
--         "nome": "Gestor de tráfego · Caio",
--         "pessoaId": "COLE-AQUI-O-UUID-DO-PASSO-3",
--         "pctFaturamento": 0.8,
--         "pctEficiencia": 30,
--         "ativa": true
--       },
--       {
--         "id": "g2",
--         "nome": "Gestor de tráfego · Segundo",
--         "pessoaId": "COLE-AQUI-O-OUTRO-UUID",
--         "pctFaturamento": 0.6,
--         "pctEficiencia": 30,
--         "ativa": true
--       }
--     ]$$::jsonb, true),
--     updated_at = now()
-- where id = 1;


-- ── 5) Voltar atrás ─────────────────────────────────────────────────────────
-- Apagar a chave devolve o comportamento antigo (um acordo, 0,8% / 30%):
--
-- update public.marketing_config set data = data - 'comissoes', updated_at = now() where id = 1;
--
-- Já `'[]'` (lista vazia) é o contrário: diz explicitamente que ninguém recebe.
--
-- update public.marketing_config set data = jsonb_set(data, '{comissoes}', '[]'::jsonb, true), updated_at = now() where id = 1;
