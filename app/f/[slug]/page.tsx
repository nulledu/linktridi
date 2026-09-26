import { headers } from "next/headers";
import { resolverBotPublicado } from "@/lib/player-remoto";
import { metaDoLinkTridi, normalizarLinkTridi } from "@/lib/tridiflow-linktridi";
import { PlayerClient } from "./PlayerClient";

export const dynamic = "force-dynamic";

// PLAYER PÚBLICO — destino do anúncio. Leve de propósito: sem nada do editor.
// Resolve o bot publicado por (host, slug); domínio próprio ou o padrão.
export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0];
  const bot = await resolverBotPublicado(host, slug);

  if (!bot) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#F2F2F7", fontFamily: "system-ui, sans-serif", color: "var(--neutro)", fontSize: 15, padding: 24, textAlign: "center" }}>
        Este link não está disponível.
      </div>
    );
  }
  return <PlayerClient bot={bot} />;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0];
  const bot = await resolverBotPublicado(host, slug);
  const meta = bot?.settings.meta;
  // LinkTridi não tem "nome do bot" nem foto de chat: sem isto o link da bio
  // compartilhado saía com o título "Atendimento" (o padrão do tema de CHAT) e
  // sem imagem. O perfil que a pessoa já preencheu é a resposta certa.
  const lt = bot?.settings.modo === "linktridi"
    ? metaDoLinkTridi(meta, normalizarLinkTridi(bot.settings.linktridi), bot.nome)
    : null;
  const titulo = lt?.titulo || meta?.titulo || bot?.theme.nomeBot || bot?.nome || "Chat";
  const descricao = lt ? lt.descricao : meta?.descricao;
  const imagem = lt ? lt.imagem : meta?.imagem;
  const meta_: Record<string, unknown> = { title: titulo, robots: { index: false } };
  if (descricao) meta_.description = descricao;
  // Favicon: o definido à mão manda; senão cai na foto de perfil do bot — que é
  // o que o visitante já vê no topo do chat, então a aba fica coerente sem
  // precisar configurar nada.
  const icone = lt ? lt.favicon : meta?.favicon || bot?.theme.fotoUrl;
  if (icone) meta_.icons = { icon: icone };
  meta_.openGraph = {
    title: titulo,
    ...(descricao ? { description: descricao } : {}),
    ...(imagem ? { images: [{ url: imagem }] } : {}),
  };
  return meta_;
}
