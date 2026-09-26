# Integração Financeira Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar compromissos, recorrências e seus cadastros com criação cruzada transacional, previsões idempotentes na agenda e upload confiável de marca de empresa.

**Architecture:** Uma única unidade de domínio materializa uma competência de recorrência e é compartilhada por geração unitária e em lote. Uma RPC Postgres cria regra e primeira ocorrência na mesma transação; a UI apenas envia intenção, nunca origem ou chave idempotente. Previsões continuam calculadas sem persistência e são unidas à agenda no servidor, enquanto o upload de marca ganha compensação de storage.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres, Vitest, PGlite, CSS responsivo existente.

**Spec:** `docs/superpowers/specs/2026-08-24-integracao-financeira-design.md`

## Global Constraints

- Não modificar nem incluir em commits mudanças não relacionadas já presentes no worktree.
- Toda iconografia visível usa `app/(plataforma)/Icon.tsx` com paths oficiais do Tabler; nenhum emoji.
- Toda interface funciona a partir de 320 px, usa `var(--tap)`, `dvh` e os componentes responsivos existentes.
- O navegador não define livremente `origem`, `origem_id` ou `idempotency_key`.
- Fornecedor e contato são favorecidos mutuamente exclusivos.
- Compromissos materializados nunca são reescritos ao editar a recorrência.
- Cada comportamento novo segue RED → GREEN → REFACTOR e cada tarefa termina em commit isolado.

---

### Task 1: Contrato de dados compartilhado

**Files:**
- Modify: `supabase/financeiro_contato_empresa.sql`
- Modify: `lib/financeiro/tipos.ts`
- Modify: `lib/financeiro/db.ts`
- Modify: `lib/financeiro/campos-novos.ts`
- Test: `lib/__tests__/financeiro-contato-empresa.test.ts`

**Interfaces:**
- Consumes: tabelas `fin_contatos`, `fin_recorrencias`, `fin_compromissos` e `fin_confere_empresa` de `supabase/financeiro.sql`.
- Produces: `Contato.natureza`, `Contato.organizacao_id`, `Recorrencia.contato_id`, `Compromisso.contato_id` e validações de mesma empresa.

- [ ] **Step 1: Acrescentar testes SQL que falham para `fin_compromissos.contato_id`**

```ts
it("compromisso aceita contato da mesma empresa", async () => {
  const contato = await uuid(
    "insert into public.fin_contatos (empresa_id, nome) values ($1, 'Locador') returning id", [tridi]);
  const compromisso = await uuid(
    `insert into public.fin_compromissos
      (empresa_id, descricao, valor, vencimento, contato_id)
     values ($1, 'Aluguel', 1000, '2026-08-10', $2) returning id`, [tridi, contato]);
  const { rows } = await db.query<{ contato_id: string }>(
    "select contato_id from public.fin_compromissos where id = $1", [compromisso]);
  expect(rows[0].contato_id).toBe(contato);
});

it("compromisso recusa contato de outra empresa", async () => {
  const contato = await uuid(
    "insert into public.fin_contatos (empresa_id, nome) values ($1, 'Gedux') returning id", [gedux]);
  await expect(db.query(
    `insert into public.fin_compromissos
      (empresa_id, descricao, valor, vencimento, contato_id)
     values ($1, 'Errado', 1000, '2026-08-10', $2)`, [tridi, contato]))
    .rejects.toThrow(/outra empresa/);
});
```

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `npx vitest run lib/__tests__/financeiro-contato-empresa.test.ts`
Expected: FAIL porque `fin_compromissos.contato_id` ainda não existe.

- [ ] **Step 3: Adicionar a coluna e recriar o trigger com a lista completa**

