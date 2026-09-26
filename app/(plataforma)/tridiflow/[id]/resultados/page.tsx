import { requireModule } from "@/lib/require-auth";
import { ResultadosClient } from "./ResultadosClient";

export const dynamic = "force-dynamic";

export default async function TridiflowResultadosPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("tridiflow:projetos");
  const { id } = await params;
  return <ResultadosClient botId={id} />;
}
