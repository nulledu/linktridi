# Estoque — Localização, Fornecedores, Unidades e Etiquetas (Planos 2 e 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fechar o Projeto 2. O item ganha lugar e fornecedor de verdade (CRUD), cada unidade física ganha etiqueta Code128 com código próprio, e bipar a etiqueta dá baixa no estoque com motivo.

**Architecture:** Tudo que é regra vira função pura em `lib/` com teste (`code128.ts`, `estoque-unidades.ts`), e as rotas só orquestram. A tela de bipagem reusa `LeitorCodigo` (que já atende câmera e pistola USB pela mesma porta) em modo `continuo`. Nenhum poll novo.

**Tech Stack:** Next 16 App Router, React 19, Supabase, TypeScript, Vitest.

**Depende de:** o SQL `supabase/estoque_hierarquia_unidades.sql` já rodado — ele cria `estoque_locais`, `estoque_fornecedores`, `estoque_unidades`, `etiqueta_impressoes`, o gatilho de `quantidade` e as três guardas.

**Spec:** [`2026-08-11-estoque-hierarquia-unidades-design.md`](../specs/2026-08-11-estoque-hierarquia-unidades-design.md)
**Plano anterior:** [`2026-08-11-estoque-fundacao-catalogo.md`](2026-08-11-estoque-fundacao-catalogo.md)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/code128.ts` **(criar)** | Code128-B → SVG. Puro. |
| `lib/estoque-unidades.ts` **(criar)** | Formato do código, sequencial, prefixo de SKU. Puro. |
| `app/api/estoque/locais/route.ts` **(criar)** | CRUD de lugares. |
| `app/api/estoque/fornecedores/route.ts` **(criar)** | CRUD de fornecedores. |
| `app/api/estoque/unidades/route.ts` **(criar)** | Gerar, listar e dar baixa em unidades. |
| `app/api/estoque/etiquetas/route.ts` **(criar)** | Registrar impressão. |
| `app/(plataforma)/estoque/LocaisPanel.tsx` **(criar)** | Aba Localização. |
| `app/(plataforma)/estoque/FornecedoresPanel.tsx` **(reescrever)** | CRUD + sub-aba do ERP legado. |
| `app/(plataforma)/estoque/UnidadesDoItem.tsx` **(criar)** | Unidades dentro da ficha do item. |
| `app/(plataforma)/estoque/Etiqueta.tsx` **(criar)** | Uma etiqueta + folha A4 imprimível. |
| `app/(plataforma)/estoque/BiparClient.tsx` **(criar)** | Bipagem em lote com motivo. |
| `app/(plataforma)/estoque/EstoqueTabs.tsx` **(modificar)** | Abas Localização e Bipar. |
| `lib/areas.ts` **(modificar)** | Subs `estoque:locais` e `estoque:bipar`. |
| `lib/recebimento.ts` **(modificar)** | Confirmar entrega grava custo e gera unidades. |

---

# PLANO 2 — Localização, Fornecedores e custo

## Task 1: Permissões novas

**Files:** `lib/areas.ts`

- [ ] **Step 1:** Na área `estoque`, acrescente duas subs ao array `subs`:

```ts
    { key: "locais",  label: "Ver e editar localizações", descricao: "Cadastro dos lugares do estoque." },
    { key: "bipar",   label: "Bipar etiqueta (dar baixa)", descricao: "Tirar unidade do estoque lendo o código.", sensivel: true, implica: ["itens"] },
