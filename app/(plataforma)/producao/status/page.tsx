import { exigirSubarea } from "../subarea";
import { StatusProducao } from "./StatusProducao";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  await exigirSubarea("producao:status");
  return <StatusProducao />;
}
