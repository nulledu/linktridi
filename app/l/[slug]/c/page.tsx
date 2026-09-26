import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Loja } from "../../tema/Loja";
import { registrarVisualizacao } from "../registrar";
import { contextoDa, dadosDaLoja } from "../dados";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const dados = await dadosDaLoja(slug).catch(() => null);
  if (!dados) return { title: "Loja não encontrada" };
  return {
    title: `Coleções — ${dados.loja.nome}`,
    robots: { index: true, follow: true },
  };
}

export default async function ColecoesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dados = await dadosDaLoja(slug).catch(() => null);
  if (!dados) notFound();
  await registrarVisualizacao(dados.loja.id, "colecoes", `/l/${slug}/c`);

  return <Loja ctx={contextoDa(dados, "colecoes")} />;
}
