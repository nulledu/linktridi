import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { limitarValidade } from "@/lib/auth-cookie";

// Cliente server-side ligado à sessão do usuário (respeita RLS). Usado em
// Server Components / rotas autenticadas.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  // Em produção (Vercel) o proto é https → cookie Secure. Em http (ex.: tablet
  // via localhost/adb reverse) NÃO marca Secure, senão o WebView descarta o
  // cookie de sessão e o login "não entra".
  let secure = true;
  try {
    const proto = (await headers()).get("x-forwarded-proto");
    secure = proto ? proto.split(",")[0].trim() === "https" : false;
  } catch { /* sem request (build) — mantém secure */ }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...limitarValidade(options), secure })
            );
          } catch {
            // chamado de Server Component sem resposta mutável — ignorar.
          }
        },
      },
    }
  );
}

// Cliente com service role (ignora RLS). NUNCA expor ao browser.
// Usado em rotas de API server-side para leitura/seed administrativos.
export function createSupabaseAdminClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
