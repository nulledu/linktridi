// ── Tokens do Meta (multi-perfil) ──────────────────────────────────────────
// Vários perfis (logins) do Facebook. Cada entrada é um perfil; o gasto do
// Marketing/X1 agrega as contas de anúncio de TODOS (dedupe por account_id).
//
// Armazenamento: a tabela meta_token tem uma CHECK (meta_token_single) que só
// deixa UMA linha (id=1). Então guardamos a LISTA de tokens como um array JSON
// na coluna `token` dessa única linha. Auto-migra: se a coluna ainda tiver um
// token "cru" (formato antigo), ele vira a 1ª entrada da lista.
//
// Segurança: o token é segredo — nunca sai numa resposta de API. As funções de
// admin (validate/add/remove) devem ser chamadas só por rotas com gate de admin.
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const GRAPH = "https://graph.facebook.com/v21.0";
const ENV_TOKEN = process.env.META_ADS_TOKEN || "";
const APP_ID = process.env.META_APP_ID || "1034297678198927";
const APP_SECRET = process.env.META_APP_SECRET || "";
const ROW_ID = 1;

// App usado pro login OAuth ("Entrar com o Facebook"). App ID atual:
// 1040039604276311 (env META_AUTH_APP_ID sobrescreve). O SECRET vem de
// META_ADS_SECRET (fallback META_AUTH p/ compat) — lido SÓ no backend, nunca no
// front/logs/resposta. Os tokens já conectados por apps antigos continuam válidos
// pelo mapa appId→secret (appSecretMap) — a troca de app é aditiva.
// App ID é PÚBLICO (aparece na URL do OAuth) e é um só: fixo no código.
// Antes era env-com-fallback e um META_AUTH_APP_ID velho no Vercel sobrepunha o
// certo — o diálogo abria com client_id inválido e a Meta dizia "app não
// existe", enquanto em dev (sem a env) funcionava. O SECRET continua só em env.
export const OAUTH_APP_ID = "1040039604276311";
export const OAUTH_APP_SECRET = process.env.META_ADS_SECRET || process.env.META_AUTH || "";

// ── Multi-app ────────────────────────────────────────────────────────────────
// Cada token do Facebook pertence a UM app, e só o app_secret DAQUELE app renova
// aquele token. Como há vários apps, guardamos um mapa appId → app_secret:
//   META_APP_SECRETS = {"1034297678198927":"abc…","987654321":"def…"}
// (JSON). O par único META_APP_ID + META_APP_SECRET também entra no mapa (compat),
// assim como o par do app de OAuth (META_AUTH_APP_ID + META_AUTH).
// Na renovação, descobrimos o app de cada token (debug_token) e usamos o secret certo.
function appSecretMap(): Map<string, string> {
  const m = new Map<string, string>();
  if (APP_ID && APP_SECRET) m.set(APP_ID, APP_SECRET);
  if (OAUTH_APP_ID && OAUTH_APP_SECRET) m.set(OAUTH_APP_ID, OAUTH_APP_SECRET);
  const raw = (process.env.META_APP_SECRETS || "").trim();
  if (raw) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      if (obj && typeof obj === "object") {
        for (const [appId, secret] of Object.entries(obj)) {
          if (typeof secret === "string" && secret) m.set(String(appId), secret);
        }
      }
    } catch { /* formato inválido → ignora, usa só o par único */ }
  }
  return m;
}

export interface TokenEntry { id: number; token: string; expiresAt: string | null; addedAt: string | null; appId: string | null }
export interface AdAccountLite { id: string; name: string }
export interface ProfileValidation {
  ok: boolean; error?: string; userId?: string; name?: string; accounts: AdAccountLite[];
}
// Visão do perfil p/ o admin — SEM o token.
export interface ConnectionInfo {
  id: number; name: string; userId: string | null;
  expiresAt: string | null; addedAt: string | null;
  accountCount: number; accounts: AdAccountLite[]; ok: boolean; error?: string;
  appId: string | null;      // app do Facebook a que o token pertence
  canRenew: boolean;         // temos o app_secret desse app cadastrado?
}

