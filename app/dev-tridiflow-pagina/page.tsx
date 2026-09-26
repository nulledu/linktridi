import { notFound } from "next/navigation";
import { templatePaginaPorId } from "@/lib/tridiflow-pagina-templates";
import { PAGINA_VAZIA, mapPagina, type Animacao } from "@/lib/tridiflow-pagina";
import { linkDePreview } from "@/lib/tridiflow-site-maindx";
import { DevPaginaClient } from "./DevPaginaClient";

// Preview de DESENVOLVIMENTO do construtor de páginas: renderiza os componentes
// REAIS (editor e página) com um template de exemplo, SEM login e SEM banco.
// Existe para conferir o visual de fato — um mock à parte sempre acaba
// divergindo do componente que roda em produção.
// 404 em produção; o middleware só libera /dev-* fora de produção.
//
// ?tela=editor (padrão) | pagina | lista   ·   ?t=vsl|captura|venda|obrigado|branco
// ?anim=<animação>  liga a animação em TODOS os blocos — serve pra conferir que
// nada fica invisível quando o gatilho de entrada não dispara (bloco mais alto
// que a tela, API bloqueada, aba em segundo plano).
export const dynamic = "force-dynamic";

export default async function DevPaginaPage({ searchParams }: { searchParams: Promise<{ tela?: string; t?: string; anim?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tela, t, anim } = await searchParams;
  // O documento é montado UMA vez, no servidor, e desce como prop. Gerar o
  // template no cliente também produziria ids diferentes dos do HTML servido
  // (hydration mismatch). Em produção o doc vem do banco, com ids fixos —
  // aqui a gente reproduz esse mesmo contrato.
  const tpl = templatePaginaPorId(t ?? "vsl");
  const base = tpl?.doc ?? PAGINA_VAZIA;
  const comAnim = anim ? mapPagina(base, (b) => ({ ...b, estilo: { ...b.estilo, animacao: anim as Animacao } })) : base;
  // Site com várias páginas (Maindx): os links `/p/<slug>` não existem aqui
  // sem banco, então apontam pro próprio preview de cada template.
  const paraPreview = (id: string) => `/dev-tridiflow-pagina?tela=${tela ?? "editor"}&t=${id}`;
  const doc = mapPagina(comAnim, (b) => ({
    ...b,
    url: b.tipo === "botao" ? linkDePreview(b.url, paraPreview) : b.url,
    rodape: b.rodape && {
      ...b.rodape,
      colunas: b.rodape.colunas.map((c) => ({ ...c, links: c.links.map((l) => ({ ...l, url: linkDePreview(l.url, paraPreview) ?? l.url })) })),
    },
    cabecalho: b.cabecalho && {
      ...b.cabecalho,
      urlBotao: linkDePreview(b.cabecalho.urlBotao, paraPreview),
      links: b.cabecalho.links.map((l) => ({
        ...l,
        url: linkDePreview(l.url, paraPreview) ?? l.url,
        filhos: l.filhos?.map((f) => ({ ...f, url: linkDePreview(f.url, paraPreview) ?? f.url })),
      })),
    },
  }));
  return <DevPaginaClient tela={tela ?? "editor"} doc={doc} nome={tpl?.nome ?? "Página"} />;
}
