import { NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";

// Mesmo gate da página (ver memória rbac-page-api-gate-parity): a Contingência
// é ÁREA PRÓPRIA, então a chave é `contingencia` — ver E escrever, que na
// grade andam juntos. Quem cuida de criativo não enxerga o parque de chips por
// tabela: precisa do quadradinho da Contingência ligado nele.
//
// `getProfileForModule` (e não `requireModuleKeys`) porque isto é API: sem
// acesso a resposta tem de ser 403 em JSON. Um redirect devolveria 200 com o
// HTML do login, e todo `if (r.ok)` da tela leria isso como sucesso.
export async function gateContingencia(): Promise<{ ok: true; profile: { id: string; name: string } } | { ok: false; res: NextResponse }> {
  const profile = await getProfileForModule("contingencia");
  if (!profile) {
    return { ok: false, res: NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 }) };
  }
  return { ok: true, profile: { id: profile.id, name: profile.name } };
}

export const json = (b: unknown, status = 200) =>
  NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

export const erro = (error: unknown, padrao: string) => {
  const e = error as { message?: string };
  return json({ ok: false, error: e?.message || padrao }, 500);
};

export const DIA = /^\d{4}-\d{2}-\d{2}$/;
export const texto = (v: unknown, max: number) => (v == null ? null : String(v).trim().slice(0, max) || null);
