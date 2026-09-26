// TEMPORÁRIO — banco de provas do catálogo do Estoque, pra medir o
// comportamento a 320px sem passar por login.
import { notFound } from "next/navigation";
import { ProvaCatalogo } from "./ProvaCatalogo";

export const dynamic = "force-dynamic";

export default function DevEstoqueCatalogo() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só torna o prefixo
  // /dev-estoque-item PÚBLICO fora de produção — não faz a rota sumir. É este
  // 404 que a remove em produção.
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaCatalogo />;
}
