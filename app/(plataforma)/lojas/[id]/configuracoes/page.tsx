import { notFound } from "next/navigation";
import { fonteLoja } from "@/lib/lojas-fonte";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export default async function ConfiguracoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dados: loja } = await fonteLoja(id);
  if (!loja) notFound();
  return <ConfiguracoesClient loja={loja} />;
}
