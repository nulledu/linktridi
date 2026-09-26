-- ═════════════════════════════════════════════════════════════════════════════
--  CADASTRO FINANCEIRO UNIFICADO — identidade canônica e extensão comercial
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Rode depois de `financeiro.sql`, `financeiro_fornecedor_completo.sql`,
-- `financeiro_contato_banco_recorrencia.sql` e
-- `financeiro_contato_empresa.sql`. É idempotente: fornecedores e seus IDs
-- legados continuam existindo, mas passam a apontar para a identidade em
-- `fin_contatos`.

-- ── 1. A identidade e a extensão ────────────────────────────────────────────

alter table public.fin_contatos
  add column if not exists papeis text[] not null default array['contato']::text[],
  add column if not exists cnpj text;

alter table public.fin_fornecedores
  add column if not exists contato_id uuid references public.fin_contatos(id) on delete restrict;

-- O CNPJ é armazenado somente em dígitos. Assim a trava vale igualmente para
-- `12.345.678/0001-99` e `12345678000199`; a tela é quem o formata.
update public.fin_contatos
   set cnpj = nullif(regexp_replace(cnpj, '[^0-9]', '', 'g'), '')
 where cnpj is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fin_contatos'::regclass
       and conname = 'fin_contatos_papeis_validos'
  ) then
    alter table public.fin_contatos add constraint fin_contatos_papeis_validos
      check (
        array_position(papeis, null) is null
        and papeis <@ array['contato', 'fornecedor', 'cliente', 'parceiro', 'prestador', 'outro']::text[]
      );
  end if;
end $$;

-- `natureza` já existia sem domínio fechado. Corrigir valores legados antes de
-- travar a coluna mantém a migração reaplicável e faz a invariável valer também
-- para escrita direta, não só para a RPC.
update public.fin_contatos
   set natureza = 'pessoa'
 where natureza not in ('pessoa', 'empresa');

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fin_contatos'::regclass
       and conname = 'fin_contatos_natureza_valida'
  ) then
    alter table public.fin_contatos add constraint fin_contatos_natureza_valida
      check (natureza in ('pessoa', 'empresa'));
  end if;
end $$;

create unique index if not exists fin_fornecedores_contato
  on public.fin_fornecedores(contato_id) where contato_id is not null;

create unique index if not exists fin_contatos_cnpj on public.fin_contatos(empresa_id, cnpj)
  where cnpj is not null and deleted_at is null;

-- ── 2. Backfill sem adivinhação por nome ────────────────────────────────────
--
-- Só CNPJ normalizado identifica uma identidade existente. Nome, telefone e
-- similaridade nunca participam da decisão: dois "Atlas" podem ser empresas
-- distintas. Sem CNPJ, cada fornecedor recebe sua própria identidade.
do $$
declare
  f record;
  v_contato_id uuid;
  v_cnpj text;
