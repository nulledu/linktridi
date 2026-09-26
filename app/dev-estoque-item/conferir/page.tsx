// TEMPORÁRIO — banco de provas da aba "Conferir" do Estoque, pra medir 320px,
// alvo de toque e os dois temas sem passar por login (credencial não se digita
// aqui). Mora sob `/dev-estoque-item` de propósito: esse prefixo JÁ está em
// `DEV_ONLY_PREFIXES` no middleware, então a rota nasce pública fora de
// produção sem precisar registrar nada novo.
import { notFound } from "next/navigation";
import { Prova } from "./Prova";

export const dynamic = "force-dynamic";

export default async function DevEstoqueConferir({ searchParams }: { searchParams: Promise<{ qc?: string }> }) {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só torna a rota PÚBLICA
  // fora de produção — não a faz sumir. É este 404 que a remove em produção.
  if (process.env.NODE_ENV === "production") notFound();
  const { qc } = await searchParams;
  return <Prova qcDesligado={qc === "off"} />;
}
