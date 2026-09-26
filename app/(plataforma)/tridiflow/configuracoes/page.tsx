import { redirect } from "next/navigation";
import { requireModule } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// Configurações abre direto na 1ª seção (Domínios).
export default async function TridiflowConfiguracoesPage() {
  await requireModule("tridiflow:configuracoes");
  redirect("/tridiflow/configuracoes/dominios");
}
