import { NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { listErpUsers } from "@/lib/funcoes";

export const dynamic = "force-dynamic";

// GET /api/erp-users — funcionários do ERP p/ o seletor de funções. Duas telas
// usam: a aba de Funções (área Colaboradores) e o painel de Ponto (área
// Configurações). Portão = ter uma das duas áreas.
export async function GET() {
  if (!(await getProfileForAnyModule("colaboradores", "administracao"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ users: await listErpUsers() });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