```sql
alter table public.fin_compromissos
  add column if not exists contato_id uuid references public.fin_contatos(id) on delete set null;

drop trigger if exists fin_compromissos_empresa_ok on public.fin_compromissos;
create trigger fin_compromissos_empresa_ok before insert or update on public.fin_compromissos
  for each row execute function public.fin_confere_empresa(
    'conta_id,fin_contas', 'fornecedor_id,fin_fornecedores',
    'colaborador_id,fin_colaboradores', 'contato_id,fin_contatos');
```

Atualizar tipos, seleções tolerantes e fallback de schema para expor `contato_id` sem quebrar banco ainda não migrado.

- [ ] **Step 4: Executar os testes SQL e de tipos do Financeiro**

Run: `npx vitest run lib/__tests__/financeiro-contato-empresa.test.ts lib/__tests__/financeiro-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/financeiro_contato_empresa.sql lib/financeiro/tipos.ts lib/financeiro/db.ts lib/financeiro/campos-novos.ts lib/__tests__/financeiro-contato-empresa.test.ts
git commit -m "feat(financeiro): liga contatos a obrigações"
```

### Task 2: Materialização exata de uma competência

**Files:**
- Create: `lib/financeiro/materializar-recorrencia.ts`
- Modify: `lib/financeiro/escrita.ts`
- Modify: `app/api/financeiro/recorrencias/gerar/route.ts`
- Create: `app/api/financeiro/recorrencias/materializar/route.ts`
- Create: `lib/__tests__/financeiro-materializar-recorrencia.test.ts`

**Interfaces:**
- Consumes: `geracoesPendentes()`, `chaveDaRecorrencia()` e cliente Supabase administrativo.
- Produces: `materializarOcorrencia(empresaId: string, recorrenciaId: string, competencia: string, autor: Autor): Promise<Resultado<{ id: string | null; criado: boolean }>>`.

- [ ] **Step 1: Escrever testes de domínio para competência exata e idempotência**

```ts
it("materializa somente a competência solicitada", async () => {
  const r = await materializarOcorrencia(tridi, recorrencia, "2026-09-01", autor);
  expect(r).toMatchObject({ ok: true, dados: { criado: true } });
  const { rows } = await db.query(
    "select competencia from public.fin_compromissos where origem_id = $1 order by competencia", [recorrencia]);
  expect(rows).toEqual([{ competencia: "2026-09-01" }]);
});

it("a segunda materialização devolve o mesmo compromisso", async () => {
  const a = await materializarOcorrencia(tridi, recorrencia, "2026-09-01", autor);
  const b = await materializarOcorrencia(tridi, recorrencia, "2026-09-01", autor);
  expect(b).toMatchObject({ ok: true, dados: { criado: false, id: a.dados?.id } });
});

it("recusa competência fora da cadência", async () => {
  const r = await materializarOcorrencia(tridi, recorrencia, "2026-09-15", autor);
  expect(r).toEqual({ ok: false, erro: "Competência não pertence a esta recorrência." });
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run lib/__tests__/financeiro-materializar-recorrencia.test.ts`
Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Implementar a unidade de domínio mínima**

```ts
export async function materializarOcorrencia(
  empresaId: string, recorrenciaId: string, competencia: string, autor: Autor,
): Promise<Resultado<{ id: string | null; criado: boolean }>> {
  // carrega regra por empresa; valida competência com geracoesPendentes;
  // procura a chave antes do upsert; faz upsert e devolve criado/id;
  // avança proxima_competencia apenas quando materializou a próxima esperada.
}
```

Extrair de `gerarRecorrencias` o loop que chama essa função para cada geração pendente. A rota unitária aceita somente `{ empresa_id, recorrencia_id, competencia }`, valida UUID/data e exige `financeiro:compromissos`.

- [ ] **Step 4: Executar testes de materialização e geração em lote**

Run: `npx vitest run lib/__tests__/financeiro-materializar-recorrencia.test.ts lib/__tests__/financeiro-recorrencias.test.ts`
Expected: PASS e nenhuma competência extra criada.

- [ ] **Step 5: Commit**

