import { NextRequest, NextResponse } from "next/server";
import { getLojaPublicaPorSlug, listProdutosPublicos } from "@/lib/lojas-db";
import { caminhoProduto, linkDeCompra, precoVigente } from "@/lib/lojas";
import { encaminharGet, modoRemoto } from "@/lib/player-remoto";

export const dynamic = "force-dynamic";

// PÚBLICO — o catálogo que a Central de Tutoriais mostra.
//
// Devolve o MESMO que a vitrine já entrega a qualquer visitante (título, foto,
// preço e o link de compra). O link de compra sai pronto daqui porque a regra
// é da LOJA, não da central: quem fecha por WhatsApp recebe o `wa.me` com o
// item escrito; quem tem carrinho próprio recebe a página do produto, que é
// onde o carrinho e o checkout moram.
const LIMITE = 60;

export async function GET(req: NextRequest) {
  if (modoRemoto()) return encaminharGet(req, "/api/f/catalogo");
  const slug = (req.nextUrl.searchParams.get("loja") || "").slice(0, 200);
  if (!slug) return NextResponse.json({ produtos: [] });

  const loja = await getLojaPublicaPorSlug(slug).catch(() => null);
  if (!loja) return NextResponse.json({ produtos: [] });

  const produtos = (await listProdutosPublicos(loja.id).catch(() => []))
    .filter((p) => p.status === "ativo")
    .slice(0, LIMITE)
    .map((p) => {
      const preco = precoVigente(p);
      const pagina = `/l/${loja.slug}/p/${caminhoProduto(p)}`;
      const compra = linkDeCompra(loja, p);
      return {
        id: p.id, titulo: p.titulo, preco,
        // Só quando há desconto de verdade: "de/por" com o mesmo valor é ruído.
        precoDe: p.precoPromocional && p.preco > preco ? p.preco : null,
        imagemUrl: p.imagens?.[0]?.url ?? "",
        paginaHref: pagina,
        comprarHref: compra.href,
        // Diz ao cartão se o botão sai do site (aba nova) ou continua nele.
        comprarPeloZap: compra.peloZap,
      };
    });

  return NextResponse.json({ loja: { nome: loja.nome, slug: loja.slug }, produtos });
}
