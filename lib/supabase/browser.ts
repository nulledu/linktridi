import { createBrowserClient } from "@supabase/ssr";

// Cliente browser (anon key). Usado no dashboard para auth e leitura RLS-safe.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
