import { NextRequest, NextResponse } from "next/server";
import { getProfile, getProfileForModule } from "@/lib/require-auth";
import { assinaturaDoStatus, lerStatus, visaoPublica } from "@/lib/status-servidor";
import { custoDasQuedas } from "@/lib/status-custo";

export const dynamic = "force-dynamic";

// Status da Tridi. PÚBLICA (está em PUBLIC_PREFIXES), mas o que ela devolve
// depende de quem pede:
//   · sem login → só plataforma e estado ("gedux.com.br: no ar"). Nada de nome
//     de funil, motivo ou infraestrutura: o link é aberto a qualquer um;
//   · qualquer pessoa LOGADA → tudo: itens, ocorrências, linha do tempo e
//     disponibilidade de 7/30 dias (decisão do dono, 15/09/2026: "todos devem
//     ter acesso ao status");
//   · o custo estimado das quedas em anúncio é número de gasto: só pra quem
//     tem `administracao:status` (admin, TI, gestor) — os mesmos do aviso.
// A leitura do Supabase é uma a cada 30 s por instância (cached), e o poll de
// quem tem a chave manda `?assinatura=`: nada mudou → `{ mudou: false }`.
export async function GET(req: NextRequest) {
  const s = await lerStatus().catch(() => null);
  if (!s) return NextResponse.json({ erro: "indisponivel" }, { status: 503 });

  const perfil = await getProfile().catch(() => null);
  if (!perfil) return NextResponse.json(visaoPublica(s));

  const assinatura = assinaturaDoStatus(s);
  if (req.nextUrl.searchParams.get("assinatura") === assinatura) {
    return NextResponse.json({ mudou: false, assinatura });
  }
  const veCusto = !!(await getProfileForModule("administracao:status").catch(() => null));
  const custos = veCusto ? await custoDasQuedas(s.incidentes).catch(() => ({} as Record<number, number>)) : {} as Record<number, number>;
  return NextResponse.json({
    publico: false,
    assinatura,
    ...s,
    incidentes: s.incidentes.map((i) => ({ ...i, custo: custos[i.id] ?? null })),
  });
}
