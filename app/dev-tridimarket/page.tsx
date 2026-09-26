import { notFound } from "next/navigation";
import { DevTridiMarketClient } from "./DevTridiMarketClient";

export const dynamic = "force-dynamic";

// Preview de DESENVOLVIMENTO do TridiMarket — renderiza as telas reais com
// dados de exemplo, SEM login. Existe pra conferir o visual de fato (não um
// mock à parte, que sempre acaba divergindo do componente real).
// 404 em produção, e o middleware só libera /dev-* fora de produção.
//
// ?tela=pessoas mostra a lista de pessoas; o padrão é o painel.
export default async function DevTridiMarketPage({ searchParams }: { searchParams: Promise<{ tela?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  // A tela vem do SERVIDOR e desce como prop: ler location.search durante a
  // render do cliente faz o HTML do servidor divergir do cliente (hydration).
  const { tela } = await searchParams;
  return <DevTridiMarketClient tela={tela ?? "painel"} />;
}
