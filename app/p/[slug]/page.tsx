import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { resolverPaginaPublicada } from "@/lib/player-remoto";
import { varsDaUrl } from "@/lib/tridiflow-pagina-runtime";
import { urlSegura } from "@/lib/tridiflow-pagina-estilo";
import { COOKIE_AB, ehVariante, sortearVariante } from "@/lib/tridiflow-ab";
import { PaginaClient } from "./PaginaClient";
import { cartaoDoTutorial, ehCentralTutoriais, normalizarCentralTutoriais, resumoDoProduto, urlPublicaSegura, type CentralTutoriaisDoc } from "@/lib/tridiflow-tutoriais";
import { CentralTutoriais } from "./CentralTutoriais";

// PÁGINA PÚBLICA (landing / VSL) — destino do anúncio.
// Mesma estratégia do player de fluxo (/f/[slug]): SSR sem cache, resolve por
// (host, slug), e o conteúdo vem do SNAPSHOT publicado — nunca do rascunho.
export const dynamic = "force-dynamic";

async function resolver(slug: string) {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0];
  return resolverPaginaPublicada(host, slug);
}

/** Origem de quem pediu (`https://<host>`). A prévia do link no WhatsApp e no
 *  Instagram só busca endereço ABSOLUTO — og:image relativo sai sem foto.
 *  Proxy encadeado junta vários hosts no cabeçalho: vale o primeiro. */
async function origemPublica(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
  return host ? `https://${host}` : "";
}

/** Só http(s) absoluto vira og:image: caminho relativo ganha a origem, e
 *  `data:`/`mailto:` ficam de fora — prévia sem foto é melhor que foto quebrada. */
function urlAbsoluta(valor: string, origem: string): string | undefined {
  const u = urlPublicaSegura(valor);
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/") && origem) return `${origem}${u}`;
  return undefined;
}

/** Foto do cartão "Todos" ou a primeira capa, na ordem em que a própria
 *  página mostra os guias (destaque primeiro). */
function imagemDaCentral(central: CentralTutoriaisDoc, origem: string): string | undefined {
  const capas = central.tutoriais.filter((t) => t.status === "publicado" && t.capaUrl)
    .sort((a, b) => Number(b.destaque) - Number(a.destaque) || a.ordem - b.ordem)
    .map((t) => t.capaUrl);
  for (const candidata of [central.todosImagemUrl, ...capas]) {
    const url = urlAbsoluta(candidata, origem);
    if (url) return url;
  }
  return undefined;
}

/** O cartão que aparece quando alguém cola o link da central no WhatsApp.
 *  Descrição curta (~80) porque o cartão corta em duas linhas: o subtítulo
 *  inteiro sairia pela metade no meio de uma palavra. O corte por palavra do
 *  resumo de produto serve igual aqui. */
