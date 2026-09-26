// ── Gate das APIs da TI ──────────────────────────────────────────────────────
// Paridade página/API: a página abre por `requireModule("ti")` e cada rota
// exige a MESMA sub-chave da ação (ti:ver, ti:criar, ti:editar, ti:excluir).
// Devolve JSON 401/403 — API nunca redireciona pro login (sessão expirada
// viraria "200 + HTML do login" e o cliente leria como sucesso).
import { NextResponse } from "next/server";
import { getProfile, type Profile } from "@/lib/require-auth";

export type SubTi = "ver" | "criar" | "editar" | "excluir";

export async function gateTi(sub: SubTi): Promise<{ me: Profile; keys: string[] } | NextResponse> {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { resolveMyModuleKeys } = await import("@/lib/perfis");
  const keys = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
  if (!keys.includes(`ti:${sub}`)) return NextResponse.json({ error: "forbidden", chave: `ti:${sub}` }, { status: 403 });
  return { me, keys };
}

export const ehResposta = (g: unknown): g is NextResponse => g instanceof NextResponse;
