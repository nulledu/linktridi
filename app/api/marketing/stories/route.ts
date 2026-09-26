import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { ehDia, ehMes } from "@/lib/marketing-stories/calendario";
import { limparStory } from "@/lib/marketing-stories/entrada";
import { buscar, criar, listarMes, type OrdemBusca } from "@/lib/marketing-stories/servidor";
import { ehTipoStory } from "@/lib/marketing-stories/tipos";
import { respostaDeErro } from "./erro";

export const dynamic = "force-dynamic";

const ORDENS = new Set<OrdemBusca>(["recentes", "vendas", "cliques", "conversao"]);

// GET /api/marketing/stories?mes=AAAA-MM   → o quadro do mês
// GET /api/marketing/stories?busca=1&q=…   → o histórico (busca + filtros)
//
// Sem poll: o quadro muda quando alguém grava, e quem grava é quem está nele
// (ver CLAUDE.md · dados). A página é gateada pela ÁREA `marketing`, e esta
// rota pela mesma chave — ver [[rbac-page-api-gate-parity]].
export async function GET(req: NextRequest) {
  await requireModuleKeys("marketing");
  const q = req.nextUrl.searchParams;
  try {
    if (q.get("busca") === "1") {
      const tipo = q.get("tipo");
      const ordem = q.get("ordem") as OrdemBusca | null;
      const r = await buscar({
        q: q.get("q") || undefined,
        de: ehDia(q.get("de")) ? (q.get("de") as string) : undefined,
        ate: ehDia(q.get("ate")) ? (q.get("ate") as string) : undefined,
        produtoId: q.get("produto") || undefined,
        tipo: ehTipoStory(tipo) ? tipo : undefined,
        campanha: q.get("campanha") || undefined,
        ordem: ordem && ORDENS.has(ordem) ? ordem : "recentes",
        offset: Number(q.get("offset")) || 0,
        limite: Number(q.get("limite")) || 60,
      });
      return NextResponse.json({ ok: true, ...r });
    }
    const mes = q.get("mes");
    if (!ehMes(mes)) return NextResponse.json({ ok: false, error: "mes_invalido" }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await listarMes(mes)) });
  } catch (e) {
    return respostaDeErro(e);
  }
}

// POST /api/marketing/stories — registra um story (a mídia já subiu pro B2).
export async function POST(req: NextRequest) {
  const { profile, keys } = await requireModuleKeys("marketing");
  if (!keys.includes("marketing:criar")) {
    return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  }
  const r = limparStory(await req.json().catch(() => null));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 422 });
  const { publicadoEm } = r.dados;
  if (!publicadoEm) return NextResponse.json({ ok: false, error: "data_obrigatoria" }, { status: 422 });
  try {
    const story = await criar({ ...r.dados, publicadoEm }, { id: profile.id, nome: profile.name });
    return NextResponse.json({ ok: true, story });
  } catch (e) {
    return respostaDeErro(e);
  }
}
