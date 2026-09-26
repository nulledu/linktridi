-- ── Qual publicação abre na RAIZ de um domínio próprio ───────────────────────
--
-- `tridiflow_dominios` já dizia "este domínio é uma vitrine" com `loja_id`.
-- `bot_id` é o irmão dele para os domínios que NÃO são loja: o site público
-- (tutoriais, currículo, LinkTridi) precisa saber o que mostrar quando alguém
-- digita só o domínio, sem caminho nenhum.
--
-- Rodar isto é OPCIONAL. Sem a coluna, `raizDoDominio()` usa a única publicação
-- marcada pro domínio — que é o caso enquanto houver só uma. A coluna passa a
-- importar quando o mesmo domínio servir tutorial E LinkTridi E currículo: aí
-- alguém tem que dizer qual é a porta da frente, porque adivinhar entregaria a
-- página errada.
--
-- Idempotente: pode rodar quantas vezes quiser.

alter table public.tridiflow_dominios
  add column if not exists bot_id uuid references public.tridiflow_bots(id) on delete set null;

comment on column public.tridiflow_dominios.bot_id is
  'Publicação que abre na raiz (/) deste domínio. Nulo = usa a única publicação marcada pro domínio, se houver exatamente uma.';

-- Busca da raiz é por host e cai aqui em toda visita ao domínio pelado.
create index if not exists tridiflow_dominios_bot_id_idx
  on public.tridiflow_dominios (bot_id)
  where bot_id is not null;

-- Exemplo (ajuste os valores): apontar a raiz do domínio para a Central de Tutoriais.
--   update public.tridiflow_dominios d
--      set bot_id = (select b.id from public.tridiflow_bots b where b.slug = 'tutoriais' and b.tipo = 'page')
--    where d.host = 'www.carimbostridii.com.br';
