import { requireModule } from "@/lib/require-auth";
import { IntegracoesClient } from "./IntegracoesClient";

export const dynamic = "force-dynamic";

export default async function TridiflowIntegracoesPage() {
  await requireModule("tridiflow:integracoes");
  return <IntegracoesClient />;
}
