-- ── Migração: Atividades vira ÁREA PRÓPRIA (Operacional) ───────────────────
-- Antes a tela de Atividades abria pelo CARGO (admin, gerente de produção,
-- gerente de vendas) e as rotas liberavam pelo cargo, pela área Pessoas
-- (`colaboradores`) ou por "Produção › Controle". Agora é a área `atividades`,
-- com três chaves na grade (Pessoas › ficha › Acesso):
--   atividades:ver        — visão geral, quadro, histórico e tempos
--   atividades:atribuir   — criar/atribuir pra qualquer setor, gerar produção
--   atividades:configurar — modelos de produção, catálogo de tarefas e peças
--
-- Ninguém pode perder acesso no dia da virada. Herdam as TRÊS chaves quem
-- abria a tela antes:
--   (a) cargo gerente_producao ou gerente_vendas;
--   (b) área Pessoas ligada (qualquer chave `colaboradores*`);
--   (c) "Produção › Controle" ligado, ou a Produção inteira do modelo antigo
--       (área `true` sem nenhuma sub no mapa — o back-compat concedia o
--       Controle junto).
--
-- Não sobrescreve quem já tem qualquer chave de atividades decidida (true OU
-- false): a decisão da grade manda. Idempotente — rodar de novo não muda nada.
--
-- O código também herda sozinho (`atividadesHerdada()` em lib/areas.ts), então
-- mesmo sem rodar isto ninguém fica trancado do lado de fora. O que este
-- arquivo faz é gravar a herança no banco, pra que os quadradinhos apareçam
-- MARCADOS na ficha — senão o próximo salvamento (que grava o mapa completo)
-- apagaria um acesso que ninguém decidiu tirar.

update public.employees e
set permissoes = coalesce(e.permissoes, '{}'::jsonb) || jsonb_build_object(
  'atividades:ver', true,
  'atividades:atribuir', true,
  'atividades:configurar', true
)
from public.profiles p
where p.id = e.id
  and not (coalesce(e.permissoes, '{}'::jsonb) ?| array[
    'atividades', 'atividades:ver', 'atividades:atribuir', 'atividades:configurar'
  ])
  and (
    -- (a) o cargo que abria a tela
    p.role in ('gerente_producao', 'gerente_vendas')
    -- (b) a área Pessoas, por qualquer chave dela
    or exists (
      select 1 from jsonb_each(coalesce(e.permissoes, '{}'::jsonb)) kv
      where (kv.key = 'colaboradores' or kv.key like 'colaboradores:%')
        and kv.value = 'true'::jsonb
    )
    -- (c) Produção › Controle, marcado ou herdado do modelo antigo
    or coalesce(e.permissoes -> 'producao:controle', 'false'::jsonb) = 'true'::jsonb
    or (
      coalesce(e.permissoes -> 'producao', 'false'::jsonb) = 'true'::jsonb
      and not (coalesce(e.permissoes, '{}'::jsonb) ?| array['producao:status', 'producao:dia', 'producao:controle'])
    )
  );

-- Confere quem herdou:
-- select p.name, p.role, e.permissoes -> 'atividades:ver' as ver
-- from public.employees e join public.profiles p on p.id = e.id
-- where coalesce(e.permissoes -> 'atividades:ver', 'false'::jsonb) = 'true'::jsonb
-- order by p.name;
