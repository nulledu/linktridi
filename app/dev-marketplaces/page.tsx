import { notFound } from "next/navigation";
import { MarketplacesProvaClient } from "./MarketplacesProvaClient";

export const dynamic = "force-dynamic";

// Banco de provas da aba Comercial › Marketplaces — o componente real, com a
// rota interceptada, sem login e sem ERP.
//
// As DUAS travas, e elas fazem coisas diferentes (ver CLAUDE.md):
// · `DEV_ONLY_PREFIXES` no middleware só torna a rota PÚBLICA fora de produção;
// · o `notFound()` abaixo é o que a faz SUMIR em produção. Sem ele qualquer
//   pessoa logada abriria a página no ar — e como as rotas `/dev-*` ficam fora
//   de `(plataforma)`, elas não têm gate de sessão próprio.
export default function DevMarketplacesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MarketplacesProvaClient />;
}
