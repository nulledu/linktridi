import { notFound } from "next/navigation";
import { DevTridifyClient } from "./DevTridifyClient";

export const dynamic = "force-dynamic";

// Preview de DESENVOLVIMENTO da Tridify — renderiza os componentes reais com
// dados de exemplo, SEM login e SEM Meta. Existe só pra ver o visual de verdade
// (não os mocks HTML). 404 em produção: nunca vaza pro app publicado.
export default function DevTridifyPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevTridifyClient />;
}
