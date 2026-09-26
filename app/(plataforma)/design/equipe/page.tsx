import { requireModule } from "@/lib/require-auth";
import { DesignClient } from "../DesignClient";

export const dynamic = "force-dynamic";

// O painel de desempenho por pessoa (vetor, contorno, aprovação, reprovação)
// que era a página inteira do Design. Continua igual — só mudou de endereço.
export default async function EquipePage() {
  const me = await requireModule("design");
  return <DesignClient isAdmin={me.role === "admin"} />;
}
