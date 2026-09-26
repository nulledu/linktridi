import { NextRequest, NextResponse } from "next/server";
import { createTridiMarketAdminClient } from "../../../../../lib/tridimarket/client";
import { authorizeDevice, deviceAuthFailure, deviceHeartbeatInput } from "../_device";

export async function POST(req: NextRequest) {
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure(auth.reason);
  const device = auth.device;
  const parsed = deviceHeartbeatInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_heartbeat" }, { status: 422 });
  const db = createTridiMarketAdminClient();
  const patch = { versao_app: parsed.data.appVersion, bateria: Number(parsed.data.health?.bateria) || null, visto_em: new Date().toISOString() };
  // A contagem de pendências é a ÚNICA janela que o painel tem pra fila do
  // aparelho: ela vive no SQLite do tablet, então nada no servidor consegue
  // deduzi-la. Era descartada aqui, e por isso o painel mostrava "0 na fila"
  // com venda encalhada no tablet.
  const { error } = await db.from("dispositivos")
    .update({ ...patch, pendencias: parsed.data.pendingOperations }).eq("id", device.id);
  if (error) {
    // Banco sem a coluna (supabase/tridimarket-pendencias-tablet.sql não
    // rodado): grava o resto. Heartbeat não pode falhar por causa dela — é ele
    // que diz que o aparelho está vivo.
    if (!/pendencias/i.test(error.message ?? "")) return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    const { error: e2 } = await db.from("dispositivos").update(patch).eq("id", device.id);
    if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 503 });
  }
  return NextResponse.json({ ok: true, data: { serverTime: new Date().toISOString() } });
}
