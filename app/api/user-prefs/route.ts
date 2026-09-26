import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { PREFS_DO_SHELL, esquecerPrefsDoShell, getUserPrefs, setUserPref } from "@/lib/user-prefs";
import { PREF_APARENCIA, lerAparenciaDaConta } from "@/lib/tema";
import { PREF_RAIL } from "@/lib/prefs-da-conta";

export const dynamic = "force-dynamic";

// Preferências de UI do usuário logado (layout do cockpit, colunas de campanhas…).
// Cada pessoa lê/grava só as SUAS prefs — o id vem da sessão, nunca do cliente.
const KEY_OK = /^[a-z0-9._-]{1,60}$/i;

export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prefs = await getUserPrefs(me.id);
  return NextResponse.json({ prefs }, { headers: { "Cache-Control": "no-store" } });
}

// PUT body: { key: string, value: any } — grava uma preferência.
// Resposta: { ok, em } — `em` é o updated_at gravado (ms), a versão que o
// aparelho guarda pra saber quem é mais novo (ver lib/tema.ts).
export async function PUT(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { key?: unknown; value?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const key = typeof body.key === "string" ? body.key : "";
  if (!KEY_OK.test(key)) return NextResponse.json({ error: "bad_key" }, { status: 400 });
  if (body.value === undefined) return NextResponse.json({ error: "no_value" }, { status: 400 });
  let value = body.value;
  // A aparência vira script inline no HTML da plataforma (o layout lê e
  // injeta antes do paint): só entra no banco tema do enum e cor em hexadecimal.
  if (key === PREF_APARENCIA) {
    const a = lerAparenciaDaConta(value, null);
    if (!a) return NextResponse.json({ error: "bad_value" }, { status: 400 });
    const limpo: Record<string, string> = {};
    if (a.tema) limpo.tema = a.tema;
    if (a.accent) limpo.accent = a.accent;
    value = limpo;
  }
  if (key === PREF_RAIL && typeof value !== "boolean") {
    return NextResponse.json({ error: "bad_value" }, { status: 400 });
  }
  // Cap de tamanho (evita abuso): valor serializado até 20KB.
  let json: string;
  try { json = JSON.stringify(value); } catch { return NextResponse.json({ error: "bad_value" }, { status: 400 }); }
  // A personalização inteira da Tridify vai numa chave só (painel, colunas,
  // funil, visões…) — ela ganha teto maior.
  const teto = key === "tridify.ajustes" ? 200_000 : 20_000;
  if (json.length > teto) return NextResponse.json({ error: "too_large" }, { status: 413 });
  try {
    const em = await setUserPref(me.id, key, value);
    if (PREFS_DO_SHELL.includes(key)) esquecerPrefsDoShell(me.id);
    return NextResponse.json({ ok: true, em });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
