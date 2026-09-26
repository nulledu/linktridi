import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAlgumModulo } from "@/lib/require-auth";
import { getBot } from "@/lib/tridiflow-db";
import { buscarProdutosTutoriais } from "@/lib/tridiflow-tutoriais-produtos";
import { ehCentralTutoriais, normalizarCentralTutoriais } from "@/lib/tridiflow-tutoriais";
import { idsDeProdutos } from "@/lib/tridiflow-tutoriais-leitura";
import { TEMA_PADRAO } from "@/lib/tridiflow-pagina-tema";
import { TutorialPublico } from "@/app/p/[slug]/[tutorial]/TutorialPublico";
import { BarraPrevia } from "../BarraPrevia";

// Prévia de UM tutorial do rascunho — inclusive os em rascunho, que a página
// pública nunca mostra. Mesma sessão/permissão da prévia da central.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prévia — Tutorial", robots: { index: false } };

export default async function PreviaTutorialPage({ params }: { params: Promise<{ id: string; handle: string }> }) {
  await requireAlgumModulo("marketing", "tridiflow:tutoriais");
  const { id, handle } = await params;
  const bot = await getBot(id);
  if (!bot || bot.tipo !== "page" || !ehCentralTutoriais(bot.pagina.config)) notFound();
  const central = normalizarCentralTutoriais(bot.pagina.config.centralTutoriais);
  const tutorial = central.tutoriais.find((t) => t.handle === handle);
  if (!tutorial) notFound();
  // Os mesmos produtos da página no ar: blocos de produto E materiais.
  const produtos = await buscarProdutosTutoriais(idsDeProdutos(tutorial));
  const cfg = bot.pagina.config;
  const estilo = {
    "--color-background": cfg.corFundo || "#ffffff",
    "--color-text": cfg.corTexto || "#111114",
    "--color-text-muted": `color-mix(in srgb, ${cfg.corTexto || "#111114"} 62%, transparent)`,
    // Reserva FIXA, não `var(--primary-texto)`: esse token segue o tema e o
    // destaque de quem está vendo, e o fundo aqui é sempre branco. No escuro
    // com destaque salvo, quem edita via uma cor clareada a ~2,9:1 — e uma cor
    // que o cliente anônimo (sem destaque) nunca vê.
    "--color-primary": cfg.corPrimaria || TEMA_PADRAO.corPrimaria,
    "--color-primary-contrast": "#ffffff",
    background: cfg.corFundo || "#ffffff", minHeight: "100dvh",
  } as React.CSSProperties;
  const categoriaNome = central.categorias.find((c) => c.id === tutorial.categoriaId)?.nome;
  const outros = central.tutoriais.filter((t) => t.handle !== tutorial.handle);
  const mesma = outros.filter((t) => t.categoriaId === tutorial.categoriaId);
  const relacionados = (mesma.length ? mesma : outros).slice(0, 4)
    .map((t) => ({ handle: t.handle, titulo: t.titulo, capaUrl: t.capaUrl, duracaoMinutos: t.duracaoMinutos }));
  // Sem `botId` de propósito: rascunho não vota nem conta contato, e os
  // passos marcados na prévia ficam numa chave própria (`tut-feitos:previa:…`).
  // O WhatsApp vai junto pra quem edita ver o "fale com a gente" como ficará.
  return <main style={estilo}>
    <BarraPrevia voltarHref={`/marketing/tutoriais/${bot.id}`} />
    <TutorialPublico tutorial={tutorial} categoriaNome={categoriaNome} centralTitulo={central.titulo}
      centralUrl={`/previa/tutoriais/${bot.id}`} produtos={produtos} atalhos={central.atalhos} relacionados={relacionados}
      whatsapp={central.whatsapp} />
  </main>;
}
