import { notFound } from "next/navigation";
import { fonteLoja, fonteProdutos } from "@/lib/lojas-fonte";
import { listarMenus, listarPaginas } from "@/lib/lojas-conteudo-db";
import { colecoesDaLoja } from "@/lib/vitrine/colecoes";
import type { Pagina } from "@/lib/lojas-conteudo";
import { AvisoDemo } from "../../AvisoDemo";
import { NavegacaoClient } from "./NavegacaoClient";

export const dynamic = "force-dynamic";

// Navegação: os menus do cabeçalho e do rodapé da vitrine.
//
// As sugestões de destino (coleções e páginas) vêm prontas do servidor. Sem
// elas, montar um menu seria digitar caminho na mão e descobrir o erro de
// digitação depois, na loja no ar.
export default async function NavegacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dados: loja, demo } = await fonteLoja(id);
  if (!loja) notFound();

  const [menus, paginas, { dados: produtos }] = await Promise.all([
    listarMenus(id).catch(() => null),
    listarPaginas(id).catch(() => []),
    fonteProdutos(id),
  ]);

  return (
    <>
      {demo && <AvisoDemo />}
      <NavegacaoClient
        lojaId={id}
        slug={loja.slug}
        menus={menus ?? []}
        disponivel={menus !== null}
        destinos={[
          { grupo: "Loja", itens: [{ titulo: "Página inicial", destino: "/" }, { titulo: "Todas as coleções", destino: "/c" }, { titulo: "Carrinho", destino: "/carrinho" }] },
          { grupo: "Coleções", itens: colecoesDaLoja(produtos).map((c) => ({ titulo: c.titulo, destino: `/c/${c.handle}` })) },
          { grupo: "Páginas", itens: paginas.map((p: Pagina) => ({ titulo: p.titulo, destino: `/p/${p.handle}` })) },
        ]}
      />
    </>
  );
}
