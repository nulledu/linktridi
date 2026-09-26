-- ═════════════════════════════════════════════════════════════════════════════
--  A VIEW DE SALDO PRECISA DEVOLVER A MARCA DA CONTA
-- ═════════════════════════════════════════════════════════════════════════════
--
--  `fin_contas.logo_url` e `fin_contas.icone` existem desde o `financeiro.sql`,
--  e a rota de upload grava neles corretamente — medido em produção: Sicred,
--  Itaú e Inter estão os três com o caminho gravado.
--
--  Só que a TELA não lê a tabela: ela lê a view `fin_contas_saldo`, que é onde
--  mora o saldo calculado. E a view nunca listou essas duas colunas. O
--  resultado é o pior tipo de defeito: a foto sobe, o banco guarda, e a tela
--  continua mostrando o ícone de reserva — "adiciono as fotos dos bancos e
--  gateways e nada acontece". Não havia erro em lugar nenhum, porque a leitura
--  é tolerante: ela tenta com as colunas, leva 42703, e repete sem elas.
--
--  Rode DEPOIS de `financeiro_contato_banco_recorrencia.sql` (que criou a
--  versão atual da view). Idempotente.
--
--  O `drop` antes do `create` NÃO é zelo. `create or replace view` no Postgres
--  só aceita ACRESCENTAR coluna no FIM; qualquer outra mudança morre em
--  «cannot change name of view column». E como o SQL Editor roda o arquivo
--  inteiro numa transação, esse erro derrubaria tudo. Já aconteceu neste banco.

drop view if exists public.fin_contas_saldo;
create view public.fin_contas_saldo as
select
  c.id, c.empresa_id, c.nome, c.tipo, c.instituicao, c.cor, c.ordem,
  c.ativa, c.inclui_no_saldo, c.saldo_inicial, c.responsavel_id,
  c.limite, c.conta_mae_id, c.bandeira, c.final,
  c.agencia, c.numero,
  -- O que faltava. `logo_url` é o CAMINHO no bucket privado (nunca a URL: link
  -- assinado vence, e coluna cheia de link morto é pior que coluna vazia);
  -- `icone` é o Tabler que aparece enquanto não há imagem.
  c.logo_url, c.icone,
  c.saldo_inicial + coalesce(sum(m.valor) filter (where m.status = 'confirmado'), 0) as saldo,
  case when c.tipo = 'cartao'
       then greatest(0, -(c.saldo_inicial + coalesce(sum(m.valor) filter (where m.status = 'confirmado'), 0)))
  end as usado,
  case when c.tipo = 'cartao' and c.limite is not null
       then c.limite - greatest(0, -(c.saldo_inicial + coalesce(sum(m.valor) filter (where m.status = 'confirmado'), 0)))
  end as disponivel
from public.fin_contas c
left join public.fin_movimentos m on m.conta_id = c.id
group by c.id;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- `com_logo` tem de bater com o número de contas que têm imagem na tabela.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'fin_contas_saldo'
      and column_name in ('logo_url','icone')) as colunas_de_marca,
  (select count(*) from public.fin_contas_saldo where logo_url is not null) as com_logo_na_view,
  (select count(*) from public.fin_contas      where logo_url is not null) as com_logo_na_tabela;
