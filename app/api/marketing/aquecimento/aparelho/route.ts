import { NextRequest, NextResponse } from "next/server";
import { gateContingencia } from "../../contingencia/_gate";
import { listAparelhos, salvarAparelho, type PatchAparelho } from "@/lib/marketing-aquecimento";

export const dynamic = "force-dynamic";

// PATCH — a ficha do aparelho (foto, modelo, lugar, observação) e o rename.
//
// Rota própria e não um campo do ativo porque a ficha é do CELULAR, não do chip:
// gravá-la pelo ativo faria a foto pertencer a um número, e trocar o chip do
// aparelho levaria a foto junto.
export async function PATCH(req: NextRequest) {
  // Mesmo gate da página (ver [[rbac-page-api-gate-parity]]): sem a sub-chave,
  // quem só LÊ marketing não escreve ficha nenhuma.
  const g = await gateContingencia();
  if (!g.ok) return g.res;

  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });

  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ ok: false, error: "nome_obrigatorio" }, { status: 422 });

  const renomear = b.renomear === undefined ? undefined : String(b.renomear).trim().slice(0, 80);
  if (renomear !== undefined && !renomear) {
    return NextResponse.json({ ok: false, error: "nome_obrigatorio" }, { status: 422 });
  }

  const patch: PatchAparelho = {};
  if (b.modelo !== undefined) patch.modelo = b.modelo ? String(b.modelo).slice(0, 80) : null;
  if (b.lugar !== undefined) patch.lugar = b.lugar ? String(b.lugar).slice(0, 80) : null;
  if (b.obs !== undefined) patch.obs = b.obs ? String(b.obs).slice(0, 600) : null;
  if (b.fotoUrl !== undefined) {
    const u = b.fotoUrl ? String(b.fotoUrl) : "";
    // Só aceita o que o próprio /api/upload devolveu. Sem isto, a ficha vira um
    // `<img src>` que qualquer pessoa com a permissão aponta pra fora — um
    // rastreador de terceiros carregado em toda abertura do inventário.
    if (u && !/^https?:\/\//i.test(u)) {
      return NextResponse.json({ ok: false, error: "foto_invalida" }, { status: 422 });
    }
    patch.fotoUrl = u ? u.slice(0, 500) : null;
  }

  try {
    const ficha = await salvarAparelho(nome, patch, renomear);
    if (!ficha) return NextResponse.json({ ok: false, error: "sql_pendente" }, { status: 503 });
    return NextResponse.json({ ok: true, aparelho: ficha, aparelhos: await listAparelhos() });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "aparelho_error" }, { status: 500 });
  }
}
