import { requireModule } from "@/lib/require-auth";
import { LogisticaClient } from "./LogisticaClient";

export const dynamic = "force-dynamic";

export default async function LogisticaPage() {
  await requireModule("logistica");
  return <LogisticaClient />;
}
