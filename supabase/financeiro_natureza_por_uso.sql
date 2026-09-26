-- ═════════════════════════════════════════════════════════════════════════════
--  A NATUREZA DO CONTATO VIRA CONSEQUÊNCIA DO USO
-- ═════════════════════════════════════════════════════════════════════════════
--
--  `fin_contatos.natureza` nasce 'pessoa' e ninguém nunca troca — é um campo
--  que pede uma classificação antes de a pessoa saber para que ela serve. O
--  resultado, medido no diretório de produção em 24/08/2026: nove fichas, TODAS
--  empresas (Madeiranit Bauru, Packit, Molas ICO, Unitec, Acrílicos…), todas
--  gravadas como 'pessoa'.
--
--  Isso criava um beco sem saída na tela: o seletor "Organização" listava só
--  quem tinha natureza = 'empresa', então abria escrito "Sem organização
--  cadastrada" num diretório cheio de organizações. Para sair, alguém teria que
--  adivinhar que existe um campo a corrigir em cada ficha, uma por uma.
--
--  O código já não depende mais disso (a lista aceita qualquer ficha, e
--  escolher alguém como organização passa a marcá-lo). Este arquivo arruma o
--  que já está gravado, para o diretório começar organizado em vez de esperar
--  alguém usar cada ficha uma vez.
--
--  O CRITÉRIO É CONSERVADOR, e de propósito: marcar pessoa como empresa é
--  chato mas reversível na tela; o contrário também. Ainda assim, adivinhar
--  pelo nome ("tem Ltda?") erraria em cima de dado que é do dono, não meu.
--  Então só marca quem tem PROVA de ser empresa:
--
--    · tem CNPJ preenchido, ou
--    · alguém já a aponta como organização.
--
--  NÃO entra "é fornecedor". A primeira versão deste arquivo tinha esse
--  critério, com a justificativa de que "quem vende para a empresa é uma
--  empresa" — e ela é falsa. Rodado em produção, marcou como empresa o
--  "Mestre Marceneiro" e o "Alexandre Império das Chapas": um marceneiro
--  autônomo e uma pessoa com nome próprio. Fornecedor é PAPEL; empresa é
--  natureza jurídica, e as duas coisas não se deduzem uma da outra.
--  O passo 4, no fim, desfaz o que aquele critério marcou.
--
--  Quem não se encaixa fica como está. Idempotente: rodar de novo não desfaz
--  nada e não remarca o que já está certo.

-- ── 1. Tem CNPJ ──────────────────────────────────────────────────────────────
update public.fin_contatos
   set natureza = 'empresa'
 where natureza is distinct from 'empresa'
   and coalesce(nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), ''), '') <> '';

-- ── 2. Alguém já a aponta como organização ───────────────────────────────────
update public.fin_contatos c
   set natureza = 'empresa'
 where c.natureza is distinct from 'empresa'
   and exists (select 1 from public.fin_contatos f where f.organizacao_id = c.id);

-- ── 3. DESFAZ o que o critério "é fornecedor" marcou ────────────────────────
--
-- A versão anterior deste arquivo marcava todo fornecedor como empresa. Quem
-- já rodou aquela versão tem pessoas gravadas como empresa; este passo as
-- devolve a 'pessoa'.
--
-- Só volta quem não tem NENHUMA prova independente: sem CNPJ e sem ninguém
-- apontando para ela como organização. Quem tem prova fica como está, e quem
-- alguém corrigiu à mão na tela também — porque a tela, ao vincular, é o
-- próprio critério 2.
do $$
begin
  update public.fin_contatos c
     set natureza = 'pessoa'
   where c.natureza = 'empresa'
     and coalesce(nullif(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), ''), '') = ''
     and not exists (select 1 from public.fin_contatos f where f.organizacao_id = c.id)
     and c.papeis @> array['fornecedor']::text[];
exception
  when undefined_column then raise notice 'sem a coluna papeis — pulei o passo 3';
end $$;

-- ── Conferência ──────────────────────────────────────────────────────────────
select natureza, count(*) as fichas
  from public.fin_contatos
 group by natureza
 order by natureza;
