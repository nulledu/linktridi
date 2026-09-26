import { notFound } from "next/navigation";
import { DevAnalyticsClient } from "./DevAnalyticsClient";

// Banco de provas da Visão geral do Analytics.
//
// Precisa das DUAS travas (ver CLAUDE.md): o prefixo em `middleware.ts` só a
// torna PÚBLICA fora de produção; quem a faz sumir de produção é o `notFound`
// abaixo. Sem ele, qualquer pessoa logada abriria a página no ar — e como as
// rotas `/dev-*` ficam fora de `(plataforma)`, elas não têm gate de sessão
// próprio.
export const dynamic = "force-static";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevAnalyticsClient />;
}