async function gj(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store" });
  return (await res.json()) as Record<string, unknown>;
}

// Descobre a que app um token pertence (o próprio token introspecta a si mesmo).
// Lê o app_id do TEXTO cru — IDs grandes viriam como número e perderiam precisão
// se passassem por JSON.parse (> 2^53). Regex preserva todos os dígitos.
async function appIdDoToken(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const raw = await res.text();
    const m = raw.match(/"app_id"\s*:\s*"?(\d+)"?/);
    return m ? m[1] : null;
  } catch { return null; }
}

// ── Armazenamento (1 linha, array JSON na coluna token) ──────────────────────
function parseEntries(raw: string | null, legacyExpiry: string | null): TokenEntry[] {
  if (!raw) return [];
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr
          .filter((e): e is { id?: number; token?: string; expiresAt?: string | null; addedAt?: string | null; appId?: string | null } => !!e && typeof e.token === "string" && !!e.token)
          .map((e, i) => ({ id: typeof e.id === "number" ? e.id : i + 1, token: e.token as string, expiresAt: e.expiresAt ?? null, addedAt: e.addedAt ?? null, appId: e.appId ?? null }));
      }
    } catch { /* corrompido → trata como vazio */ }
    return [];
  }
  // Formato antigo: um token cru → vira a 1ª entrada (auto-migração).
  return [{ id: 1, token: s, expiresAt: legacyExpiry, addedAt: null, appId: null }];
}

export async function listStoredEntries(): Promise<TokenEntry[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("meta_token").select("token, expires_at").eq("id", ROW_ID).maybeSingle();
    return parseEntries((data?.token as string) ?? null, (data?.expires_at as string) ?? null);
  } catch {
    return [];
  }
}

async function writeEntries(entries: TokenEntry[]): Promise<string | null> {
  try {
    const db = createSupabaseAdminClient();
    // expires_at da linha = a expiração mais próxima (só informativo).
    const exps = entries.map((e) => e.expiresAt).filter((x): x is string => !!x).sort();
    const { error } = await db.from("meta_token").upsert({
      id: ROW_ID,
      token: JSON.stringify(entries),
      expires_at: exps[0] ?? null,
      updated_at: new Date().toISOString(),
    });
    clearTokenCache();
    return error ? error.message : null;
  } catch (e) {
    return String(e);
  }
}

// Cache dos tokens (evita bater no Supabase a cada request de gasto). 10 min.
let tokCache: { at: number; toks: string[] } | null = null;
const TOK_TTL_MS = 10 * 60 * 1000;
export function clearTokenCache() { tokCache = null; }

// Dias até a expiração (ou Infinity se não expira / desconhecido).
function diasAteExpirar(iso: string | null): number {
  if (!iso) return Infinity;
  return (new Date(iso).getTime() - Date.now()) / 864e5;
}

// Todos os tokens ativos. A linha é a fonte da verdade; se estiver vazia, cai no
// env META_ADS_TOKEN (bootstrap). Usado pelo lib/meta p/ agregar o gasto.
// "Nunca expira": além do cron semanal, aqui renovamos proativamente qualquer
// token a < 10 dias de expirar — como o painel é usado todo dia, o token é
// estendido bem antes de vencer (rolling refresh) e nunca lapsa.
export async function getAllTokens(): Promise<string[]> {
  if (tokCache && Date.now() - tokCache.at < TOK_TTL_MS) return tokCache.toks;
  let entries = await listStoredEntries();

  // Renova o que está a < 15 dias de vencer (rolling refresh bem antes do prazo).
  // Token já expirado não dá pra estender (usuário reconecta) — não adianta tentar
  // a cada 10 min. Vale p/ TODOS os perfis (cada um com o secret do seu app).
  const perto = appSecretMap().size > 0 && entries.some((e) => { const d = diasAteExpirar(e.expiresAt); return d >= 0 && d < 15; });
  if (perto) {
    await refreshAllTokens();       // regrava com validade +60 dias
    entries = await listStoredEntries();
  }

  const toks = entries.map((e) => e.token).filter((t): t is string => !!t);
  const out = toks.length === 0 && ENV_TOKEN ? [ENV_TOKEN] : toks;
  tokCache = { at: Date.now(), toks: out };
  return out;
}

