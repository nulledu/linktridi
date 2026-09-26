# Cadastro Financeiro Unificado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar pessoas, empresas externas e fornecedores em “Contatos e empresas”, com múltiplos papéis por cadastro e imagens relacionadas nos compromissos.

**Architecture:** `fin_contatos` vira a identidade canônica; `fin_fornecedores` permanece como extensão comercial ligada por `contato_id`, preservando FKs e histórico. Uma operação transacional sincroniza identidade e extensão, enquanto consultas resolvem uma visão unificada e compromissos recebem marcas assinadas em lote.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, Vitest, PGlite.

**Spec:** `docs/superpowers/specs/2026-08-24-cadastro-financeiro-unificado-design.md`

## Global Constraints

- Um registro tem natureza única `pessoa | empresa` e múltiplos papéis entre `contato`, `fornecedor`, `cliente`, `parceiro`, `prestador`, `outro`.
- `fin_empresas` continua representando Tridi/Gedux e nunca é fundida com organizações externas.
- Histórico e FKs existentes para `fin_fornecedores` devem permanecer válidos.
- Nenhuma fusão automática por nome; somente CNPJ normalizado pode identificar organização inequívoca.
- Toda iconografia nova usa `Icon`/Tabler, nunca emoji.
- Toda UI funciona desde 320 px, sem overflow, com alvos de toque de 44 px, temas claro/escuro e folhas inferiores no celular.
- Uploads permanecem no bucket privado e URLs assinadas são resolvidas em lote no servidor.
- Alterações do Financeiro exigem `financeiro:cadastros`; leitura de compromissos não pode receber dados bancários.

## Estrutura de arquivos

- `supabase/financeiro_cadastro_unificado.sql`: schema, backfill, constraints e RPC transacional.
- `lib/financeiro/partes.ts`: vocabulário de papéis, normalização e resolução do relacionado.
- `lib/financeiro/tipos.ts`: contratos `Contato`, `Fornecedor` e `RelacionadoFinanceiro`.
- `lib/financeiro/db.ts`: consultas tolerantes da identidade/extensão unificadas.
- `lib/financeiro/marca-relacionada.ts`: escolhe a marca de compromisso/previsão sem conhecer React.
- `app/api/financeiro/contatos/**`: escrita unificada e compatibilidade do cadastro canônico.
- `app/api/financeiro/fornecedores/**`: adaptadores legados para a mesma escrita.
- `app/api/financeiro/marca/route.ts`: resolve fornecedor para contato canônico.
- `app/(plataforma)/financeiro/cadastros/contatos/**`: diretório e sidepanel unificados.
- `app/(plataforma)/financeiro/cadastros/fornecedores/page.tsx`: redirecionamento compatível.
- `app/(plataforma)/financeiro/compromissos/**`: relacionado unificado e imagem.
- `app/(plataforma)/financeiro/cadastros/recorrencias/**`: mesmo seletor e marca nas previsões.

---

### Task 1: Schema e backfill seguros

**Files:**
- Create: `supabase/financeiro_cadastro_unificado.sql`
- Create: `lib/__tests__/financeiro-cadastro-unificado-sql.test.ts`

**Interfaces:**
- Produces: colunas `fin_contatos.papeis text[]`, `fin_contatos.cnpj text`, `fin_fornecedores.contato_id uuid`.
- Produces: RPC `fin_salvar_parte(p_entrada jsonb, p_user_id uuid) returns jsonb`.

- [ ] **Step 1: Escrever teste PGlite que sobe o schema antigo**

```ts
it("liga fornecedor a uma identidade sem fundir homônimos", async () => {
  await db.exec(schemaBase + fornecedorCompleto);
  await db.exec(`insert into fin_fornecedores(id, empresa_id, nome, cnpj)
    values ('00000000-0000-0000-0000-000000000010', EMPRESA, 'Atlas', null),
           ('00000000-0000-0000-0000-000000000011', EMPRESA, 'Atlas', null)`);
  await db.exec(migracao);
  const r = await db.query(`select count(distinct contato_id)::int as n from fin_fornecedores where nome='Atlas'`);
  expect(r.rows[0].n).toBe(2);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run lib/__tests__/financeiro-cadastro-unificado-sql.test.ts`
Expected: FAIL porque a migração/RPC ainda não existe.

- [ ] **Step 3: Implementar migração idempotente**

O SQL deve:

