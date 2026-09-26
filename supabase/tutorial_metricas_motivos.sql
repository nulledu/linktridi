-- Métricas da Central de Tutoriais, parte 2: POR QUE o guia não resolveu e
-- quantas pessoas foram falar com a gente pelo WhatsApp.
--
-- O "Ainda não" sozinho diz que o guia falhou, não onde. O motivo separa
-- "o passo está confuso" (conserta-se o texto) de "o resultado não saiu como
-- esperado" ou "o problema é o produto" (conserta-se outra coisa). E
-- `contatos` é o chamado que o guia não evitou — o número que diz se a
-- central está poupando atendimento.
--
-- Mesmo desenho da parte 1 (supabase/tutorial_metricas.sql): contador POR DIA
-- na mesma linha (central, tutorial, dia), nunca evento nem pessoa.
--
-- Rode no SQL Editor do Supabase JÁ, logo DEPOIS da parte 1 — numa
-- instalação nova também. É re-rodável: rodar de novo não estraga nada.
--
-- Não é migração que pode esperar: ela fecha uma porta pública. A parte 1
-- cria a função sem tirar o EXECUTE de ninguém, e é o `revoke` do fim deste
-- arquivo que tranca. Até ele rodar, a chave anon — que vai no navegador,
-- junto com o id da central e o handle na URL — chama a função direto, com
-- qualquer p_quanto, por cima do RLS. O que o app tolera é só a falta das
-- COLUNAS: segue contando vistas e votos — a função antiga recusa o campo
-- novo, a rota responde 200 mesmo assim e a leitura do editor cai no select
-- de antes.

alter table tutorial_metricas add column if not exists contatos         integer not null default 0;
alter table tutorial_metricas add column if not exists motivo_produto   integer not null default 0;
alter table tutorial_metricas add column if not exists motivo_passo     integer not null default 0;
alter table tutorial_metricas add column if not exists motivo_resultado integer not null default 0;
alter table tutorial_metricas add column if not exists motivo_outro     integer not null default 0;

-- Soma atômica, agora com os campos novos. MESMA assinatura da parte 1: o
-- `create or replace` não aceita trocar nome nem tipo de parâmetro, e a rota
-- do app chama exatamente assim.
--
-- A lista continua FECHADA: o campo chega de uma rota pública, e sem ela
-- qualquer texto viraria tentativa de coluna. Espelhada em CAMPOS_METRICA
-- (lib/tridiflow-tutoriais-metricas.ts) — o teste compara as duas.
create or replace function incrementar_metrica_tutorial(
  p_bot uuid, p_handle text, p_campo text, p_quanto integer default 1
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_campo not in (
    'vistas', 'uteis', 'inuteis', 'contatos',
    'motivo_produto', 'motivo_passo', 'motivo_resultado', 'motivo_outro'
  ) then
    raise exception 'campo invalido: %', p_campo;
  end if;
  insert into tutorial_metricas (
    bot_id, handle, dia,
    vistas, uteis, inuteis, contatos,
    motivo_produto, motivo_passo, motivo_resultado, motivo_outro
  )
  values (
    p_bot, left(p_handle, 200), ((now() at time zone 'America/Sao_Paulo')::date),
    case when p_campo = 'vistas'           then p_quanto else 0 end,
    case when p_campo = 'uteis'            then p_quanto else 0 end,
    case when p_campo = 'inuteis'          then p_quanto else 0 end,
    case when p_campo = 'contatos'         then p_quanto else 0 end,
    case when p_campo = 'motivo_produto'   then p_quanto else 0 end,
    case when p_campo = 'motivo_passo'     then p_quanto else 0 end,
    case when p_campo = 'motivo_resultado' then p_quanto else 0 end,
    case when p_campo = 'motivo_outro'     then p_quanto else 0 end
  )
  -- `excluded` é a linha que tentou entrar: o incremento de cada coluna (o
  -- campo pedido com p_quanto, o resto com 0). Somar a linha inteira evita
  -- repetir oito `case` que um dia divergem dos de cima.
  on conflict (bot_id, handle, dia) do update set
    vistas           = tutorial_metricas.vistas           + excluded.vistas,
    uteis            = tutorial_metricas.uteis            + excluded.uteis,
    inuteis          = tutorial_metricas.inuteis          + excluded.inuteis,
    contatos         = tutorial_metricas.contatos         + excluded.contatos,
    motivo_produto   = tutorial_metricas.motivo_produto   + excluded.motivo_produto,
    motivo_passo     = tutorial_metricas.motivo_passo     + excluded.motivo_passo,
    motivo_resultado = tutorial_metricas.motivo_resultado + excluded.motivo_resultado,
    motivo_outro     = tutorial_metricas.motivo_outro     + excluded.motivo_outro;
end;
$$;

-- security definer roda como o dono da função, por cima do RLS. E o Postgres
-- dá EXECUTE a PUBLIC por padrão, com o Supabase publicando toda função do
-- schema public como RPC: com a chave anon — que vai no navegador — qualquer
-- um chamaria isto direto, com p_quanto = 1000000 ou negativo, apagando a
-- série. O voto entra pela rota do app (que manda sempre 1), nunca pelo
-- cliente. O `grant` explícito garante que o servidor não perde a chamada
-- junto com o PUBLIC.
revoke execute on function incrementar_metrica_tutorial(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function incrementar_metrica_tutorial(uuid, text, text, integer) to service_role;