```

`sensivel` em `bipar` porque ela MEXE no estoque de verdade: quem só consultava o catálogo não deve ganhar o poder de dar baixa junto, no back-compat. `implica: ["itens"]` porque a tela de bipagem mostra o item da unidade — sem `estoque:itens` a página abriria e toda requisição voltaria 403.

- [ ] **Step 2:** `npm test && npx tsc --noEmit`. Há teste que confere o catálogo de áreas; se ele fixa a contagem de subs, atualize o número.
- [ ] **Step 3:** `git commit -m "feat(estoque): permissões de localização e de bipagem" -- lib/areas.ts`

## Task 2: API de lugares

**Files:** criar `app/api/estoque/locais/route.ts`

- [ ] **Step 1:** Escreva a rota seguindo o padrão de `app/api/estoque-itens/route.ts` (mesma checagem `getProfile` + `resolveMyModuleKeys`).

- `GET` → `select("id,nome,codigo,pai_id,ativo,ordem").order("ordem").order("nome").limit(500)`. Devolve `{ locais, podeGerir }`. Qualquer autenticado lê (o seletor do editor precisa).
- `POST` → exige `estoque:locais`. Campos: `nome` (obrigatório), `codigo` (obrigatório, `.trim().toUpperCase()`), `pai_id`, `ordem`. Código duplicado volta `409 { error: "codigo_duplicado" }` — o índice único é `lower(codigo)`, então trate o erro `23505` do Postgres em vez de deixar virar 500.
- `PATCH` → mesmos campos + `ativo`.
- `DELETE ?id=` → antes de apagar, conte itens apontando pra ele:

```ts
  const { count } = await db.from("estoque_itens")
    .select("id", { count: "exact", head: true }).eq("local_id", id);
  if ((count ?? 0) > 0) return NextResponse.json({ error: "local_em_uso", itens: count }, { status: 409 });
```

Apagar um lugar com item dentro deixaria os itens sem endereço em silêncio. `head: true` porque só o número interessa — o corpo volta vazio.

- [ ] **Step 2:** Ciclo em árvore: no `PATCH`, se `pai_id` for o próprio `id`, recuse com `400 { error: "pai_invalido" }`. Um lugar sendo ancestral de si mesmo trava qualquer consulta em árvore na tela.
- [ ] **Step 3:** `npm test && npx tsc --noEmit`
- [ ] **Step 4:** `git commit -m "feat(estoque): API de localizações" -- app/api/estoque/locais/route.ts`

## Task 3: API de fornecedores

**Files:** criar `app/api/estoque/fornecedores/route.ts`

- [ ] **Step 1:** Mesmo formato da Task 2, gateada por `estoque:fornecedores`. Colunas: `id,nome,cnpj,contato,telefone,email,obs,ativo`. `GET` devolve `{ fornecedores, podeGerir }` com `.limit(500)`.
- [ ] **Step 2:** `DELETE` conta itens com `fornecedor_id = id` e recusa com `409 { error: "fornecedor_em_uso", itens: count }`.
- [ ] **Step 3:** `npm test && npx tsc --noEmit`
- [ ] **Step 4:** `git commit -m "feat(estoque): API de fornecedores" -- app/api/estoque/fornecedores/route.ts`

## Task 4: Aba Localização

**Files:** criar `app/(plataforma)/estoque/LocaisPanel.tsx`; modificar `EstoqueTabs.tsx` e `app/(plataforma)/estoque/page.tsx`

- [ ] **Step 1:** `LocaisPanel` lista os lugares em árvore rasa (pai → filhos), cada linha mostrando `codigo · nome` e a contagem de itens guardados ali. Reuse `PainelLateral` (de `ui/controles`) para criar/editar e `TabelaOuCards` para a lista. Botão "Novo lugar" com `Botao`.

O painel de um lugar mostra **o que está guardado nele** — é a metade que responde "o que tem na Prateleira B2?". Busque por `/api/estoque-itens` e filtre por `local_id` no cliente (o catálogo já vem inteiro e limitado a 2000; uma rota nova só pra isso seria uma consulta a mais sem ganho).

- [ ] **Step 2:** Em `page.tsx`, acrescente `locais: keys.includes("estoque:locais")` e `bipar: keys.includes("estoque:bipar")` ao objeto `perms`, e o mesmo em `EstoquePerms`.
- [ ] **Step 3:** Em `EstoqueTabs`, acrescente a aba:

```tsx
    ["locais", "Localização", "map-pin", perms.locais],
