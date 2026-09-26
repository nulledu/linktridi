import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { cachedByToken, sessionKey } from "@/lib/auth-cache";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/rbac";
import { cached } from "@/lib/cache";
import { ehSuperusuario } from "@/lib/superusuario";
import { previewBypassAtivo } from "@/lib/preview-bypass";

export interface Profile {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  password_set: boolean;
}

// Retorna a identidade autenticada ({ id }) ou null. Usado nas rotas de escrita.
// `getClaims()` verifica o JWT LOCALMENTE: o projeto assina com chave ES256 e o
// auth-js confere a assinatura contra o JWKS público (baixado uma vez por
// processo). O `getUser()` antigo era uma chamada HTTP ao /auth/v1/user em todo
// cache-miss — e isto roda em toda página e toda rota de API. Token HS256
// legado cai sozinho no getUser() por dentro, então nada fica menos seguro.
// Memoizado pelo cookie de sessão (lib/auth-cache): token igual → mesma
// resposta, sem repetir a verificação.
export async function getAuthedUser(): Promise<{ id: string } | null> {
  const cookieStore = await cookies();
  try {
    return await cachedByToken(sessionKey(cookieStore.getAll()), async () => {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.getClaims();
      // O getClaims não lança: devolve `{ data: null, error }` também quando a
      // falha é de REDE — o refresh do token (~1x/hora) ou o JWKS vencido (a
      // cada 10 min) pegando o Auth lento. Isso não é "deslogado": lançar tira
      // a resposta do cache. Token inválido/forjado segue virando null
      // memorizado — é a defesa contra cookie adulterado batendo em loop.
      if (error && falhaPassageiraDoAuth(error)) throw error;
      const sub = data?.claims?.sub;
      return sub ? { id: sub } : null;
    });
  } catch (e) {
    // Esta requisição sai como antes (sem sessão); a próxima pergunta de novo.
    if (falhaPassageiraDoAuth(e)) return null;
    throw e;
  }
}

// Rede fora ou Auth respondendo 5xx: não diz nada sobre o token.
function falhaPassageiraDoAuth(e: unknown): boolean {
  return isAuthRetryableFetchError(e) || (isAuthError(e) && typeof e.status === "number" && e.status >= 500);
}

// Perfil (papel) de um usuário. Usa service_role para ler `profiles` sem
// depender de RLS. `cache()` do React dedupa DENTRO da requisição (layout +
// página numa query só); `cached` (30s, igual ao meuNivel) atravessa
// requisições — sem ele cada fetch da tela refazia esta query.
const perfilDe = cache(async (id: string): Promise<Profile | null> => {
  const data = await cached(`profile:${id}`, 30_000, async () => {
    const db = createSupabaseAdminClient();
    const { data, error } = await db
      .from("profiles")
      .select("id,username,name,role,active,password_set")
      .eq("id", id)
      .maybeSingle();
    // Falha de leitura LANÇA. Devolvida como `data: null`, virava "sem perfil"
    // por 30s: um timeout mandava a instância inteira pro /login e toda API
    // pro 401.
    if (error) throw error;
    return data;
  }).catch(() => null);   // esta requisição sai sem perfil, como antes; a próxima lê de novo
  if (!data || !data.active || !isRole(data.role)) return null;
  return data as Profile;
});

async function perfilDaSessao(anteciparAcesso: boolean): Promise<Profile | null> {
  const user = await getAuthedUser();
  if (!user) {
    // Bypass de DESENVOLVIMENTO: sem sessão, assume um colaborador p/ visualizar
    // o app de atividades no WebView antigo. Gated por previewBypassAtivo() —
    // que é falso em produção, senão seria acesso ao ERP inteiro sem login (A1).
    if (previewBypassAtivo()) return previewProfile();
    return null;
  }
  // Quase toda página segue de `getProfile` direto pro `resolveMyModuleKeys`,
  // que precisa da linha de `employees` — e ela só depende do id, que já está
  // em mãos. Disparar agora faz `profiles` e `employees` viajarem JUNTAS em vez
  // de em fila (eram duas idas de 250–700 ms uma esperando a outra). O `cached`
  // do acessoBruto dedupa: o meuNivel logo adiante pega a mesma promessa.
  // Import dinâmico pela mesma razão dos gates abaixo (evitar ciclo de módulo).
  if (anteciparAcesso) void import("@/lib/perfis").then((m) => m.acessoBruto(user.id)).catch(() => {});
  return perfilDe(user.id);
}

// Carrega o perfil (papel) do usuário logado, ou null — já disparando a
// leitura de `employees` que o gate por área vai pedir logo em seguida.
export const getProfile = cache(() => perfilDaSessao(true));

// Igual ao getProfile, SEM o disparo antecipado de `employees`. Pra rota que só
// quer saber QUEM é e nunca resolve chave de área — os polls. Com ciclo maior
// que os 30s do cache, cada tick pagava uma leitura de `employees` (com o
// `permissoes` jsonb) só pra jogar fora.
export const getProfileSemAcesso = cache(() => perfilDaSessao(false));

