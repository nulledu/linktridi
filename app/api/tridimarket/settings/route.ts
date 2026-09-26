import { NextRequest, NextResponse } from "next/server";
import { audit, marketApiError, marketRepository, requireMarketAdmin, settingsInput } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const repo = marketRepository();
    const [profiles, schemaReady, settings] = await Promise.all([repo.profiles(), repo.schemaReady(), repo.settings()]);
    return NextResponse.json({ ok: true, data: { profiles, schemaReady, settings, offlineHours: 48, pinAttempts: 5, initialProfiles: ["Tridi Produção", "Tridi Escritório"] } });
  } catch (error) { return marketApiError(error); }
}

// Salva os Ajustes globais. Se a tabela market_settings ainda não existe (SQL
// pendente), o upsert falha com mensagem clara em vez de fingir que salvou.
export async function PATCH(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = settingsInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_settings", issues: parsed.error.flatten() }, { status: 422 });
  try {
    const repo = marketRepository();
    const settings = await repo.saveSettings(parsed.data, actor.id);
    await audit(actor.id, "settings.update", "settings", 1, undefined, parsed.data);
    return NextResponse.json({ ok: true, data: settings });
  } catch (error) {
    const e = error as { message?: string };
    if (/market_settings/i.test(e?.message ?? "")) {
      return NextResponse.json({ ok: false, error: "migracao_pendente", action: "rodar supabase/tridimarket-ajustes-score.sql" }, { status: 503 });
    }
    return marketApiError(error);
  }
}
