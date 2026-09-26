import { notFound } from "next/navigation";
import { ProvaSetor } from "./ProvaSetor";

/**
 * Banco de provas dos painéis de setor (Produção/Logística) — peças com
 * dados de MENTIRA, pra ver todos os estados sem criar atividade de verdade
 * (uma atividade de teste no pool faria o tablet do galpão TOCAR).
 *
 * Duas travas, como toda página /dev-*:
 * 1. `DEV_ONLY_PREFIXES` no middleware — pública só fora de produção;
 * 2. o `notFound()` abaixo — em produção a página some de verdade.
 */
export default function DevPainelSetorPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaSetor />;
}
