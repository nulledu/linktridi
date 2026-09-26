# Produção em cadeia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O motor de reposição passa a entender a cadeia (ficha técnica): cria atividades só de itens ativados, trava quando falta material, cria a atividade do componente, libera o pai quando o estoque entra, aceita dispensa que segura recriação — com painel de controle e o tablet Android ganhando dispensa, card com a cadeia, código repartido e redesenho visual.

**Architecture:** Regras puras em `lib/producao-em-cadeia.ts`; o motor existente (`lib/requisicoes.ts`) ganha o passo de cadeia; liberação por gancho nos pontos de ENTRADA de estoque; espera registrada em `producao_esperas`; estados novos são valores de texto na coluna `status` que já é livre. Spec: `docs/superpowers/specs/2026-09-04-producao-em-cadeia-design.md`.

**Tech Stack:** Next.js + Supabase (service_role), Vitest, Jetpack Compose/Kotlin (android/, gradle), adb.

**Convenções (CLAUDE.md):** commit direto na main com testes verdes; `git add` só do que é da etapa (repo tem sujeira de outra sessão em `lib/financeiro/*` — 2 testes de financeiro já falham por isso, NÃO são regressão); sem emoji na web (Tabler); colunas nomeadas + `.limit()`; SQL entregue roda na mão; nunca `git stash`.

**Fatos verificados do código (não re-descobrir):**
- `atividades.status` é `text` sem check — `aguardando_material` e `cancelada` são só valores novos.
- `/api/device/pull` filtra `.or("status.neq.concluida,...")` → os dois status novos VAZARIAM; excluir lá.
- Cobertura (`coberturaDeProducao` em requisicoes.ts) conta `in ["pendente","em_andamento"]` e máquinas `in ["fila","executando"]` → incluir `aguardando_material` nos dois, senão o motor cria em dobro.
- `atribuirProducao` insere com `por_nome: "Sistema (requisição)"` — é o selo de automação existente (`nascidaDaAutomacao` em lib/atividades-estagio.ts).
- `ficha_tecnica(item_id, componente_id, quantidade numeric)` + hierarquia escada em lib/estoque-hierarquia.ts.
- `verificarReabastecimento` usa degraus de colunas tolerantes (COM_TIPO → COM_RECEITA → SEM_RECEITA) — o degrau novo entra ACIMA.
- Push do tablet: `aplicarAtividade` com `it.tipo === "iniciar" | "pausar" | "bloquear" | "devolver" | "concluir"` (app/api/device/push/route.ts:266+).
- Tablet Compose: composables `ProvisionScreen`(1045), `PickerScreen`(1078), `AtividadesScreen`(1105), `AtividadeCard`(1180), `CameraCaptureScreen`(510), `DevolverDialog`(371), `WorkerCard`(451), `TopBar`(1013), `BigButton`(1246) etc. em `android/app/src/main/java/com/tridi/app/MainActivity.kt`.
- Memória `atividades-tablet-gotchas` existe — LER antes da Fase B (`~/.claude/projects/-Users-caiosilva-dashvendas/memory/atividades-tablet-gotchas.md`).

---

## FASE A — banco, regras, motor, liberação, painel

### Task A1: SQL `supabase/producao_em_cadeia.sql`

**Files:** Create: `supabase/producao_em_cadeia.sql`

- [ ] **Step 1: Escrever o arquivo** (re-rodável, roda na mão):

