import { requireModule } from "@/lib/require-auth";
import { FrotaClient } from "./FrotaClient";

export const dynamic = "force-dynamic";

export default async function FrotaPage() {
  await requireModule("frota");
  return <FrotaClient />;
}
