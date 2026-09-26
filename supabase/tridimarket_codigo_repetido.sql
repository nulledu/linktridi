-- TridiMarket — permitir o MESMO código de barras em produtos diferentes.
--
-- Até aqui `produtos.codigo_barras` era `unique`. A regra existia por um bom
-- motivo: com dois produtos no mesmo código, bipar deixa de identificar o item
-- e o tablet pode cobrar o errado. Isso continua valendo — o que muda é que a
-- ambiguidade passa a ser TRATADA em vez de proibida:
--
--   • o painel segue recusando código repetido por padrão, e só aceita quando
--     quem cadastra confirma que é de propósito (evita repetir por engano ao
--     digitar um EAN errado, que era o que a restrição protegia);
--   • no tablet, bipar um código de mais de um produto abre a escolha com foto,
--     nome e preço, em vez de pegar um deles no escuro.
--
-- Idempotente. O índice comum entra no lugar do índice implícito da restrição:
-- sem ele, a busca por código viraria varredura da tabela inteira.

do $$
declare
  nome text;
begin
  -- Descobre o nome real da restrição em vez de chutar `produtos_codigo_barras_key`:
  -- se a tabela foi criada por outro caminho, o nome pode ser outro.
  select con.conname into nome
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'mercadinho'
     and rel.relname = 'produtos'
     and con.contype = 'u'
     and (select array_agg(att.attname::text order by att.attname)
            from unnest(con.conkey) k
            join pg_attribute att on att.attrelid = rel.oid and att.attnum = k)
         = array['codigo_barras'];
  if nome is not null then
    execute format('alter table mercadinho.produtos drop constraint %I', nome);
  end if;
end $$;

create index if not exists produtos_codigo_barras_idx
  on mercadinho.produtos (codigo_barras)
  where codigo_barras is not null;

comment on column mercadinho.produtos.codigo_barras is
  'Pode repetir entre produtos. Ao bipar um código repetido, o tablet pergunta qual produto é.';
