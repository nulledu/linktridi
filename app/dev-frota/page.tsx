import { notFound } from "next/navigation";
import { ProvaFrota } from "./ProvaFrota";

/**
 * Banco de provas do console da frota — os dois rostos da tela (vazia e
 * montada) sem precisar de login nem de TV cadastrada.
 *
 * Duas travas, como toda página /dev-*:
 * 1. `DEV_ONLY_PREFIXES` no middleware — pública só fora de produção;
 * 2. o `notFound()` abaixo — em produção a página some de verdade.
 */
export default function DevFrotaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaFrota />;
}
