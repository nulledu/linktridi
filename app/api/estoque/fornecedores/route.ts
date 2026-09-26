import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { empresasDoUsuario } from "@/lib/financeiro/db";
import {
  empresaParaCriar, fornecedoresDoFinanceiro, podeGerirFornecedores as podeGerir,
} from "@/lib/estoque-fornecedor-fonte";
import { limparNomeFornecedor, normalizarFornecedor } from "@/lib/estoque-fornecedores-semelhanca";

// ── Estoque · Fornecedores ───────────────────────────────────────────────────
//
// Esta rota não tem mais cadastro próprio: ela é a janela do estoque para o
// cadastro do FINANCEIRO (`fin_fornecedores`). O porquê e a fronteira de
// colunas estão em `lib/estoque-fornecedor-fonte.ts`; a troca de chave
// estrangeira está em `supabase/estoque_fornecedor_do_financeiro.sql`.
//
// A consequência que muda o dia a dia: LER continua sendo de qualquer pessoa do
// estoque, mas ESCREVER passou a exigir `financeiro:cadastros`. Não há como ser
// diferente sem furar a área restrita — quem grava em `fin_fornecedores` está
// gravando dentro do módulo trancado, e a chave dele é essa. Quem não tem, vê a
// lista e o recado de onde se cadastra.

export const dynamic = "force-dynamic";

// GET → a lista, para o seletor do editor de item e para a aba Fornecedores.
// Qualquer pessoa autenticada: sem isso o editor de item ficaria sem o campo de
// origem, que é justamente o que a sincronização veio melhorar.
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { fornecedores, pendente } = await fornecedoresDoFinanceiro();
  const gerir = await podeGerir(me);
  const { dados: empresas } = gerir
    ? await empresasDoUsuario(me.id)
    : { dados: [] as { id: string; nome: string }[] };

  return NextResponse.json({
    fornecedores,
    podeGerir: gerir,
    // A tela usa isto para dizer "rode o SQL do Financeiro" em vez de mostrar
    // uma lista vazia que parece cadastro por fazer.
    financeiroPendente: pendente,
    // Só quando há mais de uma: com uma empresa a pergunta não existe.
    empresas: empresas.map((e) => ({ id: e.id, nome: e.nome })),
  });
}

/** Teto de uma colagem. A planilha do galpão traz 17; 200 é dez vezes o pior
 *  caso real e segura um "colei a coluna inteira" de 4 mil linhas. */
const LOTE_MAX = 200;

function falha(e: { code?: string; message?: string }) {
  if (e.code === "23505") return NextResponse.json({ error: "nome_duplicado" }, { status: 409 });
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json(
      { error: "financeiro_pendente", detail: "Rode supabase/financeiro.sql neste banco." },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: "failed", detail: e.message }, { status: 500 });
}

