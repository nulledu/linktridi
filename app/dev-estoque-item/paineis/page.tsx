// Banco de provas dos painéis do Estoque nos estados que as outras provas não
// alcançam (lista vazia, uma linha, nome de 77 caracteres, passo 2 da
// importação, resultado da conferência).
import { notFound } from "next/navigation";
import { ProvaPaineis } from "./ProvaPaineis";

export const dynamic = "force-dynamic";

export default function DevEstoquePaineis() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só torna o prefixo
  // `/dev-estoque-item` PÚBLICO fora de produção — não o faz sumir. É este 404
  // que o remove em produção.
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaPaineis />;
}
