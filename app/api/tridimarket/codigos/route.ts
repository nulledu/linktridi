import { NextResponse } from "next/server";
import { marketApiError, marketDb, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// GET /api/tridimarket/codigos
// Saúde dos códigos de acesso. Como o login virou GLOBAL (qualquer pessoa compra
// em qualquer tablet), um código repetido deixa duas pessoas ambíguas e o totem
// recusa as duas. Aqui o admin vê exatamente quem precisa trocar.
export async function GET() {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const db = marketDb();
    const [{ data: pessoas, error }, { data: perfis, error: perfilError }] = await Promise.all([
      db.from("funcionarios").select("id,nome,codigo_acesso,unidade_id").eq("ativo", true).order("nome"),
      db.from("unidades").select("id,nome"),
    ]);
    if (error) throw error;
    if (perfilError) throw perfilError;

    const nomeDoPerfil = new Map<string, string>((perfis ?? []).map((p: { id: string; nome: string }) => [String(p.id), String(p.nome)]));
    const porCodigo = new Map<string, Array<{ id: number; nome: string; unidade: string }>>();
    let semCodigo = 0;
    for (const p of (pessoas ?? []) as Array<{ id: number; nome: string; codigo_acesso: string | null; unidade_id: string }>) {
      const codigo = String(p.codigo_acesso ?? "").trim();
      if (!codigo) { semCodigo++; continue; }
      const lista = porCodigo.get(codigo) ?? [];
      lista.push({ id: Number(p.id), nome: String(p.nome), unidade: nomeDoPerfil.get(String(p.unidade_id)) ?? "—" });
      porCodigo.set(codigo, lista);
    }
    // Só o conflito interessa; o código em si NÃO é devolvido (é credencial).
    const conflitos = [...porCodigo.entries()]
      .filter(([, pessoas]) => pessoas.length > 1)
      .map(([, pessoas]) => ({ pessoas }))
      .sort((a, b) => b.pessoas.length - a.pessoas.length);

    return NextResponse.json({
      ok: true,
      data: {
        total: (pessoas ?? []).length,
        semCodigo,
        conflitos,
        pessoasEmConflito: conflitos.reduce((s, c) => s + c.pessoas.length, 0),
      },
    });
  } catch (error) { return marketApiError(error); }
}