```sql
-- ── Produção em cadeia ───────────────────────────────────────────────────────
-- Pré-requisitos já rodados: bom_ficha_tecnica.sql (ficha_tecnica),
-- estoque_producao_receita.sql (receita no item), maquinas.sql.

-- O liga/desliga POR ITEM. Nasce desligado: só o que o dono ativar gera
-- atividade. Coluna ausente = comportamento antigo (todo item com mínimo).
alter table public.estoque_itens
  add column if not exists producao_automatica boolean not null default false;

-- A memória da dispensa: "não precisa fazer" segura a recriação ENQUANTO o
-- saldo não cair abaixo do que estava quando alguém dispensou. Caiu mais, a
-- falta é nova — o motor limpa a memória e cria de novo.
alter table public.estoque_itens add column if not exists reposicao_dispensada_saldo  int;
alter table public.estoque_itens add column if not exists reposicao_dispensada_em     timestamptz;
alter table public.estoque_itens add column if not exists reposicao_dispensada_por    text;
alter table public.estoque_itens add column if not exists reposicao_dispensada_motivo text;

-- O que habilita o Dispensar (atividade de gente se devolve, não se dispensa)
-- e a frase de origem que o card do tablet e o painel mostram.
alter table public.atividades add column if not exists criada_por_automacao boolean not null default false;
alter table public.atividades add column if not exists origem_frase text;

-- ── A espera: o que falta pra esta ordem poder andar ─────────────────────────
-- Uma linha por (ordem × material em falta). É o índice da liberação (estoque
-- de X entrou → quem espera X?) e a transparência do painel. Dona é UMA das
-- duas filas: atividade (tablet) ou programação (máquina).
create table if not exists public.producao_esperas (
  id             uuid primary key default gen_random_uuid(),
  atividade_id   uuid references public.atividades(id) on delete cascade,
  programacao_id uuid references public.maquina_programacoes(id) on delete cascade,
  item_id        uuid not null references public.estoque_itens(id) on delete cascade,
  item_nome      text not null,
  falta          int  not null,
  criado_em      timestamptz not null default now(),
  check (falta > 0),
  check ((atividade_id is null) <> (programacao_id is null))
);
create index if not exists producao_esperas_item_idx  on public.producao_esperas (item_id);
create index if not exists producao_esperas_ativ_idx  on public.producao_esperas (atividade_id);
create index if not exists producao_esperas_prog_idx  on public.producao_esperas (programacao_id);
alter table public.producao_esperas enable row level security;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/producao_em_cadeia.sql
git commit -m "feat(producao): SQL da producao em cadeia — ativacao por item, dispensa com memoria e esperas"
git push
```

(Assinatura Co-Authored-By em todos os commits, como sempre.)

---

### Task A2: Regras puras `lib/producao-em-cadeia.ts` (TDD)

**Files:**
- Create: `lib/producao-em-cadeia.ts`
- Test: `lib/__tests__/producao-em-cadeia.test.ts`

- [ ] **Step 1: Teste que falha.** Casos mínimos (escrever de verdade, executor):

