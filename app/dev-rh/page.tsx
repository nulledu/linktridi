import { notFound } from "next/navigation";
import { ProvaRh } from "./ProvaRh";

/**
 * Banco de provas do RH — sem login.
 *
 * As telas do módulo ficam atrás de uma área restrita, e credenciais não se
 * digitam para conferir layout. Esta página monta o trilho, a lista e a ficha
 * com dados falsos para o `npm run rolagem` medir a sobra de largura em
 * 320/390/430/768/1024 (o script descobre as rotas `/dev-*` sozinho, então esta
 * entra na medição sem ninguém cadastrá-la).
 *
 * AS DUAS TRAVAS, e a segunda é a que faz sumir (ver CLAUDE.md):
 *  1. `/dev-rh` em DEV_ONLY_PREFIXES no middleware — isso só a torna PÚBLICA
 *     fora de produção; em produção ela continuaria existindo, exigindo sessão.
 *  2. o `notFound()` abaixo — é este que a apaga em produção. Sem ele, qualquer
 *     pessoa logada abriria a página, e como `/dev-*` mora FORA de
 *     `(plataforma)` ela não tem gate de sessão próprio.
 */
export const dynamic = "force-dynamic";

// `searchParams` declarado só pra `npm run rolagem` descobrir os `?tela=`
// (o script lê o contrato da rota); quem lê a query é o cliente, depois de
// hidratar.
export default async function DevRhPage({ searchParams }: { searchParams: Promise<{ tela?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  await searchParams;
  return <ProvaRh />;
}
