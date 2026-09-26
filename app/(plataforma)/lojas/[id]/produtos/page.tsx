import { notFound } from "next/navigation";
import { fonteLoja, fonteProdutos } from "@/lib/lojas-fonte";
import { AvisoDemo } from "../../AvisoDemo";
import { ProdutosClient } from "./ProdutosClient";

export default async function ProdutosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Os produtos dependem só do id da URL, não do objeto loja — as duas idas
  // viajam juntas (eram uma atrás da outra, e cada ida custa 250–700 ms).
  const [{ dados: loja }, { dados: produtos, demo }] = await Promise.all([fonteLoja(id), fonteProdutos(id)]);
  if (!loja) notFound();
  // Os dados chegam prontos do servidor: nada de `fetch` no boot da tela.
  return (
    <>
      {demo && <AvisoDemo />}
      <ProdutosClient lojaId={id} produtos={produtos} />
    </>
  );
}
