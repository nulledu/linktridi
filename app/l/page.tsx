import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cached } from "@/lib/cache";
import { getLojaPublicaPorHost } from "@/lib/lojas-db";
import { Vitrine } from "./Vitrine";
import { Loja } from "./tema/Loja";
import { contextoDa, dadosDaLoja } from "./[slug]/dados";
import { registrarVisualizacao } from "./[slug]/registrar";

export const dynamic = "force-dynamic";

/**
 * A vitrine na RAIZ de um domínio próprio.
 *
 * Quem digita `carimbostridi.com.br` cai em `/`, e o middleware reescreve pra
 * cá. A resolução host → loja mora AQUI, e não lá, de propósito: o middleware
 * roda em toda requisição do projeto, e uma ida ao banco dentro dele é
 * exatamente o tempo parado que já pausou o projeto por CPU na Vercel. Aqui a
 * consulta acontece só nesta rota, e ainda passa pelo cache.
 *
 * O host só resolve o SLUG; o resto vem do mesmo `dadosDaLoja` que serve
 * `/l/<slug>`.
 *
 * Antes esta rota montava a vitrine SIMPLES direto, sempre — quem apontasse um
 * domínio próprio para uma loja com tema veria o catálogo cru na raiz e o tema
 * inteiro ao clicar em qualquer link, porque o segundo clique cai em `/l/<slug>`.
 * Duas caras da mesma loja, e nada no painel explicando por quê.
 */
const slugDoHost = (host: string) =>
  cached(`vitrine-host:${host}`, 60_000, async () => {
    const loja = await getLojaPublicaPorHost(host);
    return loja ? loja.slug : null;
  });

const porHost = async (host: string) => {
  const slug = await slugDoHost(host);
  return slug ? dadosDaLoja(slug) : null;
};

const hostDaRequisicao = async () => {
  const h = await headers();
  return (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0].toLowerCase();
};

export async function generateMetadata(): Promise<Metadata> {
  const dados = await porHost(await hostDaRequisicao()).catch(() => null);
  if (!dados) return { title: "Loja não encontrada" };
  const l = dados.loja;
  return {
    title: l.seoTitulo || l.nome,
    description: l.seoDescricao || `Catálogo de ${l.nome}.`,
    // A vitrine é a exceção ao `noindex` do layout raiz — e num domínio próprio
    // ela é a página que MAIS precisa ser encontrada.
    robots: { index: true, follow: true },
    icons: l.faviconUrl ? { icon: l.faviconUrl } : undefined,
  };
}

export default async function VitrineDoDominioPage() {
  // Endereço sem loja ligada (ou ligado a uma loja em rascunho) cai em 404 —
  // que é também o que acontece hoje num domínio de bot sem bot.
  const dados = await porHost(await hostDaRequisicao()).catch(() => null);
  if (!dados) notFound();
  await registrarVisualizacao(dados.loja.id, "inicio", "/");
  if (dados.tema.modelo === "simples") return <Vitrine loja={dados.loja} produtos={dados.produtos} />;
  return <Loja ctx={contextoDa(dados, "inicio")} />;
}
