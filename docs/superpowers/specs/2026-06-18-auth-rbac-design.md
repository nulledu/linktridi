# Auth + RBAC — fundação da plataforma

Data: 2026-06-18 · Status: aprovado (Seções 1–4)

## Contexto

O DashVendas hoje é um painel de vendas (kiosk TV + dashboard de controle) com um
**único login admin** via Supabase Auth. A meta é transformá-lo na fundação de uma
plataforma ERP multi-módulo (vendas, produção, estoque, colaboradores, atividades,
analytics). Este spec cobre **apenas a fundação**: autenticação por usuário + RBAC +
shell + gestão de usuários. Os módulos de domínio virão em ciclos próprios.

## Decomposição da plataforma (referência)

Ordem: **Auth/RBAC → Shell → Colaboradores → Tarefas/Rotinas → Estoque → Produção →
Analytics**. Vendas já existe; integra cedo. Cada módulo = spec/plano/implementação
própria.

## Papéis (fixos)

| Papel | Acesso |
|-------|--------|
| `admin` | Tudo |
| `gerente_producao` | Só Produção |
| `gerente_vendas` | Só Vendas |
| `estoquista` | Só Estoque |
| `colaborador` | Só "Minhas atividades" |

Colaborador = usuário do sistema (1:1). O cadastro no RH cria o login com papel.

## Seção 1 — Modelo de dados

Tabela `profiles` (Supabase novo, não o ERP legado), 1:1 com `auth.users`:

```
profiles
  id           uuid PK, FK → auth.users.id (on delete cascade)
  username     text UNIQUE NOT NULL        -- login
  name         text NOT NULL               -- exibição
  role         text NOT NULL CHECK (5 papéis)
  active       bool NOT NULL default true
  password_set bool NOT NULL default false -- false até 1º login definir senha
  created_at   timestamptz default now()
```

- Email sintético interno `{username}@tridi.local` em `auth.users` (usuário nunca vê).
- RLS: usuário lê só o próprio profile; escrita/gestão via service_role nas rotas.
- Migration `supabase/migrations/0002_auth_rbac.sql` + seed do admin atual.

## Seção 2 — Autenticação (login por username)

- Form de login: `username` + `senha`. Sem email visível.
- Rota `POST /api/auth/login` (server, cookie-bound):
  1. Resolve `profile` por username via service_role. Inexistente/inativo → 401.
  2. `email = {username}@tridi.local`.
  3. **1º acesso (`password_set=false`, opção C):** a senha digitada é cadastrada
     (admin `updateUserById`), `password_set=true`. Sem prova de identidade extra
     (confiança interna — trade-off aceito).
  4. `signInWithPassword({email, senha})` no client cookie-bound → grava sessão.
- Troca de senha: usuário comum **não** tem. Só o admin reseta (volta
  `password_set=false`; pessoa redefine no próximo login).

## Seção 3 — Gating (RBAC)

`lib/rbac.ts` é a fonte única: mapa papel → módulos, `canAccess(role, key)`,
`homeFor(role)`.

```
admin             → todos
gerente_producao  → producao
gerente_vendas    → vendas
estoquista        → estoque
colaborador       → minhas-atividades
```

Três camadas: (1) `middleware.ts` exige sessão fora das rotas públicas; (2) layout do
shell + `requireRole([...])` nas páginas/rotas de API; (3) nav só mostra links
permitidos. Negação = redirect pra home do papel, não tela de erro.

## Seção 4 — Shell e rotas

```
app/
  (plataforma)/            -- layout shell (sidebar+topbar) + guard
    inicio/                -- redireciona p/ home do papel
    vendas/                -- módulo real (dashboard de controle atual)
    producao/  estoque/  colaboradores/  minhas-atividades/   -- placeholders "em breve"
    usuarios/              -- gestão de usuários (admin)
  login/                   -- username + 1º acesso
  painel/                  -- INTOCADO (kiosk TV, público p/ tv-app)
  api/
    auth/login, auth/logout
    users/  +  users/[id]  -- CRUD admin
```

`/painel`, `/api/sales`, `/api/config` ficam **públicos e intocados** — o tv-app
Android e o kiosk dependem deles. O `DashboardClient` atual é renderizado dentro de
`vendas/`.

## Gestão de usuários (admin)

`/usuarios`: listar, criar (username+nome+papel; cria auth user + profile,
`password_set=false`), editar (nome/papel/ativo), resetar senha, desativar. Rotas
`GET/POST /api/users` e `PUT/DELETE /api/users/[id]` — todas exigem `requireRole(['admin'])`.

## Testes

- Unit (`vitest`): `lib/rbac.ts` — `canAccess` e `homeFor` para cada papel.
- Verificação manual no preview: login 1º acesso define senha; papéis veem só seus
  módulos; admin gerencia usuários; `/painel` e `/api/sales` seguem públicos.

## Fora de escopo

Conteúdo real dos módulos produção/estoque/colaboradores/atividades; recuperação de
senha self-service; auditoria/log de acesso; rotação das credenciais legadas.
