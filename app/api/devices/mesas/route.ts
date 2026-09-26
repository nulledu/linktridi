import { NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/devices/mesas — SÓ os nomes das mesas de produção ativas, pra
// preencher o seletor "em qual tablet cai" ao criar atividade.
//
// Existe porque /api/devices é (e deve continuar) restrito a admin: ele devolve
// os códigos de pareamento, que são segredo. Só que quem CRIA atividade inclui
// gerente_producao/gerente_vendas — pra eles a lista vinha 401 → vazia → o
// seletor sumia e a dirigida nascia "só no sistema" sem ninguém perceber.
// Mesmo gate da página de atividades; resposta sem id, token ou código.
const ROLES = new Set(["admin", "gerente_producao", "gerente_vendas"]);

export async function GET() {
  const p = await getProfile();
  if (!p || !ROLES.has(p.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = createSupabaseAdminClient();
  const sel = (cols: string) => db.from("devices").select(cols).eq("ativo", true).order("nome_mesa");
  // Resiliente a banco sem a coluna `tipo` (SQL pendente): cai pro select menor.
  let r = await sel("nome_mesa,setor,tipo,ativo");
  if (r.error && /column|schema cache/i.test(r.error.message)) r = await sel("nome_mesa,setor,ativo");
  if (r.error) return NextResponse.json({ devices: [] });

  const devices = ((r.data ?? []) as Array<{ nome_mesa: string | null; setor: string | null; tipo?: string | null; ativo: boolean }>)
    .filter((d) => d.nome_mesa && d.tipo !== "ponto");
  return NextResponse.json({ devices });
}