```bash
git add lib/financeiro/materializar-recorrencia.ts lib/financeiro/escrita.ts app/api/financeiro/recorrencias/gerar/route.ts app/api/financeiro/recorrencias/materializar/route.ts lib/__tests__/financeiro-materializar-recorrencia.test.ts
git commit -m "feat(financeiro): materializa recorrência por competência"
```

### Task 3: Previsões ligadas à agenda

**Files:**
- Modify: `lib/financeiro/previsoes.ts`
- Modify: `lib/__tests__/previsoes.test.ts`
- Modify: `app/(plataforma)/financeiro/compromissos/page.tsx`
- Modify: `app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx`
- Modify: `app/dev-mobile/ProvaFinanceiro.tsx`
- Test: `lib/__tests__/financeiro-telas.test.ts`

**Interfaces:**
- Consumes: `previsoesDaAgenda(regras, compromissos, ate, hoje)` e POST `/api/financeiro/recorrencias/materializar`.
- Produces: agenda combinada com discriminante `prevista`, detalhe de previsão e totais separados.

- [ ] **Step 1: Escrever testes que exigem ligação servidor → cliente e rota correta**

```ts
it("a página de compromissos entrega previsões calculadas", () => {
  const fonte = ler("app/(plataforma)/financeiro/compromissos/page.tsx");
  expect(fonte).toContain("recorrencias(escopo");
  expect(fonte).toContain("previsoesDaAgenda(");
  expect(fonte).toContain("previsoes={previsoes}");
});

it("previsão materializa pela rota de recorrência", () => {
  const fonte = ler("app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx");
  expect(fonte).toContain('/api/financeiro/recorrencias/materializar');
  expect(fonte).not.toContain('idempotency_key: p.chave');
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run lib/__tests__/previsoes.test.ts lib/__tests__/financeiro-telas.test.ts`
Expected: FAIL porque a página não carrega previsões e o cliente usa a rota manual.

- [ ] **Step 3: Ligar dados e corrigir comportamento da linha prevista**

No servidor, carregar recorrências em paralelo, calcular `const previsoes = previsoesDaAgenda(fRegras.dados, fCompromissos.dados, ate, hoje)` e passar ao cliente. No cliente, abrir detalhe da previsão ao clicar; a ação explícita envia:

```ts
await enviar("/api/financeiro/recorrencias/materializar", "POST", {
  empresa_id: p.empresa_id,
  recorrencia_id: p.recorrencia_id,
  competencia: p.competencia,
});
```

Adicionar `empresa_id` a `PrevisaoDaAgenda`, necessário em Visão geral. Totais exibem `lançado` e `previsto` separadamente.

- [ ] **Step 4: Executar testes puros, de tela e typecheck**

Run: `npx vitest run lib/__tests__/previsoes.test.ts lib/__tests__/financeiro-telas.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/financeiro/previsoes.ts lib/__tests__/previsoes.test.ts app/\(plataforma\)/financeiro/compromissos/page.tsx app/\(plataforma\)/financeiro/compromissos/CompromissosClient.tsx app/dev-mobile/ProvaFinanceiro.tsx lib/__tests__/financeiro-telas.test.ts
git commit -m "feat(financeiro): mostra recorrências na agenda"
```

### Task 4: Criação conjunta transacional

**Files:**
- Create: `supabase/financeiro_compromisso_recorrente.sql`
- Create: `lib/financeiro/compromisso-recorrente.ts`
- Create: `lib/__tests__/financeiro-compromisso-recorrente.test.ts`
- Modify: `app/api/financeiro/compromissos/route.ts`
- Modify: `app/api/financeiro/recorrencias/route.ts`

**Interfaces:**
- Consumes: permissões `compromissos` e `cadastros`, ids validados e cálculo de próxima competência.
- Produces: `criarCompromissoRecorrente(entrada: EntradaCompromissoRecorrente, autor: Autor)` e RPC `fin_criar_compromisso_recorrente`, retornando `{ compromisso_id, recorrencia_id }`.

