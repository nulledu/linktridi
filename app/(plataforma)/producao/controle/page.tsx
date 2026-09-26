import { exigirSubarea } from "../subarea";
import { ControleAgora } from "./ControleAgora";

export const dynamic = "force-dynamic";

export default async function ControlePage() {
  await exigirSubarea("producao:controle");
  return <ControleAgora />;
}
