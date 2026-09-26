-- ── Recebimento v3 — a compra passa a falar a língua do catálogo novo ────────
--
-- Três buracos que esta migração fecha:
--
-- 1. O recebimento CRIAVA o item do catálogo com o eixo morto `tipo` e sem
--    `hierarquia`. Item sem hierarquia não aparece em nenhuma das 8 abas do
--    Catálogo e não consegue nem gerar SKU. Agora a compra carrega a
--    hierarquia escolhida na hora de registrar (ou nasce como insumo
--    indireto, que é o balde honesto de compra avulsa).
-- 2. Fornecedor era texto solto mesmo com `estoque_fornecedores` existindo, e
--    lugar não existia em campo nenhum — por isso a aba Localização mostrava
--    "0 itens" em toda prateleira depois de receber.
-- 3. Quando o lançamento no estoque falhava, a compra virava "Recebido e
--    lançado" do mesmo jeito e ninguém reconferia. `estoque_erro` guarda o
--    motivo pra tela poder dizer "chegou, mas não entrou no estoque: …".
--
-- Idempotente — pode rodar quantas vezes quiser. O código roda sem ele: as
-- escritas retiram sozinhas a coluna que o banco ainda não tem (ver
-- `escreverTolerante` em lib/recebimento.ts). Sem rodar, porém, a compra
-- continua sem fornecedor/lugar de verdade e o erro de estoque só aparece na
-- resposta da chamada, não no painel.

alter table public.compras add column if not exists fornecedor_id uuid
  references public.estoque_fornecedores(id) on delete set null;
alter table public.compras add column if not exists local_id uuid
  references public.estoque_locais(id) on delete set null;

-- Hierarquia do item que está sendo comprado. Só é usada quando o item ainda
-- não existe no catálogo — é ela que o recebimento copia pro item novo.
alter table public.compras add column if not exists hierarquia text;
alter table public.compras drop constraint if exists compras_hierarquia_chk;
alter table public.compras add constraint compras_hierarquia_chk
  check (hierarquia is null or hierarquia in
    ('materia_prima','insumo_direto','insumo_indireto','embalagem',
     'mp_processada','componente','peca','produto'));

-- Motivo de o lançamento no estoque ter falhado no último recebimento.
-- Nulo = entrou tudo certo.
alter table public.compras add column if not exists estoque_erro text;

create index if not exists compras_fornecedor_idx on public.compras (fornecedor_id);
create index if not exists compras_local_idx      on public.compras (local_id);
