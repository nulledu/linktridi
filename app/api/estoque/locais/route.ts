import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { podeCadastrarEstoque } from "@/lib/estoque-permissoes";
import type { Role } from "@/lib/rbac";

// ── Estoque · Localizações ────────────────────────────────────────────────
// supabase/estoque_hierarquia_unidades.sql (seção 1) cria `estoque_locais`.
// Enquanto ninguém rodou esse SQL, toda query aqui devolve o erro cru do
// Postgres ("relation ... does not exist") — sem fallback silencioso, porque
// não há nada pra degradar pra: sem a tabela não existe local nenhum pra
// mostrar, então errar alto é o que avisa a pessoa a rodar o SQL.

export const dynamic = "force-dynamic";

const PODE_GERIR = ["admin", "estoquista", "gerente_producao"];

// Mesmo formato do podeGerir() em app/api/estoque-itens/route.ts: papel de
// sempre OU a sub-permissão "estoque:locais" da grade. Sem o fallback pelo
// papel, quem é estoquista/gerente_producao mas ainda não foi migrado pra
// grade nova (fica só com a chave de área "estoque", sem sub nenhuma —
// lib/perfis.ts) perderia a gestão de localizações do dia pra noite.
async function podeGerir(me: { id: string; role: string; username?: string | null }): Promise<boolean> {
  if (PODE_GERIR.includes(me.role)) return true;
  const keys = await resolveMyModuleKeys({ id: me.id, role: me.role as Role, username: me.username });
  return keys.includes("estoque:locais");
}

// GET → lista de localizações. Qualquer usuário autenticado: o seletor de
// local dentro do editor de item precisa disso mesmo sem a sub "locais".
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("estoque_locais")
    .select("id,nome,codigo,pai_id,ativo,ordem")
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  // `podeGerir` e `podeMover` são perguntas DIFERENTES e não se implicam.
  // Gerir é sobre o LUGAR (criar a prateleira, renomear, apagar) — `estoque:locais`.
  // Mover é sobre o PRODUTO (dizer onde ele mora) — `estoque:cadastrar`, a mesma
  // que o PATCH da ficha exige pra escrever `local_id`. Um estoquista pode
  // cadastrar a estante sem poder reendereçar o catálogo inteiro.
  return NextResponse.json({
    locais: data ?? [],
    podeGerir: await podeGerir(me),
    podeMover: await podeCadastrarEstoque(me),
  });
}

// POST → cria localização. Com `locais: [{codigo, nome}]` no corpo, cria várias
// de uma colagem só — é a mesma porta que a aba Fornecedores já tinha, e a
// única forma de um corredor com seis prateleiras não custar sete aberturas de
// painel. Sem ela, "0 locais" é o estado que fica pra sempre.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeGerir(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (Array.isArray(b.locais)) return criarEmLote(b.locais, b.pai_id ? String(b.pai_id) : null);
  const nome = String(b.nome || "").trim();
  if (!nome) return NextResponse.json({ error: "missing_nome" }, { status: 400 });
  // Maiúsculo e sem espaço nas pontas: é o que vai pra etiqueta física, então
  // "dep-01" e "DEP-01 " têm que virar o mesmo código antes de bater no banco.
  const codigo = String(b.codigo || "").trim().toUpperCase();
  if (!codigo) return NextResponse.json({ error: "missing_codigo" }, { status: 400 });
  const paiId = b.pai_id ? String(b.pai_id) : null;
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("estoque_locais").insert({
    nome,
    codigo,
    pai_id: paiId,
    ordem: b.ordem !== undefined && b.ordem !== "" ? Math.max(0, Number(b.ordem) || 0) : 0,
  }).select("id").single();
  if (error) {
    // 23505 = índice único em lower(codigo): "DEP-01" e "dep-01" colidem no
    // banco mesmo parecendo strings diferentes na tela. 409 deixa a pessoa
    // escolher outro código; um 500 cru não diria o quê fazer.
    if (error.code === "23505") return NextResponse.json({ error: "codigo_duplicado" }, { status: 409 });
    return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ local: data });
}

/** Teto de uma colagem. Um galpão inteiro não passa de algumas dezenas; 200
 *  segura "colei a coluna inteira" da planilha virando 4 mil INSERTs. */
const LOTE_MAX = 200;

