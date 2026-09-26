-- ── estoque_movimentos aprende a apontar pro catálogo novo ───────────────────
--
-- A tabela nasceu no sistema ANTIGO: `produto_id integer not null`, casando com
-- a numeração antiga (#175, #258…). O catálogo de hoje (`estoque_itens`) usa
-- uuid — e TODA gravação de histórico das rotas novas (ajuste por QR, entrada
-- por leitura, entrada do tablet) vinha FALHANDO EM SILÊNCIO: o insert estoura
-- "invalid input syntax for type integer", e as rotas engolem o erro de
-- propósito (o saldo já mudou; estourar faria a pessoa repetir o ajuste e
-- dobrar o movimento). Resultado: saldo certo, razão vazio.
--
-- O conserto NÃO troca o tipo de `produto_id` — os relatórios antigos
-- (lib/estoque.ts) leem esta tabela esperando número, e movimentos legados
-- continuam válidos. Entra uma coluna nova:
--
--   item_id uuid  → o item do catálogo novo. As rotas novas gravam ela.
--   produto_id    → deixa de ser obrigatório (movimento novo não tem número antigo).
--
-- Idempotente: rodar duas vezes não muda nada na segunda.

alter table public.estoque_movimentos
  add column if not exists item_id uuid;

alter table public.estoque_movimentos
  alter column produto_id drop not null;

create index if not exists estoque_mov_item_idx
  on public.estoque_movimentos (item_id);

-- ── O rastro da contagem importada em 22/08/2026 ─────────────────────────────
--
-- A importação da lista do sistema antigo (60 itens: 52 criados, 5 saldos
-- acertados) mexeu no saldo SEM conseguir deixar linha no razão — exatamente
-- pela coluna que este arquivo cria. Aqui as linhas entram, apontando pro item
-- pelo nome. A guarda por motivo faz rodar de novo não duplicar nada.

do $$
begin
  if exists (select 1 from public.estoque_movimentos where motivo = 'Contagem importada do sistema antigo (22/08/2026)') then
    raise notice 'Rastro da importação já registrado. Nada a fazer.';
    return;
  end if;

  insert into public.estoque_movimentos (item_id, produto_nome, delta, motivo, origem)
  select i.id, i.nome, i.quantidade, 'Contagem importada do sistema antigo (22/08/2026)', 'manual'
    from public.estoque_itens i
   where i.quantidade > 0
     and i.nome in (
       'Caixa De Cotonete','Luva De Plástico','Luva De Borracha','Máscara','Fita Durex (Fina)',
       'Cola Bastão','Folha Sulfite','BISCUIT','Detergente','Água Sanitária','Caixa M','Caixa P',
       'Rolo De Etiqueta (Envio)','Ribbon','LÂMINA DE ESTILETE','Gaze','Pó De Café','Filtro De Café',
       'Açúcar','SBP','Grampos','Rolo De Código De Barras','Bico (Cola Bonder)','Tinta Preta',
       'Saco De Envio P','Saco De Envio M','Lub Fast','SERINGA','Tesoura','Estilete',
       'Bandeja De Pintura','Rolo De Pintura (Menor)','Fibra De Limpeza','Kraft','Fita Durex',
       'Bobina Dupla Face','Papel Higiênico'
     );

  raise notice 'Rastro da importação: % linha(s).', (select count(*) from public.estoque_movimentos where motivo = 'Contagem importada do sistema antigo (22/08/2026)');
end $$;

-- Confere: as rotas novas passam a conseguir gravar histórico.
select
  count(*) filter (where item_id is not null) as com_item_novo,
  count(*) filter (where produto_id is not null) as legado
from public.estoque_movimentos;
