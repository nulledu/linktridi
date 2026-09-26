-- Classificação de estoque em 10 classes + SKU + estoque ideal. Rode no Supabase NOVO.

alter table public.estoque_itens add column if not exists classe text;
alter table public.estoque_itens add column if not exists sku text;
alter table public.estoque_itens add column if not exists estoque_ideal numeric(12,2);

alter table public.estoque_itens drop constraint if exists estoque_itens_classe_chk;
alter table public.estoque_itens add constraint estoque_itens_classe_chk check (classe is null or classe in
  ('acabado','semiacabado','peca_montada','componente','materia_prima','insumo','emb_producao','emb_expedicao','manutencao','consumo'));
create index if not exists estoque_itens_classe_idx on public.estoque_itens (classe);

-- Mapeamento inicial (editável depois na tela).
update public.estoque_itens set classe = case
  -- PRODUTO
  when tipo='produto' and nome ilike 'Caixa Desmontada%' then 'emb_producao'
  when tipo='produto' and nome in ('Coração','Polvo','Base Chancela','Decorativo') then 'semiacabado'
  when tipo='produto' then 'acabado'
  -- PEÇA
  when tipo='peca' then 'peca_montada'
  -- COMPONENTE
  when tipo='componente' and categoria='Insumos' then 'materia_prima'   -- EVA, Feltro, MDF, Borracha, Laminado, Dupla face
  when tipo='componente' and categoria in ('Colas','Tintas') then 'insumo'
  when tipo='componente' and categoria='Embalagem' then 'emb_producao'  -- Caixas/Etiquetas seed
  when tipo='componente' then 'componente'
  else classe end;

-- SKU dos produtos (origem: Sistema de Custos).
update public.estoque_itens set sku = case
  when lower(nome)=lower('Carimbo Acrílico 5cm') and tipo='produto' then 'AC05'
  when lower(nome)=lower('Chancela 4cm') and tipo='produto' then 'CHN01'
  when lower(nome)=lower('Chancela 5cm') and tipo='produto' then 'CHN02'
  when lower(nome)=lower('Logo iluminada 25cm') and tipo='produto' then 'A548DWW8T'
  when lower(nome)=lower('Logo iluminada 35cm') and tipo='produto' then 'GGSRSFRRW'
  when lower(nome)=lower('Logo iluminada 45cm') and tipo='produto' then 'LLKKDD88G'
  when lower(nome)=lower('Logo iluminada 60cm') and tipo='produto' then 'DDFFAEGHT'
  when lower(nome)=lower('Carimbo 13cm') and tipo='produto' then 'CRB13'
  when lower(nome)=lower('Carimbo 14cm') and tipo='produto' then 'CRB14'
  when lower(nome)=lower('Carimbo 15cm') and tipo='produto' then 'CRB15'
  when lower(nome)=lower('Carimbo Decorativo') and tipo='produto' then 'iJIFYU7'
  when lower(nome)=lower('Almofada 22x22') and tipo='produto' then '4PMBTVJSH'
  when lower(nome)=lower('Almofada 11') and tipo='produto' then 'AMF06'
  when lower(nome)=lower('Almofada 16') and tipo='produto' then 'AMF08'
  when lower(nome)=lower('Almofada 6') and tipo='produto' then 'AMF07'
  when lower(nome)=lower('Porta medalhas 24 unidades') and tipo='produto' then 'PM246MM'
  when lower(nome)=lower('Carimbo 6cm') and tipo='produto' then 'CRB06'
  when lower(nome)=lower('Carimbo 4cm') and tipo='produto' then 'CRB04'
  when lower(nome)=lower('Carimbo 5cm') and tipo='produto' then 'CRB05'
  when lower(nome)=lower('Carimbo 7cm') and tipo='produto' then 'CRB07'
  when lower(nome)=lower('Carimbo 8cm') and tipo='produto' then 'CRB08'
  when lower(nome)=lower('Carimbo 9cm') and tipo='produto' then 'CRB09'
  when lower(nome)=lower('Carimbo Acrílico 3cm') and tipo='produto' then 'AC03'
  when lower(nome)=lower('Carimbo Acrílico 4cm') and tipo='produto' then 'AC04'
  when lower(nome)=lower('Carimbo 10cm') and tipo='produto' then 'CRB10'
  when lower(nome)=lower('Carimbo 11cm') and tipo='produto' then 'CRB11'
  when lower(nome)=lower('Carimbo 12cm') and tipo='produto' then 'CRB12'
  else sku end
where tipo='produto';
