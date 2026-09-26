# Estoque multi-local + Transferir na Operação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um item de estoque pode ter saldo em mais de um lugar do galpão, com um cartão "Transferir" na /operacao que move quantidade de um lugar pro outro.

**Architecture:** Tabela nova `estoque_item_locais` (item×lugar×quantidade) com gatilhos que mantêm `estoque_itens.local_id` como "lugar principal" (telas legadas intocadas) e aparam alocação quando o total cai por fora. Transferência é uma função SQL atômica (`estoque_transferir`) chamada por RPC. Regras puras em `lib/estoque-transferencia.ts` com testes. Spec: `docs/superpowers/specs/2026-09-04-estoque-multi-local-design.md`.

**Tech Stack:** Next.js App Router, Supabase (service_role via `createSupabaseAdminClient`), Vitest (`*.test.ts` puro, `*.dom.test.tsx` jsdom), Tabler Icons via `app/(plataforma)/Icon.tsx`.

**Convenções obrigatórias do repo (CLAUDE.md):** sem emoji na UI (só `<Icon>`); celular 320px+ no mesmo commit (usar a fundação do `globals.css`, `var(--tap)`, nunca `vh`); colunas nomeadas + `.limit()` em toda query; commit direto na `main` com `npm test` + `npx tsc --noEmit` verdes antes; push na hora; NUNCA `git stash`; `git add` só dos arquivos da etapa (o repo tem sujeira de outra sessão).

---

### Task 1: SQL — tabela, semente, gatilhos e RPC

**Files:**
- Create: `supabase/estoque_item_locais.sql`

- [ ] **Step 1: Escrever o arquivo SQL**

```sql
-- ── Estoque em mais de um lugar ──────────────────────────────────────────────
--
-- Roda NA MÃO no SQL Editor do Supabase (produção), como os demais arquivos
-- desta pasta. Re-rodável: `if not exists` / `drop ... if exists` em tudo.
-- Pré-requisito: supabase/estoque_hierarquia_unidades.sql já rodado
-- (estoque_locais e estoque_itens.local_id existem).
--
-- O item deixou de morar num lugar só. `estoque_item_locais` guarda QUANTAS
-- peças de cada item estão em cada lugar. `estoque_itens.local_id` continua
-- existindo como o lugar PRINCIPAL (o de maior saldo, mantido por gatilho) —
-- é o que as telas antigas leem, e nenhuma delas precisa mudar.
--
-- Invariante: sum(estoque_item_locais.quantidade) ≤ estoque_itens.quantidade.
-- A diferença é o balde "sem lugar definido" — não é linha, é a subtração.

create table if not exists public.estoque_item_locais (
  id            uuid primary key default gen_random_uuid(),
  -- cascade nos dois lados DE PROPÓSITO: alocação é dado derivado, não razão.
  -- Lugar apagado → as peças voltam pro balde "sem lugar" sozinhas.
  item_id       uuid not null references public.estoque_itens(id)  on delete cascade,
  local_id      uuid not null references public.estoque_locais(id) on delete cascade,
  quantidade    int  not null,
  atualizado_em timestamptz not null default now(),
  unique (item_id, local_id)
);

-- check com nome próprio (mesmo padrão de estoque_unidades_quantidade_chk):
-- linha zerada é APAGADA, nunca fica registrada com zero.
alter table public.estoque_item_locais drop constraint if exists estoque_item_locais_qtd_chk;
alter table public.estoque_item_locais add constraint estoque_item_locais_qtd_chk
  check (quantidade > 0);

create index if not exists estoque_item_locais_local_idx
  on public.estoque_item_locais (local_id);

-- Como o resto do módulo: RLS ligado sem policy = só o service_role lê/escreve.
alter table public.estoque_item_locais enable row level security;

-- ── Semente: o dado de hoje nasce 100% alocado ───────────────────────────────
insert into public.estoque_item_locais (item_id, local_id, quantidade)
select i.id, i.local_id, i.quantidade
  from public.estoque_itens i
 where i.local_id is not null and coalesce(i.quantidade, 0) > 0
on conflict (item_id, local_id) do nothing;

-- ── Gatilho 1: o lugar principal acompanha a repartição ──────────────────────
-- Sem linha nenhuma o local_id NÃO é mexido: preserva o "mora aqui" de item
-- com estoque zero, que existe hoje e as etiquetas usam.
create or replace function public.estoque_item_locais_sincroniza_principal()
returns trigger language plpgsql as $$
declare
  v_item uuid := coalesce(new.item_id, old.item_id);
  v_principal uuid;
begin
  select l.local_id into v_principal
    from public.estoque_item_locais l
   where l.item_id = v_item
   order by l.quantidade desc, l.local_id
   limit 1;
  if v_principal is not null then
    update public.estoque_itens set local_id = v_principal
     where id = v_item and local_id is distinct from v_principal;
  end if;
  return null;
end $$;

drop trigger if exists estoque_item_locais_principal_tg on public.estoque_item_locais;
create trigger estoque_item_locais_principal_tg
after insert or update or delete on public.estoque_item_locais
for each row execute function public.estoque_item_locais_sincroniza_principal();

-- ── Gatilho 2: quando o total cai POR FORA, a sobra sai do(s) maior(es) ──────
-- Tablet, ajuste antigo, baixa de unidade: nenhum caminho legado conhece a
-- repartição, e mesmo assim a invariante vale. Determinístico (maior saldo,
-- desempate por local_id), sem divergência muda.
create or replace function public.estoque_itens_apara_alocacao()
returns trigger language plpgsql as $$
declare
  v_sobra int;
  v_tira  int;
  r record;
begin
  select coalesce(sum(quantidade), 0) - greatest(coalesce(new.quantidade, 0), 0)
    into v_sobra
    from public.estoque_item_locais where item_id = new.id;
  if v_sobra <= 0 then return null; end if;
  for r in
    select id, quantidade from public.estoque_item_locais
     where item_id = new.id
     order by quantidade desc, local_id
  loop
    exit when v_sobra <= 0;
    v_tira := least(r.quantidade, v_sobra);
    if v_tira >= r.quantidade then
      delete from public.estoque_item_locais where id = r.id;
    else
      update public.estoque_item_locais
         set quantidade = quantidade - v_tira, atualizado_em = now()
       where id = r.id;
    end if;
    v_sobra := v_sobra - v_tira;
  end loop;
  return null;
end $$;

drop trigger if exists estoque_itens_apara_alocacao_tg on public.estoque_itens;
create trigger estoque_itens_apara_alocacao_tg
after update of quantidade on public.estoque_itens
for each row when (new.quantidade is distinct from old.quantidade)
execute function public.estoque_itens_apara_alocacao();

-- ── Transferir: atômico, com trava na linha do item ──────────────────────────
-- p_de = null  → tira do balde "sem lugar" (alocar).
-- p_para = null → devolve pro balde (desalocar).
-- Erros com mensagem-código; a rota traduz em frase.
create or replace function public.estoque_transferir(
  p_item uuid, p_de uuid, p_para uuid, p_qtd int
) returns void language plpgsql as $$
declare
  v_total   int;
  v_alocado int;
  v_origem  int;
begin
  if p_qtd is null or p_qtd <= 0 then
    raise exception 'quantidade_invalida';
  end if;
  if p_de is not distinct from p_para then
    raise exception 'origem_igual_destino';
  end if;

  select quantidade into v_total
    from public.estoque_itens where id = p_item for update;
  if not found then raise exception 'item_inexistente'; end if;

  if p_de is null then
    select coalesce(sum(quantidade), 0) into v_alocado
      from public.estoque_item_locais where item_id = p_item;
    if coalesce(v_total, 0) - v_alocado < p_qtd then
      raise exception 'sem_lugar_insuficiente';
    end if;
  else
    select quantidade into v_origem
      from public.estoque_item_locais
     where item_id = p_item and local_id = p_de;
    if coalesce(v_origem, 0) < p_qtd then
      raise exception 'saldo_insuficiente_na_origem';
    end if;
    if v_origem = p_qtd then
      delete from public.estoque_item_locais
       where item_id = p_item and local_id = p_de;
    else
      update public.estoque_item_locais
         set quantidade = quantidade - p_qtd, atualizado_em = now()
       where item_id = p_item and local_id = p_de;
    end if;
  end if;

  if p_para is not null then
    if not exists (select 1 from public.estoque_locais where id = p_para) then
      raise exception 'destino_inexistente';
    end if;
    insert into public.estoque_item_locais (item_id, local_id, quantidade)
    values (p_item, p_para, p_qtd)
    on conflict (item_id, local_id) do update
      set quantidade = public.estoque_item_locais.quantidade + excluded.quantidade,
          atualizado_em = now();
  end if;
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/estoque_item_locais.sql
git commit -m "feat(estoque): item pode ter saldo em mais de um lugar — tabela, gatilhos e transferencia atomica (SQL)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

Nota pro relatório final: **o SQL roda na mão** — avisar o dono (padrão sql-sempre-entregar).

---

### Task 2: Regras puras — `lib/estoque-transferencia.ts` (TDD)

**Files:**
- Create: `lib/estoque-transferencia.ts`
- Test: `lib/__tests__/estoque-transferencia.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import {
  montarLugares, semLugar, precisaPerguntarLugar, quantoTirarDoLugar,
  problemaDaTransferencia, fraseDoErroDeTransferencia, MAX_POR_TRANSFERENCIA,
} from "../estoque-transferencia";