```ts
import { describe, it, expect } from "vitest";
import {
  explodirNecessidades, decidirCadeia, dispensaVale, fraseDeOrigem,
  PROFUNDIDADE_MAX, type NoDaCadeia,
} from "../producao-em-cadeia";

// Chancela precisa de 1 folha; folha precisa de 2 borrachas.
const FICHA = new Map([
  ["chancela", [{ componenteId: "folha", nome: "Folha", quantidade: 1 }]],
  ["folha", [{ componenteId: "borracha", nome: "Borracha", quantidade: 2 }]],
]);

describe("explodirNecessidades", () => {
  it("arredonda o TOTAL pra cima, nunca por unidade", () => {
    const ficha = [{ componenteId: "chapa", nome: "Chapa", quantidade: 0.013889 }];
    // 72 acolchoados = 1 chapa (72 × 0.013889 = 1.000008 → ceil 2? NÃO: 1.000008
    // é ruído de float — tolerância de 1e-6 antes do ceil)
    expect(explodirNecessidades(72, ficha, new Map())[0].necessario).toBe(1);
    expect(explodirNecessidades(80, ficha, new Map())[0].necessario).toBe(2);
  });
  it("falta = necessario - saldo, nunca negativa", () => {
    const ficha = [{ componenteId: "x", nome: "X", quantidade: 2 }];
    const r = explodirNecessidades(10, ficha, new Map([["x", 15]]));
    expect(r[0]).toMatchObject({ necessario: 20, falta: 5 });
  });
});

describe("decidirCadeia", () => {
  const base = {
    fichas: FICHA,
    saldos: new Map([["folha", 0], ["borracha", 100]]),
    ativados: new Set(["chancela", "folha"]),
    produziveis: new Set(["chancela", "folha"]),
  };
  it("com material pra tudo, o pai nasce pendente e sem filhos", () => {
    const r = decidirCadeia("chancela", 10, { ...base, saldos: new Map([["folha", 50]]) });
    expect(r.estado).toBe("pendente");
    expect(r.filhos).toEqual([]);
    expect(r.esperas).toEqual([]);
  });
  it("falta componente produzível+ativado → pai aguardando, filho criado com a falta", () => {
    const r = decidirCadeia("chancela", 10, base);
    expect(r.estado).toBe("aguardando_material");
    expect(r.esperas).toEqual([{ itemId: "folha", nome: "Folha", falta: 10 }]);
    expect(r.filhos).toEqual([{ itemId: "folha", nome: "Folha", quantidade: 10 }]);
  });
  it("o filho também é verificado (recursão): borracha em falta trava a folha", () => {
    const r = decidirCadeia("chancela", 10, { ...base, saldos: new Map([["folha", 0], ["borracha", 0]]) });
    const folha = r.filhos.find((f) => f.itemId === "folha");
    expect(folha).toBeTruthy();
    // a decisão do filho vem junto pra quem cria saber o estado dele
    expect(r.decisoesFilhos.get("folha")?.estado).toBe("aguardando_material");
    expect(r.decisoesFilhos.get("folha")?.esperas).toEqual([{ itemId: "borracha", nome: "Borracha", falta: 20 }]);
  });
  it("componente NÃO produzível em falta → espera sem filho (aviso de compra)", () => {
    const r = decidirCadeia("chancela", 10, { ...base, produziveis: new Set(["chancela"]) });
    expect(r.estado).toBe("aguardando_material");
    expect(r.filhos).toEqual([]);
    expect(r.comprar).toEqual([{ itemId: "folha", nome: "Folha", falta: 10 }]);
  });
  it("componente produzível mas NÃO ativado → trata como não produzível", () => {
    const r = decidirCadeia("chancela", 10, { ...base, ativados: new Set(["chancela"]) });
    expect(r.filhos).toEqual([]);
    expect(r.comprar.length).toBe(1);
  });
  it("ciclo não roda pra sempre", () => {
    const fichas = new Map([
      ["a", [{ componenteId: "b", nome: "B", quantidade: 1 }]],
      ["b", [{ componenteId: "a", nome: "A", quantidade: 1 }]],
    ]);
    const r = decidirCadeia("a", 5, {
      fichas, saldos: new Map(), ativados: new Set(["a", "b"]), produziveis: new Set(["a", "b"]),
    });
    expect(r.filhos.length).toBeLessThanOrEqual(1); // b entra uma vez, a não re-entra
  });
});

describe("dispensaVale", () => {
  it("segura enquanto o saldo não caiu abaixo do saldo da dispensa", () => {
    expect(dispensaVale(10, 10)).toBe(true);
    expect(dispensaVale(12, 10)).toBe(true);
    expect(dispensaVale(9, 10)).toBe(false);
    expect(dispensaVale(10, null)).toBe(false);
  });
});

describe("fraseDeOrigem", () => {
  it("explica a conta pra quem está na bancada", () => {
    expect(fraseDeOrigem(8, 20, 50)).toMatch(/8/);
    expect(fraseDeOrigem(8, 20, 50)).toMatch(/20/);
    expect(fraseDeOrigem(8, 20, 50)).toMatch(/50/);
  });
});
```

- [ ] **Step 2:** `npx vitest run lib/__tests__/producao-em-cadeia.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar.** Contratos exatos:

```ts
export interface ComponenteDaFicha { componenteId: string; nome: string; quantidade: number }
export interface Necessidade { itemId: string; nome: string; necessario: number; falta: number }
export interface DecisaoDoNo {
  estado: "pendente" | "aguardando_material";
  /** O que falta e trava ESTA ordem (produzíveis e compráveis juntos). */
  esperas: { itemId: string; nome: string; falta: number }[];
  /** Ordens-filhas a criar (produzível + ativado). */
  filhos: { itemId: string; nome: string; quantidade: number }[];
  /** Materiais comprados em falta (o aviso de compras). */
  comprar: { itemId: string; nome: string; falta: number }[];
  /** Decisão de cada filho (recursiva) — quem cria usa pra dar o estado certo. */
  decisoesFilhos: Map<string, DecisaoDoNo>;
}
export interface ContextoDaCadeia {
  fichas: Map<string, ComponenteDaFicha[]>;
  saldos: Map<string, number>;
  ativados: Set<string>;
  produziveis: Set<string>;
}
export const PROFUNDIDADE_MAX = 8;
export type NoDaCadeia = DecisaoDoNo;
```

- `explodirNecessidades(qtd, ficha, saldos)`: `necessario = Math.ceil(qtd * quantidade - 1e-6)` (tolerância de float ANTES do ceil, o caso 72×0.013889), `falta = Math.max(0, necessario - (saldos.get(id) ?? 0))`.
- `decidirCadeia(itemId, quantidade, ctx, visitados = new Set(), profundidade = 0)`: explode a ficha do item; cada componente com `falta > 0` vira espera; se `produziveis.has(id) && ativados.has(id)` e não visitado e profundidade < PROFUNDIDADE_MAX → vira filho `{quantidade: falta}` e recursão em `decisoesFilhos`; senão vira `comprar`. `estado = esperas.length ? "aguardando_material" : "pendente"`. Visitados compartilhado na descida (ciclo).
- `dispensaVale(saldoAtual, saldoDispensa)`: `saldoDispensa != null && saldoAtual >= saldoDispensa`.
- `fraseDeOrigem(saldo, minimo, alvo)`: `` `Estoque caiu a ${saldo} (mínimo ${minimo}) — repõe até ${alvo}.` ``

- [ ] **Step 4:** rodar de novo → PASS. `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit** `feat(producao): regras puras da cadeia — explosao da ficha, decisao de estado e dispensa`