- [ ] **Step 1: Escrever teste PGlite da RPC transacional**

```ts
it("cria regra e primeira ocorrência ligadas", async () => {
  const { rows } = await db.query<{ compromisso_id: string; recorrencia_id: string }>(
    "select * from public.fin_criar_compromisso_recorrente($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [tridi, "Aluguel", "aluguel", 8000, "2026-08-10", "mensal", 1, 10, null, autor]);
  const ids = rows[0];
  const { rows: compromisso } = await db.query(
    "select origem, origem_id, idempotency_key from public.fin_compromissos where id = $1", [ids.compromisso_id]);
  expect(compromisso[0]).toMatchObject({ origem: "recorrencia", origem_id: ids.recorrencia_id });
  expect(compromisso[0].idempotency_key).toBe(`rec:${ids.recorrencia_id}:2026-08`);
});

it("não deixa recorrência órfã quando o compromisso falha", async () => {
  await expect(chamarRpcComValorInvalido()).rejects.toThrow();
  const { rows } = await db.query("select id from public.fin_recorrencias where descricao = 'Falha'");
  expect(rows).toHaveLength(0);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run lib/__tests__/financeiro-compromisso-recorrente.test.ts`
Expected: FAIL porque a função SQL não existe.

- [ ] **Step 3: Implementar RPC idempotente e adaptadores de API**

A função SQL cria a regra, calcula a chave da competência inicial, cria o compromisso ligado e define `proxima_competencia` para o próximo passo. O adaptador TypeScript valida favorecido mutuamente exclusivo e chama `db().rpc("fin_criar_compromisso_recorrente", params)`.

As rotas aceitam intenção explícita:

```ts
type RecorrenciaNoCompromisso = {
  ativa: true;
  periodicidade: Periodicidade;
  intervalo_meses: number;
  dia_vencimento: number;
  fim: string | null;
};

type PrimeiraOcorrenciaNaRegra = { lancar_primeira: boolean };
```

A rota de compromisso exige as duas permissões quando `recorrencia.ativa`; a rota de recorrência exige também `compromissos` quando `lancar_primeira`.

- [ ] **Step 4: Executar testes de RPC, rotas e segurança**

Run: `npx vitest run lib/__tests__/financeiro-compromisso-recorrente.test.ts lib/__tests__/financeiro-rotas.test.ts`
Expected: PASS, inclusive rollback e permissão dupla.

- [ ] **Step 5: Commit**

```bash
git add supabase/financeiro_compromisso_recorrente.sql lib/financeiro/compromisso-recorrente.ts lib/__tests__/financeiro-compromisso-recorrente.test.ts app/api/financeiro/compromissos/route.ts app/api/financeiro/recorrencias/route.ts
git commit -m "feat(financeiro): cria compromisso e recorrência juntos"
```

### Task 5: Formulários cruzados e favorecido único

**Files:**
- Modify: `app/(plataforma)/financeiro/compromissos/page.tsx`
- Modify: `app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx`
- Modify: `app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx`
- Modify: `app/(plataforma)/financeiro/cadastros/recorrencias/page.tsx`
- Modify: `app/dev-mobile/ProvaFinanceiro.tsx`
- Test: `lib/__tests__/financeiro-telas.test.ts`

**Interfaces:**
- Consumes: contratos das rotas da Task 4 e listas de contatos/fornecedores/contas.
- Produces: opção `Repetir este compromisso`, opção `Lançar a primeira ocorrência agora` e seletores mutuamente exclusivos.

- [ ] **Step 1: Acrescentar testes estáticos e de payload dos dois formulários**

```ts
it("compromisso oferece recorrência e envia a intenção", () => {
  const fonte = ler("app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx");
  expect(fonte).toContain("Repetir este compromisso");
  expect(fonte).toContain("recorrencia:");
});

it("recorrência oferece lançar a primeira ocorrência", () => {
  const fonte = ler("app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx");
  expect(fonte).toContain("Lançar a primeira ocorrência agora");
  expect(fonte).toContain("lancar_primeira");
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run lib/__tests__/financeiro-telas.test.ts`
Expected: FAIL porque os controles ainda não existem.

