-- ── Migração: Contingência vira ÁREA PRÓPRIA ────────────────────────────────
-- A sub `marketing:aquecimento` foi aposentada: o parque de chips, BMs, contas,
-- celulares e proxies virou a área `contingencia`, ligada pessoa a pessoa em
-- Pessoas › ficha › Acesso.
--
-- Ninguém pode perder acesso no dia da virada. Herdam `contingencia: true`:
--   (a) quem tem a sub `marketing:aquecimento` marcada; e
--   (b) quem tem o Marketing inteiro do modelo ANTIGO — área `true` sem nenhuma
--       sub no mapa. Nesse formato o back-compat de `chavesDasAreas()` concedia
--       todas as subs de leitura, aquecimento incluído: essa gente ENXERGA a
--       contingência hoje, então continua enxergando.
--
-- Não sobrescreve quem já tem `contingencia` decidido (true OU false): a decisão
-- da grade manda. Idempotente — rodar de novo não muda nada.
--
-- O código também herda sozinho (`contingenciaHerdada()` em lib/areas.ts), então
-- mesmo sem rodar isto ninguém fica trancado do lado de fora. O que este arquivo
-- faz é gravar a herança no banco, pra que o quadradinho apareça MARCADO na
-- grade — senão o próximo salvamento da ficha (que grava o mapa completo)
-- apagaria um acesso que ninguém decidiu tirar.

update public.employees e
set permissoes = jsonb_set(coalesce(e.permissoes, '{}'::jsonb), '{contingencia}', 'true'::jsonb)
where not (coalesce(e.permissoes, '{}'::jsonb) ? 'contingencia')
  and (
    -- (a) a sub marcada de propósito
    coalesce(e.permissoes -> 'marketing:aquecimento', 'false'::jsonb) = 'true'::jsonb
    -- (b) modelo antigo: área ligada, nenhuma sub de marketing no mapa
    or (
      coalesce(e.permissoes -> 'marketing', 'false'::jsonb) = 'true'::jsonb
      and not (coalesce(e.permissoes, '{}'::jsonb) ?| array[
        'marketing:ver', 'marketing:criar', 'marketing:desempenho', 'marketing:aquecimento'
      ])
    )
  );

-- Confere quem herdou (roda depois do update; deve listar o gestor de tráfego).
-- select e.id, p.name, e.permissoes -> 'contingencia' as contingencia
-- from public.employees e join public.profiles p on p.id = e.id
-- where coalesce(e.permissoes -> 'contingencia', 'false'::jsonb) = 'true'::jsonb;
