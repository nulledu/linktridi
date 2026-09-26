import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { anotarHistorico, lerEtapas, mudarStatus } from "@/lib/rh/curriculos/dados";
import { destinoValido, seloDaEtapa } from "@/lib/rh/curriculos/etapas";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH { status, entrevista_em? } — inclusive "arquivado" (arquivar É um
 * status). Agendar entrevista é `status: "entrevista"` com a data/hora (ISO);
 * `entrevista_em: null` desmarca.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const eu = await apiRh("curriculos_status");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "Candidato inválido." }, { status: 400 });

  const corpo = (await req.json().catch(() => null)) as { status?: unknown; entrevista_em?: unknown } | null;
  const { dados: etapas } = await lerEtapas();
  if (!corpo || !destinoValido(etapas, corpo.status)) return NextResponse.json({ erro: "Etapa inválida." }, { status: 400 });

  let extra: { entrevista_em?: string | null } = {};
  if ("entrevista_em" in corpo) {
    const v = corpo.entrevista_em;
    if (v === null) extra = { entrevista_em: null };
    else if (typeof v === "string" && !Number.isNaN(Date.parse(v))) extra = { entrevista_em: new Date(v).toISOString() };
    else return NextResponse.json({ erro: "Data da entrevista inválida." }, { status: 400 });
  }

  const r = await mudarStatus(id, corpo.status, { id: eu.profile.id, nome: eu.profile.name }, extra);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.erro.includes("encontrado") ? 404 : 500 });
  if (r.antes !== corpo.status) {
    await anotarHistorico({
      candidato_id: id, tipo: "status", autor_id: eu.profile.id, autor_nome: eu.profile.name,
      titulo: `Movido para "${seloDaEtapa(etapas, corpo.status).label}".`,
      detalhe: `Antes: ${seloDaEtapa(etapas, r.antes).label}.`,
      dados: { de: r.antes, para: corpo.status },
    });
  }
  if (extra.entrevista_em) {
    const quando = new Date(extra.entrevista_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
    await anotarHistorico({
      candidato_id: id, tipo: "entrevista", autor_id: eu.profile.id, autor_nome: eu.profile.name,
      titulo: `Entrevista marcada para ${quando}.`, dados: { entrevista_em: extra.entrevista_em },
    });
  }
  return NextResponse.json({ ok: true, antes: r.antes });
}
