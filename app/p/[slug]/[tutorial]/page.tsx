import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { registrarMetricaRemota, resolverPaginaPublicada, resolverProdutosTutoriais } from "@/lib/player-remoto";
import { ehCentralTutoriais, normalizarCentralTutoriais } from "@/lib/tridiflow-tutoriais";
import { idsDeProdutos, metadadosDoTutorial } from "@/lib/tridiflow-tutoriais-leitura";
import { legivelSobre } from "@/lib/vitrine/cor";
import { TutorialPublico } from "./TutorialPublico";

export const dynamic = "force-dynamic";
async function buscar(slug: string, handle: string) {
  const h = await headers(); const host = (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0];
  const pagina = await resolverPaginaPublicada(host, slug); if (!pagina || !ehCentralTutoriais(pagina.pagina.config)) return null;
  const central = normalizarCentralTutoriais(pagina.pagina.config.centralTutoriais);
  const tutorial = central.tutoriais.find((t) => t.handle === handle && t.status === "publicado");
  return tutorial ? { pagina, central, tutorial, host } : null;
}
// O cartão do link (WhatsApp, Instagram) sai com a capa e o título do guia —
// é como o tutorial chega a quem ainda não abriu. A montagem é pura e testada
// em `metadadosDoTutorial`.
export async function generateMetadata({ params }: { params: Promise<{ slug: string; tutorial: string }> }): Promise<Metadata> {
  const p = await params; const d = await buscar(p.slug, p.tutorial).catch(() => null);
  if (!d) return { title: "Tutorial não encontrado", robots: { index: false } };
  return metadadosDoTutorial({ tutorial: d.tutorial, centralTitulo: d.central.titulo, host: d.host, slug: p.slug });
}
export default async function TutorialPage({ params }: { params: Promise<{ slug: string; tutorial: string }> }) {
  const p = await params; const d = await buscar(p.slug, p.tutorial).catch(() => null); if (!d) notFound();
  // Produtos dos blocos E dos materiais numa ida só: o "Você vai precisar"
  // liga cada material à página do produto.
  const produtos = await resolverProdutosTutoriais(idsDeProdutos(d.tutorial));
  const cfg = d.pagina.pagina.config;
  // A tinta sobre a cor principal (botão, número do passo, play) sai da
  // luminância: branco fixo reprovava nas próprias predefinições — "Impacto"
  // (#f97316) dava 2,8:1. Branco continua quando dá pra ler. É `legivelSobre`
  // e não `tintaSobre` porque este é Server Component e lib/aparencia.ts é
  // "use client": chamar função de lá aqui derruba a página inteira.
  const estilo = { "--color-background": cfg.corFundo || "#ffffff", "--color-text": cfg.corTexto || "#111114", "--color-text-muted": `color-mix(in srgb, ${cfg.corTexto || "#111114"} 62%, transparent)`, "--color-primary": cfg.corPrimaria || "var(--primary-texto)", "--color-primary-contrast": legivelSobre("#ffffff", [cfg.corPrimaria || ""]), background: cfg.corFundo || "#ffffff" } as React.CSSProperties;
  const categoriaNome = d.central.categorias.find((c) => c.id === d.tutorial.categoriaId)?.nome;
  // Mesma categoria primeiro; sem categoria, os vizinhos da lista. Nunca ele
  // mesmo, e no máximo quatro — é sugestão, não índice.
  const publicados = d.central.tutoriais.filter((t) => t.status === "publicado" && t.handle !== d.tutorial.handle);
  const mesma = publicados.filter((t) => t.categoriaId === d.tutorial.categoriaId);
  // A vista é contada DEPOIS da resposta (`after`), na invocação que já
  // existe: um pixel no cliente custaria outra invocação por leitura — foi
  // isso que pausou o projeto na Vercel em agosto.
  after(() => registrarMetricaRemota(d.pagina.id, d.tutorial.handle, "vistas"));
  const relacionados = (mesma.length ? mesma : publicados).slice(0, 4)
    .map((t) => ({ handle: t.handle, titulo: t.titulo, capaUrl: t.capaUrl, duracaoMinutos: t.duracaoMinutos }));
  // O WhatsApp da central alimenta o "fale com a gente" (Deu errado?, Ainda
  // não) e o Contato da barra padrão quando ninguém configurou a barra.
  return <main style={estilo}><TutorialPublico tutorial={d.tutorial} categoriaNome={categoriaNome} categoriaId={categoriaNome ? d.tutorial.categoriaId : null} relacionadosDaCategoria={mesma.length > 0} centralTitulo={d.central.titulo} centralUrl={`/p/${p.slug}`} produtos={produtos} atalhos={d.central.atalhos} relacionados={relacionados} botId={d.pagina.id} whatsapp={d.central.whatsapp} temIdeias={d.central.reels.some((r) => r.ativo)} /></main>;
}