```sql
alter table public.fin_contatos
  add column if not exists papeis text[] not null default array['contato']::text[],
  add column if not exists cnpj text;
alter table public.fin_fornecedores
  add column if not exists contato_id uuid references public.fin_contatos(id) on delete restrict;
create unique index if not exists fin_fornecedores_contato on public.fin_fornecedores(contato_id) where contato_id is not null;
create unique index if not exists fin_contatos_cnpj on public.fin_contatos(empresa_id, cnpj)
  where cnpj is not null and deleted_at is null;
```

Adicionar constraint para os seis papéis, backfill por CNPJ quando inequívoco, criação separada para fornecedores sem CNPJ e RPC com validação de mesma empresa.

- [ ] **Step 4: Cobrir idempotência, CNPJ e rollback da RPC**

Adicionar testes que rodam o arquivo duas vezes, impedem CNPJ duplicado e provam que erro na extensão não deixa contato parcial.

- [ ] **Step 5: Rodar testes SQL**

Run: `npx vitest run lib/__tests__/financeiro-cadastro-unificado-sql.test.ts lib/__tests__/financeiro-sql-roda.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/financeiro_cadastro_unificado.sql lib/__tests__/financeiro-cadastro-unificado-sql.test.ts
git commit -m "feat(financeiro): unifica identidade de contatos e fornecedores"
```

### Task 2: Contratos e consultas unificadas

**Files:**
- Create: `lib/financeiro/partes.ts`
- Modify: `lib/financeiro/tipos.ts`
- Modify: `lib/financeiro/db.ts`
- Create: `lib/__tests__/financeiro-partes.test.ts`

**Interfaces:**
- Produces: `type PapelContato`, `normalizarPapeis(valor: unknown): PapelContato[]`.
- Produces: `interface ParteFinanceira extends Contato { fornecedor: Fornecedor | null }`.
- Produces: `partes(escopo, opts): Promise<Fonte<ParteFinanceira[]>>`.

- [ ] **Step 1: Escrever testes de normalização e composição**

```ts
expect(normalizarPapeis(["fornecedor", "fornecedor", "invalido"])).toEqual(["fornecedor"]);
expect(comporParte(contato, fornecedor)).toMatchObject({
  id: contato.id, nome: contato.nome, papeis: ["contato", "fornecedor"], fornecedor,
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run lib/__tests__/financeiro-partes.test.ts`
Expected: FAIL com exports ausentes.

- [ ] **Step 3: Implementar vocabulário e tipos**

```ts
export const PAPEIS_CONTATO = ["contato", "fornecedor", "cliente", "parceiro", "prestador", "outro"] as const;
export type PapelContato = typeof PAPEIS_CONTATO[number];
export interface ParteFinanceira extends Contato {
  papeis: PapelContato[];
  cnpj: string | null;
  fornecedor: Fornecedor | null;
}
```

- [ ] **Step 4: Implementar consulta tolerante**

`partes()` consulta contatos, consulta fornecedores do escopo uma vez, indexa extensões por `contato_id` e preserva fallback para schema sem colunas novas. Não fazer N+1.

- [ ] **Step 5: Rodar testes de domínio e consultas**

Run: `npx vitest run lib/__tests__/financeiro-partes.test.ts lib/__tests__/financeiro-idas.test.ts lib/__tests__/financeiro-contato-banco-recorrencia.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/financeiro/partes.ts lib/financeiro/tipos.ts lib/financeiro/db.ts lib/__tests__/financeiro-partes.test.ts
git commit -m "feat(financeiro): consulta contatos com multiplos papeis"
```

### Task 3: Escrita transacional e rotas compatíveis

**Files:**
- Create: `lib/financeiro/salvar-parte.ts`
- Modify: `app/api/financeiro/contatos/route.ts`
- Modify: `app/api/financeiro/contatos/[id]/route.ts`
- Modify: `app/api/financeiro/fornecedores/route.ts`
- Modify: `app/api/financeiro/fornecedores/[id]/route.ts`
- Modify: `app/api/financeiro/marca/route.ts`
- Create: `lib/__tests__/financeiro-salvar-parte.test.ts`

**Interfaces:**
- Produces: `salvarParte({ entrada, userId }): Promise<{ contatoId: string; fornecedorId: string | null }>`.
- Consumes: RPC `fin_salvar_parte` da Task 1.

- [ ] **Step 1: Escrever teste do contrato da operação**

