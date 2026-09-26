import { notFound } from "next/navigation";
import { Loja } from "../../tema/Loja";
import { registrarVisualizacao } from "../registrar";
import { contextoDa, dadosDaLoja } from "../dados";

export const dynamic = "force-dynamic";

// Página de resultado não entra em buscador: o conteúdo é do catálogo, que já
// está indexado nas páginas de produto e de coleção.
export const metadata = { title: "Busca", robots: { index: false, follow: false } };

export default async function BuscaPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ slug }, { q }] = await Promise.all([params, searchParams]);
  const dados = await dadosDaLoja(slug).catch(() => null);
  if (!dados) notFound();
  await registrarVisualizacao(dados.loja.id, "busca", `/l/${slug}/busca`);

  return <Loja ctx={contextoDa(dados, "busca", { termo: q ?? "" })} />;
}
