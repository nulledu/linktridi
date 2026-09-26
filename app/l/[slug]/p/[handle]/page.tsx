import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPaginaPublica } from "@/lib/lojas-conteudo-db";
import { semTags } from "@/lib/vitrine/higienizar";
import { textoDaPagina } from "@/lib/lojas-blocos";
import { Loja } from "../../../tema/Loja";
import { registrarVisualizacao } from "../../registrar";
import { contextoDa, dadosDaLoja } from "../../dados";

export const dynamic = "force-dynamic";

/**
 * Página institucional da loja: `/l/<slug>/p/<handle>`.
 *
 * Só PUBLICADA aparece. Rascunho dá 404 — e o mesmo 404 de página inexistente,
 * de propósito: uma vitrine pública não conta ao visitante que existe conteúdo
 * escondido ali esperando a hora.
 */
async function buscar(slug: string, handle: string) {
  const dados = await dadosDaLoja(slug);
  if (!dados) return null;
  const pagina = await getPaginaPublica(dados.loja.id, handle);
  return pagina ? { dados, pagina } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; handle: string }> }): Promise<Metadata> {
  const { slug, handle } = await params;
  const d = await buscar(slug, handle).catch(() => null);
  if (!d) return { title: "Página não encontrada" };
  return {
    title: `${d.pagina.titulo} — ${d.dados.loja.nome}`,
    // A descrição sai do texto REAL da página. Com blocos, o `conteudo` está
    // vazio — e o resultado de busca sairia sem descrição nenhuma.
    description: semTags(textoDaPagina(d.pagina)).slice(0, 160),
    robots: { index: true, follow: true },
  };
}

export default async function PaginaDaLoja({ params }: { params: Promise<{ slug: string; handle: string }> }) {
  const { slug, handle } = await params;
  const d = await buscar(slug, handle).catch(() => null);
  if (!d) notFound();

  await registrarVisualizacao(d.dados.loja.id, "pagina", `/l/${slug}/p/${handle}`);
  const ctx = contextoDa(d.dados, "pagina", {
    pagina: { titulo: d.pagina.titulo, conteudo: d.pagina.conteudo, blocos: d.pagina.blocos },
  });
  return (
    <Loja
      ctx={ctx}
    />
  );
}
