import { redirect } from "next/navigation";
import { requireAlgumModulo } from "@/lib/require-auth";
import { VisaoTi } from "./VisaoTi";

export const dynamic = "force-dynamic";

// TI › Visão geral: o estado dos projetos num relance — sem virar dashboard.
// Quem só tem Infra (sem a área `ti`) cai direto na subárea dele: a Visão
// geral leria roadmaps que a API dele recusa.
export default async function TiPage() {
  const { keys } = await requireAlgumModulo("ti", "infraestrutura");
  if (!keys.includes("ti")) redirect("/ti/infraestrutura");
  return <VisaoTi />;
}
