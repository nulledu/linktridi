-- Repartições do estoque: componente (matéria-prima) → peca → produto (final).
alter table public.estoque_itens add column if not exists tipo text not null default 'produto';
alter table public.estoque_itens drop constraint if exists estoque_itens_tipo_chk;
alter table public.estoque_itens add constraint estoque_itens_tipo_chk check (tipo in ('componente','peca','produto'));
create index if not exists estoque_itens_tipo_idx on public.estoque_itens (tipo, categoria, nome);

-- Classificação inicial do seed (ajuste à vontade na tela).
update public.estoque_itens set tipo='componente' where nome in (
  'EVA','Feltro','MDF 3mm','MDF 6mm','Borracha','Dupla face','Laminado',
  'Cola silicone','Cola branca','Cola bonder','Cola PVA','Cola transferível',
  'Tinta papel preta 30ml','Tinta papel preta 60ml','Tinta papel colorida 30ml',
  'Tinta isopor preta 30ml','Tinta isopor colorida 30ml','Tinta plástico preta 50ml',
  'Tinta plástico colorida 50ml','Fixador 10ml','Etiqueta dourada','Etiqueta prata','Caixa P','Caixa M');
update public.estoque_itens set tipo='peca' where nome in ('Almofada','Clichê','Puxador');
update public.estoque_itens set tipo='produto' where nome in ('Carimbo','Chancela','Decorativo','Polvo','Coração');
