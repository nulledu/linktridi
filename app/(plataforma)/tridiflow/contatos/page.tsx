import { requireModule } from "@/lib/require-auth";
import { ContatosClient } from "./ContatosClient";

export const dynamic = "force-dynamic";

export default async function TridiflowContatosPage() {
  await requireModule("tridiflow:contatos");
  return <ContatosClient />;
}