begin
  for f in
    select * from public.fin_fornecedores where contato_id is null order by created_at, id
  loop
    v_contato_id := null;
    v_cnpj := nullif(regexp_replace(coalesce(f.cnpj, ''), '[^0-9]', '', 'g'), '');

    -- Um contato com aquele CNPJ só pode servir quando ainda não é extensão de
    -- outro fornecedor: a extensão é 1:1 para preservar todas as FKs legadas.
    if v_cnpj is not null then
      select c.id into v_contato_id
        from public.fin_contatos c
       where c.empresa_id = f.empresa_id
         and c.cnpj = v_cnpj
         and c.deleted_at is null
         and not exists (
           select 1 from public.fin_fornecedores ja
            where ja.contato_id = c.id and ja.id <> f.id
         )
       order by c.created_at, c.id
       limit 1;
    end if;

    if v_contato_id is null then
      begin
        insert into public.fin_contatos (
          empresa_id, nome, cnpj, papeis, categoria, categorias, telefone,
          telefones, email, endereco, observacao, site, logo_url, icone,
          ativo, created_by, updated_by
        ) values (
          f.empresa_id, f.nome, v_cnpj, array['fornecedor']::text[],
          f.categoria, f.categorias, coalesce(f.contato_fone, f.whatsapp),
          case when coalesce(f.contato_fone, f.whatsapp) is not null
               then array[coalesce(f.contato_fone, f.whatsapp)] end,
          f.contato_email, f.endereco, f.observacao, f.site, f.logo_url, f.icone,
          f.ativo, f.created_by, f.updated_by
        ) returning id into v_contato_id;
      exception when unique_violation then
        -- Um banco antigo pode ter dois fornecedores com o mesmo CNPJ em
        -- formatos diferentes. Mantemos ambos e seus históricos, mas não
        -- inventamos uma fusão; o segundo fica sem CNPJ canônico até revisão.
        insert into public.fin_contatos (
          empresa_id, nome, papeis, categoria, categorias, telefone, telefones,
          email, endereco, observacao, site, logo_url, icone, ativo, created_by, updated_by
        ) values (
          f.empresa_id, f.nome, array['fornecedor']::text[], f.categoria,
          f.categorias, coalesce(f.contato_fone, f.whatsapp),
          case when coalesce(f.contato_fone, f.whatsapp) is not null
               then array[coalesce(f.contato_fone, f.whatsapp)] end,
          f.contato_email, f.endereco, f.observacao, f.site, f.logo_url, f.icone,
          f.ativo, f.created_by, f.updated_by
        ) returning id into v_contato_id;
      end;
    else
      -- Nunca sobrescrevemos uma ficha canônica com dado legado. Só incluímos
      -- o papel que torna explícita a extensão que acabamos de ligar.
      update public.fin_contatos c
         set papeis = case when 'fornecedor' = any(c.papeis) then c.papeis
                           else array_append(c.papeis, 'fornecedor') end
       where c.id = v_contato_id;
    end if;

    update public.fin_fornecedores set contato_id = v_contato_id where id = f.id;
  end loop;
end $$;

-- ── 3. Escrita atômica da ficha e da extensão ───────────────────────────────
--
-- `p_entrada` é plano de propósito: a rota valida o payload de UI e a RPC
-- aplica uma única transação. Campos comuns moram na raiz; os comerciais em
-- `fornecedor`. Exemplo mínimo:
-- { empresa_id, nome, natureza, papeis, cnpj, fornecedor: { prazo_dias } }
create or replace function public.fin_salvar_parte(p_entrada jsonb, p_user_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_empresa_id uuid := nullif(p_entrada ->> 'empresa_id', '')::uuid;
  v_contato_id uuid := nullif(p_entrada ->> 'id', '')::uuid;
  v_fornecedor_id uuid := coalesce(
    nullif(p_entrada ->> 'fornecedor_id', '')::uuid,
    nullif(p_entrada -> 'fornecedor' ->> 'id', '')::uuid
  );
  v_fornecedor jsonb := coalesce(p_entrada -> 'fornecedor', '{}'::jsonb);
  v_nome text := nullif(btrim(coalesce(p_entrada ->> 'nome', '')), '');
  v_natureza text := coalesce(nullif(p_entrada ->> 'natureza', ''), 'pessoa');
  v_cnpj text := nullif(regexp_replace(coalesce(nullif(p_entrada ->> 'cnpj', ''), nullif(v_fornecedor ->> 'cnpj', ''), ''), '[^0-9]', '', 'g'), '');
  v_categoria text := coalesce(
    nullif(btrim(coalesce(p_entrada ->> 'categoria', '')), ''),
    nullif(btrim(coalesce(p_entrada -> 'categorias' ->> 0, '')), ''),
    nullif(btrim(coalesce(v_fornecedor ->> 'categoria', '')), '')
  );
  v_categorias text[];
  v_telefone text := coalesce(
    nullif(btrim(coalesce(p_entrada ->> 'telefone', '')), ''),
    nullif(btrim(coalesce(p_entrada -> 'telefones' ->> 0, '')), ''),
    nullif(btrim(coalesce(v_fornecedor ->> 'contato_fone', '')), '')
  );
  v_email text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'email', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'contato_email', '')), ''));
  v_endereco text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'endereco', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'endereco', '')), ''));
  v_observacao text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'observacao', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'observacao', '')), ''));
  v_site text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'site', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'site', '')), ''));
  v_logo_url text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'logo_url', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'logo_url', '')), ''));
  v_icone text := coalesce(nullif(btrim(coalesce(p_entrada ->> 'icone', '')), ''), nullif(btrim(coalesce(v_fornecedor ->> 'icone', '')), ''));
  v_ativo boolean;
  v_papeis text[];
  v_empresa_fornecedor uuid;
  v_fornecedor_atual uuid;