---

### Task A3: Motor em cadeia (`lib/requisicoes.ts`)

**Files:** Modify: `lib/requisicoes.ts`

- [ ] **Step 1: Cobertura conta aguardando.** Em `coberturaDeProducao`: trocar `.in("status", ["pendente", "em_andamento"])` por `.in("status", ["pendente", "em_andamento", "aguardando_material"])`; e na consulta de `maquina_programacoes`, `.in("status", ["fila", "executando"])` → `["fila", "executando", "aguardando_material"]`.

- [ ] **Step 2: `atribuirProducao` aceita o estado e o selo.** Assinatura ganha um 5º parâmetro opcional:

```ts
opts?: { status?: "pendente" | "aguardando_material"; origemFrase?: string | null }
```

No objeto `linha` do insert: `status: opts?.status ?? "pendente"`, e acrescentar `criada_por_automacao: true, origem_frase: opts?.origemFrase ?? null`. **Tolerância**: se o insert falhar com coluna ausente (`criada_por_automacao|origem_frase|42703|schema cache`), repetir sem os dois campos (mesmo padrão do `tempo_estimado_min` que já está ali). `programarNaMaquina` idem: parâmetro `status` (`"fila"` default | `"aguardando_material"`).

- [ ] **Step 3: `verificarReabastecimento` em cadeia.** Reescrever o corpo mantendo os degraus de colunas (novo degrau no topo com `id,producao_automatica,reposicao_dispensada_saldo` — caiu pro degrau velho, `cadeiaDisponivel = false` e o resto se comporta como hoje):

1. Depois de montar `itens`: se a coluna `producao_automatica` veio, filtrar `it.producao_automatica === true`; pular item com `dispensaVale(q, it.reposicao_dispensada_saldo)`; se `q < saldoDispensa`, LIMPAR a memória (update das 4 colunas pra null) antes de criar.
2. Carregar cadeias numa ida: `ficha_tecnica.select("item_id,componente_id,quantidade").in("item_id", idsDosAbaixo).limit(1000)` e, com os componente_ids, `estoque_itens.select("id,nome,quantidade,qtd_minima,producao_automatica,producao_instrucao,ficha própria?")` — pra montar `ContextoDaCadeia` (produzível = tem `producao_instrucao` OU tem linhas próprias na ficha_tecnica; buscar as fichas dos componentes também, um nível de cada vez até PROFUNDIDADE_MAX, com `in()` e teto). Tolerante: erro de tabela ausente → `cadeiaDisponivel = false`.
3. Por item abaixo do mínimo: `decidirCadeia(...)` → criar o PAI via `atribuirProducao(..., { status: decisao.estado, origemFrase: fraseDeOrigem(q, min, alvo) })`; gravar esperas (`producao_esperas.insert([...])`, tolerante a tabela ausente); criar FILHOS (cada um também via `atribuirProducao` com o estado da `decisoesFilhos`, dedup: filho já coberto por `producaoEmAndamento` não é recriado); acumular `comprar` de toda a varredura.
4. Aviso de compras: um insert só em notificações para os perfis com papel em `["admin","estoquista","gerente_producao"]` (mesma lista PODE da rota reabastecer), texto "Compra necessária: 40 Folha de Borracha (trava Produzir Chancela)". Reusar o helper de notificação que `avisarQuemRecebeu` já usa.

