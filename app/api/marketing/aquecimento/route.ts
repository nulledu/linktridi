import { NextRequest, NextResponse } from "next/server";
import { gateContingencia } from "../contingencia/_gate";
import { listAparelhos, listAtivos, listRoteiros, criarAtivo, type NovoAtivo, type TipoAtivo } from "@/lib/marketing-aquecimento";

export const dynamic = "force-dynamic";

const TIPOS = new Set<TipoAtivo>(["bm", "conta", "numero"]);
const DIA = /^\d{4}-\d{2}-\d{2}$/;

// A tela é 100% derivada de ativos + marcos + roteiros + fichas de aparelho.
// Devolver os quatro de uma vez evita quatro idas ao servidor pra montar uma
// tela só — e nenhum deles muda sozinho, então não há poll nenhum aqui (ver
// CLAUDE.md · dados).
export async function GET(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const t = req.nextUrl.searchParams.get("tipo");
  const tipo = TIPOS.has(t as TipoAtivo) ? (t as TipoAtivo) : undefined;
  try {
    const [{ ativos, marcos }, roteiros, aparelhos] = await Promise.all([
      listAtivos(tipo), listRoteiros(), listAparelhos(),
    ]);
    return NextResponse.json({ ok: true, ativos, marcos, roteiros, aparelhos },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "aquecimento_error" }, { status: 500 });
  }
}

// POST — cadastra um ativo (BM, conta ou número).
export async function POST(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const profile = g.profile;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });

  const tipo = String(b.tipo ?? "");
  if (!TIPOS.has(tipo as TipoAtivo)) return NextResponse.json({ ok: false, error: "tipo_invalido" }, { status: 422 });
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ ok: false, error: "nome_obrigatorio" }, { status: 422 });
  const iniciadoEm = DIA.test(String(b.iniciadoEm ?? "")) ? String(b.iniciadoEm) : undefined;

  const novo: NovoAtivo = {
    tipo: tipo as TipoAtivo, nome: nome.slice(0, 120), iniciadoEm,
    identificador: b.identificador ? String(b.identificador).slice(0, 120) : null,
    // `pai_id` só existe para CONTA (pendurada na BM). Aceitá-lo em número ou em
    // BM criaria um vínculo que nenhuma tela sabe ler: o ativo sumiria da visão
    // WhatsApp (que agrupa por aparelho) sem aparecer em lugar nenhum.
    paiId: tipo === "conta" && b.paiId ? String(b.paiId) : null,
    // Idem para os campos de chip: uma BM com "operadora" preenchida é lixo que
    // volta como coluna vazia na tela e como dúvida em quem lê o banco depois.
    aparelho: tipo === "numero" && b.aparelho ? String(b.aparelho).slice(0, 80) : null,
    operadora: tipo === "numero" && b.operadora ? String(b.operadora).slice(0, 40) : null,
    roteiroId: b.roteiroId ? String(b.roteiroId) : null,
    responsavelId: b.responsavelId ? String(b.responsavelId) : null,
    responsavelNome: b.responsavelNome ? String(b.responsavelNome).slice(0, 80) : null,
    obs: b.obs ? String(b.obs).slice(0, 600) : null,
  };
  try {
    const ativo = await criarAtivo({ id: profile.id, nome: profile.name }, novo);
    if (!ativo) return NextResponse.json({ ok: false, error: "sql_pendente" }, { status: 503 });
    return NextResponse.json({ ok: true, ativo });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "criar_error" }, { status: 500 });
  }
}
