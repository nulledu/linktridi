-- Estagiário: quem tem a marca não acumula hora extra no banco de horas.
--
-- Estágio não gera hora extra. O crédito que nasce do RELÓGIO (ficar além da
-- jornada) é descartado no ledger; o que continua valendo é quitar dívida
-- (senão o estagiário que saiu cedo um dia jamais zeraria trabalhando) e o
-- ajuste manual do admin — a única porta pela qual um estagiário ganha horas
-- a favor. Ver lib/banco-horas.ts e lib/__tests__/banco-horas-estagiario.test.ts.
--
-- Re-rodável. Default false: ninguém vira estagiário por acidente.
alter table public.ponto_pessoas
  add column if not exists estagiario boolean not null default false;

comment on column public.ponto_pessoas.estagiario is
  'Estágio não gera hora extra: o crédito do relógio é descartado. Quitar dívida e ajuste manual continuam valendo.';

-- Marca quem o FINANCEIRO já sabe que é estágio (fin_colaboradores.vinculo),
-- pela ponte ponto_pessoas.colaborador_id. Re-rodável: só marca, nunca desmarca
-- — tirar a marca de alguém é decisão de gente, não de script.
update public.ponto_pessoas p
   set estagiario = true
  from public.fin_colaboradores c
 where c.employee_id = p.colaborador_id
   and lower(coalesce(c.vinculo, '')) = 'estagio'
   and p.estagiario is distinct from true;

-- O Financeiro só conhece 4 dos 7 (Beatriz, Isabella e mikael não têm vínculo
-- 'estagio' em fin_colaboradores), e o `update` de cima passaria por eles em
-- silêncio. Então a lista informada em 02/09/2026 vai explícita, por id de
-- ponto_pessoas — nome muda, id não. Re-rodável: só marca, nunca desmarca.
update public.ponto_pessoas
   set estagiario = true
 where id in (
   'a11b292f-928b-412f-b130-1e5c8e42ab2f',   -- Gabriel Suzuki
   'c2ea9eba-a35c-42ca-ae4d-fd7b133b799a',   -- mikael
   '749e1eb1-115e-4143-be0e-e0b11bb423a7',   -- João Vitor
   '2f0f371b-8be6-45de-ab6d-fa78c2fb8f5c',   -- Henrique Campos
   '97c15c04-2672-4d2c-bd8e-f4129283dceb',   -- Beatriz Loureiro
   '8417fb17-7686-4dbc-a24d-28c371d4c0c7',   -- Luiz Santos
   'f8899983-9642-4597-9106-21f64ba9dd68'    -- Isabella Alves
 )
   and estagiario is distinct from true;

-- Confere quem ficou marcado (esperado: as 7 pessoas acima).
select nome, estagiario from public.ponto_pessoas where estagiario order by nome;