- [ ] **Step 3: Implementar os campos usando o kit existente**

Estender os rascunhos com valores explícitos, revelar os campos condicionais sem `hover`, limpar `contato_id` ao selecionar fornecedor e vice-versa, e enviar somente os campos definidos nas Tasks 1 e 4. Em Visão geral, usar a empresa escolhida no rascunho para filtrar as opções relacionadas.

- [ ] **Step 4: Executar teste de tela e typecheck**

Run: `npx vitest run lib/__tests__/financeiro-telas.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/\(plataforma\)/financeiro/compromissos/page.tsx app/\(plataforma\)/financeiro/compromissos/CompromissosClient.tsx app/\(plataforma\)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx app/\(plataforma\)/financeiro/cadastros/recorrencias/page.tsx app/dev-mobile/ProvaFinanceiro.tsx lib/__tests__/financeiro-telas.test.ts
git commit -m "feat(financeiro): cruza formulários de recorrência"
```

### Task 6: Navegação entre origem e ocorrências

**Files:**
- Modify: `app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx`
- Modify: `app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx`
- Modify: `app/(plataforma)/financeiro/cadastros/recorrencias/page.tsx`
- Modify: `lib/financeiro/db.ts`
- Test: `lib/__tests__/financeiro-telas.test.ts`

**Interfaces:**
- Consumes: `origem`, `origem_id`, query params `recorrencia` e `compromisso`.
- Produces: links estáveis da agenda para a regra e da regra para seus compromissos.

- [ ] **Step 1: Escrever testes dos links e filtros**

```ts
it("compromisso recorrente abre a regra de origem", () => {
  const fonte = ler("app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx");
  expect(fonte).toContain('/financeiro/cadastros/recorrencias?regra=');
});

it("recorrência abre a agenda filtrada", () => {
  const fonte = ler("app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx");
  expect(fonte).toContain('/financeiro/compromissos?recorrencia=');
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run lib/__tests__/financeiro-telas.test.ts`
Expected: FAIL porque não há navegação cruzada.

- [ ] **Step 3: Implementar query params e ações com ícones Tabler**

Adicionar `Ver recorrência` no detalhe do compromisso quando `origem === "recorrencia"`; adicionar `Ver compromissos` na ficha da regra. O filtro `recorrencia` limita linhas por `origem_id` sem esconder previsões da mesma regra.

- [ ] **Step 4: Executar testes de tela**

Run: `npx vitest run lib/__tests__/financeiro-telas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/\(plataforma\)/financeiro/compromissos/CompromissosClient.tsx app/\(plataforma\)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx app/\(plataforma\)/financeiro/cadastros/recorrencias/page.tsx lib/financeiro/db.ts lib/__tests__/financeiro-telas.test.ts
git commit -m "feat(financeiro): navega entre regra e obrigação"
```

### Task 7: Upload de marca com compensação

**Files:**
- Modify: `lib/financeiro/anexos.ts`
- Modify: `app/api/financeiro/marca/route.ts`
- Create: `lib/__tests__/financeiro-marca.test.ts`

**Interfaces:**
- Consumes: bucket privado `financeiro`, `TABELA_DA_MARCA` e cliente Supabase administrativo.
- Produces: `trocarLogo(db: ClienteDeMarca, entrada: EntradaDeMarca)` com consulta honesta, atualização compensada e limpeza do caminho anterior.

- [ ] **Step 1: Escrever testes do serviço com cliente injetável**

