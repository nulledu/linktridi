// TEMPORÁRIO — banco de provas do Recebimento do Estoque, pra medir 320px sem
// passar por login.
//
// Por que não usa o /dev-mobile?ws=estoque: lá a rede falsa mapeia a chave
// "/api/estoque" e casa por PREFIXO, então ela engole "/api/estoque-itens",
// "/api/estoque/locais" e "/api/estoque/fornecedores" e devolve pras três o
// snapshot de outro formato — e não intercepta "/api/recebimento/compras", que
// é justamente o que esta aba busca. Resultado: a aba nascia vazia lá. Aqui as
// rotas simuladas são as que a tela chama de verdade.
import { notFound } from "next/navigation";
import { Prova } from "./Prova";

export const dynamic = "force-dynamic";

export default function DevRecebimento() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só torna a rota PÚBLICA
  // fora de produção — não a faz sumir. É este 404 que a remove em produção.
  if (process.env.NODE_ENV === "production") notFound();
  return <Prova />;
}
