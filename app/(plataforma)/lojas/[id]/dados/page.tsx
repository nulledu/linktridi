import { notFound } from "next/navigation";
import { fonteLoja } from "@/lib/lojas-fonte";
import { AvisoDemo } from "../../AvisoDemo";
import { DadosClient } from "./DadosClient";

export const dynamic = "force-dynamic";

// Dados da loja: nome, logo, ícone da aba e como ela aparece na busca.
//
// Era o buraco por trás de "onde eu ponho o favicon?": a logo existia, mas
// escondida dentro da seção "Cabeçalho" do editor de aparência; favicon e
// título de página não existiam em lugar nenhum.
export default async function DadosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dados: loja, demo } = await fonteLoja(id);
  if (!loja) notFound();
  return (
    <>
      {demo && <AvisoDemo />}
      <DadosClient loja={loja} />
    </>
  );
}
