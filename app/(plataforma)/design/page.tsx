import { requireModule } from "@/lib/require-auth";
import { PainelDesign } from "./PainelDesign";

export const dynamic = "force-dynamic";

// Design: painel de gestão do setor, uma tela só. Renderiza na hora; o client
// lê /api/design/projetos (leitura do ERP em cache de 1 min).
export default async function DesignPage() {
  await requireModule("design");
  return <PainelDesign />;
}
