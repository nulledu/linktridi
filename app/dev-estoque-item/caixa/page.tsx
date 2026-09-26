// TEMPORÁRIO — banco de provas da caixa lacrada (etiqueta com quantidade de
// peças e ficha contando peças), pra medir o comportamento a 320px sem login.
import { notFound } from "next/navigation";
import { ProvaCaixa } from "./ProvaCaixa";

export const dynamic = "force-dynamic";

export default function DevEstoqueCaixa() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só torna o prefixo
  // /dev-estoque-item PÚBLICO fora de produção — não faz a rota sumir. É este
  // 404 que a remove em produção.
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaCaixa />;
}
