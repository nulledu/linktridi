import { redirect } from "next/navigation";
import { requireModuleKeys } from "@/lib/require-auth";
import { DashboardClient } from "./DashboardClient";
import { PRIMEIRA_ABA } from "./abas";

export const dynamic = "force-dynamic";

// O dashboard é a cara dos PROJETOS (últimos bots, números dos funis). Quem tem
// só contatos ou só analytics não é barrado na porta do workspace: cai na
// primeira aba que a grade liberou pra ele. Barrar aqui faria o menu inteiro
// parecer quebrado — a pessoa clica em "Atendimento" e leva 403 antes de
// enxergar a aba que ela de fato tem.
export default async function TridiflowPage() {
  const { keys } = await requireModuleKeys("tridiflow");
  if (!keys.includes("tridiflow:projetos")) {
    const destino = PRIMEIRA_ABA(keys);
    if (destino) redirect(destino);
    redirect("/sem-permissao?area=" + encodeURIComponent("tridiflow:projetos"));
  }
  return <DashboardClient />;
}
