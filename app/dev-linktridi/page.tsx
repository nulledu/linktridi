import { notFound } from "next/navigation";
import type { LinkTridiDoc } from "@/lib/tridiflow-linktridi";
import { DevLinkTridiClient } from "./DevLinkTridiClient";

// Banco de provas do LinkTridi: monta os componentes REAIS (runtime público e
// editor) com um doc de exemplo, SEM login e SEM banco — é onde o celular e o
// `npm run rolagem` conferem a tela. 404 em produção; o middleware só libera
// /dev-* fora de produção.
//
// ?tela=pagina (padrão) | editor · ?leitura=1 mostra o editor sem a chave
// `tridiflow:linktridi` (formulário inerte), que é o que quem só tem
// "projetos" enxerga.
export const dynamic = "force-dynamic";

// Doc montado no servidor com ids FIXOS (uidLT é aleatório e produziria
// hydration mismatch) — em produção os ids vêm do banco, mesmo contrato.
const DOC: LinkTridiDoc = {
  versao: 1,
  perfil: {
    nome: "Tridi Gaia", bio: "Produtos favoritos e links exclusivos.\nEntrega pra todo o Brasil.",
    avatarUrl: "", halo: true, verificado: true, formatoLogo: "quadrado", mostrarMarca: true, zapFlutuante: true,
    tituloSecao: "Toque num produto pra comprar direto no site oficial.",
    tamanhoTituloSecao: "md", mostrarSocial: true,
    social: { instagram: "https://instagram.com/tridi", tiktok: "https://tiktok.com/@tridi", whatsapp: "https://wa.me/5511999999999" },
  },
  cores: { fundo: "#FFFFFF", cartao: "#FAFAFC", destaque: "#7C3AED", cta: "#7C3AED", preco: "#17803D", badge: "#FF6000", formas: true },
  posts: [
    { id: "p1", tipo: "imagem", mediaUrl: "", destinoUrl: "https://example.com/kit", titulo: "Kit Completo de Lançamento", tamanhoTitulo: "md", badge: "Mais vendido", prefixo: "Kit completo", preco: 197.9, precoDe: 297.9, sufixo: "7 dias de garantia ou seu dinheiro de volta", avaliacaoNota: 4.9, avaliacaoQtd: 312, parcelas: 3, cta: "Comprar agora", destaque: true, publicado: true },
    { id: "p2", tipo: "imagem", mediaUrl: "", destinoUrl: "https://example.com/curso", titulo: "Curso do Zero ao Primeiro Pedido", tamanhoTitulo: "md", preco: 97, cta: "Quero o curso", publicado: true },
    { id: "p3", formato: "botao", tipo: "imagem", mediaUrl: "", destinoUrl: "https://chat.whatsapp.com/exemplo", titulo: "Entrar no grupo VIP do WhatsApp", publicado: true },
    { id: "p4", tipo: "imagem", mediaUrl: "", destinoUrl: "https://example.com/oculto", titulo: "Rascunho oculto", publicado: false },
  ],
};

// ?status=rascunho mostra o editor de um LinkTridi que ainda não foi publicado
// (o padrão é "no ar", o caso em que salvar já muda o link).
export default async function DevLinkTridiPage({ searchParams }: { searchParams: Promise<{ tela?: string; leitura?: string; status?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tela, leitura, status } = await searchParams;
  return <DevLinkTridiClient tela={tela === "editor" ? "editor" : "pagina"} doc={DOC} leitura={leitura === "1"}
    status={status === "rascunho" ? "rascunho" : "publicado"} />;
}