```ts
it("remove o upload novo quando atualizar a linha falha", async () => {
  const db = bancoDeMarca({ updateError: new Error("falhou") });
  const r = await trocarLogo(db, entradaEmpresa);
  expect(r).toEqual({ ok: false, erro: "falhou" });
  expect(db.storage.removidos).toEqual([expect.stringContaining("logos/empresa/")]);
});

it("remove o caminho antigo somente depois do update", async () => {
  const db = bancoDeMarca({ logoAtual: "logos/empresa/antigo.png" });
  await trocarLogo(db, entradaEmpresa);
  expect(db.eventos).toEqual(["upload:nova", "update:nova", "remove:antiga"]);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run lib/__tests__/financeiro-marca.test.ts`
Expected: FAIL porque o serviço compensado ainda não existe.

- [ ] **Step 3: Extrair e implementar o serviço**

```ts
export async function trocarLogo(db: ClienteDeMarca, entrada: EntradaDeMarca): Promise<ResultadoMarca> {
  // valida registro e obtém logo_url atual;
  // faz upload novo;
  // atualiza logo_url;
  // remove novo em caso de falha no update;
  // remove antigo somente após sucesso.
}
```

A rota converte erros de consulta em 400/404/503/500 distintos e nunca chama “não encontrado” quando o cliente retornou erro.

- [ ] **Step 4: Executar testes do serviço e rotas financeiras**

Run: `npx vitest run lib/__tests__/financeiro-marca.test.ts lib/__tests__/financeiro-rotas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/financeiro/anexos.ts app/api/financeiro/marca/route.ts lib/__tests__/financeiro-marca.test.ts
git commit -m "fix(financeiro): torna troca de marca consistente"
```

### Task 8: Verificação integrada e mobile

**Files:**
- Modify if required by discovered regressions: only files already owned by Tasks 1–7.
- Test: `lib/__tests__/previsoes.test.ts`
- Test: `lib/__tests__/financeiro-contato-empresa.test.ts`
- Test: `lib/__tests__/financeiro-materializar-recorrencia.test.ts`
- Test: `lib/__tests__/financeiro-compromisso-recorrente.test.ts`
- Test: `lib/__tests__/financeiro-marca.test.ts`
- Test: `lib/__tests__/financeiro-telas.test.ts`

**Interfaces:**
- Consumes: entrega completa das Tasks 1–7.
- Produces: evidência fresca de testes, tipos, build e comportamento responsivo.

- [ ] **Step 1: Executar a suíte financeira completa**

Run: `npx vitest run lib/__tests__/financeiro-*.test.ts lib/__tests__/previsoes.test.ts`
Expected: PASS sem erros não tratados.

- [ ] **Step 2: Executar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: ambos com exit code 0.

- [ ] **Step 3: Iniciar o app e verificar `/dev-mobile`**

Run: `npm run dev`

Em 320, 375 e 430 px, nos temas claro e escuro:

```js
document.documentElement.scrollWidth - document.documentElement.clientWidth
```

Expected: `0`. Medir botões novos por `offsetHeight` e `offsetWidth`; Expected: pelo menos `44` no eixo de toque relevante.

- [ ] **Step 4: Verificar os fluxos integrados na prova sem login**

Confirmar visualmente: compromisso com recorrência, recorrência com primeira ocorrência, previsão com detalhe e botão de materialização, navegação cruzada e erro legível de marca. Recarregar após redimensionar quando `useIsMobile()` estiver envolvido.

- [ ] **Step 5: Conferir escopo git e registrar correções finais**

Run: `git diff --check && git status --short`
Expected: nenhum whitespace error e nenhuma mudança não relacionada incluída nos commits financeiros.

- [ ] **Step 6: Commit de correções de integração, somente se necessário**

```bash
git add lib/financeiro app/api/financeiro app/\(plataforma\)/financeiro app/dev-mobile/ProvaFinanceiro.tsx supabase/financeiro_contato_empresa.sql supabase/financeiro_compromisso_recorrente.sql lib/__tests__/financeiro-*.test.ts lib/__tests__/previsoes.test.ts
git commit -m "fix(financeiro): fecha integração entre abas"
```
