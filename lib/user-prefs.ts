// ── Preferências de UI por usuário (Supabase novo, tabela user_prefs).
// Guarda layouts personalizados (cockpit do Tráfego, colunas de campanhas…) pra
// o painel seguir a conta entre dispositivos. Chave-valor por (user_id, key).
// Tolerante à ausência da tabela: se não existir, o cliente segue só no
// localStorage (nada quebra).

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached, invalidate } from "@/lib/cache";
import { PREF_APARENCIA, lerAparenciaDaConta, type AparenciaDaConta } from "@/lib/tema";
import { PREF_RAIL, lerRailDaConta, type Versionado } from "@/lib/prefs-da-conta";

// Todas as preferências do usuário → { [key]: value }.
export async function getUserPrefs(userId: string): Promise<Record<string, unknown>> {
  if (!userId) return {};
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("user_prefs").select("key,value").eq("user_id", userId);
    if (error) return {};
    const out: Record<string, unknown> = {};
    for (const r of data || []) out[r.key as string] = r.value;
    return out;
  } catch {
    return {};
  }
}

// Salva/atualiza uma preferência (upsert por user_id+key). Devolve o
// `updated_at` gravado, em ms: é a versão que o aparelho guarda pra saber se a
// conta tem coisa mais nova que a cópia dele (ver lib/tema.ts).
export async function setUserPref(userId: string, key: string, value: unknown): Promise<number> {
  const db = createSupabaseAdminClient();
  const agora = new Date();
  const { error } = await db
    .from("user_prefs")
    .upsert({ user_id: userId, key, value, updated_at: agora.toISOString() }, { onConflict: "user_id,key" });
  if (error) throw new Error(error.message);
  return agora.getTime();
}

// ── O que o SHELL precisa antes de pintar ────────────────────────────────────
// Tema/cor e barra recolhida, lidos pelo layout da plataforma em TODA página —
// numa consulta só e cacheados: cada ida ao Supabase custa 250–700 ms daqui e
// isto muda raramente. Cache velho em outra instância não desfaz troca nova: a
// versão (`em`) decide quem vence no aparelho (lib/tema.ts, lib/prefs-da-conta.ts).
// Erro SOBE: quem chama distingue "vazio" de "não deu pra ler", e só o vazio
// pode receber a cópia antiga do aparelho.
export const PREFS_DO_SHELL: string[] = [PREF_APARENCIA, PREF_RAIL];

export type PrefsDoShell = { aparencia: AparenciaDaConta | null; rail: Versionado<boolean> | null };

export function getPrefsDoShell(userId: string): Promise<PrefsDoShell> {
  return cached(`prefs-shell:${userId}`, 60_000, async () => {
    const { data, error } = await createSupabaseAdminClient()
      .from("user_prefs")
      .select("key,value,updated_at")
      .eq("user_id", userId)
      .in("key", PREFS_DO_SHELL)
      .limit(PREFS_DO_SHELL.length);
    if (error) throw error;
    const linhas = (data || []) as { key: string; value: unknown; updated_at: string | null }[];
    const linha = (k: string) => linhas.find((r) => r.key === k);
    const ap = linha(PREF_APARENCIA);
    const rail = linha(PREF_RAIL);
    return {
      aparencia: ap ? lerAparenciaDaConta(ap.value, ap.updated_at as string | null) : null,
      rail: rail ? lerRailDaConta(rail.value, rail.updated_at as string | null) : null,
    };
  });
}

export function esquecerPrefsDoShell(userId: string) {
  invalidate(`prefs-shell:${userId}`);
}
