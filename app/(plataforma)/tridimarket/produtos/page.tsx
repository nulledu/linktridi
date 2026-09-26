import { ProdutosClient } from "./ProdutosClient";

export const dynamic = "force-dynamic";

// Produtos e Estoque viraram uma tela só: a lista é a mesma e quem confere
// preço é quem repõe. O estoque é escolhido por empresa dentro do ajuste.
export default function ProdutosPage() {
  return <ProdutosClient />;
}
