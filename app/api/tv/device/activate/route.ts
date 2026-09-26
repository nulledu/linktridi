import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { tokenDigest } from "../_device";

export const dynamic = "force-dynamic";

// Freio de força-bruta do código curto: por IP, em memória do processo. Mesmo
// espírito do freio do estoque; leve o bastante pra viver aqui.
const TETO = 20, JANELA_MS = 10 * 60_000;
const balde = new Map<string, { n: number; ate: number }>();
function excedido(ip: string): boolean {
  const agora = Date.now();
  const b = balde.get(ip);
  if (!b || b.ate < agora) return false;
  return b.n >= TETO;
}
function consumir(ip: string) {
  const agora = Date.now();
  const b = balde.get(ip);
  if (!b || b.ate < agora) balde.set(ip, { n: 1, ate: agora + JANELA_MS });
  else b.n++;
  // Rota pública: o tamanho do Map é decidido por quem chama. Passou de 1000,
  // poda só o que já venceu — IP ainda freado continua freado.
  if (balde.size > 1000) for (const [k, v] of balde) if (v.ate < agora) balde.delete(k);
}
const ipDe = (req: NextRequest) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";

/**
 * POST /api/tv/device/activate — troca o código de ativação (uso único,
 * digitado na caixa por quem cadastrou o aparelho no console) por um Bearer
 * token permanente. O UPDATE atômico é a trava de corrida: dois aparelhos com
 * o mesmo código nunca conseguem os dois — o segundo não casa mais.
 */
export async function POST(req: NextRequest) {
  const ip = ipDe(req);
  if (excedido(ip)) return NextResponse.json({ error: "muitas_tentativas" }, { status: 429 });

  let b: { codigo?: string; modelo?: string };
  try { b = await req.json(); } catch { consumir(ip); return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const codigo = (b.codigo || "").trim();
  if (!codigo) { consumir(ip); return NextResponse.json({ error: "codigo_invalido" }, { status: 401 }); }

  const token = randomBytes(32).toString("base64url");
  const nowIso = new Date().toISOString();
  const db = createSupabaseAdminClient();

  const claim = (comExpiracao: boolean) => {
    let q = db.from("tv_dispositivos")
      .update({ token_hash: tokenDigest(token), codigo_ativacao: null, ativado_em: nowIso, modelo: b.modelo ?? null, visto_em: nowIso })
      .eq("codigo_ativacao", codigo).eq("ativo", true);
    if (comExpiracao) q = q.or(`codigo_expira_em.is.null,codigo_expira_em.gt.${nowIso}`);
    return q.select("id,nome").maybeSingle();
  };

  const faltaColuna = (e: { code?: string; message?: string } | null) =>
    !!e && (e.code === "42703" || /column .* does not exist|Could not find the .* column/i.test(e.message ?? ""));

  let { data, error } = await claim(true);
  // Base sem `codigo_expira_em` ou sem `ativado_em` (SQL parcial): refaz sem.
  if (error && faltaColuna(error)) {
    const q = db.from("tv_dispositivos")
      .update({ token_hash: tokenDigest(token), codigo_ativacao: null, visto_em: nowIso })
      .eq("codigo_ativacao", codigo).eq("ativo", true).select("id,nome").maybeSingle();
    ({ data, error } = await q);
  }
  if (error) return NextResponse.json({ error: "falha", detail: error.message }, { status: 500 });
  if (!data) { consumir(ip); return NextResponse.json({ error: "codigo_invalido" }, { status: 401 }); }

  return NextResponse.json({ token, dispositivo: { id: data.id, nome: data.nome } });
}
