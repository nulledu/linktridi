# Módulo Colaboradores / RH

Data: 2026-06-18 · Status: implementado

## Contexto

2º módulo do roadmap (depois de Auth+RBAC). Cadastro e gestão de colaboradores.
Decisão anterior: **colaborador = usuário** (1:1). Este módulo **absorve** a tela
`/usuarios` criada na fundação — passa a ser o cadastro único (acesso + dados de RH).

## Decisões

- **A) `employees` estende `profiles`** (1:1). Uma pessoa = um registro.
- **Campos de RH:** foto, cargo, setor, telefone/WhatsApp, data de admissão,
  observações. Status = `profiles.active`.
- **Setor = lista fixa:** `Vendas`, `Produção`, `Estoque`, `Administrativo`.
- **A) Colaboradores absorve `/usuarios`** — uma tela só; `/usuarios` e `/api/users`
  removidos.

## Dados

Migration `supabase/migrations/0003_colaboradores.sql`:

```
employees
  id            uuid PK, FK → profiles.id (on delete cascade)
  photo_url     text
  cargo         text
  setor         text CHECK (Vendas|Produção|Estoque|Administrativo)
  telefone      text
  data_admissao date
  observacoes   text
  updated_at    timestamptz default now()
```

RLS: `employees_self_read` (id = auth.uid()). Gestão via service_role nas rotas.

## RBAC

`lib/rbac.ts`: módulo `usuarios` removido; `colaboradores` vira `ready: true`,
acesso só `admin`.

## Rotas / UI

- `GET/POST /api/colaboradores` — lista (join `profiles`+`employees`) e cria
  (auth user + profile + employee, `password_set=false`).
- `PUT/DELETE /api/colaboradores/[id]` — edita perfil + RH + reset senha / remove.
  Mantém as regras anti-auto-trancamento (admin não se desativa, rebaixa ou exclui).
- `/colaboradores` — lista com foto/cargo/setor/papel/status; form de novo
  colaborador (com upload de foto no bucket `photos`); edição inline por linha.

## Testes

`lib/__tests__/rbac.test.ts` atualizado (sem `usuarios`; `colaboradores` só admin).
Build Next + `vitest` verdes.

## Fora de escopo

Tarefas/rotinas/atividades (próximo módulo); CPF/salário/documentos; importação em
massa.