const ARVORE = [
  { id: "rua-c", nome: "Rua C", codigo: "RUA-C", pai_id: null },
  { id: "mov-1", nome: "Estante Cinza", codigo: "EC", pai_id: "rua-c" },
  { id: "niv-2", nome: "Nível 2", codigo: "EC-2", pai_id: "mov-1" },
  { id: "rua-e", nome: "Rua E", codigo: "RUA-E", pai_id: null },
];

describe("montarLugares", () => {
  it("traz nome e caminho do topo até o lugar, ordenado por saldo", () => {
    const lugares = montarLugares(
      [{ local_id: "niv-2", quantidade: 5 }, { local_id: "rua-e", quantidade: 30 }],
      ARVORE,
    );
    expect(lugares).toEqual([
      { id: "rua-e", nome: "Rua E", caminho: "Rua E", quantidade: 30 },
      { id: "niv-2", nome: "Nível 2", caminho: "Rua C › Estante Cinza › Nível 2", quantidade: 5 },
    ]);
  });
  it("lugar que sumiu da árvore não derruba a lista — sai com o id como nome", () => {
    const lugares = montarLugares([{ local_id: "fantasma", quantidade: 2 }], ARVORE);
    expect(lugares[0].quantidade).toBe(2);
    expect(lugares[0].nome).toBeTruthy();
  });
});

describe("semLugar", () => {
  it("é o total menos o alocado, nunca negativo", () => {
    const lugares = [{ id: "a", nome: "A", caminho: "A", quantidade: 30 }];
    expect(semLugar(50, lugares)).toBe(20);
    expect(semLugar(10, lugares)).toBe(0);
  });
});

describe("precisaPerguntarLugar", () => {
  it("só com 2 ou mais lugares", () => {
    const l = (n: number) => Array.from({ length: n }, (_, i) =>
      ({ id: `l${i}`, nome: `L${i}`, caminho: `L${i}`, quantidade: 1 }));
    expect(precisaPerguntarLugar(l(0))).toBe(false);
    expect(precisaPerguntarLugar(l(1))).toBe(false);
    expect(precisaPerguntarLugar(l(2))).toBe(true);
  });
});

describe("quantoTirarDoLugar", () => {
  it("nunca tira mais do que o lugar tem — o resto sai do balde sem-lugar", () => {
    const lugares = [{ id: "a", nome: "A", caminho: "A", quantidade: 3 }];
    expect(quantoTirarDoLugar(lugares, "a", 10)).toBe(3);
    expect(quantoTirarDoLugar(lugares, "a", 2)).toBe(2);
    expect(quantoTirarDoLugar(lugares, "b", 2)).toBe(0);
  });
});

describe("problemaDaTransferencia", () => {
  const lugares = [
    { id: "a", nome: "Rua A", caminho: "Rua A", quantidade: 30 },
    { id: "b", nome: "Rua B", caminho: "Rua B", quantidade: 20 },
  ];
  const base = { total: 60, lugares, deLocalId: "a", paraLocalId: "b", quantidade: 5 };
  it("transferência válida passa", () => {
    expect(problemaDaTransferencia(base)).toBeNull();
  });
  it("quantidade tem que ser inteiro positivo", () => {
    expect(problemaDaTransferencia({ ...base, quantidade: 0 })).toMatch(/quantidade/i);
    expect(problemaDaTransferencia({ ...base, quantidade: 2.5 })).toMatch(/quantidade/i);
    expect(problemaDaTransferencia({ ...base, quantidade: MAX_POR_TRANSFERENCIA + 1 }))
      .toMatch(/limite/i);
  });
  it("origem igual ao destino não anda", () => {
    expect(problemaDaTransferencia({ ...base, paraLocalId: "a" })).toMatch(/mesmo lugar/i);
  });
  it("sem destino nenhum e sem origem nenhuma não é transferência", () => {
    expect(problemaDaTransferencia({ ...base, deLocalId: null, paraLocalId: null }))
      .toMatch(/lugar/i);
  });
  it("origem sem saldo suficiente explica com números", () => {
    const p = problemaDaTransferencia({ ...base, deLocalId: "b", quantidade: 25 });
    expect(p).toMatch(/20/);
  });
  it("do balde sem-lugar só sai o que está no balde", () => {
    // total 60, alocado 50 → sem lugar = 10
    expect(problemaDaTransferencia({ ...base, deLocalId: null, quantidade: 10 })).toBeNull();
    expect(problemaDaTransferencia({ ...base, deLocalId: null, quantidade: 11 }))
      .toMatch(/sem lugar/i);
  });
});

