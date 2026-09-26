import { resolveMyModuleKeys } from "@/lib/perfis";
import type { Role } from "@/lib/rbac";

/**
 * Quem pode gerir metas (as de /api/metas e as de vendedor/equipe que a TV
 * pública mostra): papel de gestão OU a área Pessoas (`colaboradores`), que
 * é de onde a aba de Metas abre. Um portão só pras três rotas.
 */
export async function podeGerirMetas(role?: string, id?: string, username?: string | null): Promise<boolean> {
  if (role === "admin" || role === "gerente_producao" || role === "gerente_vendas") return true;
  if (!id || !role) return false;
  const keys = await resolveMyModuleKeys({ id, role: role as Role, username });
  return keys.includes("colaboradores");
}
