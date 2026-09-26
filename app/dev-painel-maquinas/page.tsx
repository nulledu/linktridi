import { notFound } from "next/navigation";
import { ProvaMaquinas } from "./ProvaMaquinas";

/**
 * Banco de provas do painel de Máquinas — o desenho com dados de MENTIRA.
 *
 * Existe porque a parede real só acende depois de `supabase/maquinas.sql`
 * rodar no banco: sem isto, aprovar o layout dependeria de criar máquina e
 * programação de verdade.
 *
 * Duas travas, como toda página /dev-*:
 * 1. `DEV_ONLY_PREFIXES` no middleware — pública só fora de produção;
 * 2. o `notFound()` abaixo — em produção a página some de verdade.
 */
export default function DevPainelMaquinasPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaMaquinas />;
}