```ts
it("usa uma única RPC e devolve os dois ids", async () => {
  rpc.mockResolvedValue({ data: { contato_id: CONTATO, fornecedor_id: FORNECEDOR }, error: null });
  await expect(salvarParte({ entrada, userId: USER })).resolves.toEqual({ contatoId: CONTATO, fornecedorId: FORNECEDOR });
  expect(rpc).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run lib/__tests__/financeiro-salvar-parte.test.ts`
Expected: FAIL com módulo ausente.

- [ ] **Step 3: Implementar serviço e validação**

Validar nome, natureza, papéis, CNPJ e campos comerciais antes da RPC; mapear `23505` para erro de conflito de CNPJ.

- [ ] **Step 4: Fazer contatos usarem o serviço**

POST/PATCH aceitam `papeis` e bloco `fornecedor`; DELETE inativa a identidade e a extensão, sem apagar histórico.

- [ ] **Step 5: Converter fornecedores em adaptadores**

POST/PATCH transformam o payload antigo em `{ natureza: "empresa", papeis: ["fornecedor"], fornecedor: corpo }` e retornam o `fornecedorId` legado. DELETE remove/inativa somente o papel fornecedor.

- [ ] **Step 6: Canonicalizar upload de fornecedor**

Antes de `acharRegistro`, resolver `fin_fornecedores.contato_id`; quando existir, gravar `fin_contatos.logo_url`. Manter fallback legado enquanto a migração estiver pendente.

- [ ] **Step 7: Rodar testes de API e segurança**

Run: `npx vitest run lib/__tests__/financeiro-salvar-parte.test.ts lib/__tests__/financeiro-rotas.test.ts lib/__tests__/financeiro-marca*.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/financeiro/salvar-parte.ts app/api/financeiro/contatos app/api/financeiro/fornecedores app/api/financeiro/marca/route.ts lib/__tests__/financeiro-salvar-parte.test.ts
git commit -m "feat(financeiro): salva papeis do cadastro em uma transacao"
```

### Task 4: Diretório e sidepanel unificados

**Files:**
- Create: `app/(plataforma)/financeiro/cadastros/contatos/PapeisContato.tsx`
- Modify: `app/(plataforma)/financeiro/cadastros/contatos/page.tsx`
- Modify: `app/(plataforma)/financeiro/cadastros/contatos/ContatosClient.tsx`
- Create: `app/(plataforma)/financeiro/cadastros/contatos/__tests__/contatos-unificados.dom.test.tsx`

**Interfaces:**
- Consumes: `ParteFinanceira[]`, `PapelContato[]`, API da Task 3.
- Produces: filtro query `?papel=fornecedor&editar=<contato-id>`.

- [ ] **Step 1: Escrever testes DOM do fluxo principal**

```tsx
render(<ContatosClient lista={[parte]} papelInicial="fornecedor" {...props} />);
expect(screen.getByRole("heading", { name: "Contatos e empresas" })).toBeInTheDocument();
await user.click(screen.getByText("Atlas"));
expect(screen.getByLabelText("Papéis")).toHaveTextContent("Fornecedor");
expect(screen.getByLabelText("Prazo de pagamento")).toBeVisible();
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run 'app/(plataforma)/financeiro/cadastros/contatos/__tests__/contatos-unificados.dom.test.tsx'`
Expected: FAIL com título/props ausentes.

- [ ] **Step 3: Criar dropdown multisseleção acessível**

Usar botão de 44 px que abre `.gp-pop`/folha móvel, checkboxes reais para os seis papéis e `Icon` Tabler. Não depender de hover.

- [ ] **Step 4: Integrar lista e filtros**

Título “Contatos e empresas”; botão “Novo contato ou empresa”; filtros Natureza, Papel, Categoria e Status; badges de papéis na tabela/card.

- [ ] **Step 5: Integrar formulário único**

Dados gerais aparecem uma vez. Natureza pessoa mostra organização; papel fornecedor revela os campos comerciais hoje presentes em `FornecedoresClient`. Salvar envia um único payload para `/api/financeiro/contatos`.

- [ ] **Step 6: Abrir por query string**

Ler `papel` e `editar` no server/client sem quebrar renderização; trazer aba/ficha atual para a vista no celular.

- [ ] **Step 7: Rodar testes DOM e financeiros de tela**

Run: `npx vitest run 'app/(plataforma)/financeiro/cadastros/contatos/__tests__/contatos-unificados.dom.test.tsx' lib/__tests__/financeiro-telas.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add 'app/(plataforma)/financeiro/cadastros/contatos'
git commit -m "feat(financeiro): unifica contatos empresas e fornecedores"
```

