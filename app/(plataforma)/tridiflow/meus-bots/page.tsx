import { redirect } from "next/navigation";
import { requireModuleKeys } from "@/lib/require-auth";
import { MeusBotsClient } from "./MeusBotsClient";

export const dynamic = "force-dynamic";

export default async function TridiflowMeusBotsPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  // A lista é de quem tem "projetos"; criar e mexer no LinkTridi é chave à
  // parte — a tela some com as ações que a API recusaria.
  const { keys } = await requireModuleKeys("tridiflow:projetos");
  // LinkTridi mora no Marketing · Geral (set/2026). O endereço antigo continua
  // valendo e leva pra lá.
  if ((await searchParams).tipo === "linktridi") redirect("/marketing?aba=paginas&ver=linktridi");
  return <MeusBotsClient podeLinkTridi={keys.includes("tridiflow:linktridi")} />;
}
