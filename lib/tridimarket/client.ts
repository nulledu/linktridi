// Cliente do TridiMarket — banco PRINCIPAL do sistema, schema `mercadinho`
// (supabase/mercadinho-novo.sql).
//
// O Supabase separado do mercadinho (wcxhyludixozqloqzjpn) foi APOSENTADO junto
// com o ERP antigo: o sistema novo começa do zero e vive junto do resto da
// plataforma — uma base só pra administrar e fazer backup, nada herdado.
//
// O schema separado é o que garante o "sem rastro": nenhuma tabela daqui
// referencia `public`, e o app nunca enxerga o que sobrou do antigo.
//
// PRÉ-REQUISITO: `mercadinho` precisa estar em Settings → API → Exposed schemas
// (junto de `public`, que é onde mora o resto do Gaius). Sem isso o PostgREST
// devolve 406 em tudo — a tela mostra o aviso de schema pendente.
export const MARKET_SCHEMA = "mercadinho";

function jwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function createTridiMarketAdminClient() {
  if (typeof window !== "undefined") throw new Error("TridiMarket admin client is server-only");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  if (jwtRole(key) !== "service_role") throw new Error("O TridiMarket precisa da chave service_role");
  const { createClient } = require("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: MARKET_SCHEMA },
  });
}

export const TRIDIMARKET_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
