import { NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { verificarReabastecimento } from "@/lib/requisicoes";

export const dynamic = "force-dynamic";

const PODE = ["admin", "estoquista", "gerente_producao"];

// POST → verifica o catálogo e cria atividades de reposição p/ itens abaixo do mínimo.
//
// `estoque:ajustar`: repor é a resposta a "está faltando quantidade", e o botão
// cria trabalho pro galpão. Não é consulta — ficava em `estoque:itens`.
export async function POST() {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "estoque:ajustar"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await verificarReabastecimento());
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e).slice(0, 120) }, { status: 500 });
  }
}