### Task 5: Navegação e compatibilidade das abas

**Files:**
- Modify: `app/(plataforma)/financeiro/FinanceiroShell.tsx`
- Modify: `app/(plataforma)/financeiro/cadastros/fornecedores/page.tsx`
- Modify: `app/(plataforma)/financeiro/cadastros/page.tsx`
- Modify: `app/(plataforma)/financeiro/configuracoes/page.tsx`
- Modify: `app/(plataforma)/financeiro/configuracoes/ConfiguracoesClient.tsx`
- Modify: `lib/__tests__/financeiro-telas.test.ts`

**Interfaces:**
- Consumes: query `?papel=fornecedor&editar=` da Task 4.

- [ ] **Step 1: Adicionar teste textual de navegação**

```ts
expect(shell).toContain('label: "Contatos e empresas"');
expect(shell).not.toContain('label: "Fornecedores"');
expect(paginaFornecedor).toContain('redirect("/financeiro/cadastros/contatos?papel=fornecedor")');
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run lib/__tests__/financeiro-telas.test.ts`
Expected: FAIL no novo contrato.

- [ ] **Step 3: Trocar navegação e cards-resumo**

Deixar um único item “Contatos e empresas”; consolidar KPIs do hub; preservar contagem por papel.

- [ ] **Step 4: Redirecionar rota antiga**

Usar `redirect()` na página server de fornecedores e preservar `editar` quando vier na query.

- [ ] **Step 5: Consolidar galeria de imagens**

Configurações lista a identidade canônica uma vez, com badges de papéis, eliminando grupos duplicados de contato/fornecedor.

- [ ] **Step 6: Rodar testes**

Run: `npx vitest run lib/__tests__/financeiro-telas.test.ts lib/__tests__/financeiro-marca-permissao.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'app/(plataforma)/financeiro/FinanceiroShell.tsx' 'app/(plataforma)/financeiro/cadastros' 'app/(plataforma)/financeiro/configuracoes' lib/__tests__/financeiro-telas.test.ts
git commit -m "feat(financeiro): centraliza cadastros no diretorio de contatos"
```

### Task 6: Imagens e relacionado unificado nos compromissos

**Files:**
- Create: `lib/financeiro/marca-relacionada.ts`
- Create: `lib/__tests__/financeiro-marca-relacionada.test.ts`
- Modify: `app/(plataforma)/financeiro/compromissos/page.tsx`
- Modify: `app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx`

**Interfaces:**
- Produces: `marcaRelacionada(compromisso, partes, fornecedores, empresa): MarcaRelacionada`.
- Produces: prop `logosRelacionados: Record<string, string>` e `relacionados: RelacionadoFinanceiro[]`.

- [ ] **Step 1: Escrever teste da prioridade visual**

```ts
expect(marcaRelacionada({ contato_id: CONTATO, fornecedor_id: FORNECEDOR }, ctx).origem).toBe("contato");
expect(marcaRelacionada({ contato_id: null, fornecedor_id: FORNECEDOR }, ctx).origem).toBe("fornecedor");
expect(marcaRelacionada({ contato_id: null, fornecedor_id: null }, ctx).origem).toBe("empresa");
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run lib/__tests__/financeiro-marca-relacionada.test.ts`
Expected: FAIL com módulo ausente.

- [ ] **Step 3: Implementar resolução pura**

Retornar `{ origem, id, nome, logo_url, icone }`; fornecedor canônico usa imagem de seu contato; legado usa a própria.

- [ ] **Step 4: Assinar imagens em lote no servidor**

Coletar caminhos únicos de partes, fornecedores legados e `fin_empresas`; chamar `assinarLogos()` uma vez; passar mapa serializável ao client.

- [ ] **Step 5: Mostrar `Marca` na lista e ficha**

Adicionar imagem ao lado da descrição/relacionado sem remover status, valor ou vencimento. No card móvel, imagem não reduz alvo de ações.

- [ ] **Step 6: Unificar seletor do formulário**

Um `<select>` “Relacionado a” com grupos Pessoas, Empresas e Fornecedores. Valor codificado como `contato:<id>` ou `fornecedor:<id>` atualiza exatamente um dos dois campos existentes.

- [ ] **Step 7: Rodar testes**