// ── Validação (Graph) ────────────────────────────────────────────────────────
export async function validateToken(token: string): Promise<ProfileValidation> {
  const t = token.trim();
  if (!t) return { ok: false, error: "Token vazio.", accounts: [] };
  try {
    const me = await gj(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(t)}`);
    if (me.error) return { ok: false, error: (me.error as { message?: string })?.message || "Token inválido.", accounts: [] };
    const acctsResp = await gj(`${GRAPH}/me/adaccounts?fields=account_id,name&limit=200&access_token=${encodeURIComponent(t)}`);
    if (acctsResp.error) {
      return { ok: false, error: (acctsResp.error as { message?: string })?.message || "Sem permissão de anúncios (ads_read).", userId: me.id as string, name: me.name as string, accounts: [] };
    }
    // Segue paging.next: sem isto, quem tem muitas contas via BM não via todas
    // (a conta "sumia" da listagem mesmo com o token certo).
    type ActRow = { account_id: string; name?: string };
    const linhas: ActRow[] = [...((acctsResp.data as ActRow[]) || [])];
    let next = (acctsResp.paging as { next?: string } | undefined)?.next;
    for (let i = 0; next && i < 20; i++) {
      const pag = await gj(next);
      if (pag.error || !Array.isArray(pag.data)) break;
      linhas.push(...(pag.data as ActRow[]));
      next = (pag.paging as { next?: string } | undefined)?.next;
    }
    const accounts: AdAccountLite[] = linhas.map((a) => ({ id: a.account_id, name: a.name?.trim() || `Conta ${a.account_id}` }));
    return { ok: true, userId: me.id as string, name: (me.name as string) || "Perfil", accounts };
  } catch (e) {
    return { ok: false, error: String(e), accounts: [] };
  }
}

// Lê a expiração REAL de um token no Graph (debug_token). Usa o app token
// (appId|secret) quando temos o secret desse app; senão, o próprio token.
// expires_at = 0 → "não expira" (system user) → null.
async function lerExpiracao(token: string, appId?: string | null, secret?: string): Promise<string | null> {
  try {
    const acc = appId && secret ? `${appId}|${secret}` : token;
    const dbg = await gj(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(acc)}`);
    const exp = (dbg.data as { expires_at?: number } | undefined)?.expires_at;
    return exp && exp > 0 ? new Date(exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

// Troca um token curto por um token longo (60 dias) usando o secret do APP a que
// ele pertence, e SEMPRE grava a expiração real. Se não temos o secret daquele app
// não dá pra estender (limitação do Facebook) — mas registramos o app e o prazo.
async function toLongLived(token: string): Promise<{ token: string; expiresAt: string | null; appId: string | null }> {
  const appId = await appIdDoToken(token);
  const secret = appId ? appSecretMap().get(appId) : undefined;
  let long = token;
  if (appId && secret) {
    try {
      const ex = await gj(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${secret}&fb_exchange_token=${encodeURIComponent(token)}`);
      if (ex.access_token) long = ex.access_token as string;
    } catch { /* mantém o original */ }
  }
  return { token: long, expiresAt: await lerExpiracao(long, appId, secret), appId };
}

// ── Escrita (admin) ──────────────────────────────────────────────────────────
export async function addToken(rawToken: string): Promise<{ ok: boolean; error?: string; profile?: ConnectionInfo }> {
  const raw = rawToken.trim();
  if (!raw) return { ok: false, error: "Cole um token." };
  const { token: longTok, expiresAt, appId } = await toLongLived(raw);
  const v = await validateToken(longTok);
  if (!v.ok) return { ok: false, error: v.error || "Token inválido." };

  const entries = await listStoredEntries();
  const now = new Date().toISOString();
  const nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  entries.push({ id: nextId, token: longTok, expiresAt, addedAt: now, appId });
  const err = await writeEntries(entries);
  if (err) return { ok: false, error: err };
  const canRenew = !!(appId && appSecretMap().has(appId));
  return {
    ok: true,
    profile: {
      id: nextId, name: v.name || "Perfil", userId: v.userId || null,
      expiresAt, addedAt: now, accountCount: v.accounts.length, accounts: v.accounts, ok: true,
      appId, canRenew,
    },
  };
}

export async function removeToken(id: number): Promise<{ ok: boolean; error?: string }> {
  const entries = await listStoredEntries();
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return { ok: true }; // já não existia
  const err = await writeEntries(next);
  return err ? { ok: false, error: err } : { ok: true };
}

// ── Listagem p/ o admin (sem token) ─────────────────────────────────────────
export async function describeConnections(): Promise<ConnectionInfo[]> {
  const entries = await listStoredEntries();
  const secrets = appSecretMap();
  return Promise.all(entries.map(async (e): Promise<ConnectionInfo> => {
    const v = await validateToken(e.token);
    const appId = e.appId ?? (v.ok ? await appIdDoToken(e.token) : null);
    const secret = appId ? secrets.get(appId) : undefined;
    // Expiração AO VIVO do Graph — corrige entradas antigas gravadas sem prazo.
    const liveExp = v.ok ? await lerExpiracao(e.token, appId, secret) : null;
    return {
      id: e.id, name: v.name || "Perfil", userId: v.userId || null,
      expiresAt: liveExp ?? e.expiresAt, addedAt: e.addedAt,
      accountCount: v.accounts.length, accounts: v.accounts,
      ok: v.ok, error: v.ok ? undefined : v.error,
      appId, canRenew: !!(appId && secrets.has(appId)),
    };
  }));
}

// ── Renovação (cron) ─────────────────────────────────────────────────────────
// Troca cada token por um novo token longo (rolling refresh) e regrava a lista.
export async function refreshAllTokens(): Promise<{ ok: boolean; renovados: number; total: number; resultados: Array<{ id: number; ok: boolean; error?: string; expiresAt?: string | null }> }> {
  let entries = await listStoredEntries();
  if (entries.length === 0 && ENV_TOKEN) entries = [{ id: 1, token: ENV_TOKEN, expiresAt: null, addedAt: null, appId: null }];
  const secrets = appSecretMap();

  const resultados: Array<{ id: number; ok: boolean; error?: string; expiresAt?: string | null }> = [];
  const novos: TokenEntry[] = [];
  for (const e of entries) {
    // Descobre o app do token e pega o secret DELE (não um secret genérico).
    const appId = e.appId ?? await appIdDoToken(e.token);
    const secret = appId ? secrets.get(appId) : undefined;
    if (!appId || !secret) {
      novos.push({ ...e, appId });
      resultados.push({ id: e.id, ok: false, error: appId ? `sem secret cadastrado p/ o app ${appId}` : "não deu p/ identificar o app do token" });
      continue;
    }
    try {
      const ex = await gj(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${secret}&fb_exchange_token=${e.token}`);
      const tok = ex.access_token as string | undefined;
      if (!tok) { novos.push({ ...e, appId }); resultados.push({ id: e.id, ok: false, error: (ex.error as { message?: string })?.message || "exchange_failed" }); continue; }
      const expiresAt = await lerExpiracao(tok, appId, secret);
      novos.push({ ...e, token: tok, expiresAt, appId });
      resultados.push({ id: e.id, ok: true, expiresAt });
    } catch (err) {
      novos.push({ ...e, appId });
      resultados.push({ id: e.id, ok: false, error: String(err) });
    }
  }
  await writeEntries(novos);
  const renovados = resultados.filter((r) => r.ok).length;
  return { ok: renovados > 0, renovados, total: entries.length, resultados };
}
