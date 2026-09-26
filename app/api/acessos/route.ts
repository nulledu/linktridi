import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import {
  listarCredenciais, criarCredencial, atualizarCredencial, apagarCredencial,
  registrar, cofreConfigurado, CATEGORIAS,
  TabelaAusenteError, ChaveAusenteError,
} from "@/lib/acessos-cofre";

export const dynamic = "force-dynamic";

// ── Cofre de senhas (Acessos & Infra › Cofre) ────────────────────────────────
// Gate na MESMA chave que a aba usa na tela (`infraestrutura:cofre`). Gatear a
// página por uma chave e a API por outra é o defeito que já derrubou o ERP pra
// quem tinha cargo: a tela abre e toda requisição volta 403. O cofre saiu de
// Pessoas para Infra em 15/09/2026 — a chave veio junto (era `colaboradores:cofre`).
const CHAVE = "infraestrutura:cofre";

function erro(e: unknown) {
  if (e instanceof TabelaAusenteError)
    return NextResponse.json({ error: "tabela_ausente", detalhe: "Rode supabase/acessos_cofre.sql no Supabase." }, { status: 200 });
  if (e instanceof ChaveAusenteError)
    return NextResponse.json({ error: "chave_ausente", detalhe: "Falta a variável de ambiente ACESSOS_CRYPTO_KEY (32 bytes)." }, { status: 200 });
  return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
}

const categoria = (v: unknown) =>
  typeof v === "string" && (CATEGORIAS as readonly string[]).includes(v) ? v : "Outros";

export async function GET() {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    // `configurado: false` faz a tela avisar ANTES de alguém digitar uma senha
    // e levar erro no submit. A listagem em si não precisa da chave: nada nela
    // é cifrado.
    return NextResponse.json({ credenciais: await listarCredenciais(), configurado: cofreConfigurado() });
  } catch (e) { return erro(e); }
}

export async function POST(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    colaboradorId?: string; tipo?: string; servico?: string; categoria?: string;
    url?: string; login?: string; senha?: string; notas?: string; colaboradorNome?: string;
  };
  if (!b.colaboradorId) return NextResponse.json({ error: "colaborador_obrigatorio" }, { status: 400 });
  if (!b.servico?.trim()) return NextResponse.json({ error: "servico_obrigatorio" }, { status: 400 });
  if (!b.senha) return NextResponse.json({ error: "senha_obrigatoria" }, { status: 400 });
  try {
    const c = await criarCredencial({
      colaboradorId: b.colaboradorId, tipo: b.tipo, servico: b.servico, categoria: categoria(b.categoria),
      url: b.url, login: b.login, senha: b.senha, notas: b.notas, criadoPor: me.id,
    });
    await registrar({ credencialId: c.id, atorId: me.id, atorNome: me.name, acao: "criar", servico: c.servico, colaboradorNome: b.colaboradorNome });
    return NextResponse.json({ credencial: c });
  } catch (e) { return erro(e); }
}

export async function PATCH(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    id?: string; tipo?: string; servico?: string; categoria?: string;
    url?: string; login?: string; senha?: string; notas?: string; colaboradorNome?: string;
  };
  if (!b.id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  try {
    const c = await atualizarCredencial(b.id, {
      tipo: b.tipo, servico: b.servico, categoria: b.categoria === undefined ? undefined : categoria(b.categoria),
      url: b.url, login: b.login, senha: b.senha, notas: b.notas,
    });
    await registrar({ credencialId: c.id, atorId: me.id, atorNome: me.name, acao: "editar", servico: c.servico, colaboradorNome: b.colaboradorNome });
    return NextResponse.json({ credencial: c });
  } catch (e) { return erro(e); }
}

export async function DELETE(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  try {
    // Registra ANTES de apagar: o log guarda o nome do serviço numa coluna
    // própria, mas a linha some da tabela e com ela o contexto se o insert
    // acontecesse depois e falhasse.
    await registrar({
      credencialId: id, atorId: me.id, atorNome: me.name, acao: "apagar",
      servico: url.searchParams.get("servico"), colaboradorNome: url.searchParams.get("colaborador"),
    });
    await apagarCredencial(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