```

e o `atual === "locais" ? <LocaisPanel /> : …` na renderização. O tipo `Aba` ganha `"locais"`.

- [ ] **Step 4:** **Celular:** confira a 320px que a fileira de abas (agora com 4) rola de lado e que a árvore não estoura. `document.documentElement.scrollWidth - clientWidth === 0`.
- [ ] **Step 5:** `npm test && npx tsc --noEmit`
- [ ] **Step 6:** `git commit -m "feat(estoque): aba de localização com cadastro de lugares" -- "app/(plataforma)/estoque/LocaisPanel.tsx" "app/(plataforma)/estoque/EstoqueTabs.tsx" "app/(plataforma)/estoque/page.tsx"`

## Task 5: Fornecedores vira CRUD

**Files:** reescrever `app/(plataforma)/estoque/FornecedoresPanel.tsx`

- [ ] **Step 1:** Duas sub-abas (`Abas` com `ui-abas--sub`): **"Fornecedores"** (o CRUD novo, de `/api/estoque/fornecedores`) e **"Base de custos da Tridi"** (o conteúdo atual, que lê `/api/tridi/estoque` do ERP legado, só leitura).

Não apague o painel legado: ele é a única visão da base de custos do ERP e ninguém pediu pra tirar.

- [ ] **Step 2:** Cada fornecedor mostra quantos itens do catálogo apontam pra ele e o total em custo (só se `podeVerCusto`).
- [ ] **Step 3:** **Celular** a 320px, e `npm test && npx tsc --noEmit`.
- [ ] **Step 4:** `git commit -m "feat(estoque): fornecedores viram cadastro, com o ERP legado ao lado" -- "app/(plataforma)/estoque/FornecedoresPanel.tsx"`

## Task 6: Recebimento grava o custo

**Files:** `lib/recebimento.ts`

- [ ] **Step 1:** Onde a confirmação de entrega atualiza `estoque_itens`, acrescente o custo unitário da compra:

```ts
  // "Custo = valor da última compra" (o pedido). Sem isto o custo é digitado à
  // mão uma vez e envelhece calado até alguém notar que a margem está errada.
  if (compra.preco_unit != null && compra.estoque_item_id) {
    await db.from("estoque_itens")
      .update({ custo: Number(compra.preco_unit), custo_em: new Date().toISOString() })
      .eq("id", compra.estoque_item_id);
  }
```

- [ ] **Step 2:** **Atenção ao gatilho.** Se o item for `serializado`, a guarda `estoque_itens_guarda` do banco RECUSA qualquer escrita em `quantidade` que não bata com a contagem de etiquetas. Verifique se a confirmação de recebimento escreve `quantidade` — se escrever, ela precisa pular esse campo para item serializado (a Task 10 faz o item serializado nascer de unidades, não de soma). Rode o caminho e reporte o que achou.
- [ ] **Step 3:** `npm test && npx tsc --noEmit`
- [ ] **Step 4:** `git commit -m "feat(estoque): confirmar recebimento grava o custo da última compra" -- lib/recebimento.ts`

---

# PLANO 3 — Unidades, etiquetas e bipagem

## Task 7: Code128 em SVG

**Files:** criar `lib/code128.ts` e `lib/__tests__/code128.test.ts`

- [ ] **Step 1: teste primeiro.** Code128-B: 103 símbolos, START-B = 104, checksum = `(104 + Σ(i · valor_i)) mod 103`, STOP = 106 (padrão `2331112`). Cada símbolo é uma string de 6 dígitos de largura (barra, espaço, barra, espaço, barra, espaço), menos o STOP que tem 7.

```ts
import { describe, it, expect } from "vitest";
import { code128Svg, code128Larguras, checksum128 } from "../code128";