Run: `npx vitest run lib/__tests__/financeiro-marca-relacionada.test.ts lib/__tests__/financeiro-compromisso-recorrente.test.ts lib/__tests__/financeiro-telas.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/financeiro/marca-relacionada.ts lib/__tests__/financeiro-marca-relacionada.test.ts 'app/(plataforma)/financeiro/compromissos'
git commit -m "feat(financeiro): mostra imagem relacionada nos compromissos"
```

### Task 7: Recorrências e demais consumidores

**Files:**
- Modify: `app/(plataforma)/financeiro/cadastros/recorrencias/page.tsx`
- Modify: `app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx`
- Modify: `app/(plataforma)/financeiro/compras/page.tsx`
- Modify: `app/(plataforma)/financeiro/notas/page.tsx`
- Modify: `app/(plataforma)/financeiro/patrimonio/page.tsx`
- Modify: `lib/__tests__/financeiro-telas.test.ts`

**Interfaces:**
- Consumes: `ParteFinanceira`, query de edição e seletor relacionado das Tasks 2 e 6.

- [ ] **Step 1: Adicionar contratos de integração ao teste**

Provar que recorrência recebe relacionados unificados e que compras/notas/patrimônio continuam usando `fornecedor.id` da extensão, nunca `contato.id` no campo legado.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run lib/__tests__/financeiro-telas.test.ts`
Expected: FAIL nos novos contratos.

- [ ] **Step 3: Aplicar seletor unificado em recorrências**

Preservar `fornecedor_id`/`contato_id`, a criação cruzada e a navegação por competência.

- [ ] **Step 4: Atualizar links dos consumidores**

Compras, notas e patrimônio abrem `/financeiro/cadastros/contatos?papel=fornecedor&editar=<contato_id>` quando houver vínculo; seletores continuam enviando o ID da extensão.

- [ ] **Step 5: Rodar suíte financeira**

Run: `npx vitest run lib/__tests__/financeiro*.test.ts`
Expected: todos os testes financeiros PASS.

- [ ] **Step 6: Commit**

```bash
git add 'app/(plataforma)/financeiro/cadastros/recorrencias' 'app/(plataforma)/financeiro/compras' 'app/(plataforma)/financeiro/notas' 'app/(plataforma)/financeiro/patrimonio' lib/__tests__/financeiro-telas.test.ts
git commit -m "feat(financeiro): integra diretorio unificado nas abas"
```

### Task 8: Verificação móvel, documentação e produção

**Files:**
- Modify: `docs/superpowers/plans/2026-08-24-cadastro-financeiro-unificado.md` (marcar passos)
- Modify: `/Users/caiosilva/Documents/Brain/wiki/Financeiro-Integracao-Compromissos-Recorrencias.md`
- Modify: `/Users/caiosilva/Documents/Brain/log.md`

**Interfaces:**
- Consumes: entrega completa das Tasks 1–7.

- [x] **Step 1: Rodar verificações estáticas e build**

```bash
npx tsc --noEmit
npx vitest run lib/__tests__/financeiro*.test.ts
npm run build
```

Expected: exit code 0 nos três comandos.

- [ ] **Step 2: Conferir navegador móvel**

Abrir `/dev-mobile?ws=financeiro` e o diretório unificado em 320, 375 e 430 px, recarregando após resize. Medir `document.documentElement.scrollWidth - clientWidth === 0`, alvos por `offsetHeight/offsetWidth >= 44`, sidepanel como folha e temas claro/escuro.

- [ ] **Step 3: Executar UAT de integração**

Criar organização, ativar papel fornecedor, subir imagem, criar compromisso relacionado e confirmar que a mesma imagem aparece na lista e ficha. Remover papel e confirmar que o histórico permanece e o fornecedor some de novos seletores.

- [x] **Step 4: Atualizar wiki e log**

Registrar migração, decisões finais, resultado dos testes e ordem de aplicação no Wiki-Brain; nunca editar `raw/`.

- [x] **Step 5: Commit de documentação**

```bash
git add docs/superpowers/plans/2026-08-24-cadastro-financeiro-unificado.md
git commit -m "docs(financeiro): registra verificacao do cadastro unificado"
```

- [ ] **Step 6: Publicar somente commits verificados**

Confirmar `git status`, preservar mudanças não relacionadas, fazer `git push origin main` e acompanhar o status Vercel do SHA até `success`. Verificar `https://tridigaius.vercel.app/login` com HTTP 200 e reportar separadamente qualquer migração de banco ainda pendente.
