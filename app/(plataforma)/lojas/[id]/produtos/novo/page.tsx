import { notFound } from "next/navigation";
import { fonteLoja } from "@/lib/lojas-fonte";
import { AvisoDemo } from "../../../AvisoDemo";
import { ProdutoEditor } from "../ProdutoEditor";

export default async function NovoProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dados: loja, demo } = await fonteLoja(id);
  if (!loja) notFound();
  // Sem `produto`: o editor nasce vazio, em rascunho.
  return (
    <>
      {demo && <AvisoDemo />}
      <ProdutoEditor lojaId={id} />
    </>
  );
}