function metadadoDaCentral(central: CentralTutoriaisDoc, nome: string, slug: string, origem: string): Metadata {
  const titulo = central.titulo || nome;
  const descricao = central.subtitulo ? resumoDoProduto(central.subtitulo, 80) : undefined;
  const imagem = imagemDaCentral(central, origem);
  // Sem query: `?c=` é a gaveta aberta de quem compartilhou, não outra página.
  const url = origem ? `${origem}/p/${encodeURIComponent(slug)}` : undefined;
  return {
    title: titulo,
    description: central.subtitulo,
    robots: { index: false, follow: false },
    openGraph: { type: "website", title: titulo, description: descricao, url, images: imagem ? [{ url: imagem }] : undefined },
    twitter: { card: "summary_large_image", title: titulo, description: descricao, images: imagem ? [imagem] : undefined },
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await resolver(slug).catch(() => null);
  if (!p) return { title: "Página", robots: { index: false } };
  const cfg = p.pagina.config ?? {};
  if (ehCentralTutoriais(cfg)) {
    return metadadoDaCentral(normalizarCentralTutoriais(cfg.centralTutoriais), p.nome, slug, await origemPublica());
  }
  const titulo = cfg.tituloSeo || p.nome;
  // Sanitizada como toda URL do documento — e data:image não vira og:image
  // (WhatsApp/Meta só buscam http/https).
  const imagemOg = urlSegura(cfg.imagemOgUrl);
  return {
    title: titulo,
    description: cfg.descricaoSeo,
    // Landing de campanha não deve competir com o site no orgânico.
    robots: { index: false, follow: false },
    icons: cfg.faviconUrl ? [{ url: cfg.faviconUrl }] : undefined,
    openGraph: { title: titulo, description: cfg.descricaoSeo, images: imagemOg ? [{ url: imagemOg }] : undefined },
  };
}

export default async function PaginaPublica(
  { params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const { slug } = await params;
  const [pagina, busca] = await Promise.all([resolver(slug).catch(() => null), searchParams]);

  if (!pagina) {
    return (
      <main style={{
        minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24,
        background: "#0b0b0f", color: "#fff",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <strong style={{ fontSize: 17, display: "block" }}>Este link não está disponível.</strong>
          <span style={{ fontSize: 13.5, opacity: 0.65, display: "block", marginTop: 6 }}>
            A página pode ter sido despublicada ou o endereço está errado.
          </span>
        </div>
      </main>
    );
  }

  const cfg = pagina.pagina.config ?? {};
  if (ehCentralTutoriais(cfg)) {
    const central = normalizarCentralTutoriais(cfg.centralTutoriais);
    // Só o RESUMO de cada guia publicado atravessa pro cliente. Com o
    // tutorial inteiro, o conteúdo de todos os guias ia no HTML da central
    // só pra desenhar cartões.
    const cartoes = central.tutoriais.filter((t) => t.status === "publicado").map(cartaoDoTutorial);
    // Categoria OCULTA atravessa só com o id — é o que o cliente usa pra não
    // jogar em "Outros" o guia de uma gaveta escondida. Com nome e foto, a
    // gaveta que alguém tirou do ar (ainda em preparo) saía no código da página.
    const categorias = central.categorias.map((c) => c.ativa ? c : { ...c, nome: "", imagemUrl: "" });
    const estilo = {
      "--color-background": cfg.corFundo || "#ffffff",
      "--color-text": cfg.corTexto || "#111114",
      "--color-text-muted": `color-mix(in srgb, ${cfg.corTexto || "#111114"} 62%, transparent)`,
      "--color-primary": cfg.corPrimaria || "var(--primary-texto)",
      "--color-primary-contrast": "#ffffff",
    } as React.CSSProperties;
    return <main style={estilo}><CentralTutoriais titulo={central.titulo} subtitulo={central.subtitulo} sobrelinha={central.sobrelinha} mostrarTitulo={central.mostrarTitulo} catalogoLoja={central.catalogoLoja} catalogoRotulo={central.catalogoRotulo} slug={slug} categorias={categorias} tutoriais={cartoes} atalhos={central.atalhos} todosImagemUrl={central.todosImagemUrl} todosRotulo={central.todosRotulo} whatsapp={central.whatsapp} reels={central.reels} depoimentos={central.depoimentos} /></main>;
  }

  // As variáveis de `{{merge}}` são lidas AQUI, no servidor, e não no cliente.
  // Lidas no cliente, o primeiro render (SSR) sairia com a tag crua e o segundo
  // com o valor: divergência de hidratação, e um piscar de "{{nome}}" na cara
  // de quem chegou pelo anúncio.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(busca ?? {})) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }

  // Versão do teste A/B decidida AQUI, no servidor, pela mesma razão das
  // variáveis acima: escolher no cliente faria o SSR mandar uma versão e a
  // hidratação trocar por outra — divergência, e um piscar da versão errada.
  //
  // Quem já tem cookie mantém a versão: alguém que volta pra página e vê outra
  // headline acha que entrou no lugar errado, e o placar contaria a mesma
  // pessoa nos dois braços.
  const teste = cfg.teste;
  const doCookie = (await cookies()).get(COOKIE_AB)?.value;
  const variante = teste?.ativo
    ? (ehVariante(doCookie) ? doCookie : sortearVariante(teste.pesoA, Math.random()))
    : "a";

  return <PaginaClient pagina={pagina} vars={varsDaUrl(qs.toString())} variante={variante} />;
}