describe("fraseDoErroDeTransferencia", () => {
  it("traduz os códigos da função SQL em frase", () => {
    expect(fraseDoErroDeTransferencia("saldo_insuficiente_na_origem")).toMatch(/origem/i);
    expect(fraseDoErroDeTransferencia("qualquer_outra_coisa")).toMatch(/transferir/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/__tests__/estoque-transferencia.test.ts`
Expected: FAIL — módulo `../estoque-transferencia` não existe.

- [ ] **Step 3: Implementar `lib/estoque-transferencia.ts`**

```ts
// ── Transferir estoque entre lugares: a régua ────────────────────────────────
//
// Puro, sem banco e sem React — a mesma regra vale pra rota que executa
// (`/api/estoque/transferir`), pro ajuste-qr que pergunta "de qual lugar?" e
// pro painel Transferir da /operacao. O banco tem a última palavra (a função
// SQL `estoque_transferir` revalida com a linha travada); aqui é o que deixa a
// tela recusar ANTES do clique, com frase de gente.

import { caminhoDe, type LocalDaArvore } from "./estoque-locais-arvore";

export interface LugarComSaldo {
  id: string;
  nome: string;
  /** "Rua C › Estante Cinza › Nível 2" — do topo até o lugar. */
  caminho: string;
  quantidade: number;
}

/** Mesmo teto (e mesmo motivo) do MAX_POR_MUDANCA de estoque-lugar-dos-itens:
 *  acima disso é engano de digitação, não logística. */
export const MAX_POR_TRANSFERENCIA = 10000;

/** As linhas do banco viram lugares com nome e caminho, do maior saldo pro
 *  menor. Lugar apagado da árvore não derruba a lista: sai com o próprio id,
 *  porque sumir com saldo alocado seria pior que feio. */
export function montarLugares(
  alocacoes: { local_id: string; quantidade: number }[],
  arvore: LocalDaArvore[],
): LugarComSaldo[] {
  return alocacoes
    .map((a) => {
      const trilha = caminhoDe(a.local_id, arvore);
      const nome = trilha.length ? trilha[trilha.length - 1].nome : a.local_id;
      const caminho = trilha.length ? trilha.map((l) => l.nome).join(" › ") : a.local_id;
      return { id: a.local_id, nome, caminho, quantidade: a.quantidade };
    })
    .sort((x, y) => y.quantidade - x.quantidade || x.id.localeCompare(y.id));
}

/** O balde "sem lugar definido": total menos alocado, nunca negativo (o
 *  gatilho do banco garante a invariante, mas uma leitura no meio de uma
 *  escrita não pode virar número negativo na tela). */
export function semLugar(total: number, lugares: LugarComSaldo[]): number {
  const alocado = lugares.reduce((s, l) => s + l.quantidade, 0);
  return Math.max(0, (total ?? 0) - alocado);
}

/** Baixa/entrada só pergunta "de qual lugar?" quando há dúvida de verdade. */
export function precisaPerguntarLugar(lugares: LugarComSaldo[]): boolean {
  return lugares.length >= 2;
}

/** Quanto da baixa sai DAQUELE lugar: nunca mais do que ele tem — o resto é do
 *  balde sem-lugar e o total cuida dele. */
export function quantoTirarDoLugar(
  lugares: LugarComSaldo[], localId: string, quantidade: number,
): number {
  const lugar = lugares.find((l) => l.id === localId);
  return Math.min(lugar?.quantidade ?? 0, Math.max(0, quantidade));
}

export interface PedidoDeTransferencia {
  total: number;
  lugares: LugarComSaldo[];
  /** null = tirar do balde "sem lugar". */
  deLocalId: string | null;
  /** null = devolver pro balde (desalocar). */
  paraLocalId: string | null;
  quantidade: number;
}

/** O que impede esta transferência, ou null. Frase, não código: quem lê está
 *  de pé na frente da estante. */
export function problemaDaTransferencia(p: PedidoDeTransferencia): string | null {
  const q = p.quantidade;
  if (!Number.isInteger(q) || q <= 0) {
    return "A quantidade precisa ser um número inteiro maior que zero.";
  }
  if (q > MAX_POR_TRANSFERENCIA) {
    return `São ${q} peças de uma vez, e o limite é ${MAX_POR_TRANSFERENCIA}. ` +
      "Quantidade desse tamanho costuma ser dedo a mais no teclado.";
  }
  if (p.deLocalId === p.paraLocalId) {
    return p.deLocalId === null
      ? "Escolha um lugar de origem ou de destino — do jeito que está, nada muda de lugar."
      : "Origem e destino são o mesmo lugar — nada mudaria.";
  }
  if (p.deLocalId === null) {
    const disponivel = semLugar(p.total, p.lugares);
    if (q > disponivel) {
      return disponivel === 0
        ? "Não há peça sem lugar definido neste item — escolha de qual lugar tirar."
        : `Só ${disponivel} peça(s) estão sem lugar definido, e você pediu ${q}.`;
    }
    return null;
  }
  const origem = p.lugares.find((l) => l.id === p.deLocalId);
  if (!origem) return "O lugar de origem não tem saldo deste item.";
  if (q > origem.quantidade) {
    return `O lugar de origem tem ${origem.quantidade} peça(s) deste item, e você pediu ${q}.`;
  }
  return null;
}

/** A frase pra cada erro que a função SQL `estoque_transferir` levanta. A
 *  mensagem do Postgres chega como o texto do `raise exception`. */
export function fraseDoErroDeTransferencia(mensagem: string): string {
  if (/saldo_insuficiente_na_origem/.test(mensagem)) {
    return "O lugar de origem não tem essa quantidade — alguém mexeu no saldo agora há pouco. Recarregue e confira.";
  }
  if (/sem_lugar_insuficiente/.test(mensagem)) {
    return "Não há essa quantidade sem lugar definido — recarregue e confira a repartição.";
  }
  if (/origem_igual_destino/.test(mensagem)) return "Origem e destino são o mesmo lugar.";
  if (/quantidade_invalida/.test(mensagem)) return "A quantidade precisa ser um inteiro maior que zero.";
  if (/item_inexistente/.test(mensagem)) return "Este item não existe mais no catálogo.";
  if (/destino_inexistente/.test(mensagem)) return "O lugar de destino não existe mais — recarregue a lista de lugares.";
  return "Não deu pra transferir agora. Tente de novo.";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/__tests__/estoque-transferencia.test.ts`
Expected: PASS. (Confira a assinatura real de `caminhoDe` em `lib/estoque-locais-arvore.ts:80` — `LocalDaArvore` exige `codigo`; se o tipo pedir campos a mais no teste, ajuste o fixture, não o tipo.)

- [ ] **Step 5: Commit**

```bash
git add lib/estoque-transferencia.ts lib/__tests__/estoque-transferencia.test.ts
git commit -m "feat(estoque): regras puras da transferencia entre lugares

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Rota `POST /api/estoque/transferir`

**Files:**
- Create: `app/api/estoque/transferir/route.ts`

- [ ] **Step 1: Implementar a rota**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeAjustarEstoque } from "@/lib/estoque-permissoes";
import { schemaDesatualizado } from "@/lib/estoque-schema";
import {
  montarLugares, semLugar, fraseDoErroDeTransferencia, problemaDaTransferencia,
} from "@/lib/estoque-transferencia";

export const dynamic = "force-dynamic";

// ── Transferir saldo de um lugar pro outro ───────────────────────────────────
//
// Permissão `estoque:ajustar` (a da Entrada por leitura): transferir não cria
// nem apaga estoque, só reparte — `estoque:cadastrar` é sensível demais pra
// operação de galpão. Quem executa é a função SQL `estoque_transferir`, com a
// linha do item travada: a régua daqui é cortesia pra frase chegar antes.

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAjustarEstoque(me))) {
    return NextResponse.json({
      error: "forbidden",
      detalhe: "Transferir estoque pede a permissão “Ajustar quantidade”. Peça pro admin em Permissões.",
    }, { status: 403 });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }
  const itemId = String(b.itemId ?? "").trim();
  const deLocalId = b.deLocalId ? String(b.deLocalId).trim() : null;
  const paraLocalId = b.paraLocalId ? String(b.paraLocalId).trim() : null;
  const quantidade = Number(b.quantidade);
  if (!itemId) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  const db = createSupabaseAdminClient();

  // A repartição atual — pra régua e pra resposta.
  const [alocRes, arvoreRes, itemRes] = await Promise.all([
    db.from("estoque_item_locais").select("local_id,quantidade").eq("item_id", itemId).limit(200),
    db.from("estoque_locais").select("id,nome,codigo,pai_id").limit(500),
    db.from("estoque_itens").select("id,quantidade").eq("id", itemId).limit(1),
  ]);
  if (alocRes.error) {
    if (schemaDesatualizado(alocRes.error)) {
      return NextResponse.json({
        error: "schema_desatualizado",
        detalhe: "Rode supabase/estoque_item_locais.sql no banco — a transferência depende dele.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const item = itemRes.data?.[0];
  if (!item) return NextResponse.json({ error: "recusado", detalhe: "Item não encontrado." }, { status: 400 });

  const arvore = (arvoreRes.data ?? []) as { id: string; nome: string; codigo: string; pai_id: string | null }[];
  const lugares = montarLugares(alocRes.data ?? [], arvore);
  const total = Number(item.quantidade ?? 0);

  const problema = problemaDaTransferencia({ total, lugares, deLocalId, paraLocalId, quantidade });
  if (problema) return NextResponse.json({ error: "recusado", detalhe: problema }, { status: 400 });

  const { error } = await db.rpc("estoque_transferir", {
    p_item: itemId, p_de: deLocalId, p_para: paraLocalId, p_qtd: quantidade,
  });
  if (error) {
    if (schemaDesatualizado(error)) {
      return NextResponse.json({
        error: "schema_desatualizado",
        detalhe: "Rode supabase/estoque_item_locais.sql no banco — a transferência depende dele.",
      }, { status: 409 });
    }
    return NextResponse.json({
      error: "recusado", detalhe: fraseDoErroDeTransferencia(error.message ?? ""),
    }, { status: 400 });
  }

  // A repartição NOVA volta na resposta: a tela repinta sem segunda ida.
  const { data: depois } = await db.from("estoque_item_locais")
    .select("local_id,quantidade").eq("item_id", itemId).limit(200);
  const lugaresDepois = montarLugares(depois ?? [], arvore);
  return NextResponse.json({
    ok: true,
    lugares: lugaresDepois,
    semLugar: semLugar(total, lugaresDepois),
  });
}
```

- [ ] **Step 2: Conferir tipos e testes**

Run: `npx tsc --noEmit && npx vitest run lib/__tests__/estoque-transferencia.test.ts`
Expected: sem erro de tipo, teste PASS. Se `LocalDaArvore` tiver campos além de `id,nome,codigo,pai_id`, nomeie-os no `select` da árvore.

- [ ] **Step 3: Commit**

```bash
git add app/api/estoque/transferir/route.ts
git commit -m "feat(estoque): rota de transferencia entre lugares via RPC atomica

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 4: `/api/estoque/consultar` devolve a repartição

**Files:**
- Modify: `app/api/estoque/consultar/route.ts`

- [ ] **Step 1: Estender a resposta**

No `interface ItemConsultado`, acrescentar (depois de `local: string | null;`):

```ts
  /** A repartição por lugar. Ausente enquanto o SQL novo não rodou no banco —
   *  a tela cai no `local` de sempre. */
  lugares?: { id: string; nome: string; caminho: string; quantidade: number }[];
  /** Peças do total que não têm lugar definido. */
  semLugar?: number;
```

Criar um helper ao lado de `nomeDoLocal` (imports: `montarLugares, semLugar` de `@/lib/estoque-transferencia`, `schemaDesatualizado` de `@/lib/estoque-schema`):

```ts
/** A repartição por lugar de vários itens numa ida só. Tolerante: enquanto o
 *  SQL de estoque_item_locais não rodou, devolve mapa vazio e a resposta sai
 *  como sempre saiu (a tela mostra o lugar principal). */
async function reparticaoDosItens(db: Db, itens: ItemConsultado[]): Promise<void> {
  if (!itens.length) return;
  const ids = itens.map((i) => i.id);
  const { data, error } = await db.from("estoque_item_locais")
    .select("item_id,local_id,quantidade").in("item_id", ids).limit(400);
  if (error || !data?.length) {
    if (error && !schemaDesatualizado(error)) console.error("[consultar] reparticao:", error.message);
    return;
  }
  const { data: arvore } = await db.from("estoque_locais")
    .select("id,nome,codigo,pai_id").limit(500);
  for (const item of itens) {
    const minhas = data.filter((r: { item_id: string }) => r.item_id === item.id);
    if (!minhas.length) continue;
    item.lugares = montarLugares(minhas, arvore ?? []);
    item.semLugar = semLugar(item.quantidade, item.lugares);
  }
}
```

Antes de CADA `NextResponse.json({ ok: true, itens: [...] })` que devolve itens (os retornos de código exato e o da busca por nome), chamar `await reparticaoDosItens(db, itens)` com a lista que vai na resposta. No caminho de item único, `await reparticaoDosItens(db, [item])`.

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npx vitest run lib/__tests__/estoque-catalogo-consulta.test.ts`
Expected: verde (o teste existente da consulta não pode quebrar).

- [ ] **Step 3: Commit**

```bash
git add app/api/estoque/consultar/route.ts
git commit -m "feat(estoque): consultar devolve a reparticao de lugares do item

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 5: ConsultarPanel mostra os lugares

**Files:**
- Modify: `app/(plataforma)/operacao/ConsultarPanel.tsx`

- [ ] **Step 1: Tipo + render**

No tipo do item do painel (que hoje tem `local: string | null;` na linha ~39), acrescentar:

```ts
  lugares?: { id: string; nome: string; caminho: string; quantidade: number }[];
  semLugar?: number;
```

Onde hoje está `<Dado rotulo="Onde fica" valor={item.local ?? "sem lugar definido"} />` (linha ~253), trocar por:

```tsx
        {item.lugares?.length ? (
          <div style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>Onde fica</span>
            {item.lugares.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{l.caminho}</span>
                <strong style={{ whiteSpace: "nowrap" }}>{l.quantidade}</strong>
              </div>
            ))}
            {(item.semLugar ?? 0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, color: "var(--text-2)" }}>
                <span>sem lugar definido</span>
                <strong style={{ whiteSpace: "nowrap" }}>{item.semLugar}</strong>
              </div>
            )}
          </div>
        ) : (
          <Dado rotulo="Onde fica" valor={item.local ?? "sem lugar definido"} />
        )}
```

Adapte ao markup real em volta (o `<Dado>` vive numa grade de dados — mantenha a mesma célula). Sem emoji; texto quebra com `overflowWrap`, nada estoura 320px.

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npx vitest run app/\(plataforma\)/operacao/__tests__/consultar-panel.dom.test.tsx`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add "app/(plataforma)/operacao/ConsultarPanel.tsx"
git commit -m "feat(operacao): consultar lista os lugares do item com o saldo de cada um

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 6: Ícone Tabler `arrows-exchange`

**Files:**
- Modify: `app/(plataforma)/Icon.tsx`

- [ ] **Step 1: Buscar o path OFICIAL do Tabler**

```bash
curl -s https://raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline/arrows-exchange.svg
```

Copiar APENAS os `<path>` (ignorar o path de `stroke="none"` `fill="none"` do boilerplate, como as entradas existentes fazem). Se a URL mudar de layout, ache o SVG em https://github.com/tabler/tabler-icons — o path tem que ser copiado verbatim (CLAUDE.md: nunca inventar path).

- [ ] **Step 2: Adicionar ao mapa `ICONS`** (ordem alfabética aproximada do arquivo, formato igual às entradas vizinhas):

```ts
  "arrows-exchange": '<path d="..." /><path d="..." />',
```

- [ ] **Step 3: Verificar + commit**

Run: `npx tsc --noEmit`

```bash
git add "app/(plataforma)/Icon.tsx"
git commit -m "feat(ui): icone arrows-exchange (Tabler) para a transferencia de estoque

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---### Task 7: Painel Transferir + cartão na Operação

**Files:**
- Create: `app/(plataforma)/operacao/TransferirPanel.tsx`
- Modify: `app/(plataforma)/operacao/OperacaoClient.tsx` (CARTOES ~linha 60, switch `Painel` ~linha 255)
- Modify: `app/(plataforma)/operacao/__tests__/operacao.dom.test.tsx`
- Test: `app/(plataforma)/operacao/__tests__/transferir-panel.dom.test.tsx`

- [ ] **Step 1: Teste do contrato de permissão (falha primeiro)**

Em `operacao.dom.test.tsx`, junto aos mocks existentes:

```tsx
vi.mock("../TransferirPanel", () => ({ TransferirPanel: () => <div>painel de transferência</div> }));
```

E os casos:

```tsx
  it("com tudo liberado, Transferir aparece", () => {
    render(<OperacaoClient perms={TUDO} />);
    expect(screen.getByRole("button", { name: /Transferir/ })).toBeTruthy();
  });

  it("Transferir exige ajustar E itens — sem qualquer um dos dois, some", () => {
    // O painel busca pelo /api/estoque/consultar (gate `estoque:itens`) e grava
    // pelo /api/estoque/transferir (gate `estoque:ajustar`). Cartão com um só
    // dos dois abriria num beco de 403 — o modo de falhar desta tela.
    render(<OperacaoClient perms={{ ...TUDO, ajustar: false }} />);
    expect(screen.queryByRole("button", { name: /Transferir/ })).toBeNull();
    render(<OperacaoClient perms={{ ...TUDO, itens: false }} />);
    expect(screen.queryByRole("button", { name: /Transferir/ })).toBeNull();
  });
```

Atenção: o teste existente "com tudo liberado, as seis tarefas aparecem" enumera os títulos — vira sete com "Transferir" na lista.

Run: `npx vitest run app/\(plataforma\)/operacao/__tests__/operacao.dom.test.tsx`
Expected: FAIL (cartão não existe).

- [ ] **Step 2: Cartão + switch no OperacaoClient**

Em `CARTOES`, depois da entrada `entrada` (a ordem é a do dia — transferir anda junto de entrada/baixa):

```ts
  { key: "transferir", titulo: "Transferir", frase: "Mudar peça de lugar — diga de onde, pra onde e quanto.", icon: "arrows-exchange", pode: (p) => p.ajustar && p.itens },
```

No `Painel`:

```tsx
    case "transferir": return <TransferirPanel />;
```

E o import junto dos outros painéis: `import { TransferirPanel } from "./TransferirPanel";`

- [ ] **Step 3: Escrever o TransferirPanel**

```tsx
"use client";

// ── Transferir: mudar peça de lugar, de pé no galpão ─────────────────────────
//
// Três passos num painel só: achar o item (mesmo gesto da Consultar — bipa ou
// digita), dizer DE ONDE e PRA ONDE, dizer QUANTO. A frase do que vai
// acontecer aparece ANTES do botão gravar. A régua é a mesma da rota
// (lib/estoque-transferencia.ts): a tela recusa antes do clique, o banco
// revalida com a linha travada.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import {
  problemaDaTransferencia, semLugar as calcularSemLugar, type LugarComSaldo,
} from "@/lib/estoque-transferencia";

interface ItemAchado {
  id: string; nome: string; sku: string | null; unidade: string;
  quantidade: number; imagemUrl?: string | null; local: string | null;
  lugares?: LugarComSaldo[]; semLugar?: number;
}
interface LugarDaArvore { id: string; nome: string; pai_id: string | null; ativo?: boolean }

/** null = balde "sem lugar definido". */
const SEM_LUGAR = null;

export function TransferirPanel() {
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [opcoes, setOpcoes] = useState<ItemAchado[]>([]);
  const [item, setItem] = useState<ItemAchado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [de, setDe] = useState<string | null>(SEM_LUGAR);
  const [para, setPara] = useState<string | null>(SEM_LUGAR);
  const [qtd, setQtd] = useState("");
  const [filtroDestino, setFiltroDestino] = useState("");
  const [arvore, setArvore] = useState<LugarDaArvore[]>([]);
  const [gravando, setGravando] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  // A árvore de lugares é pequena (~80 linhas) e não muda no meio do gesto:
  // uma ida só, sem poll.
  useEffect(() => {
    let vivo = true;
    fetch("/api/estoque/locais", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (vivo) setArvore((d.locais ?? d.itens ?? []) as LugarDaArvore[]); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const buscar = useCallback(async (texto: string, ehCodigo: boolean) => {
    const alvo = texto.trim();
    if (!alvo) return;
    setBuscando(true); setAviso(null); setFeito(null);
    try {
      const p = new URLSearchParams(ehCodigo ? { codigo: alvo } : { busca: alvo });
      const r = await fetch(`/api/estoque/consultar?${p}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setAviso(d?.detalhe ?? "Não deu para buscar agora."); return; }
      const itens = (d.itens ?? []) as ItemAchado[];
      if (itens.length === 1) escolher(itens[0]);
      else { setItem(null); setOpcoes(itens); if (!itens.length) setAviso("Nenhum item com esse código ou nome."); }
    } catch {
      setAviso("Sem conexão — a busca precisa de rede.");
    } finally {
      setBuscando(false);
      requestAnimationFrame(() => { campoRef.current?.focus(); campoRef.current?.select(); });
    }
  }, []);

  function escolher(i: ItemAchado) {
    setItem(i); setOpcoes([]); setQtd(""); setPara(SEM_LUGAR); setFeito(null);
    const lugares = i.lugares ?? [];
    // Origem pré-escolhida quando não há dúvida: o único lugar, ou o balde
    // sem-lugar quando é o único com saldo.
    setDe(lugares.length === 1 ? lugares[0].id : lugares.length === 0 ? SEM_LUGAR : lugares[0].id);
  }

  const lugares = item?.lugares ?? [];
  const semLugarQtd = item ? (item.semLugar ?? calcularSemLugar(item.quantidade, lugares)) : 0;

  const caminhoDe = useCallback((id: string): string => {
    const nomes: string[] = [];
    let atual: LugarDaArvore | undefined = arvore.find((l) => l.id === id);
    for (let i = 0; atual && i < 10; i++) {
      nomes.unshift(atual.nome);
      atual = atual.pai_id ? arvore.find((l) => l.id === atual!.pai_id) : undefined;
    }
    return nomes.join(" › ") || id;
  }, [arvore]);

  const destinos = useMemo(() => {
    const f = filtroDestino.trim().toLowerCase();
    return arvore
      .filter((l) => l.ativo !== false && l.id !== de)
      .filter((l) => !f || caminhoDe(l.id).toLowerCase().includes(f))
      .slice(0, 8);
  }, [arvore, filtroDestino, de, caminhoDe]);

  const quantidade = Math.floor(Number(qtd));
  const problema = item && qtd
    ? problemaDaTransferencia({ total: item.quantidade, lugares, deLocalId: de, paraLocalId: para, quantidade })
    : null;
  const pronto = !!item && !!qtd && !problema && (de !== para);

  async function transferir() {
    if (!item || !pronto || gravando) return;
    setGravando(true); setAviso(null);
    try {
      const r = await fetch("/api/estoque/transferir", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, deLocalId: de, paraLocalId: para, quantidade }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setAviso(String(d?.detalhe ?? "Não deu pra transferir agora.")); return; }
      setItem({ ...item, lugares: d.lugares ?? [], semLugar: d.semLugar ?? 0 });
      setQtd("");
      navigator.vibrate?.([18, 45, 18]);
      setFeito(`${quantidade} peça(s) transferida(s).`);
    } catch {
      setAviso("Sem conexão — nada foi transferido.");
    } finally { setGravando(false); }
  }

  const nomeDoLado = (id: string | null) =>
    id === SEM_LUGAR ? "sem lugar definido" : caminhoDe(id);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); void buscar(termo, false); }}
        style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 200px), 1fr) auto", gap: 8 }}
      >
        <input
          ref={campoRef} value={termo}
          onChange={(e) => setTermo(e.target.value.slice(0, 60))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscar(termo, true); } }}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Bipe a etiqueta ou digite o nome"
          aria-label="Código ou nome do item"
          style={{ minHeight: "var(--tap)", padding: "10px 14px", fontSize: 16,
            borderRadius: "var(--r-sm)", border: "1.5px solid var(--border)",
            background: "var(--surface)", color: "var(--text)", width: "100%" }}
        />
        <Botao type="submit" disabled={buscando}>
          <Icon name="search" size={16} color="currentColor" /> Buscar
        </Botao>
      </form>

      {aviso && <p role="alert" style={{ margin: 0, color: "var(--danger, #b3261e)", fontSize: 14 }}>{aviso}</p>}
      {feito && <p role="status" style={{ margin: 0, color: "var(--success, #1b7f4b)", fontSize: 14 }}>{feito}</p>}

      {opcoes.map((o) => (
        <button key={o.id} type="button" onClick={() => escolher(o)}
          style={{ minHeight: "var(--tap)", textAlign: "left", padding: "10px 12px",
            border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
            background: "var(--surface)", color: "var(--text)" }}>
          <strong>{o.nome}</strong>{o.sku ? ` · ${o.sku}` : ""} — {o.quantidade} {o.unidade}
        </button>
      ))}

      {item && (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <strong style={{ fontSize: 16 }}>{item.nome}</strong>
            <span style={{ color: "var(--text-2)", fontSize: 14 }}> — {item.quantidade} {item.unidade} no total</span>
          </div>

          {/* DE ONDE sai */}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>De onde sai</span>
            {lugares.map((l) => (
              <button key={l.id} type="button" aria-pressed={de === l.id}
                onClick={() => { setDe(l.id); if (para === l.id) setPara(SEM_LUGAR); }}
                style={{ minHeight: "var(--tap)", display: "flex", justifyContent: "space-between",
                  gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: "var(--r-sm)",
                  border: `1.5px solid ${de === l.id ? "var(--primary)" : "var(--border)"}`,
                  background: de === l.id ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
                  color: "var(--text)", textAlign: "left" }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{l.caminho}</span>
                <strong>{l.quantidade}</strong>
              </button>
            ))}
            {semLugarQtd > 0 && (
              <button type="button" aria-pressed={de === SEM_LUGAR}
                onClick={() => setDe(SEM_LUGAR)}
                style={{ minHeight: "var(--tap)", display: "flex", justifyContent: "space-between",
                  gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: "var(--r-sm)",
                  border: `1.5px solid ${de === SEM_LUGAR ? "var(--primary)" : "var(--border)"}`,
                  background: de === SEM_LUGAR ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
                  color: "var(--text)", textAlign: "left" }}>
                <span>sem lugar definido</span><strong>{semLugarQtd}</strong>
              </button>
            )}
          </div>

          {/* PRA ONDE vai */}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Pra onde vai</span>
            <input value={filtroDestino} onChange={(e) => setFiltroDestino(e.target.value.slice(0, 60))}
              placeholder="Filtre o lugar de destino" aria-label="Filtrar lugar de destino"
              style={{ minHeight: "var(--tap)", padding: "10px 12px", fontSize: 15,
                borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
                background: "var(--surface)", color: "var(--text)", width: "100%" }} />
            {destinos.map((l) => (
              <button key={l.id} type="button" aria-pressed={para === l.id}
                onClick={() => setPara(l.id)}
                style={{ minHeight: "var(--tap)", padding: "8px 12px", borderRadius: "var(--r-sm)",
                  border: `1.5px solid ${para === l.id ? "var(--primary)" : "var(--border)"}`,
                  background: para === l.id ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
                  color: "var(--text)", textAlign: "left", overflowWrap: "anywhere" }}>
                {caminhoDe(l.id)}
              </button>
            ))}
          </div>

          {/* QUANTO */}
          <label style={{ display: "grid", gap: 5, maxWidth: 200 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Quantas peças</span>
            <input inputMode="numeric" pattern="[0-9]*" value={qtd}
              onChange={(e) => setQtd(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-label="Quantidade a transferir"
              style={{ minHeight: "var(--tap)", padding: "10px 12px", fontSize: 16,
                borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
                background: "var(--surface)", color: "var(--text)" }} />
          </label>

          {problema
            ? <p role="alert" style={{ margin: 0, fontSize: 14, color: "var(--danger, #b3261e)" }}>{problema}</p>
            : pronto && (
              <p style={{ margin: 0, fontSize: 14, color: "var(--text-2)" }}>
                Vai transferir <strong>{quantidade}</strong> de <strong>{nomeDoLado(de)}</strong> pra <strong>{nomeDoLado(para)}</strong>.
              </p>
            )}

          <Botao onClick={() => void transferir()} disabled={!pronto || gravando}>
            <Icon name="arrows-exchange" size={16} color="currentColor" />
            {gravando ? "Transferindo…" : "Transferir"}
          </Botao>
        </div>
      )}
    </div>
  );
}
```

Ajustes de integração esperados: a chave da resposta do `GET /api/estoque/locais` (confira em `app/api/estoque/locais/route.ts:47` o nome real — `locais`, `itens` ou outro) e a API do componente `Botao` (`app/(plataforma)/ui/controles.tsx`). Cores de aviso: use os tokens semânticos existentes do `globals.css` (procure `--danger`/`--success`/equivalentes; nunca hex cru sem fallback de token).

- [ ] **Step 4: Teste do painel**

`app/(plataforma)/operacao/__tests__/transferir-panel.dom.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TransferirPanel } from "../TransferirPanel";

/**
 * O contrato do painel: origem pré-escolhida quando não há dúvida, frase do
 * que vai acontecer antes de gravar, e o POST com o corpo que a rota espera.
 */

const ITEM = {
  id: "i1", nome: "Chapa MDF 6mm", sku: "MDF6", unidade: "un", quantidade: 50,
  local: "Rua C", imagemUrl: null,
  lugares: [
    { id: "a", nome: "Rua C", caminho: "Rua C › Nível 2", quantidade: 30 },
    { id: "b", nome: "Rua E", caminho: "Rua E › Nível 1", quantidade: 20 },
  ],
  semLugar: 0,
};

function mockFetch() {
  const chamadas: { url: string; body?: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url).startsWith("/api/estoque/locais")) {
      return new Response(JSON.stringify({ locais: [
        { id: "a", nome: "Rua C", pai_id: null }, { id: "b", nome: "Rua E", pai_id: null },
        { id: "c", nome: "Rua Z", pai_id: null },
      ] }));
    }
    if (String(url).startsWith("/api/estoque/consultar")) {
      return new Response(JSON.stringify({ ok: true, itens: [ITEM] }));
    }
    if (String(url).startsWith("/api/estoque/transferir")) {
      return new Response(JSON.stringify({ ok: true, lugares: ITEM.lugares, semLugar: 0 }));
    }
    return new Response("{}", { status: 404 });
  }));
  return chamadas;
}

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("TransferirPanel", () => {
  it("acha o item, mostra os lugares e transfere com o corpo certo", async () => {
    const chamadas = mockFetch();
    render(<TransferirPanel />);
    const campo = screen.getByLabelText("Código ou nome do item");
    fireEvent.change(campo, { target: { value: "MDF6" } });
    fireEvent.keyDown(campo, { key: "Enter" });

    await waitFor(() => expect(screen.getByText(/Rua C › Nível 2/)).toBeTruthy());
    // dois lugares → os dois aparecem com saldo
    expect(screen.getByText(/Rua E › Nível 1/)).toBeTruthy();

    // destino: Rua Z
    fireEvent.click(screen.getByRole("button", { name: /Rua Z/ }));
    fireEvent.change(screen.getByLabelText("Quantidade a transferir"), { target: { value: "5" } });

    // a frase do que vai acontecer aparece antes do clique
    await waitFor(() => expect(screen.getByText(/Vai transferir/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^Transferir$/ }));
    await waitFor(() => {
      const post = chamadas.find((c) => c.url === "/api/estoque/transferir");
      expect(post?.body).toMatchObject({ itemId: "i1", deLocalId: "a", paraLocalId: "c", quantidade: 5 });
    });
  });

  it("recusa na tela quando a origem não tem saldo", async () => {
    mockFetch();
    render(<TransferirPanel />);
    const campo = screen.getByLabelText("Código ou nome do item");
    fireEvent.change(campo, { target: { value: "MDF6" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(screen.getByText(/Rua C › Nível 2/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Rua Z/ }));
    fireEvent.change(screen.getByLabelText("Quantidade a transferir"), { target: { value: "40" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/30/));
  });
});
```

- [ ] **Step 5: Rodar tudo do painel**

Run: `npx vitest run app/\(plataforma\)/operacao/__tests__/`
Expected: PASS (os dois dom tests novos + os existentes).

- [ ] **Step 6: Commit**

```bash
git add "app/(plataforma)/operacao/TransferirPanel.tsx" "app/(plataforma)/operacao/OperacaoClient.tsx" "app/(plataforma)/operacao/__tests__/operacao.dom.test.tsx" "app/(plataforma)/operacao/__tests__/transferir-panel.dom.test.tsx"
git commit -m "feat(operacao): cartao Transferir — mudar peca de lugar bipando o item

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 8: ajuste-qr aprende lugar (pergunta só quando ambíguo)

**Files:**
- Modify: `app/api/estoque/ajuste-qr/route.ts`

- [ ] **Step 1: Ler a repartição e recusar com `precisa_lugar` quando ambíguo**

Depois de resolver `item` e ANTES de aplicar o ajuste, com imports de
`montarLugares, precisaPerguntarLugar, quantoTirarDoLugar` (`@/lib/estoque-transferencia`)
e `schemaDesatualizado` (`@/lib/estoque-schema`):

```ts
  // ── A repartição por lugar ─────────────────────────────────────────────────
  // Item em 2+ lugares e a chamada não disse qual: recusa com a lista, e a
  // tela pergunta. Um lugar só (ou nenhum): segue como sempre — o gesto comum
  // não ganhou toque novo. Enquanto o SQL não rodou, `lugares` fica vazio e
  // NADA muda.
  const localIdPedido = b.localId ? String(b.localId).trim() : null;
  let lugaresDoItem: ReturnType<typeof montarLugares> = [];
  {
    const { data: aloc, error: e } = await db.from("estoque_item_locais")
      .select("local_id,quantidade").eq("item_id", item.id).limit(200);
    if (!e && aloc?.length) {
      const { data: arvore } = await db.from("estoque_locais")
        .select("id,nome,codigo,pai_id").limit(500);
      lugaresDoItem = montarLugares(aloc, arvore ?? []);
    } else if (e && !schemaDesatualizado(e)) {
      console.error("[ajuste-qr] reparticao:", e.message);
    }
  }
  if (!localIdPedido && precisaPerguntarLugar(lugaresDoItem)) {
    return NextResponse.json({
      error: "precisa_lugar",
      detalhe: sentido === "saida"
        ? "Este item está em mais de um lugar — diga de qual saiu."
        : "Este item está em mais de um lugar — diga onde entrou.",
      lugares: lugaresDoItem,
    }, { status: 409 });
  }
```

- [ ] **Step 2: Aplicar a alocação junto do ajuste**

Depois do `update` de `quantidade` que já existe (só quando ele deu certo):

```ts
  // A alocação acompanha o ajuste. Reusa a MESMA função atômica da
  // transferência: entrada = balde→lugar (depois do total subir), saída =
  // lugar→balde (o total já desceu, o gatilho não tem o que aparar).
  const lugarDoAjuste = localIdPedido ?? (lugaresDoItem.length === 1 ? lugaresDoItem[0].id : null);
  if (lugarDoAjuste) {
    const mexer = sentido === "saida"
      ? quantoTirarDoLugar(lugaresDoItem, lugarDoAjuste, quantidade)
      : quantidade;
    if (mexer > 0) {
      const { error: eT } = await db.rpc("estoque_transferir", sentido === "saida"
        ? { p_item: item.id, p_de: lugarDoAjuste, p_para: null, p_qtd: mexer }
        : { p_item: item.id, p_de: null, p_para: lugarDoAjuste, p_qtd: mexer });
      // Alocação é derivada: se falhar (corrida, schema), o ajuste do TOTAL já
      // valeu e o gatilho apara — não vira erro pra quem bipou.
      if (eT && !schemaDesatualizado(eT)) console.error("[ajuste-qr] alocacao:", eT.message);
    }
  }
```

Atenção à ordem no código real: a saída chama a RPC ANTES do update do total **ou** depois — depois é mais simples e o gatilho `estoque_itens_apara_alocacao` já protegeu o meio-tempo; manter DEPOIS nos dois sentidos, como acima.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx vitest run lib/__tests__/`
Expected: verde (as réguas do ajuste-qr têm testes puros — não podem quebrar).

- [ ] **Step 4: Commit**

```bash
git add app/api/estoque/ajuste-qr/route.ts
git commit -m "feat(estoque): baixa e entrada por leitura sabem de qual lugar — pergunta so quando ambiguo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 9: Os painéis respondem à pergunta "de qual lugar?"

**Files:**
- Create: `app/(plataforma)/estoque/EscolhaDeLugar.tsx`
- Modify: `app/(plataforma)/estoque/EntradaPorLeitura.tsx` (função `confirmar`, ~linha 79)
- Modify: `app/(plataforma)/estoque/BiparClient.tsx` (laço do ajuste-qr, ~linha 391)

- [ ] **Step 1: Componente compartilhado**

```tsx
"use client";

// ── "Este item está em mais de um lugar" ─────────────────────────────────────
//
// A resposta 409 `precisa_lugar` do ajuste-qr vira esta pergunta: uma fileira
// de botões com o lugar e o saldo. Compartilhado entre a Entrada por leitura e
// a baixa por etiqueta de produto — a MESMA pergunta nos dois painéis.

import type { LugarComSaldo } from "@/lib/estoque-transferencia";

export function EscolhaDeLugar({ frase, lugares, onEscolher }: {
  frase: string;
  lugares: LugarComSaldo[];
  onEscolher: (localId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{frase}</span>
      {lugares.map((l) => (
        <button key={l.id} type="button" onClick={() => onEscolher(l.id)}
          style={{ minHeight: "var(--tap)", display: "flex", justifyContent: "space-between",
            gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: "var(--r-sm)",
            border: "1.5px solid var(--border)", background: "var(--surface)",
            color: "var(--text)", textAlign: "left" }}>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{l.caminho}</span>
          <strong>{l.quantidade}</strong>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: EntradaPorLeitura**

No estado, junto dos existentes:

```ts
  const [pendenteDeLugar, setPendenteDeLugar] = useState<{
    codigo: string; frase: string; lugares: LugarComSaldo[];
  } | null>(null);
```

No `confirmar()`, dentro do laço, quando `!r.ok`: se `d.error === "precisa_lugar"`, em vez de empurrar desfecho de falha, guardar `setPendenteDeLugar({ codigo: linha.codigo, frase: String(d.detalhe), lugares: d.lugares ?? [] })` e `continue` (a linha fica na fila). Renderizar, acima da fila:

```tsx
      {pendenteDeLugar && (
        <EscolhaDeLugar frase={pendenteDeLugar.frase} lugares={pendenteDeLugar.lugares}
          onEscolher={(localId) => { void confirmarUm(pendenteDeLugar.codigo, localId); setPendenteDeLugar(null); }} />
      )}
```

E extrair de `confirmar` um `confirmarUm(codigo: string, localId?: string)` que faz a mesma chamada de um código só com `localId` no corpo, atualizando fila/desfechos do mesmo jeito (DRY: `confirmar` itera chamando `confirmarUm`).

- [ ] **Step 3: BiparClient (só o laço de `daQuantidade`)**

Mesmo padrão: quando o POST do ajuste-qr voltar `d.error === "precisa_lugar"`, a linha fica na pilha com um estado `precisaLugar: { frase, lugares }` no `Lido`, e a linha renderiza a `EscolhaDeLugar` inline; escolher refaz SÓ aquele POST com `localId` e aplica o resultado como os demais. Não mexer no caminho das etiquetas de unidade (PATCH `/api/estoque/unidades`) — item serializado não tem lugar por caixa por decisão de projeto.

- [ ] **Step 4: Verificar os dom tests dos dois painéis**

Run: `npx vitest run app/\(plataforma\)/estoque/__tests__/entrada-por-leitura.dom.test.tsx app/\(plataforma\)/estoque/__tests__/bipar.dom.test.tsx`
Expected: verde. Acrescentar UM caso ao teste da entrada: resposta 409 `precisa_lugar` mostra os lugares e o clique re-envia com `localId` no corpo (mock de fetch no padrão do arquivo).

- [ ] **Step 5: Commit**

```bash
git add "app/(plataforma)/estoque/EscolhaDeLugar.tsx" "app/(plataforma)/estoque/EntradaPorLeitura.tsx" "app/(plataforma)/estoque/BiparClient.tsx" "app/(plataforma)/estoque/__tests__/entrada-por-leitura.dom.test.tsx"
git commit -m "feat(estoque): paineis de baixa e entrada perguntam o lugar quando o item esta em dois

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 10: Verificação final

- [ ] **Step 1: Suíte inteira + tipos**

Run: `npm test` e `npx tsc --noEmit` (ATENÇÃO: nunca rodar duas instâncias de vitest ao mesmo tempo — trava a máquina).
Expected: tudo verde, incluindo `orcamento-de-execucao.test.ts` (nenhum poll novo, nenhum `select("*")`, nenhum `vh`) e `rolagem-horizontal.test.ts` (nenhum `minmax(Npx, …)` sem `min(100%, …)` — o TransferirPanel usa a forma certa).

- [ ] **Step 2: Celular de verdade**

Com `npm run dev` de pé, abrir `/dev-operacao` no navegador embutido em 320/390/430:
- cartão Transferir aparece e abre;
- `document.documentElement.scrollWidth - clientWidth === 0`;
- alvos com `offsetHeight >= 44` (medir por offset, NÃO por `getBoundingClientRect` — animação congelada no embutido mente);
- os dois temas.
Se `/dev-operacao` (Prova.tsx) montar os painéis com perms mocadas, incluir o Transferir lá.

- [ ] **Step 3: Relatório ao dono**

Obrigatório avisar: **rodar `supabase/estoque_item_locais.sql` no banco** antes de usar (até lá: Consultar/baixa/entrada seguem como hoje; Transferir responde 409 com a frase dizendo o que rodar).

- [ ] **Step 4: Memória e wiki**

- Atualizar memória `estoque-modulo-completo` (ou criar `estoque-multi-local.md`): item pode ter saldo em N lugares; `local_id` virou "principal" mantido por gatilho; balde "sem lugar" é subtração; transferência via RPC atômica.
- Apêndice no `log.md` do Brain (formato do CLAUDE.md global).
