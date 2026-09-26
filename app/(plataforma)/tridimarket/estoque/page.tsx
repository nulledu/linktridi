import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// A aba Estoque foi absorvida por Produtos. O redirect fica: o endereço está
// em link salvo, em atalho do navegador e no histórico de quem usa todo dia —
// um 404 aqui pareceria que o estoque sumiu do sistema.
export default function EstoquePage() {
  redirect("/tridimarket/produtos");
}
