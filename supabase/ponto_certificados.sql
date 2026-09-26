-- ── Certificado de batida ────────────────────────────────────────────────────
-- Rodar DEPOIS de ponto.sql. Pode rodar de novo sem estragar nada.
--
-- Em vez de guardar o ROSTO pra sempre, a batida ganha um atestado assinado:
-- o pós-processamento (scripts/ponto-certificar.py, no Mac) re-verifica a
-- selfie com o modelo forte e grava aqui o veredito + hash da imagem + HMAC.
-- Alterou qualquer campo → a assinatura quebra. Com o certificado emitido, a
-- selfie pode ser apagada depois do prazo de contestação: fica a prova, sem o
-- dado sensível.
create table if not exists ponto_certificados (
  registro_id  uuid primary key references ponto_registros(id) on delete cascade,
  dados        jsonb not null,        -- pessoa, instante, local, scores, modelo, sha256 da selfie
  assinatura   text not null,         -- HMAC-SHA256(dados canônicos, PONTO_CERT_KEY)
  emitido_em   timestamptz not null default now()
);
alter table ponto_certificados enable row level security;   -- só service role
