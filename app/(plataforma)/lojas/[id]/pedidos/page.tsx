import { notFound } from "next/navigation";
import { fonteLoja, fontePedidos } from "@/lib/lojas-fonte";
import { AvisoDemo } from "../../AvisoDemo";
import { PedidosClient } from "./PedidosClient";

export default async function PedidosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Mesma razão de produtos/page.tsx: os pedidos dependem só do id da URL.
  const [{ dados: loja }, { dados: pedidos, demo }] = await Promise.all([fonteLoja(id), fontePedidos(id)]);
  if (!loja) notFound();
  return (
    <>
      {demo && <AvisoDemo />}
      <PedidosClient pedidos={pedidos} />
    </>
  );
}
