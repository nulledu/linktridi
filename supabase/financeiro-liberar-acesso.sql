-- ─────────────────────────────────────────────────────────────────────────────
-- LIBERAR O FINANCEIRO PARA UMA PESSOA
-- ─────────────────────────────────────────────────────────────────────────────
-- Rode DEPOIS de `supabase/financeiro.sql`.
--
-- POR QUE ISTO EXISTE. O Financeiro é área RESTRITA: não vem do papel admin nem
-- do card "acesso total". Isso é o que você pediu — e cria um ovo-e-galinha na
-- primeira vez, porque a tela que concede acesso (`/financeiro/acessos`) também
-- fica atrás da mesma trava. Alguém precisa entrar primeiro; é este arquivo.
--
-- Depois da primeira pessoa entrar, NÃO use mais este script: use a tela
-- Financeiro › Acessos, que registra quem concedeu e o quê na auditoria.
--
-- ESTE ARQUIVO NÃO É IDEMPOTENTE DE PROPÓSITO, e por isso mora separado do
-- schema: rodar o `financeiro.sql` de novo é seguro; rodar ISTO de novo
-- re-concederia um acesso que você porventura tivesse revogado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 1 · descubra o usuário ─────────────────────────────────────────────
-- Rode só esta consulta primeiro e confirme que a pessoa é quem você espera.

select p.id, p.username, p.name, p.role, e.nome, e.setor
from public.profiles p
left join public.employees e on e.id = p.id
where p.active
order by p.username;


-- ── PASSO 2 · troque o username e rode ───────────────────────────────────────
-- Substitua 'caio' pelo username que apareceu no passo 1.
--
-- O `||` MESCLA no mapa existente em vez de substituí-lo: um `=` cru apagaria
-- todas as outras áreas da pessoa (Estoque, Comercial, Configurações…) e ela
-- perderia o sistema inteiro para ganhar o Financeiro.

update public.employees e
set permissoes = coalesce(e.permissoes, '{}'::jsonb) || jsonb_build_object(
      'financeiro',              true,   -- a porta (o gate da área)
      'financeiro:ver',          true,   -- ver as telas
      'financeiro:compromissos', true,   -- lançar e editar conta a pagar
      'financeiro:compras',      true,   -- registrar compra
      'financeiro:notas',        true,   -- notas fiscais
      'financeiro:patrimonio',   true,   -- bens
      'financeiro:cadastros',    true,   -- recorrências, contas, fornecedores
      'financeiro:pagar',        true,   -- DAR BAIXA: move dinheiro de verdade
      'financeiro:contas',       true,   -- mexer em conta, transferir, ajustar saldo
      'financeiro:folha',        true,   -- ver salário nominal
      'financeiro:acessos',      true    -- conceder o Financeiro a outras pessoas
    ),
    updated_at = now()
from public.profiles p
where p.id = e.id
  and p.username = 'caio';      -- <<< TROQUE AQUI


-- ── PASSO 3 · confira o que ficou gravado ────────────────────────────────────
-- Deve listar as onze chaves acima com `true`.

select p.username, e.nome, k.chave, (e.permissoes ->> k.chave)::boolean as liberado
from public.employees e
join public.profiles p on p.id = e.id
cross join lateral (
  select unnest(array[
    'financeiro','financeiro:ver','financeiro:compromissos','financeiro:compras',
    'financeiro:notas','financeiro:patrimonio','financeiro:cadastros',
    'financeiro:pagar','financeiro:contas','financeiro:folha','financeiro:acessos'
  ]) as chave
) k
where p.username = 'caio'       -- <<< O MESMO DE CIMA
order by k.chave;


-- ── Como TIRAR o acesso de alguém ────────────────────────────────────────────
-- Prefira a tela (Financeiro › Acessos), que deixa rastro. Se precisar aqui:
--
-- update public.employees e
-- set permissoes = e.permissoes - 'financeiro' - 'financeiro:ver'
--     - 'financeiro:compromissos' - 'financeiro:compras' - 'financeiro:notas'
--     - 'financeiro:patrimonio' - 'financeiro:cadastros' - 'financeiro:pagar'
--     - 'financeiro:contas' - 'financeiro:folha' - 'financeiro:acessos'
-- from public.profiles p
-- where p.id = e.id and p.username = 'fulano';
