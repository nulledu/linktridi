import type { DataSource } from "./types";
import { MockDataSource } from "./mock";
import { SupabaseDataSource } from "./supabase";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type { DataSource } from "./types";

// Seleciona a fonte de dados. Se o Supabase estiver configurado, usa Postgres;
// senão cai no mock (útil em dev/preview sem credenciais).
export function getDataSource(): DataSource {
  const hasSupabase =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasSupabase) return new MockDataSource();
  return new SupabaseDataSource(createSupabaseAdminClient());
}
