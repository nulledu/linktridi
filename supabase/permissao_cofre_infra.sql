-- ── Migração: o Cofre de senhas saiu de Pessoas → Acessos & Infra ───────────
-- O cofre era a sub `colaboradores:cofre` (dentro de Pessoas). Em 15/09/2026 a
-- tela saiu de Pessoas — Infra virou a única página que a mostra — e a permissão
-- foi junto: agora é `infraestrutura:cofre`. Pessoas voltou a ser liga/desliga
-- (sem subs); Infra ganhou duas subs: `ver` (domínios/hospedagens/VPS) e `cofre`.
--
-- Ninguém pode perder o cofre no dia da virada, nem perder o jeito de CHEGAR
-- nele (a tela agora abre pela área `infraestrutura`). Então quem tinha
-- `colaboradores:cofre: true` herda `infraestrutura: true` + `infraestrutura:cofre: true`.
--
-- Não sobrescreve quem já tem `infraestrutura:cofre` decidido (true OU false): a
-- decisão da grade manda. Idempotente — rodar de novo não muda nada.
--
-- O código também herda sozinho (`cofreHerdado()` em lib/areas.ts), então mesmo
-- sem rodar isto ninguém fica trancado do lado de fora. O que este arquivo faz é
-- gravar a herança no banco, pra que o quadradinho apareça MARCADO na grade —
-- senão o próximo salvamento da ficha (que grava o mapa completo) apagaria um
-- acesso que ninguém decidiu tirar.

-- (1) Herda a chave nova em quem tinha o cofre e ainda não teve `infraestrutura:cofre`
--     decidido. O `||` grava a área e a sub de uma vez (a área é a porta de entrada).
update public.employees e
set permissoes = coalesce(e.permissoes, '{}'::jsonb)
  || '{"infraestrutura": true, "infraestrutura:cofre": true}'::jsonb
where coalesce(e.permissoes -> 'colaboradores:cofre', 'false'::jsonb) = 'true'::jsonb
  and not (coalesce(e.permissoes, '{}'::jsonb) ? 'infraestrutura:cofre');

-- (2) Limpa as chaves mortas de Pessoas: `colaboradores:cofre` já foi migrada
--     acima, e `colaboradores:ponto` deixou de existir quando Pessoas voltou a
--     ser liga/desliga (o acesso continua na chave da ÁREA, `colaboradores`).
--     Roda depois da (1); tirar a chave antiga antes perderia a origem da herança.
update public.employees e
set permissoes = (coalesce(e.permissoes, '{}'::jsonb) - 'colaboradores:cofre') - 'colaboradores:ponto'
where coalesce(e.permissoes, '{}'::jsonb) ?| array['colaboradores:cofre', 'colaboradores:ponto'];

-- Confere quem herdou (deve listar quem via o cofre antes).
-- select e.id, p.name, e.permissoes -> 'infraestrutura:cofre' as cofre
-- from public.employees e join public.profiles p on p.id = e.id
-- where coalesce(e.permissoes -> 'infraestrutura:cofre', 'false'::jsonb) = 'true'::jsonb;
