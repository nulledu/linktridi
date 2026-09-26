import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { idDoCaminho, moeda, precoVigente } from "@/lib/lojas";
import { ProdutoPublico } from "../../Vitrine";
import { Loja } from "../../tema/Loja";
import { contextoDa, dadosDaLoja } from "../dados";
import { registrarVisualizacao } from "../registrar";

export const dynamic = "force-dynamic";

// O endereço é `<titulo-em-slug>-<uuid>` e quem resolve é o uuid do fim: o
// lojista pode renomear o produto sem quebrar o link que já foi divulgado.
//
// O produto sai do catálogo JÁ CARREGADO, e não de uma consulta própria: a
// vitrine com tema precisa do catálogo inteiro de qualquer jeito (coleções do
// menu, recomendados no rodapé), e uma segunda ida ao banco por página seria
// pagar duas vezes pelo mesmo dado.
async function buscar(slug: string, caminho: string) {
  const id = idDoCaminho(caminho);
  // Caminho que não termina em id nem chega a consultar o banco — é o 404
  // barato pra varredura de robô.
  if (!id) return null;
  const dados = await dadosDaLoja(slug);
  if (!dados) return null;
  const produto = dados.produtos.find((p) => p.id === id);
  return produto ? { dados, loja: dados.loja, produto } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; produto: string }> }): Promise<Metadata> {
  const { slug, produto } = await params;
  const d = await buscar(slug, produto).catch(() => null);
  if (!d) return { title: "Produto não encontrado" };
  return {
    title: `${d.produto.titulo} — ${d.loja.nome}`,
    description: d.produto.descricao.slice(0, 160) || `${d.produto.titulo} por ${moeda(precoVigente(d.produto))}.`,
    // O ERP inteiro nasce `noindex` no layout raiz; a vitrine é a exceção —
    // igual à página da loja, que já declara isso.
    robots: { index: true, follow: true },
    openGraph: {
      title: d.produto.titulo,
      // A capa é a primeira imagem — a mesma que a pessoa escolheu no painel.
      images: d.produto.imagens[0] ? [d.produto.imagens[0].url] : undefined,
    },
  };
}

export default async function ProdutoPage({ params }: { params: Promise<{ slug: string; produto: string }> }) {
  const { slug, produto } = await params;
  const d = await buscar(slug, produto).catch(() => null);
  if (!d) notFound();
  await registrarVisualizacao(d.loja.id, "produto", `/l/${slug}/${produto}`);
  if (d.dados.tema.modelo === "simples") return <ProdutoPublico loja={d.loja} produto={d.produto} />;
  return <Loja ctx={contextoDa(d.dados, "produto", { produto: d.produto })} />;
}
