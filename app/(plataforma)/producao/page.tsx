import { requireModuleKeys } from "@/lib/require-auth";
import { VisaoProducao } from "./VisaoProducao";

export const dynamic = "force-dynamic";

// Produção › Visão geral: o cockpit. Renderiza na hora e o client busca os
// dados (snapshot do ERP com cache de 60s + máquinas + quadro).
export default async function ProducaoPage() {
  const { keys } = await requireModuleKeys("producao");
  return (
    <VisaoProducao perms={{
      status: keys.includes("producao:status"),
      controle: keys.includes("producao:controle"),
      programacoes: keys.includes("producao:dia"),
      operacao: keys.includes("estoque"),
    }} />
  );
}
