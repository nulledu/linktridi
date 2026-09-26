import { notFound } from "next/navigation";
import { requireModule } from "@/lib/require-auth";
import { fonteLoja, fonteProdutos } from "@/lib/lojas-fonte";
import { PreviaClient } from "./PreviaClient";

export const dynamic = "force-dynamic";

// A prévia do editor de aparência, servida DENTRO de um `<iframe>`.
//
// Ela mora fora de `(plataforma)` de propósito: dentro, herdaria o shell do
// módulo — sidebar, cabeçalho, tokens do ERP — e a prévia mostraria a loja
// dentro do painel. Fora, é uma página nua onde o `theme.css` pode mandar em
// `html` e `body` sem encostar no sistema.
//
// Por estar fora de `(plataforma)`, o gate de sessão NÃO vem do layout: ele é
// esta linha. Sem ela a prévia de qualquer loja abriria pra quem tivesse o
// link — é a mesma armadilha das rotas `/dev-*`.
export default async function PreviaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("lojas");
  const { id } = await params;
  const { dados: loja } = await fonteLoja(id);
  if (!loja) notFound();
  const { dados: produtos } = await fonteProdutos(id);
  return <PreviaClient loja={loja} produtos={produtos} />;
}
