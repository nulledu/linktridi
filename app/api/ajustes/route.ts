import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { homeFor } from "@/lib/rbac";
import {
  gravarPaginaInicial, lerPaginaInicialDaFicha, nomeDoPadrao, opcoesDePaginaInicial, paginaInicialPermitida,
} from "@/lib/ajustes";

export const dynamic = "force-dynamic";

// Ajustes da própria pessoa. Lido quando o modal de Ajustes ABRE — nunca por
// carga de página. O id sai SEMPRE da sessão; nada no corpo escolhe de quem é.

export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [keys, ficha] = await Promise.all([
    resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username }),
    lerPaginaInicialDaFicha(me.id).catch(() => ({ disponivel: false, valor: null as string | null })),
  ]);
  return NextResponse.json({
    // Vai no campo oculto do formulário de senha: é por ele que o gerenciador
    // de senhas sabe qual conta atualizar.
    username: me.username ?? null,
    paginaInicial: ficha.disponivel ? {
      atual: paginaInicialPermitida(ficha.valor, keys) ? ficha.valor : null,
      padrao: nomeDoPadrao(homeFor(me.role)),
      opcoes: opcoesDePaginaInicial(keys),
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

// PUT { paginaInicial: "<chave do módulo>" | null } — null volta pro padrão.
export async function PUT(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { paginaInicial?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const pedido = body.paginaInicial ?? null;
  let escolha: string | null = null;
  if (pedido !== null) {
    const keys = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
    if (!paginaInicialPermitida(pedido, keys)) {
      return NextResponse.json({ error: "area_nao_liberada", detail: "Essa área não está liberada pra você." }, { status: 400 });
    }
    escolha = pedido;
  }
  const r = await gravarPaginaInicial(me.id, escolha);
  if (!r.ok) return NextResponse.json({ error: "falhou", detail: r.detail }, { status: r.status });
  return NextResponse.json({ ok: true, atual: escolha });
}
