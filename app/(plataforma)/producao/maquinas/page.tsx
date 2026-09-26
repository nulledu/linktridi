import { requireModuleKeys } from "@/lib/require-auth";
import { MaquinasProducao } from "./MaquinasProducao";

export const dynamic = "force-dynamic";

// Máquinas é de todo mundo do módulo: é onde o operador marca "em andamento"
// e "feita". Programar/cancelar/parar dependem do `controla` da rota.
export default async function MaquinasPage() {
  await requireModuleKeys("producao");
  return <MaquinasProducao />;
}
