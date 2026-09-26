import { notFound } from "next/navigation";
import { Loja } from "../../tema/Loja";
import { registrarVisualizacao } from "../registrar";
import { contextoDa, dadosDaLoja } from "../dados";
import { AdicionarPelaUrl } from "../../AdicionarPelaUrl";

export const dynamic = "force-dynamic";

// O carrinho vive no `localStorage` do visitante — o servidor não sabe o que
// tem nele. Esta página é só o esqueleto da loja; a seção do carrinho monta a
// lista no navegador. Por isso não entra em buscador.
export const metadata = { title: "Carrinho", robots: { index: false, follow: false } };

export default async function CarrinhoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dados = await dadosDaLoja(slug).catch(() => null);
  if (!dados) notFound();
  await registrarVisualizacao(dados.loja.id, "carrinho", `/l/${slug}/carrinho`);

  return <>
    {/* `?add=<produto>`: o botão de compra de fora da vitrine (Central de
        Tutoriais) manda direto pro checkout com o item já na sacola. */}
    <AdicionarPelaUrl lojaId={dados.loja.id} produtos={dados.produtos} />
    <Loja ctx={contextoDa(dados, "carrinho")} />
  </>;
}
