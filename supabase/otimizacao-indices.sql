-- ── Índices que faltavam (auditoria de desempenho, set/2026) ────────────────
-- Cada índice abaixo cobre uma query REAL do app que hoje varre a tabela.
-- Idempotente: rodar de novo não faz nada.
-- Rodar no Supabase NOVO (tzariztovuuwyeoogbxg).

-- lib/ponto.ts limparSelfies(): .not("selfie_url","is",null).order(batido_em desc)
-- Sem isto, o cron de limpeza varre ponto_registros inteira (que só cresce —
-- batida é pra sempre, por causa da folha). Parcial: só linhas com selfie.
create index if not exists ponto_registros_selfies
  on ponto_registros (batido_em desc)
  where selfie_url is not null;

-- lib/ponto.ts listPessoas(): filtra ativo; join com employees por colaborador_id.
create index if not exists ponto_pessoas_ativo on ponto_pessoas (ativo);
create index if not exists ponto_pessoas_colaborador on ponto_pessoas (colaborador_id);

-- app/api/central/chat/mensagens e canais: 5 queries filtram membros por
-- conversa_id, mas o único índice era por user_id.
create index if not exists central_conversa_membros_conversa
  on central_conversa_membros (conversa_id);

-- app/api/device/pull (a rota MAIS chamada do sistema — polling dos tablets):
-- filtra atividades por mesa_alvo + pool; nenhum índice começa por mesa_alvo.
create index if not exists atividades_mesa_alvo
  on atividades (mesa_alvo, pool, status)
  where mesa_alvo is not null;

-- lib/atividade-faixa-ordens.ts: roteamento por faixa atualiza atividades
-- casando por produto_nome (+ pool/status).
create index if not exists atividades_produto_nome
  on atividades (produto_nome, pool, status);

-- Bipagem: 8 pontos do app buscam estoque_unidades por codigo.
create index if not exists estoque_unidades_codigo on estoque_unidades (codigo);

-- app/api/device/push: baixa de peças filtra atividade_pecas por setor.
create index if not exists atividade_pecas_setor on atividade_pecas (setor);

-- Listagens de pessoas: 10+ chamadas filtram active e ordenam por name.
create index if not exists profiles_active_name on profiles (active, name);

-- trafego_eventos é consultada por criado_em, mas a DDL dela não está no repo —
-- o bloco só cria o índice SE a tabela existir neste banco.
do $$ begin
  if to_regclass('public.trafego_eventos') is not null then
    create index if not exists trafego_eventos_criado_em
      on trafego_eventos (criado_em desc);
  end if;
end $$;