- [ ] **Step 4:** `npx vitest run lib/__tests__/requisicoes-em-andamento.test.ts lib/__tests__/estoque-automacao.test.ts lib/__tests__/producao-em-cadeia.test.ts` → verdes; `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit** `feat(producao): motor de reposicao entende a cadeia — ativacao por item, filhos e esperas`

---

### Task A4: Liberação (`lib/producao-liberacao.ts` + ganchos)

**Files:**
- Create: `lib/producao-liberacao.ts`
- Modify: `lib/estoque-conferencia.ts` (após a entrada de estoque no caminho "certo"), `app/api/estoque/ajuste-qr/route.ts` (após entrada), rota/lib do Receber (localizar por `grep -rn "recebimento" app/api/estoque/device/recebimento lib/recebimento.ts` — o ponto onde `estoque_itens.quantidade` sobe).

- [ ] **Step 1: Implementar**

```ts
// lib/producao-liberacao.ts
import { createSupabaseAdminClient } from "@/lib/supabase/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Estoque de `itemId` ENTROU: quem estava esperando por ele pode andar?
 * Tudo-ou-nada por ordem: só promove quando TODAS as esperas dela cabem no
 * saldo atual. Tolerante: qualquer erro (tabela ausente, corrida) sai calado —
 * liberar é derivado, a varredura diária re-decide de qualquer jeito.
 */
