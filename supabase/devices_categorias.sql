-- ── Roteamento de ordens por bancada (Chancela × Carimbo/Clichê) ─────────────
-- Problema que isso resolve: ordem de chancela caindo no tablet de carimbos (e
-- vice-versa). Antes o roteamento só olhava `setor`, e ordem SEM setor casava
-- com todo mundo (`setor.includes("")` é sempre verdadeiro) — então vazava.
--
-- Agora cada tablet declara QUE CATEGORIAS ele recebe. Vazio/null = recebe tudo
-- (comportamento antigo). Clichê e Carimbo contam como a mesma bancada.
--
-- Exemplos:
--   update public.devices set categorias = array['Chancela'] where nome_mesa = 'Chancelas';
--   update public.devices set categorias = array['Carimbo']  where nome_mesa = 'Carimbos';

alter table public.devices                add column if not exists categorias text[];
alter table public.device_provision_codes add column if not exists categorias text[];

-- O código de pareamento passa a ser PERMANENTE e REUTILIZÁVEL: digitar o mesmo
-- código de novo re-vincula o MESMO tablet (rotaciona o token) em vez de criar
-- um device duplicado. Some o "código expirou" ao re-parear.
-- `used` e `expires_at` continuam existindo só por compatibilidade — o servidor
-- não os checa mais. Aqui limpamos a validade dos códigos já emitidos.
update public.device_provision_codes
   set expires_at = '2999-12-31T23:59:59Z'
 where expires_at < '2999-01-01T00:00:00Z';
