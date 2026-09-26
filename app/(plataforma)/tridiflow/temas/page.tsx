import { requireModule } from "@/lib/require-auth";
import { TemasClient } from "./TemasClient";

export const dynamic = "force-dynamic";

export default async function TridiflowTemasPage() {
  await requireModule("tridiflow:temas");
  return <TemasClient />;
}
