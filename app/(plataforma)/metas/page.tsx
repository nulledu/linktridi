import { requireRole } from "@/lib/require-auth";
import { metasComProgresso } from "@/lib/metas";
import { listErpUsers } from "@/lib/funcoes";
import { MetasClient } from "./MetasClient";

export const dynamic = "force-dynamic";

export default async function MetasPage() {
  const me = await requireRole(["admin", "gerente_producao", "gerente_vendas", "estoquista", "colaborador"]);
  const canManage = me.role === "admin" || me.role === "gerente_producao" || me.role === "gerente_vendas";
  const [metas, colaboradores] = await Promise.all([
    metasComProgresso(),
    canManage ? listErpUsers().catch(() => []) : Promise.resolve([]),
  ]);
  return <MetasClient initial={metas} canManage={canManage} colaboradores={colaboradores.map((c) => ({ id: c.id, nome: c.nome }))} />;
}
