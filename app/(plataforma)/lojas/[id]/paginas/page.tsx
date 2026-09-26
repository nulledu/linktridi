import { notFound } from "next/navigation";
import { fonteLoja, fonteProdutos } from "@/lib/lojas-fonte";
import { caminhoProduto } from "@/lib/lojas";
import { blocosDisponiveis, listarPaginas } from "@/lib/lojas-conteudo-db";
import { colecoesDaLoja } from "@/lib/vitrine/colecoes";
import { AvisoDemo } from "../../AvisoDemo";
import { PaginasClient } from "./PaginasClient";

export const dynamic = "force-dynamic";

// Páginas institucionais da vitrine. A vitrine já sabia desenhar o template
// `pagina` desde o porte do tema; o que faltava era o cadastro.
export default async function PaginasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dados: loja, demo } = await fonteLoja(id);
  if (!loja) notFound();

  // Sem o SQL rodado a tela abre e AVISA. Zero páginas e "tabela não existe"
  // parecem a mesma coisa na tela e são coisas bem diferentes pra quem está
  // esperando o conteúdo aparecer na loja.
  // As duas idas ao banco saem juntas: em série a tela paga 250–700 ms a mais
  // por nada, e o construtor não abre antes das duas.
  const [paginas, comBlocos, fonte] = await Promise.all([
    listarPaginas(id).catch(() => null),
    blocosDisponiveis().catch(() => false),
    fonteProdutos(id),
  ]);

  // O que os botões dos blocos podem apontar. Sai do catálogo JÁ carregado da
  // loja — a mesma lista que a tela de Navegação monta, sem esquema novo.
  const produtos = fonte.dados ?? [];
  const colecoes = colecoesDaLoja(produtos).map((c) => ({ handle: c.handle, titulo: c.titulo }));
  const catalogo = {
    destinos: [
      { grupo: "Loja", itens: [
        { titulo: "Página inicial", destino: "/" },
        { titulo: "Todos os produtos", destino: "/c" },
        { titulo: "Carrinho", destino: "/carrinho" },
      ] },
      { grupo: "Categorias", itens: colecoes.map((c) => ({ titulo: c.titulo, destino: `/c/${c.handle}` })) },
      { grupo: "Produtos", itens: produtos.slice(0, 60).map((p) => ({ titulo: p.titulo, destino: `/${caminhoProduto(p)}` })) },
      { grupo: "Páginas", itens: (paginas ?? []).map((p) => ({ titulo: p.titulo, destino: `/p/${p.handle}` })) },
    ].filter((g) => g.itens.length),
    colecoes,
    produtos: produtos.slice(0, 200).map((p) => ({ id: p.id, titulo: p.titulo })),
  };

  return (
    <>
      {demo && <AvisoDemo />}
      <PaginasClient
        lojaId={id}
        slug={loja.slug}
        paginas={paginas ?? []}
        disponivel={paginas !== null}
        comBlocos={comBlocos}
        catalogo={catalogo}
      />
    </>
  );
}
