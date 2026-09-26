import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Vitrine } from "../Vitrine";
import { Loja } from "../tema/Loja";
import { registrarVisualizacao } from "./registrar";
import { contextoDa, dadosDaLoja } from "./dados";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const dados = await dadosDaLoja(slug).catch(() => null);
  if (!dados) return { title: "Loja não encontrada" };
  // Título, descrição e ícone vêm da IDENTIDADE da loja (Dados da loja). Vazios,
  // caem no nome — que é o que a vitrine já fazia.
  const { nome, seoTitulo, seoDescricao, faviconUrl } = dados.loja;
  return {
    title: seoTitulo?.trim() || nome,
    description: seoDescricao?.trim() || `Catálogo de ${nome}.`,
    // A vitrine é pra ser achada; o painel, não.
    robots: { index: true, follow: true },
    icons: faviconUrl ? { icon: faviconUrl, apple: faviconUrl } : undefined,
    openGraph: {
      title: seoTitulo?.trim() || nome,
      description: seoDescricao?.trim() || `Catálogo de ${nome}.`,
      type: "website",
    },
  };
}

export default async function VitrinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Loja em rascunho, endereço errado ou o SQL ainda não rodado: tudo cai no
  // mesmo 404. Uma vitrine não explica ao visitante o que falta no sistema.
  const dados = await dadosDaLoja(slug).catch(() => null);
  if (!dados) notFound();
  await registrarVisualizacao(dados.loja.id, "inicio", `/l/${slug}`);

  // Duas vitrines convivem: a SIMPLES (catálogo cru, sem uma linha de
  // JavaScript) e a do TEMA. Quem escolhe é o modelo salvo no tema da loja —
  // nenhuma loja publicada troca de cara porque o tema novo entrou no ar.
  if (dados.tema.modelo === "simples") return <Vitrine loja={dados.loja} produtos={dados.produtos} />;
  return <Loja ctx={contextoDa(dados, "inicio")} />;
}
