import { notFound } from "next/navigation";
import { ProvaQuadro } from "./ProvaQuadro";

/**
 * Banco de provas do quadro (kanban) das máquinas.
 *
 * Duas travas, como toda página /dev-*:
 * 1. `DEV_ONLY_PREFIXES` no middleware — pública só fora de produção;
 * 2. o `notFound()` abaixo — em produção a página some de verdade.
 */
export default function DevQuadroMaquinasPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaQuadro />;
}