begin
  if v_empresa_id is null then
    raise exception 'financeiro: empresa_id é obrigatório' using errcode = 'not_null_violation';
  end if;
  if v_nome is null then
    raise exception 'financeiro: nome é obrigatório' using errcode = 'not_null_violation';
  end if;
  if v_natureza not in ('pessoa', 'empresa') then
    raise exception 'financeiro: natureza inválida' using errcode = 'check_violation';
  end if;

  if p_entrada ? 'papeis' then
    select coalesce(array_agg(papel), array[]::text[]) into v_papeis
      from jsonb_array_elements_text(p_entrada -> 'papeis') as papel;
  else
    v_papeis := array['contato']::text[];
  end if;

  if array_position(v_papeis, null) is not null
     or not (v_papeis <@ array['contato', 'fornecedor', 'cliente', 'parceiro', 'prestador', 'outro']::text[])
  then
    raise exception 'financeiro: papéis inválidos' using errcode = 'check_violation';
  end if;

  if nullif(p_entrada ->> 'organizacao_id', '') is not null and not exists (
    select 1 from public.fin_contatos organizacao
     where organizacao.id = (p_entrada ->> 'organizacao_id')::uuid
       and organizacao.empresa_id = v_empresa_id
  ) then
    raise exception 'financeiro: organização aponta para outra empresa' using errcode = 'check_violation';
  end if;

  if v_contato_id is null then
    insert into public.fin_contatos (
      empresa_id, nome, natureza, papeis, cnpj, categoria, categorias,
      telefone, telefones, email, endereco, observacao, organizacao, cargo,
      organizacao_id, site,
      logo_url, icone, ativo, created_by, updated_by
    ) values (
      v_empresa_id, v_nome, v_natureza, v_papeis, v_cnpj,
      v_categoria,
      case when p_entrada ? 'categorias' then array(select jsonb_array_elements_text(p_entrada -> 'categorias')) end,
      v_telefone,
      case when p_entrada ? 'telefones' then array(select jsonb_array_elements_text(p_entrada -> 'telefones')) end,
      v_email, v_endereco, v_observacao,
      nullif(btrim(coalesce(p_entrada ->> 'organizacao', '')), ''),
      nullif(btrim(coalesce(p_entrada ->> 'cargo', '')), ''),
      nullif(p_entrada ->> 'organizacao_id', '')::uuid,
      v_site, v_logo_url, v_icone,
      coalesce((p_entrada ->> 'ativo')::boolean, true), p_user_id, p_user_id
    ) returning id into v_contato_id;
  else
    update public.fin_contatos c
       set nome = v_nome,
           natureza = v_natureza,
           papeis = v_papeis,
           cnpj = case when p_entrada ? 'cnpj' or v_fornecedor ? 'cnpj' then v_cnpj else c.cnpj end,
           categoria = case when p_entrada ? 'categoria' or p_entrada ? 'categorias' or v_fornecedor ? 'categoria' then v_categoria else c.categoria end,
           categorias = case when p_entrada ? 'categorias' then array(select jsonb_array_elements_text(p_entrada -> 'categorias')) else c.categorias end,
           telefone = case when p_entrada ? 'telefone' or p_entrada ? 'telefones' or v_fornecedor ? 'contato_fone' then v_telefone else c.telefone end,
           telefones = case when p_entrada ? 'telefones' then array(select jsonb_array_elements_text(p_entrada -> 'telefones')) else c.telefones end,
           email = case when p_entrada ? 'email' or v_fornecedor ? 'contato_email' then v_email else c.email end,
           endereco = case when p_entrada ? 'endereco' or v_fornecedor ? 'endereco' then v_endereco else c.endereco end,
           observacao = case when p_entrada ? 'observacao' or v_fornecedor ? 'observacao' then v_observacao else c.observacao end,
           organizacao = case when p_entrada ? 'organizacao' then nullif(btrim(coalesce(p_entrada ->> 'organizacao', '')), '') else c.organizacao end,
           cargo = case when p_entrada ? 'cargo' then nullif(btrim(coalesce(p_entrada ->> 'cargo', '')), '') else c.cargo end,
           organizacao_id = case when p_entrada ? 'organizacao_id' then nullif(p_entrada ->> 'organizacao_id', '')::uuid else c.organizacao_id end,
           site = case when p_entrada ? 'site' or v_fornecedor ? 'site' then v_site else c.site end,
           logo_url = case when p_entrada ? 'logo_url' or v_fornecedor ? 'logo_url' then v_logo_url else c.logo_url end,
           icone = case when p_entrada ? 'icone' or v_fornecedor ? 'icone' then v_icone else c.icone end,
           ativo = case when p_entrada ? 'ativo' then coalesce((p_entrada ->> 'ativo')::boolean, true) else c.ativo end,
           updated_by = p_user_id
     where c.id = v_contato_id and c.empresa_id = v_empresa_id;
    if not found then
      raise exception 'financeiro: contato não pertence à empresa' using errcode = 'check_violation';
    end if;
  end if;

  -- A identidade é a fonte de verdade. As colunas duplicadas do fornecedor
  -- permanecem sincronizadas apenas para consumidores legados durante a transição.
  select coalesce(c.categoria, c.categorias[1]), c.categorias,
         coalesce(c.telefone, c.telefones[1]), c.email,
         c.endereco, c.observacao, c.site, c.ativo
    into v_categoria, v_categorias, v_telefone, v_email,
         v_endereco, v_observacao, v_site, v_ativo
    from public.fin_contatos c where c.id = v_contato_id;

  if 'fornecedor' = any(v_papeis) then
    if v_fornecedor_id is null then
      select id into v_fornecedor_id from public.fin_fornecedores
       where contato_id = v_contato_id order by created_at, id limit 1;
    end if;

    if v_fornecedor_id is not null then
      select empresa_id, contato_id into v_empresa_fornecedor, v_fornecedor_atual
        from public.fin_fornecedores where id = v_fornecedor_id;
      if v_empresa_fornecedor is null then
        raise exception 'financeiro: fornecedor não encontrado' using errcode = 'foreign_key_violation';
      end if;
      if v_empresa_fornecedor <> v_empresa_id then
        raise exception 'financeiro: fornecedor aponta para outra empresa' using errcode = 'check_violation';
      end if;
      if v_fornecedor_atual is not null and v_fornecedor_atual <> v_contato_id then
        raise exception 'financeiro: fornecedor já pertence a outro contato' using errcode = 'unique_violation';
      end if;

      update public.fin_fornecedores f
         set contato_id = v_contato_id,
             nome = v_nome,
             cnpj = case when p_entrada ? 'cnpj' or v_fornecedor ? 'cnpj' then v_cnpj else f.cnpj end,
             categoria = v_categoria,
             categorias = v_categorias,
             contato_nome = case when v_fornecedor ? 'contato_nome' then nullif(btrim(coalesce(v_fornecedor ->> 'contato_nome', '')), '') else f.contato_nome end,
             contato_email = v_email,
             contato_fone = v_telefone,
             prazo_dias = case when v_fornecedor ? 'prazo_dias' then nullif(v_fornecedor ->> 'prazo_dias', '')::int else f.prazo_dias end,
             forma_pagamento = case when v_fornecedor ? 'forma_pagamento' then nullif(btrim(coalesce(v_fornecedor ->> 'forma_pagamento', '')), '') else f.forma_pagamento end,
             observacao = v_observacao,
             pix_tipo = case when v_fornecedor ? 'pix_tipo' then nullif(btrim(coalesce(v_fornecedor ->> 'pix_tipo', '')), '') else f.pix_tipo end,
             pix_chave = case when v_fornecedor ? 'pix_chave' then nullif(btrim(coalesce(v_fornecedor ->> 'pix_chave', '')), '') else f.pix_chave end,
             banco = case when v_fornecedor ? 'banco' then nullif(btrim(coalesce(v_fornecedor ->> 'banco', '')), '') else f.banco end,
             agencia = case when v_fornecedor ? 'agencia' then nullif(btrim(coalesce(v_fornecedor ->> 'agencia', '')), '') else f.agencia end,
             conta_numero = case when v_fornecedor ? 'conta_numero' then nullif(btrim(coalesce(v_fornecedor ->> 'conta_numero', '')), '') else f.conta_numero end,
             aceita_boleto = case when v_fornecedor ? 'aceita_boleto' then coalesce((v_fornecedor ->> 'aceita_boleto')::boolean, false) else f.aceita_boleto end,
             inscricao_estadual = case when v_fornecedor ? 'inscricao_estadual' then nullif(btrim(coalesce(v_fornecedor ->> 'inscricao_estadual', '')), '') else f.inscricao_estadual end,
             site = v_site,
             whatsapp = v_telefone,
             cidade = case when v_fornecedor ? 'cidade' then nullif(btrim(coalesce(v_fornecedor ->> 'cidade', '')), '') else f.cidade end,
             uf = case when v_fornecedor ? 'uf' then nullif(btrim(coalesce(v_fornecedor ->> 'uf', '')), '') else f.uf end,
             endereco = v_endereco,
             prazo_envio_dias = case when v_fornecedor ? 'prazo_envio_dias' then nullif(v_fornecedor ->> 'prazo_envio_dias', '')::int else f.prazo_envio_dias end,
             ativo = v_ativo,
             deleted_at = case when v_ativo then null else f.deleted_at end,
             updated_by = p_user_id
       where f.id = v_fornecedor_id;
    else
      insert into public.fin_fornecedores (
        empresa_id, contato_id, nome, cnpj, categoria, categorias, contato_nome,
        contato_email, contato_fone, prazo_dias, forma_pagamento, observacao,
        pix_tipo, pix_chave, banco, agencia, conta_numero, aceita_boleto,
        inscricao_estadual, site, whatsapp, cidade, uf, endereco,
        prazo_envio_dias, ativo, created_by, updated_by
      ) values (
        v_empresa_id, v_contato_id, v_nome, v_cnpj,
        v_categoria, v_categorias,
        nullif(btrim(coalesce(v_fornecedor ->> 'contato_nome', '')), ''), v_email, v_telefone,
        nullif(v_fornecedor ->> 'prazo_dias', '')::int,
        nullif(btrim(coalesce(v_fornecedor ->> 'forma_pagamento', '')), ''),
        v_observacao,
        nullif(btrim(coalesce(v_fornecedor ->> 'pix_tipo', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'pix_chave', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'banco', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'agencia', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'conta_numero', '')), ''),
        coalesce((v_fornecedor ->> 'aceita_boleto')::boolean, false),
        nullif(btrim(coalesce(v_fornecedor ->> 'inscricao_estadual', '')), ''),
        v_site, v_telefone,
        nullif(btrim(coalesce(v_fornecedor ->> 'cidade', '')), ''),
        nullif(btrim(coalesce(v_fornecedor ->> 'uf', '')), ''), v_endereco,
        nullif(v_fornecedor ->> 'prazo_envio_dias', '')::int,
        v_ativo, p_user_id, p_user_id
      ) returning id into v_fornecedor_id;
    end if;
  else
    -- Tirar o papel não destrói compras, compromissos nem a extensão histórica.
    update public.fin_fornecedores f
       set nome = v_nome,
           cnpj = case when p_entrada ? 'cnpj' then v_cnpj else f.cnpj end,
           categoria = v_categoria,
           categorias = v_categorias,
           contato_email = v_email,
           contato_fone = v_telefone,
           whatsapp = v_telefone,
           site = v_site,
           endereco = v_endereco,
           observacao = v_observacao,
           ativo = false,
           updated_by = p_user_id
     where contato_id = v_contato_id;
    v_fornecedor_id := null;
  end if;

  insert into public.fin_auditoria (empresa_id, entidade, entidade_id, acao, dados, user_id)
  values (
    v_empresa_id, 'contato', v_contato_id, 'salvar_parte',
    jsonb_build_object('papeis', v_papeis, 'fornecedor_id', v_fornecedor_id), p_user_id
  );

  return jsonb_build_object('contato_id', v_contato_id, 'fornecedor_id', v_fornecedor_id);
end $$;