describe("code128", () => {
  it("checksum do exemplo canônico", () => {
    // "AB" → START_B(104) + A(33) + B(34); soma = 104 + 1*33 + 2*34 = 205; 205 % 103 = 102.
    // (Uma versão anterior deste plano dizia "2" — conta errada. Checksum errado
    // gera etiqueta que imprime bonita e não lê em leitor nenhum, então este
    // número é conferido contra o exemplo PJJ123C da referência do padrão.)
    expect(checksum128("AB")).toBe(102);
  });
  it("começa em START-B e termina no padrão de parada", () => {
    const l = code128Larguras("MDF6MM-BR-18-000042");
    expect(l.slice(0, 6).join("")).toBe("211214");  // START B
    expect(l.slice(-7).join("")).toBe("2331112");   // STOP
  });
  it("largura total é módulos, não pixels — dá pra escalar sem borrar", () => {
    const l = code128Larguras("ABC");
    expect(l.every((n) => Number.isInteger(n) && n >= 1 && n <= 4)).toBe(true);
  });
  it("recusa caractere fora do Code128-B em vez de gerar código ilegível", () => {
    expect(() => code128Larguras("café")).toThrow();
  });
  it("SVG sai com viewBox e sem largura fixa, pra caber na etiqueta", () => {
    const svg = code128Svg("MDF-000001");
    expect(svg).toContain("viewBox");
    expect(svg).not.toMatch(/width="\d+px"/);
  });
});
```

- [ ] **Step 2:** Rode, veja falhar.
- [ ] **Step 3:** Implemente. Code128-B cobre ASCII 32–126; o valor de um caractere é `charCode - 32`. A tabela de 107 padrões de largura é fixa e conhecida — copie-a de uma fonte de referência do padrão, não invente. O SVG é uma sequência de `<rect>` pretos, com `shape-rendering="crispEdges"` (sem isso a barra sai borrada na impressão).
- [ ] **Step 4:** Rode, veja passar. `npx tsc --noEmit`.
- [ ] **Step 5:** `git commit -m "feat(estoque): gerador de Code128 em SVG, sem dependência nova" -- lib/code128.ts lib/__tests__/code128.test.ts`

## Task 8: Código da unidade

**Files:** criar `lib/estoque-unidades.ts` e `lib/__tests__/estoque-unidades.test.ts`

- [ ] **Step 1: teste primeiro.**

```ts
import { describe, it, expect } from "vitest";
import { codigoDaUnidade, partirCodigo, skuAutomatico, MOTIVOS_BAIXA } from "../estoque-unidades";

describe("código da unidade", () => {
  it("é SKU + sequencial de 6 dígitos", () => {
    expect(codigoDaUnidade("MDF6MM-BR-18", 42)).toBe("MDF6MM-BR-18-000042");
  });
  it("aguenta mais de um milhão sem truncar", () => {
    expect(codigoDaUnidade("X", 1234567)).toBe("X-1234567");
  });
  it("parte o código de volta em SKU e sequência", () => {
    // O SKU tem hífens, então só o ÚLTIMO grupo é a sequência.
    expect(partirCodigo("MDF6MM-BR-18-000042")).toEqual({ sku: "MDF6MM-BR-18", seq: 42 });
  });
  it("recusa código sem sequência em vez de devolver NaN", () => {
    expect(partirCodigo("MDF6MM")).toBeNull();
    expect(partirCodigo("MDF-ABC")).toBeNull();
  });
  it("SKU automático usa o prefixo da hierarquia", () => {
    expect(skuAutomatico("materia_prima", 7)).toBe("MP-0007");
    expect(skuAutomatico("produto", 123)).toBe("PRD-0123");
  });
  it("os motivos de baixa batem com o check do banco", () => {
    expect(MOTIVOS_BAIXA.map((m) => m.key)).toEqual(["consumido", "expedido", "perdido", "devolvido"]);
  });
});
```

- [ ] **Step 2:** Rode, veja falhar. Implemente. `MOTIVOS_BAIXA` traz `{ key, label, icon }` — os `key` são exatamente os do `check` de `estoque_unidades.status`, menos `em_estoque`. Prefixos vêm de `HIERARQUIA_DEFS[].prefixo`.
- [ ] **Step 3:** Rode, veja passar. `git commit -m "feat(estoque): formato do código de unidade e motivos de baixa" -- lib/estoque-unidades.ts lib/__tests__/estoque-unidades.test.ts`

## Task 9: API de unidades

**Files:** criar `app/api/estoque/unidades/route.ts`

- [ ] **Step 1:** `GET ?item=<id>` → unidades do item. Colunas nomeadas, `.limit(500)`, e um `count` separado por status com `head: true` (o painel mostra "312 em estoque" sem baixar 312 linhas).

- [ ] **Step 2:** `POST` → gera N unidades. Exige `estoque:itens`.

```ts
// max(seq)+1 numa transação otimista: dois cliques em "gerar etiquetas" correm,
// e o `unique (item_id, seq)` protege o dado — mas o perdedor levaria erro cru.
// Mesmo laço de nova tentativa que a numeração dos criativos do Marketing usa.
```

Leia `max(seq)`, monte as N linhas, `insert`. Em erro `23505` (violação de unicidade), releia e tente de novo, até 3 vezes; depois disso devolva `409 { error: "corrida_de_sequencial" }`.

O `sku` do item é obrigatório: se estiver vazio, gere com `skuAutomatico` e grave no item antes de criar as unidades. Recuse com `400 { error: "item_nao_serializado" }` se `serializado` for falso — gerar etiqueta pra item a granel é o começo da confusão.

**Limite de lote:** no máximo 500 por chamada. Acima disso, `400 { error: "lote_grande", max: 500 }`. É proteção contra o gatilho por linha: 500 inserções disparam 500 recontagens, e é o teto que o plano 1 registrou como dívida.

- [ ] **Step 3:** `PATCH` → dá baixa. Exige `estoque:bipar`. Corpo: `{ codigos: string[], motivo: string, obs?: string }`.

Para cada código: acha a unidade, confere que está `em_estoque`, grava `status = motivo`, `baixa_motivo`, `baixado_por_id/nome`, `baixado_em`. Devolve por código o que aconteceu:

```ts
  return NextResponse.json({ ok: true, resultado: codigos.map((c) => ({
    codigo: c, situacao: "baixada" | "desconhecida" | "ja_baixada", item: nome ?? null })) });