// Cadastro em lote. A triagem (o que é novo, o que já existe, o que repete na
// própria lista) acontece NA TELA, com o humano olhando — aqui só entra o que
// ele marcou. O servidor repete a checagem do que já existe porque a lista da
// tela pode estar velha, e confia no resto: código estranho é problema de quem
// escreveu, não motivo pra recusar a colagem inteira.
async function criarEmLote(bruto: unknown[], paiId: string | null) {
  const linhas: { codigo: string; nome: string }[] = [];
  const chaves = new Set<string>();
  for (const l of bruto.slice(0, LOTE_MAX)) {
    const o = (l ?? {}) as Record<string, unknown>;
    const codigo = String(o.codigo || "").trim().toUpperCase();
    const nome = String(o.nome || "").trim() || codigo;
    const chave = codigo.toLowerCase();
    if (!codigo || chaves.has(chave)) continue;   // vazio ou repetido na própria colagem
    chaves.add(chave);
    linhas.push({ codigo, nome });
  }
  if (!linhas.length) return NextResponse.json({ error: "lista_vazia" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: atuais, error: erroLista } = await db.from("estoque_locais")
    .select("id,codigo,ordem").limit(1000);
  if (erroLista) return NextResponse.json({ error: "failed", detail: erroLista.message }, { status: 500 });
  const listaAtual = (atuais ?? []) as { codigo: string; ordem: number | null }[];
  const jaNoBanco = new Set(listaAtual.map((l) => String(l.codigo).trim().toLowerCase()));

  const entrar = linhas.filter((l) => !jaNoBanco.has(l.codigo.toLowerCase()));
  const jaExistiam = linhas.filter((l) => jaNoBanco.has(l.codigo.toLowerCase())).map((l) => l.codigo);
  if (!entrar.length) return NextResponse.json({ criados: [], jaExistiam, falhas: [] });

  // A ordem da colagem é a ordem da estante (A1, A2, A3…), e ela continua de
  // onde o cadastro parou — nascer tudo em `ordem: 0` embaralharia as novas
  // com as antigas na lista da tela, que ordena por `ordem` antes do nome.
  const base = listaAtual.reduce((m, l) => Math.max(m, Number(l.ordem) || 0), 0) + 1;
  const monta = (l: { codigo: string; nome: string }, i: number) =>
    ({ codigo: l.codigo, nome: l.nome, pai_id: paiId, ordem: base + i });

  // Uma ida ao banco pras seis prateleiras. Se QUALQUER linha bater no índice
  // único, o Postgres derruba o INSERT inteiro — aí (e só aí) vai uma a uma,
  // pra cinco entrarem e a sexta ser a única a voltar como falha.
  const { data, error } = await db.from("estoque_locais")
    .insert(entrar.map(monta)).select("id,codigo,nome");
  if (!error) return NextResponse.json({ criados: data ?? [], jaExistiam, falhas: [] });

  const criados: { id: string; codigo: string; nome: string }[] = [];
  const falhas: { codigo: string; motivo: string }[] = [];
  for (let i = 0; i < entrar.length; i++) {
    const r = await db.from("estoque_locais").insert(monta(entrar[i], i)).select("id,codigo,nome").single();
    if (r.error) falhas.push({ codigo: entrar[i].codigo, motivo: r.error.code === "23505" ? "codigo_duplicado" : "failed" });
    else if (r.data) criados.push(r.data as { id: string; codigo: string; nome: string });
  }
  return NextResponse.json({ criados, jaExistiam, falhas });
}

// PATCH → edita localização (qualquer campo, inclusive ativo).
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeGerir(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (b.nome !== undefined) {
    const nome = String(b.nome).trim();
    if (!nome) return NextResponse.json({ error: "missing_nome" }, { status: 400 });
    patch.nome = nome;
  }
  if (b.codigo !== undefined) {
    const codigo = String(b.codigo).trim().toUpperCase();
    if (!codigo) return NextResponse.json({ error: "missing_codigo" }, { status: 400 });
    patch.codigo = codigo;
  }
  if (b.pai_id !== undefined) {
    const paiId = b.pai_id ? String(b.pai_id) : null;
    // Um local não pode ser pai de si mesmo: viraria uma árvore com um ciclo
    // de tamanho 1, e qualquer tela que sobe/desce a hierarquia (breadcrumb,
    // seletor em árvore) entraria num loop infinito nele.
    if (paiId === id) return NextResponse.json({ error: "pai_invalido" }, { status: 400 });
    patch.pai_id = paiId;
  }
  if (b.ordem !== undefined) patch.ordem = Math.max(0, Number(b.ordem) || 0);
  if (b.ativo !== undefined) patch.ativo = !!b.ativo;
  const db = createSupabaseAdminClient();
  const { error } = await db.from("estoque_locais").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "codigo_duplicado" }, { status: 409 });
    return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE ?id= → remove localização.
export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeGerir(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const db = createSupabaseAdminClient();
  // Local em uso não pode sumir: os itens que apontam pra ele perderiam o
  // endereço em silêncio. Head-only — só a contagem viaja, nenhuma linha.
  const { count, error: contagemErro } = await db.from("estoque_itens")
    .select("id", { count: "exact", head: true }).eq("local_id", id);
  if (contagemErro) return NextResponse.json({ error: "failed", detail: contagemErro.message }, { status: 500 });
  if ((count ?? 0) > 0) return NextResponse.json({ error: "local_em_uso", itens: count }, { status: 409 });
  const { error } = await db.from("estoque_locais").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
