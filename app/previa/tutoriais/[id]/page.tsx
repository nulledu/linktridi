import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAlgumModulo } from "@/lib/require-auth";
import { getBot } from "@/lib/tridiflow-db";
import { cartaoDoTutorial, ehCentralTutoriais, normalizarCentralTutoriais } from "@/lib/tridiflow-tutoriais";
import { TEMA_PADRAO } from "@/lib/tridiflow-pagina-tema";
import { legivelSobre } from "@/lib/vitrine/cor";
import { CentralTutoriais } from "@/app/p/[slug]/CentralTutoriais";
import { BarraPrevia } from "./BarraPrevia";

// PRÉVIA da Central de Tutoriais — o RASCUNHO, exatamente com a cara da página
// pública. A rota fica fora de (plataforma) de propósito: a prévia precisa ser
// a página como o cliente vê, sem a moldura do ERP. A sessão é exigida aqui
// mesmo (requireModule), porque fora de (plataforma) não há gate herdado.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prévia — Central de Tutoriais", robots: { index: false } };

export default async function PreviaCentralPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAlgumModulo("marketing", "tridiflow:tutoriais");
  const { id } = await params;
  const bot = await getBot(id);
  if (!bot || bot.tipo !== "page" || !ehCentralTutoriais(bot.pagina.config)) notFound();
  const central = normalizarCentralTutoriais(bot.pagina.config.centralTutoriais);
  const cfg = bot.pagina.config;
  // Reserva FIXA, não `var(--primary-texto)`: esse token segue o tema e o
  // destaque de quem está vendo, e a central pinta o próprio fundo branco. No
  // escuro com destaque salvo, quem edita via uma cor clareada a ~2,9:1 — e uma
  // cor que o visitante anônimo (sem destaque) nunca vê. Mesma reserva da
  // prévia do tutorial ao lado. A tinta vem de `legivelSobre` (servidor) e não
  // do `tintaSobre` de lib/aparencia, que é "use client" e não roda aqui.
  const primaria = cfg.corPrimaria || TEMA_PADRAO.corPrimaria;
  const estilo = {
    "--color-background": cfg.corFundo || "#ffffff",
    "--color-text": cfg.corTexto || "#111114",
    "--color-text-muted": `color-mix(in srgb, ${cfg.corTexto || "#111114"} 62%, transparent)`,
    "--color-primary": primaria,
    "--color-primary-contrast": legivelSobre("#ffffff", [primaria]),
    background: cfg.corFundo || "#ffffff", minHeight: "100dvh",
  } as React.CSSProperties;
  // TODOS os tutoriais, rascunho incluso — a prévia é onde o dono vê o guia
  // antes de publicar. Mas só o resumo, como no ar: a prévia que mandasse o
  // conteúdo inteiro esconderia o custo que a página pública não paga mais.
  const cartoes = central.tutoriais.map(cartaoDoTutorial);
  return <main style={estilo}>
    <BarraPrevia voltarHref={`/marketing/tutoriais/${bot.id}`} />
    <CentralTutoriais titulo={central.titulo} subtitulo={central.subtitulo} sobrelinha={central.sobrelinha} mostrarTitulo={central.mostrarTitulo} catalogoLoja={central.catalogoLoja} catalogoRotulo={central.catalogoRotulo} slug={bot.slug}
      categorias={central.categorias} tutoriais={cartoes} atalhos={central.atalhos} todosImagemUrl={central.todosImagemUrl} todosRotulo={central.todosRotulo} whatsapp={central.whatsapp} base={`/previa/tutoriais/${bot.id}`} mostrarVazias reels={central.reels} depoimentos={central.depoimentos} />
  </main>;
}