```

Nunca falhe o lote inteiro por um código ruim — quem bipou 40 chapas não pode perder as 39 boas por causa de uma etiqueta rasgada.

- [ ] **Step 4:** `npm test && npx tsc --noEmit`
- [ ] **Step 5:** `git commit -m "feat(estoque): API de unidades — gerar, listar e dar baixa" -- app/api/estoque/unidades/route.ts`

## Task 10: Unidades na ficha do item

**Files:** criar `app/(plataforma)/estoque/UnidadesDoItem.tsx`; modificar `ItemEditor.tsx`

- [ ] **Step 1:** Componente que aparece no editor **só quando `serializado`**: mostra "N em estoque · M baixadas", um botão "Gerar etiquetas" (pede a quantidade) e a lista das últimas unidades com código, status e data.
- [ ] **Step 2:** No `ItemEditor`, renderize-o abaixo dos interruptores, dentro de `{serializado && item?.id && (…)}` — item novo ainda não tem id, e gerar etiqueta antes de salvar não teria onde pendurar.
- [ ] **Step 3:** **Celular** a 320px: a lista vira `CardLinha`, não tabela.
- [ ] **Step 4:** `npm test && npx tsc --noEmit`; `git commit -m "feat(estoque): unidades e geração de etiquetas na ficha do item" -- "app/(plataforma)/estoque/UnidadesDoItem.tsx" "app/(plataforma)/estoque/ItemEditor.tsx"`

## Task 11: A etiqueta

**Files:** criar `app/(plataforma)/estoque/Etiqueta.tsx`; criar `app/api/estoque/etiquetas/route.ts`

- [ ] **Step 1:** `<Etiqueta />` desenha uma etiqueta: nome à esquerda, `code128Svg(codigo)` no meio, localização à direita, e rodapé com data de impressão e responsável. Layout em CSS Grid de 3 colunas.

- [ ] **Step 2:** `<FolhaDeEtiquetas />` repete N etiquetas numa folha A4 com `@media print`:

```css
@page { size: A4; margin: 8mm; }
@media print { .nao-imprime { display: none } }
```

Dimensões em **mm**, não px — é papel. Nada de `vh`.

- [ ] **Step 3:** `POST /api/estoque/etiquetas` grava uma linha em `etiqueta_impressoes` por etiqueta impressa (`codigo`, `item_id`, `unidade_id`, `local_texto`, `responsavel_id`, `responsavel`). É isso que faz "Responsável" e "Data de impressão" valerem alguma coisa: dá pra consultar depois.
- [ ] **Step 4:** `npm test && npx tsc --noEmit`; `git commit -m "feat(estoque): etiqueta Code128 imprimível, com registro de quem imprimiu" -- "app/(plataforma)/estoque/Etiqueta.tsx" app/api/estoque/etiquetas/route.ts`

## Task 12: Bipagem

**Files:** criar `app/(plataforma)/estoque/BiparClient.tsx`; modificar `EstoqueTabs.tsx`

Esta é a tela que mais importa acertar — usada em pé, no galpão, dezenas de vezes seguidas.

- [ ] **Step 1:** Monte com `LeitorCodigo` em modo `continuo` (ele já atende câmera e pistola USB pela mesma porta). Cada leitura aceita empilha na lista com resposta **imediata**.

- [ ] **Step 2:** Resposta por leitura, no mesmo quadro:

```tsx
// Som + vibração + a unidade entrando na pilha têm que sair juntos. Latência
// entre eles destrói a sensação de que a leitura "pegou" — e quem está bipando
// rápido bipa mais rápido que a transição.
navigator.vibrate?.(30);
```

Nada bloqueia entrada durante animação. A mola da pilha é criticamente amortecida (sem quique): não houve gesto com inércia, então quique aqui é ruído.

- [ ] **Step 3:** O motivo é escolhido **uma vez**, no rodapé, e confirma o lote inteiro. Um `PATCH` só com todos os códigos.
- [ ] **Step 4:** Código desconhecido ou já baixado avisa **na hora**, em vermelho, e não entra na pilha. Remover da pilha é um botão de 44px (não `:hover`, não arrastar — no galpão a mão está ocupada).
- [ ] **Step 5:** Aba nova em `EstoqueTabs`: `["bipar", "Bipar", "barcode", perms.bipar]`. O ícone `barcode` **não existe** no `Icon.tsx` — acrescente com o path oficial do Tabler:

```ts
  barcode: '<path d="M4 7v-1a2 2 0 0 1 2 -2h2" /><path d="M4 17v1a2 2 0 0 0 2 2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v1" /><path d="M16 20h2a2 2 0 0 0 2 -2v-1" /><path d="M5 11h1v2h-1l0 -2" /><path d="M10 11l0 2" /><path d="M14 11h1v2h-1l0 -2" /><path d="M19 11l0 2" />',
