import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { colecaoPorHandle } from "@/lib/vitrine/colecoes";
import { Loja } from "../../../tema/Loja";
import { registrarVisualizacao } from "../../registrar";
import { contextoDa, dadosDaLoja } from "../../dados";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; handle: string }> }): Promise<Metadata> {
  const { slug, handle } = await params;
  const dados = await dadosDaLoja(slug).catch(() => null);
  if (!dados) return { title: "Loja não encontrada" };
  const col = colecaoPorHandle(dados.produtos, handle);
  return {
    title: `${col?.titulo ?? "Coleção"} — ${dados.loja.nome}`,
    robots: { index: true, follow: true },
  };
}

export default async function ColecaoPage({ params }: { params: Promise<{ slug: string; handle: string }> }) {
  const { slug, handle } = await params;
  const dados = await dadosDaLoja(slug).catch(() => null);
  if (!dados) notFound();
  await registrarVisualizacao(dados.loja.id, "colecao", `/l/${slug}/c/${handle}`);

  // Coleção inexistente NÃO é 404: o handle vem de uma categoria que o lojista
  // pode ter renomeado, e o link já foi divulgado. A página abre vazia dizendo
  // que não há produto — melhor que sumir.
  const colecao = colecaoPorHandle(dados.produtos, handle);
  return <Loja ctx={contextoDa(dados, "colecao", { colecao })} />;
}