// Perfil de visualização: o usuário definido em APP_PREVIEW_USER, ou o 1º
// colaborador ativo.
async function previewProfile(): Promise<Profile | null> {
  const db = createSupabaseAdminClient();
  const wanted = process.env.APP_PREVIEW_USER;
  let q = db.from("profiles").select("id,username,name,role,active,password_set").eq("active", true);
  q = wanted ? q.eq("username", wanted) : q.eq("role", "colaborador");
  const { data } = await q.limit(1).maybeSingle();
  if (!data || !isRole(data.role)) return null;
  return data as Profile;
}

// Guard para Server Components: exige sessão + papel permitido. Sem sessão →
// /login. Papel não permitido → a mesma tela de "sem permissão" do gate por
// módulo, pra não existirem dois comportamentos diferentes para a mesma
// frustração (um explica, o outro devolvia pra home sem dizer nada).
export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect(semPermissao(""));
  return profile;
}

// Gate de API por módulo: retorna o Profile se o usuário tem acesso resolvido ao
// módulo `key`, senão null (a rota responde 403). Mesma lógica do requireModule,
// mas sem redirect — pra usar em rotas de API.
export async function getProfileForModule(key: string): Promise<Profile | null> {
  const profile = await getProfile();
  if (!profile) return null;
  const { resolveMyModuleKeys } = await import("@/lib/perfis");
  const keys = await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username });
  return keys.includes(key) ? profile : null;
}

// Igual ao anterior, mas basta ter UMA das chaves. Serve pro caso comum de uma
// rota que atende duas áreas (ex.: o X1 é do Marketing e do Comercial) e pro
// gate que aceita a sub OU a área inteira.
export async function getProfileForAnyModule(...keys: string[]): Promise<Profile | null> {
  const profile = await getProfile();
  if (!profile) return null;
  const { resolveMyModuleKeys } = await import("@/lib/perfis");
  const minhas = await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username });
  return keys.some((k) => minhas.includes(k)) ? profile : null;
}

// Gate de API SÓ PARA ADMIN — ações sensíveis onde "ter a área" não basta
// (ex.: somar/tirar horas do banco de horas, lançar batida manual). Retorna o
// Profile só se role === "admin" (ou superusuário), senão null → 403.
export async function getAdminProfile(): Promise<Profile | null> {
  const profile = await getProfile();
  if (!profile) return null;
  if (ehSuperusuario(profile.id, profile.username)) return profile;
  return profile.role === "admin" ? profile : null;
}

// Para onde vai quem não tem acesso. Manda a CHAVE tentada junto pra tela
// conseguir dizer QUAL área foi barrada — "você não tem permissão" sem dizer
// permissão pra quê não ajuda ninguém a pedir a liberação certa.
//
// Antes isto era um redirect mudo pra /central: do lado de quem clicou, o link
// simplesmente não fazia nada, e a leitura natural disso é "está quebrado".
function semPermissao(key: string): string {
  return `/sem-permissao?area=${encodeURIComponent(key)}`;
}

// Guard por MÓDULO (Fase 2): exige sessão + acesso resolvido por
// Departamento ↓ Perfil ↓ Permissões. Sem sessão → /login. Sem acesso → /home.
// Retorna o profile + as CHAVES resolvidas (inclui sub-permissões "area:sub"),
// pra página gatear as sub-ações (ex.: `keys.includes("estoque:precos")`).
export async function requireModule(key: string): Promise<Profile> {
  const { resolveMyModuleKeys } = await import("@/lib/perfis");
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const keys = await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username });
  if (!keys.includes(key)) redirect(semPermissao(key));
  return profile;
}

/** Como o `requireModuleKeys`, mas passa quem tem QUALQUER uma das chaves —
 *  o 403 aponta pra primeira. Uso: as páginas do Marketing · Geral que abrem
 *  pela área `marketing` OU pela chave antiga do TridiFlow. */
export async function requireAlgumModulo(...chaves: string[]): Promise<{ profile: Profile; keys: string[] }> {
  const { resolveMyModuleKeys } = await import("@/lib/perfis");
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const keys = await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username });
  if (!chaves.some((k) => keys.includes(k))) redirect(semPermissao(chaves[0]));
  return { profile, keys };
}

// Igual ao requireModule, mas devolve também as chaves resolvidas (pra sub-gates).
export async function requireModuleKeys(key: string): Promise<{ profile: Profile; keys: string[] }> {
  const { resolveMyModuleKeys } = await import("@/lib/perfis");
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const keys = await resolveMyModuleKeys({ id: profile.id, role: profile.role, username: profile.username });
  if (!keys.includes(key)) redirect(semPermissao(key));
  return { profile, keys };
}
