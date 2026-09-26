import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createTridiMarketAdminClient } from "../../../../../lib/tridimarket/client";
import { isMissingMarketSchema } from "../../../../../lib/tridimarket/repository";
import { deviceActivationInput, tokenDigest } from "../_device";
import { auditDevice } from "../../_shared";

export async function POST(req: NextRequest) {
  const parsed = deviceActivationInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_activation" }, { status: 422 });
  const token = randomBytes(32).toString("base64url");
  try {
    const db = createTridiMarketAdminClient();
    const { data, error } = await db.rpc("ativar_dispositivo", {
      p_codigo: parsed.data.code,
      p_token_hash: tokenDigest(token),
      p_versao_app: parsed.data.appVersion,
      p_instalacao_id: parsed.data.installationId,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.dispositivo_id) return NextResponse.json({ ok: false, error: row?.erro || "activation_denied" }, { status: 409 });
    // Ativação de tablet é evento de segurança: é o momento em que um aparelho
    // novo passa a poder vender. Nunca registra o token — só o que identifica o
    // aparelho e a instalação.
    await auditDevice(String(row.dispositivo_id), "device.activate", "device", row.dispositivo_id, {
      profileId: row.unidade_id, deviceName: row.nome,
      appVersion: parsed.data.appVersion, installationId: parsed.data.installationId,
    });
    return NextResponse.json({ ok: true, data: { deviceId: row.dispositivo_id, profileId: row.unidade_id, deviceName: row.nome, token, rulesVersion: 1 } });
  } catch (error) {
    // A RPC market_activate_device faz parte do SQL ainda não aplicado — sem ela,
    // qualquer código gerado no painel falha aqui com um erro cru do Postgres
    // ("Could not find the function..."). Agora isso vira "market_schema_missing",
    // igual ao resto do painel, em vez de "activation_failed" (que soa como
    // "código errado" quando na verdade não existe schema nenhum ainda).
    if (isMissingMarketSchema(error as { message?: string })) {
      return NextResponse.json({ ok: false, error: "market_schema_missing", action: "run_supabase_tridimarket_migration" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: (error as Error).message || "activation_failed" }, { status: 503 });
  }
}
