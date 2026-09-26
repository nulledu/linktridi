import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// ── Auth da TV box — mesmo desenho dos outros aparelhos do galpão ────────────
// (estoque/tridimarket): a caixa carrega um Bearer token opaco, o servidor só
// guarda o HASH. Sem sessão de usuário.

export interface TvDevice { id: string; nome: string }

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(req: NextRequest): string | null {
  const value = req.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() || null : null;
}

/**
 * Três desfechos, e a diferença IMPORTA para a frota inteira:
 * • um device  → autorizado.
 * • "sem_token"/"invalido" → o token não vale (401): a TV deve re-registrar.
 * • "erro"     → o BANCO falhou (503): a TV NÃO pode concluir que seu token é
 *   ruim. Se um soluço do Supabase virasse 401, toda a frota jogaria fora
 *   tokens bons e re-registraria ao mesmo tempo — uma tempestade que derruba o
 *   que estava de pé. 503 diz "tenta de novo depois", e o token continua valendo.
 */
export type ResultadoAuth = { device: TvDevice } | { erro: "invalido" | "transitorio" };

export async function autorizarTv(req: NextRequest): Promise<ResultadoAuth> {
  const token = bearerToken(req);
  if (!token) return { erro: "invalido" };
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("tv_dispositivos")
    .select("id,nome,ativo")
    .eq("token_hash", tokenDigest(token))
    .eq("ativo", true)
    .maybeSingle();
  // error = o banco não respondeu direito (transitório). data ausente sem erro
  // = o token realmente não casa com nenhuma TV ativa (inválido de verdade).
  if (error) return { erro: "transitorio" };
  if (!data) return { erro: "invalido" };
  return { device: { id: String(data.id), nome: String(data.nome) } };
}

export function respostaAuth(r: ResultadoAuth): NextResponse | null {
  if ("device" in r) return null;
  return r.erro === "transitorio"
    ? NextResponse.json({ error: "indisponivel" }, { status: 503 })
    : NextResponse.json({ error: "invalid_device" }, { status: 401 });
}

/** @deprecated use respostaAuth — mantido só se algo antigo referenciar. */
export function falhaAuthTv() {
  return NextResponse.json({ error: "invalid_device" }, { status: 401 });
}
