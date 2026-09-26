# Níveis de acesso (RBAC) — como funciona

O sistema tem **5 níveis**. Cada pessoa tem **um papel** (`profiles.role`), e o papel
define o nível. Fonte única da verdade: [`lib/rbac.ts`](../lib/rbac.ts) — toda permissão
sai dali (`MODULES`, `ROLE_LEVEL`, `canAccess`, `canSeeCusto`). Não há permissão solta
espalhada pelo código; para mexer em quem vê o quê, mexe-se só no `rbac.ts`.

## Os 5 níveis

| Nível | Papel (`role`)        | Vê custo? | O que acessa |
|-------|-----------------------|-----------|--------------|
| **5** | `admin`               | ✅ **sim** | Tudo. Único que vê **custos** e financeiro. Cria colaboradores, configura o sistema. |
| **4** | `gerente_vendas`      | ❌ não    | Analytics/Vendas + Colaboradores. Vê faturamento, **não** vê custo de itens. |
| **4** | `gerente_producao`    | ❌ não    | Produção, Design, Logística, Estoque + Colaboradores. **Não** vê custo. |
| **3** | `estoquista`          | ❌ não    | Estoque (quantidades, itens). **Não** vê custo dos itens. |
| **2** | `colaborador`         | ❌ não    | Operacional: registra as próprias vendas/atividades. Vê só o que é dele. |
| **1** | (reservado)           | ❌ não    | Dispositivos/quiosque-tablet (chão de fábrica), sem painel. |

> Há **dois papéis no nível 4** (gerência de vendas e de produção) de propósito: mesmo
> "andar" de poder, áreas diferentes. Quem decide é a área (`MODULES.roles`), não o número.

## Regra de CUSTO (o ponto sensível)

Custo de componentes/peças/produtos é **confidencial**. Só o **admin** (nível 5) vê.

Isso é garantido em **dois lugares** (defesa em profundidade):

1. **Backend** — [`app/api/estoque-itens/route.ts`](../app/api/estoque-itens/route.ts): no
   `GET`, se `canSeeCusto(role)` for falso, o campo `custo` é **removido do JSON** antes de
   sair do servidor. Não-admin nunca recebe o número, nem pelo DevTools/Network.
2. **Frontend** — [`CatalogoClient.tsx`](../app/(plataforma)/estoque/CatalogoClient.tsx): só
   renderiza custo e o campo de edição quando `podeVerCusto` (vindo do backend).

Escrita de custo (`POST`/`PATCH`) também é gateada: só admin grava `custo`.

## Como adicionar gente nova com outros cargos

1. O **cargo** (`employees.cargo`, ex: "Vendedora", "Designer") é texto livre, só descritivo.
2. O que importa para permissão é o **papel** (`role`). Mapeie o cargo novo para o papel
   de nível mais próximo na hora de criar o colaborador.
3. Se surgir uma área nova no sistema, adicione um item em `MODULES` com os `roles` que
   podem ver — e pronto, a sidebar e os guards se ajustam sozinhos.
4. Para um recurso novo ser "só admin" (como custo), use/estenda `canSeeCusto` ou crie um
   helper igual em `rbac.ts`. **Nunca** cheque `role === "admin"` espalhado no código.

## Catálogo de estoque (origem dos dados)

Componentes-peças, peças e produtos + **custos** foram importados do *Sistema de Custos*
(`levantamento-custo`). SQL de importação: [`supabase/estoque_custos.sql`](../supabase/estoque_custos.sql)
(cria a coluna `estoque_itens.custo` e faz upsert idempotente por `lower(nome)+tipo`).