export async function liberarEsperasDoItem(itemId: string): Promise<void> {
  try {
    const db: Db = createSupabaseAdminClient();
    const { data: gatilho, error } = await db.from("producao_esperas")
      .select("atividade_id,programacao_id").eq("item_id", itemId).limit(200);
    if (error || !gatilho?.length) return;
    const atividadeIds = [...new Set(gatilho.map((g: { atividade_id: string | null }) => g.atividade_id).filter(Boolean))] as string[];
    const programacaoIds = [...new Set(gatilho.map((g: { programacao_id: string | null }) => g.programacao_id).filter(Boolean))] as string[];

    // Todas as esperas dessas ordens + os saldos atuais, em duas idas.
    const { data: esperas } = await db.from("producao_esperas")
      .select("id,atividade_id,programacao_id,item_id,falta")
      .or([atividadeIds.length ? `atividade_id.in.(${atividadeIds.join(",")})` : "", programacaoIds.length ? `programacao_id.in.(${programacaoIds.join(",")})` : ""].filter(Boolean).join(","))
      .limit(500);
    const itemIds = [...new Set((esperas ?? []).map((e: { item_id: string }) => e.item_id))];
    const { data: itens } = await db.from("estoque_itens")
      .select("id,quantidade").in("id", itemIds).limit(500);
    const saldo = new Map((itens ?? []).map((i: { id: string; quantidade: number }) => [i.id, Number(i.quantidade) || 0]));

    const porDono = new Map<string, { tipo: "atividade" | "programacao"; esperas: { id: string; item_id: string; falta: number }[] }>();
    for (const e of (esperas ?? []) as { id: string; atividade_id: string | null; programacao_id: string | null; item_id: string; falta: number }[]) {
      const chave = e.atividade_id ? `a:${e.atividade_id}` : `p:${e.programacao_id}`;
      const dono = porDono.get(chave) ?? { tipo: e.atividade_id ? "atividade" : "programacao", esperas: [] };
      dono.esperas.push({ id: e.id, item_id: e.item_id, falta: e.falta });
      porDono.set(chave, dono);
    }
    for (const [chave, dono] of porDono) {
      const cabe = dono.esperas.every((e) => (saldo.get(e.item_id) ?? 0) >= e.falta);
      if (!cabe) continue;
      const id = chave.slice(2);
      if (dono.tipo === "atividade") {
        await db.from("atividades").update({ status: "pendente" })
          .eq("id", id).eq("status", "aguardando_material");
      } else {
        await db.from("maquina_programacoes").update({ status: "fila" })
          .eq("id", id).eq("status", "aguardando_material");
      }
      await db.from("producao_esperas").delete().in("id", dono.esperas.map((e) => e.id));
    }
  } catch { /* liberar é derivado; a varredura diária re-decide */ }
}
```

- [ ] **Step 2: Ganchos** (fire-and-forget `void liberarEsperasDoItem(itemId)` ou `await` com try já interno):
  - `lib/estoque-conferencia.ts`: no caminho APROVADO, depois que o estoque entra — o item resolvido tem id ali; chamar no fim.
  - `app/api/estoque/ajuste-qr/route.ts`: após o update do total com `sentido === "entrada"` (junto do bloco de alocação da sessão anterior).
  - Recebimento: localizar o ponto de entrada (`lib/recebimento.ts` grava `quantidade` direto — está citado no trigger de estoque_hierarquia_unidades.sql) e chamar por item recebido.
- [ ] **Step 3:** `npx tsc --noEmit`; rodar testes de conferência: `npx vitest run lib/__tests__/ -t conferencia` → verdes.
- [ ] **Step 4: Commit** `feat(producao): estoque que entra libera as ordens aguardando material`

---

### Task A5: Dispensa (rota web + efeito compartilhado)

**Files:**
- Create: `lib/producao-dispensa.ts`, `app/api/atividades/dispensar/route.ts`
- Modify: `app/api/device/push/route.ts` (op nova em `aplicarAtividade`)

- [ ] **Step 1: Efeito compartilhado**

```ts
// lib/producao-dispensa.ts
// "Não precisa fazer": cancela a ordem automática e grava no ITEM o saldo do
// momento — o motor não recria enquanto o saldo não cair abaixo disso.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function dispensarAtividade(atividadeId: string, por: string, motivo: string | null): Promise<{ ok: boolean; erro?: string }> {
  const db: Db = createSupabaseAdminClient();
  const { data } = await db.from("atividades")
    .select("id,status,produto_nome,por_nome,criada_por_automacao")
    .eq("id", atividadeId).limit(1);
  const a = data?.[0];
  if (!a) return { ok: false, erro: "Atividade não encontrada." };
  const automatica = a.criada_por_automacao === true || a.por_nome === "Sistema (requisição)";
  if (!automatica) return { ok: false, erro: "Só atividade criada pela automação se dispensa — as outras se devolvem." };
  if (a.status === "concluida") return { ok: false, erro: "Esta atividade já foi concluída." };

  const { error } = await db.from("atividades").update({ status: "cancelada" })
    .eq("id", atividadeId).neq("status", "concluida");
  if (error) return { ok: false, erro: "Não deu pra dispensar agora." };
  await db.from("producao_esperas").delete().eq("atividade_id", atividadeId).then(() => undefined, () => undefined);

  // A memória no item (por produto_nome). Tolerante: sem coluna, sem memória —
  // a varredura recria amanhã, que era o comportamento antigo.
  if (a.produto_nome) {
    const { data: itens } = await db.from("estoque_itens")
      .select("id,quantidade").ilike("nome", String(a.produto_nome)).limit(1);
    const item = itens?.[0];
    if (item) {
      await db.from("estoque_itens").update({
        reposicao_dispensada_saldo: Number(item.quantidade) || 0,
        reposicao_dispensada_em: new Date().toISOString(),
        reposicao_dispensada_por: por,
        reposicao_dispensada_motivo: motivo,
      }).eq("id", item.id).then(() => undefined, () => undefined);
    }
  }
  return { ok: true };
}
```

- [ ] **Step 2: Rota web** `POST /api/atividades/dispensar` `{ atividadeId, motivo }` — gate `papelOuChave(me, ["admin","estoquista","gerente_producao"], "estoque:ajustar")` (mesma lista da rota reabastecer); traduz `{ok:false}` em 400 com a frase.
- [ ] **Step 3: Push do tablet.** Em `aplicarAtividade` (app/api/device/push/route.ts), novo ramo `else if (it.tipo === "dispensar") { await dispensarAtividade(it.atividade_id!, it.colaborador_nome ?? "tablet", it.motivo ?? null); }` — idempotente porque status cancelada na segunda vez cai no `neq("status","concluida")` sem efeito duplo.
- [ ] **Step 4:** `npx tsc --noEmit`; commit `feat(producao): dispensar atividade automatica — cancela, solta esperas e grava a memoria de saldo`

---

### Task A6: Telas não mostram os status novos + pull ganha a cadeia

**Files:** Modify: `app/api/device/pull/route.ts`, e onde listar atividades por status (conferir com `grep -rn '"pendente"' app/api app/\(plataforma\) | grep -i ativid`): `/api/atividades`, `/minhas-atividades`, painel de setor.

- [ ] **Step 1: Excluir dos olhos de quem trabalha.** No pull, após montar `atribuidas`, filtrar `a.status !== "aguardando_material" && a.status !== "cancelada"`. Mesmo filtro nas listagens de tela que hoje assumem só pendente/andamento/concluída (`/minhas-atividades`, painel do setor) — aguardando aparece SÓ no painel de Produção do dia (Task A7).
- [ ] **Step 2: Pull manda a cadeia.** Junto das atividades: para as automáticas (`por_nome === "Sistema (requisição)"` ou `criada_por_automacao`), uma ida em `ficha_tecnica` pelos `produto_nome` resolvidos (itens por `in(nome)`, depois ficha por `in(item_id)`, `.limit()`), montando por atividade `materiais: [{ nome, quantidade: ceil(qtd_ficha × quantidade_alvo − 1e-6) }]` e passando `automatica: true, origem_frase: a.origem_frase ?? null`. Campos AUSENTES quando não dá (schema velho) — o app tem defaults.
- [ ] **Step 3:** `npx tsc --noEmit` + suíte de device: `npx vitest run app/api/device lib/__tests__/ -t device` (ou os testes que o grep achar) → verdes.
- [ ] **Step 4: Commit** `feat(producao): aguardando/cancelada nao caem no tablet; pull leva materiais e origem`

---

### Task A7: Painel Produção do dia

**Files:** Modify: `app/api/estoque/producao-dia/route.ts`, `app/(plataforma)/estoque/ProducaoDiaClient.tsx`

- [ ] **Step 1: Rota** devolve por item: `producaoAutomatica`, `dispensa` (saldo/por/motivo/em), e a lista de esperas abertas (`producao_esperas` join leve com atividades/programações — colunas nomeadas + limit). PATCH pequeno (ou reusar o PATCH da ficha) pra ligar/desligar `producao_automatica`.
- [ ] **Step 2: Tela**: interruptor por item; linha de estado explicada ("aguardando: falta 40 Folha de Borracha", "dispensada — volta se saldo < 12", "coberta", "acima do mínimo"); botão Dispensar (chama a rota nova) nas ordens automáticas abertas; celular 320px+ (fundação, `.tab-linha`/`TabelaOuCards` se virar tabela), dois temas, Tabler only.
- [ ] **Step 3:** dom test se a tela já tiver um (`grep producao-dia __tests__`); senão, checagem manual via preview + `npm run rolagem` se o dev estiver de pé.
- [ ] **Step 4: Commit** `feat(estoque): producao do dia vira o painel da cadeia — ativar por item, esperas e dispensa`

---

### Task A8: Verificação da Fase A

- [ ] `npm test` (uma instância só!) — verde exceto os 2 pré-existentes de financeiro; `npx tsc --noEmit` limpo.
- [ ] Preview `/dev-*` que cubra a tela mexida (ou a própria com conta de teste NÃO — sem digitar credencial); medir sobra de largura = 0 em 320/390.
- [ ] Commit de ajustes finais se houver; push.

---

## FASE B — tablet Android (com.tridi.app)

**Antes de tudo:** ler a memória `atividades-tablet-gotchas.md` e conferir `adb devices` (tablet do usuário conectado). Build: `cd android && ./gradlew assembleDebug` (ou o task que o gotchas indicar); testes: `./gradlew testDebugUnitTest`.

### Task B1: Models + fila offline

**Files:** Modify: `android/app/src/main/java/com/tridi/app/data/Models.kt`, `Store.kt`/`Repo.kt` (onde PendingOp é montada), `net/Api.kt` se necessário (push já manda o JSON da op).

- [ ] `Atividade` ganha: `val automatica: Boolean = false`, `val origem_frase: String? = null`, `val materiais: List<MaterialDaFicha> = emptyList()` + `@Serializable data class MaterialDaFicha(val nome: String, val quantidade: Int)`. Defaults = tolerância a servidor velho (padrão da casa).
- [ ] `PendingOp.tipo` aceita `"dispensar"` (o campo é String — só documentar no comentário da classe) e a op usa `motivo` que já existe.
- [ ] `./gradlew testDebugUnitTest` verde; commit `feat(tablet): modelos da cadeia — automatica, materiais, origem e op dispensar`

### Task B2: Repartir o MainActivity (sem mudar comportamento)

**Files:** Create `android/app/src/main/java/com/tridi/app/ui/{Tema,ProvisionScreen,PickerScreen,AtividadesScreen,AtividadeCard,CameraCapture,Dialogos}.kt`; Modify `MainActivity.kt` (fica o Activity + navegação + estado raiz).

- [ ] Mover cada composable pro seu arquivo (`ProvisionScreen`, `PickerScreen`, `AtividadesScreen`+`startCamera`, `AtividadeCard`+`WorkerCard`+`ProgressoTempo`+`Avatar`+`MiniStat`+`BigButton`, `CameraCaptureScreen`, `DevolverDialog`), package `com.tridi.app.ui`, visibilidade `internal`/pública conforme uso; MainActivity importa. NENHUMA mudança de lógica neste commit.
- [ ] `./gradlew assembleDebug` compila; `testDebugUnitTest` verde; commit `refactor(tablet): MainActivity repartido em telas — mesmo comportamento`

### Task B3: Funções novas no card

**Files:** Modify: `ui/AtividadeCard.kt`, `ui/Dialogos.kt`, `Repo.kt` (enfileirar op)

- [ ] Card automática mostra: selo "Automática" + `origem_frase`; bloco "O que usar" com `materiais` (nome × quantidade), visível antes de aceitar.
- [ ] Botão "Não precisa fazer" (só `automatica` e status ≠ concluída): abre diálogo de motivo (mesmo desenho do DevolverDialog), enfileira `PendingOp(tipo = "dispensar", atividade_id, colaborador_id, motivo)` e some com o card localmente (o pull confirma).
- [ ] `assembleDebug` + testes; commit `feat(tablet): card mostra a cadeia e ganha o Nao precisa fazer`

### Task B4: Redesenho visual

**Files:** Create/Modify: `ui/Tema.kt` + ajustes nos screens.

- [ ] `Tema.kt`: paleta única (fundo grafite `#111318`, superfície `#1C1F26`, acento roxo da marca `#7C5CFF` — conferir o tom usado no app web em `app/globals.css` var(--primary) e usar o MESMO), estados: andamento verde `#2FBF71`, impedida âmbar `#E8A13C`, urgente vermelho `#E5484D`; tipografia: títulos 24–28sp bold, corpo 16sp, números tabulares; alvos ≥ 56dp; cantos 16dp consistentes; espaçamento 8/12/16.
- [ ] Aplicar nos screens: TopBar, PickerScreen (cards de pessoa maiores, foto redonda com anel de estado), AtividadesScreen (lista com hierarquia clara), AtividadeCard (estado por cor na borda/faixa, ping de aceite mantido), diálogos.
- [ ] `assembleDebug`; commit `feat(tablet): redesenho visual — tema unico, estados por cor, alvos de bancada`

### Task B5: Instalar e verificar no tablet real

- [ ] `adb devices` → tablet presente; `./gradlew installDebug` (ou `adb install -r` do APK).
- [ ] `adb shell am start -n com.tridi.app/.MainActivity`; `adb exec-out screencap -p > scratchpad/tablet-1.png` — conferir visual das telas (picker, lista, card, diálogo de dispensa) lendo os screenshots.
- [ ] Fluxo: com o dev server público (produção) o tablet fala com o servidor real — NÃO dispensar atividade real de produção; verificar visual e, se houver atividade automática de teste, o fluxo completo.
- [ ] Commit de ajustes; push.

---

### Task C: Encerramento

- [ ] `npm test` + `npx tsc --noEmit` + `./gradlew testDebugUnitTest` — tudo verde (fora os 2 de financeiro).
- [ ] Memória: atualizar/criar `producao-em-cadeia.md` no diretório de memória + linha no MEMORY.md.
- [ ] Relatório ao dono: **rodar `supabase/producao_em_cadeia.sql`**; ativar itens na Produção do dia (nasce tudo desligado); APK instalado no tablet.
