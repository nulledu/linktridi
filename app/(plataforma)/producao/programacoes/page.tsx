import { exigirSubarea } from "../subarea";
import { Programacoes } from "./Programacoes";

export const dynamic = "force-dynamic";

export default async function ProgramacoesPage() {
  await exigirSubarea("producao:dia");
  return <Programacoes />;
}
