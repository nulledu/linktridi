// ── Funções operacionais: liga pessoas do ERP a uma função, sem exigir login.
// Quem não tem função não aparece nos dashboards.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;

export { FUNCOES, FUNCAO_LABEL } from "@/lib/funcoes-catalog";
export type { FuncaoKey, ErpUser, Funcao } from "@/lib/funcoes-catalog";
import type { ErpUser, Funcao } from "@/lib/funcoes-catalog";

// Lista os funcionários ativos do ERP (para o seletor em Colaboradores). Cache 60s.
export async function listErpUsers(): Promise<ErpUser[]> {
  return cached("erp:usuarios", 60_000, async () => {
    // TODOS os usuários do ERP (72), não só os com atividade=true (22). O campo
    // `atividade` do ERP é "participa do módulo de atividades", não "funcionário
    // ativo" — filtrar por ele escondia a maioria da equipe no seletor de vínculo.
    const res = await fetch(
      `${LEGACY_URL}/rest/v1/usuarios?select=user_id,nome,apelido,foto_url,setor_id&order=nome.asc&limit=2000`,
      { headers: { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`ERP usuarios ${res.status}`);
    const rows = (await res.json()) as Array<{ user_id: string; nome: string | null; apelido: string | null; foto_url: string | null; setor_id: number | null }>;
    return rows.map((u) => ({ id: u.user_id, nome: u.nome || u.apelido || u.user_id.slice(0, 8), apelido: u.apelido, foto_url: u.foto_url, setor_id: u.setor_id }));
  });
}

// Funções atribuídas (ativas). Tolerante a tabela ausente.
export async function listFuncoes(): Promise<Funcao[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("funcoes").select("erp_user_id,nome,foto_url,funcao,active").eq("active", true);
    return (data as Funcao[]) ?? [];
  } catch {
    return [];
  }
}

// Conjunto de erp_user_id que têm alguma das funções dadas (p/ gating no dash).
export async function idsComFuncao(funcoes: string[]): Promise<Set<string>> {
  const all = await listFuncoes();
  return new Set(all.filter((f) => funcoes.includes(f.funcao)).map((f) => f.erp_user_id));
}