```

- [ ] **Step 6:** **Celular a 320px** — esta tela é usada com uma mão só. Alvos de 44px, botão de confirmar alcançável com o polegar, sem rolagem horizontal.
- [ ] **Step 7:** `npm test && npx tsc --noEmit`; `git commit -m "feat(estoque): bipar etiqueta dá baixa no estoque, em lote e com motivo" -- "app/(plataforma)/estoque/BiparClient.tsx" "app/(plataforma)/estoque/EstoqueTabs.tsx" "app/(plataforma)/Icon.tsx"`

## Task 13: Recebimento gera unidades

**Files:** `lib/recebimento.ts`

- [ ] **Step 1:** Ao confirmar a entrega de uma compra cujo item é `serializado`, crie as unidades pela mesma função da Task 9, com `origem: "recebimento"`, `compra_id` e `custo = preco_unit`.

É isso que dá o custo real por unidade em vez de média — o ganho silencioso do projeto inteiro.

- [ ] **Step 2:** Se a quantidade recebida passar de 500, gere em lotes de 500 (o teto da Task 9).
- [ ] **Step 3:** `npm test && npx tsc --noEmit`; `git commit -m "feat(estoque): recebimento gera as etiquetas das unidades que chegaram" -- lib/recebimento.ts`

## Task 14: Conferência final

- [ ] **Step 1:** `/dev-estoque-item` a 320/390/430: `scrollWidth - clientWidth === 0`, alvos por `offsetHeight` ≥ 44, dois temas.
- [ ] **Step 2:** Abra a aba Bipar e confira o mesmo.
- [ ] **Step 3:** Deixe uma aba do Estoque parada 1 minuto e olhe a rede: **nenhuma requisição** deve sair sozinha. Este plano não acrescenta poll nenhum; se aparecer tráfego, algo foi introduzido por engano.
- [ ] **Step 4:** `npm test` e `npx tsc --noEmit` verdes; `git push`.

---

## Pendências conhecidas, herdadas do plano 1

Registradas pela revisão adversarial do SQL e ainda abertas:

1. **Gatilho por linha.** Inserir N unidades dispara o recálculo N vezes. A Task 9 limita o lote a 500 como paliativo; a solução é `for each statement` com `referencing new table`. Vale quando um recebimento típico passar de algumas centenas.
2. **Sem índice em `estoque_unidades.compra_id`** — varredura sequencial quando uma compra é apagada.
3. **`estoque_locais.pai_id` sem trava de ciclo no banco** — a Task 2 barra o caso óbvio (pai = próprio id) na API, mas um ciclo A→B→A ainda passa.
4. **Nada da migração cai em `insumo_direto`**, porque a classe antiga "Insumos Secundários" vai toda para `insumo_indireto`. Arrumável na tela, item a item.
