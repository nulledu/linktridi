import { NextRequest } from "next/server";
import { criarCelular, salvarCelular, type SituacaoCelular } from "@/lib/contingencia";
import { gateContingencia, json, erro, texto } from "../_gate";

export const dynamic = "force-dynamic";

const SITUACOES = new Set<SituacaoCelular>(["ok", "manutencao", "aposentado"]);

export async function POST(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ ok: false, error: "json_invalido" }, 400);
  const nome = texto(b.nome, 80);
  if (!nome) return json({ ok: false, error: "nome_obrigatorio" }, 422);
  try {
    const c = await criarCelular({
      nome, modelo: texto(b.modelo, 80), identificacao: texto(b.identificacao, 80), lugar: texto(b.lugar, 80),
      responsavelId: texto(b.responsavelId, 60), responsavelNome: texto(b.responsavelNome, 80),
    });
    if (!c) return json({ ok: false, error: "sql_pendente" }, 503);
    return json({ ok: true, celular: c });
  } catch (e) {
    const msg = (e as { message?: string })?.message || "";
    if (/duplicate key|unique/i.test(msg)) return json({ ok: false, error: "nome_repetido" }, 409);
    return erro(e, "celular_error");
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = texto(b?.id, 60);
  if (!b || !id) return json({ ok: false, error: "json_invalido" }, 400);
  const patch: Parameters<typeof salvarCelular>[1] = {};
  if (b.situacao !== undefined) { if (!SITUACOES.has(b.situacao as SituacaoCelular)) return json({ ok: false, error: "situacao_invalida" }, 422); patch.situacao = b.situacao as SituacaoCelular; }
  if (b.identificacao !== undefined) patch.identificacao = texto(b.identificacao, 80);
  if (b.responsavelId !== undefined) patch.responsavelId = texto(b.responsavelId, 60);
  if (b.responsavelNome !== undefined) patch.responsavelNome = texto(b.responsavelNome, 80);
  if (b.modelo !== undefined) patch.modelo = texto(b.modelo, 80);
  if (b.lugar !== undefined) patch.lugar = texto(b.lugar, 80);
  if (b.obs !== undefined) patch.obs = texto(b.obs, 600);
  try {
    const c = await salvarCelular(id, patch);
    if (!c) return json({ ok: false, error: "sql_pendente" }, 503);
    return json({ ok: true, celular: c });
  } catch (e) { return erro(e, "celular_error"); }
}
