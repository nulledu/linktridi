import { notFound } from "next/navigation";
import { fonteLoja, fonteProduto } from "@/lib/lojas-fonte";
import { AvisoDemo } from "../../../AvisoDemo";
import { ProdutoEditor } from "../ProdutoEditor";

// Criar e editar são a MESMA tela — um formulário só, com ou sem valores
// iniciais. Duas telas parecidas viram duas telas diferentes na terceira
// mudança, e aí um campo novo entra só em uma delas.
export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string; produtoId: string }> }) {
  const { id, produtoId } = await params;
  const { dados: loja } = await fonteLoja(id);
  if (!loja) notFound();
  const { dados: produto, demo } = await fonteProduto(id, produtoId);
  if (!produto) notFound();
  return (
    <>
      {demo && <AvisoDemo />}
      <ProdutoEditor lojaId={id} produto={produto} />
    </>
  );
}
