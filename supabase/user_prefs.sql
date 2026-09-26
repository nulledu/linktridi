-- Preferências de UI por usuário — pra o painel personalizado seguir a conta
-- entre dispositivos (celular, notebook, tablet). Hoje o layout do Tráfego Pago
-- (cockpit) e as colunas da tabela de Campanhas são salvos por usuário; com esta
-- tabela eles sincronizam no servidor além do localStorage.
-- Chave-valor por (user_id, key): cada preferência é um jsonb independente.
-- Rodar no Supabase NOVO (tzariztovuuwyeoogbxg).
create table if not exists public.user_prefs (
  user_id    text not null,                    -- profiles.id (auth user)
  key        text not null,                    -- ex.: "trafego.layout", "trafego.colunas"
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Consulta padrão: todas as prefs de um usuário.
create index if not exists user_prefs_user_idx on public.user_prefs (user_id);