// POST → cria fornecedor NO FINANCEIRO. Com `nomes: string[]`, cria vários de
// uma colagem só (é a única forma de 17 fornecedores entrarem numa tarde).
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeGerir(me))) {
    return NextResponse.json(
      { error: "forbidden", detail: "Cadastrar fornecedor agora é no Financeiro." },
      { status: 403 },
    );
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const empresa = await empresaParaCriar(me, b.empresa_id);
  if ("erro" in empresa) {
    return NextResponse.json({ error: empresa.erro, empresas: empresa.empresas }, { status: empresa.status });
  }

  if (Array.isArray(b.nomes)) return criarEmLote(b.nomes, empresa.id, me.id);

  const nome = String(b.nome || "").trim();
  if (!nome) return NextResponse.json({ error: "missing_nome" }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient()
    .from("fin_fornecedores")
    .insert({
      empresa_id: empresa.id,
      nome,
      cnpj: b.cnpj ? String(b.cnpj).trim() : null,
      // O contato do estoque vira o contato do Financeiro: são o mesmo dado com
      // nome diferente. Prazo e forma de pagamento NÃO entram — quem define
      // condição comercial é a tela do Financeiro, não a do galpão.
      contato_nome: b.contato ? String(b.contato).trim() : null,
      contato_fone: b.telefone ? String(b.telefone).trim() : null,
      contato_email: b.email ? String(b.email).trim() : null,
      observacao: b.obs ? String(b.obs).trim() : null,
      created_by: me.id,
    })
    .select("id,nome")
    .single();
  if (error) return falha(error);
  return NextResponse.json({ fornecedor: data });
}

// Cadastro em lote. A triagem (quem é novo, quem já existe, quem se parece com
// quem) acontece NA TELA, com o humano olhando — aqui só entra o que ele
// marcou. Por isso o servidor não recusa nome PARECIDO com um existente: se a
// pessoa mandou "REVAL PAPELARIA" tendo "REVAL" cadastrado, foi decisão dela.
async function criarEmLote(bruto: unknown[], empresaId: string, autorId: string) {
  const nomes: string[] = [];
  const chaves = new Set<string>();
  for (const n of bruto.slice(0, LOTE_MAX)) {
    const nome = limparNomeFornecedor(String(n ?? ""));
    const chave = normalizarFornecedor(nome);
    if (!nome || !chave || chaves.has(chave)) continue;   // vazio ou repetido na própria colagem
    chaves.add(chave);
    nomes.push(nome);
  }
  if (!nomes.length) return NextResponse.json({ error: "lista_vazia" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { fornecedores, pendente } = await fornecedoresDoFinanceiro();
  if (pendente) {
    return NextResponse.json(
      { error: "financeiro_pendente", detail: "Rode supabase/financeiro.sql neste banco." },
      { status: 503 },
    );
  }

  // "Já existe" olha a empresa em que se está cadastrando: o mesmo fornecedor
  // pode existir nas duas empresas, e são linhas diferentes de propósito —
  // condição comercial é combinada por CNPJ da compradora.
  const jaNaEmpresa = new Set(
    fornecedores.filter((f) => f.empresa_id === empresaId).map((f) => normalizarFornecedor(f.nome)),
  );

  const entrar = nomes.filter((n) => !jaNaEmpresa.has(normalizarFornecedor(n)));
  const jaExistiam = nomes.filter((n) => jaNaEmpresa.has(normalizarFornecedor(n)));
  if (!entrar.length) return NextResponse.json({ criados: [], jaExistiam, falhas: [] });

  const linha = (nome: string) => ({ empresa_id: empresaId, nome, created_by: autorId });

  // Uma ida ao banco pros 17. Se QUALQUER linha bater num índice único, o
  // Postgres derruba o INSERT inteiro — aí (e só aí) vai um a um, pra 16
  // entrarem e a 17ª ser a única a voltar como falha.
  const { data, error } = await db.from("fin_fornecedores").insert(entrar.map(linha)).select("id,nome");
  if (!error) return NextResponse.json({ criados: data ?? [], jaExistiam, falhas: [] });

  const criados: { id: string; nome: string }[] = [];
  const falhas: { nome: string; motivo: string }[] = [];
  for (const nome of entrar) {
    const r = await db.from("fin_fornecedores").insert(linha(nome)).select("id,nome").single();
    if (r.error) falhas.push({ nome, motivo: r.error.code === "23505" ? "nome_duplicado" : "failed" });
    else if (r.data) criados.push(r.data as { id: string; nome: string });
  }
  return NextResponse.json({ criados, jaExistiam, falhas });
}

// PATCH → edita o fornecedor no Financeiro.
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeGerir(me))) {
    return NextResponse.json(
      { error: "forbidden", detail: "Editar fornecedor agora é no Financeiro." },
      { status: 403 },
    );
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const db = createSupabaseAdminClient();

  // A empresa sai da LINHA, nunca do corpo — mesma regra do resto do módulo:
  // aceitar a do cliente deixaria editar o fornecedor de uma empresa que a
  // pessoa não pode abrir.
  const { data: atual, error: erroLeitura } = await db
    .from("fin_fornecedores").select("id,empresa_id").eq("id", id).maybeSingle();
  if (erroLeitura) return falha(erroLeitura);
  const linha = atual as { id: string; empresa_id: string } | null;
  if (!linha) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 });

  const { dados: minhas } = await empresasDoUsuario(me.id);
  if (!minhas.some((e) => e.id === linha.empresa_id)) {
    return NextResponse.json({ error: "empresa_nao_permitida" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (b.nome !== undefined) {
    const nome = String(b.nome).trim();
    if (!nome) return NextResponse.json({ error: "missing_nome" }, { status: 400 });
    patch.nome = nome;
  }
  if (b.cnpj !== undefined) patch.cnpj = b.cnpj ? String(b.cnpj).trim() : null;
  if (b.contato !== undefined) patch.contato_nome = b.contato ? String(b.contato).trim() : null;
  if (b.telefone !== undefined) patch.contato_fone = b.telefone ? String(b.telefone).trim() : null;
  if (b.email !== undefined) patch.contato_email = b.email ? String(b.email).trim() : null;
  if (b.obs !== undefined) patch.observacao = b.obs ? String(b.obs).trim() : null;
  if (b.ativo !== undefined) patch.ativo = !!b.ativo;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  patch.updated_by = me.id;
  const { error } = await db.from("fin_fornecedores").update(patch).eq("id", linha.id);
  if (error) return falha(error);
  return NextResponse.json({ ok: true });
}

// DELETE ?id= → tira o fornecedor de circulação.
export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeGerir(me))) {
    return NextResponse.json(
      { error: "forbidden", detail: "Remover fornecedor agora é no Financeiro." },
      { status: 403 },
    );
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: atual, error: erroLeitura } = await db
    .from("fin_fornecedores").select("id,empresa_id").eq("id", id).maybeSingle();
  if (erroLeitura) return falha(erroLeitura);
  const linha = atual as { id: string; empresa_id: string } | null;
  if (!linha) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 });

  const { dados: minhas } = await empresasDoUsuario(me.id);
  if (!minhas.some((e) => e.id === linha.empresa_id)) {
    return NextResponse.json({ error: "empresa_nao_permitida" }, { status: 403 });
  }

  // Fornecedor em uso não pode sumir: os itens que apontam pra ele perderiam a
  // origem em silêncio. Head-only — só a contagem viaja, nenhuma linha.
  const { count, error: contagemErro } = await db.from("estoque_itens")
    .select("id", { count: "exact", head: true }).eq("fornecedor_id", id);
  if (contagemErro) return NextResponse.json({ error: "failed", detail: contagemErro.message }, { status: 500 });
  if ((count ?? 0) > 0) return NextResponse.json({ error: "fornecedor_em_uso", itens: count }, { status: 409 });

  // Apaga MACIO, como o resto do Financeiro: o fornecedor ainda é o nome que
  // explica a compra do ano passado. Sumir de vez apagaria essa explicação —
  // e a rota de compras do módulo já conta com `deleted_at`.
  const { error } = await db
    .from("fin_fornecedores")
    .update({ deleted_at: new Date().toISOString(), ativo: false, updated_by: me.id })
    .eq("id", linha.id);
  if (error) return falha(error);
  return NextResponse.json({ ok: true });
}
