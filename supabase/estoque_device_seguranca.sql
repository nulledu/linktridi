-- ── Estoque · segurança do leitor do galpão ──────────────────────────────────
-- Rode no Supabase NOVO (o mesmo de supabase/estoque_dispositivos.sql).
-- Idempotente: rodar duas vezes não faz mal.
--
-- Fecha o achado M6 da auditoria (docs/seguranca-auditoria.md): o código de
-- ativação é de uso único, mas NÃO expirava — um código escrito no aparelho e
-- nunca usado valia pra sempre. Agora pode ter prazo.
--
-- RODE O ARQUIVO INTEIRO de uma vez (begin/commit protege contra ficar parado
-- no meio).

begin;

-- Prazo do código de ativação. NULL = sem prazo (compatível com os códigos que
-- já existem). A rota /api/estoque/device/activate recusa código vencido e é
-- TOLERANTE à ausência desta coluna: tenta com o filtro de expiração e, se a
-- coluna ainda não existe (42703), refaz sem — então subir o código antes de
-- rodar este arquivo não trava a ativação de ninguém no intervalo.
alter table public.estoque_dispositivos
  add column if not exists codigo_expira_em timestamptz;

commit;

-- ── Como cadastrar um aparelho novo com código FORTE e com prazo ──────────────
-- Não há tela de cadastro ainda: o dispositivo entra por SQL. Gere um código
-- com entropia de verdade e uma janela curta — é o que o brute force (agora
-- freado por IP em /activate) procura, e quanto mais bits + menor a janela,
-- menos ele importa. Exemplo (requer pgcrypto, já usado por gen_random_uuid):
--
--   insert into public.estoque_dispositivos (nome, codigo_ativacao, codigo_expira_em)
--   values (
--     'Leitor do galpão (novo)',
--     encode(gen_random_bytes(6), 'hex'),      -- ~48 bits, 12 chars digitáveis
--     now() + interval '24 hours'
--   )
--   returning codigo_ativacao;                 -- anote e digite no aparelho
