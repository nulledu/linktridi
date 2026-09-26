import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { rastrear, fonteSupabase, MAX_NIVEIS, type Direcao } from "@/lib/atividades-genealogia";

export const dynamic = "force-dynamic";

/**
 * GET /api/atividades/genealogia?codigo=CHANC-000042&direcao=tras|frente
 *
 * A história de UMA caixa: de onde veio (o material e quem o fez) ou onde foi
 * parar (o que já saiu do galpão feito com ela).
 *
 * O custo vem na resposta, em `consultas`, de propósito — a travessia é por
 * nível e o teto é 1 + 4×3 + 1 = 14. Se um dia esse número começar a crescer
 * com o tamanho do galpão em vez de com a profundidade da corrente, alguém
 * escreveu um laço com `await` dentro e dá pra ver aqui antes da fatura.
 */
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Rastro de peça é informação de PRODUÇÃO, não de pessoa: quem cuida do
  // galpão ou da produção pergunta isso o tempo todo, inclusive o estoquista
  // que está com a caixa reprovada na mão.
  const pode = await papelOuChave(
    me,
    ["admin", "estoquista"],
    "atividades:ver", "estoque", "estoque:bipar",
  );
  if (!pode) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const codigo = (p.get("codigo") || "").trim();
  if (!codigo) return NextResponse.json({ error: "missing_codigo" }, { status: 400 });
  // Código de etiqueta é curto e sem espaço. Texto longo aqui é engano (alguém
  // colou a lista inteira) e não deve virar um `in` de mil valores.
  if (codigo.length > 64) return NextResponse.json({ error: "codigo_invalido" }, { status: 400 });

  const direcao: Direcao = p.get("direcao") === "frente" ? "frente" : "tras";
  const niveis = Math.min(MAX_NIVEIS, Math.max(1, Math.round(Number(p.get("niveis")) || MAX_NIVEIS)));

  try {
    const rastro = await rastrear(fonteSupabase(), { codigo, direcao, maxNiveis: niveis });
    return NextResponse.json(rastro);
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: (e as Error).message }, { status: 500 });
  }
}
