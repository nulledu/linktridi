// TEMPORÁRIO — banco de provas da tela /fotos-estoque, pra medir o
// comportamento a 320px sem passar por login. Some junto com as pastas
// app/fotos-*.
import { notFound } from "next/navigation";
import { FaxinaDeFotos } from "../fotos-comuns/FaxinaDeFotos";

export const dynamic = "force-dynamic";

export default function DevFotosEstoque() {
  // Trava 2 de 2: o middleware só torna a rota PÚBLICA fora de produção; quem
  // faz a página sumir em produção é esta linha.
  if (process.env.NODE_ENV === "production") notFound();
  return <FaxinaDeFotos catalogo="estoque" demo />;
}
