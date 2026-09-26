import { notFound } from "next/navigation";
import { fonteLoja, fontePedidos } from "@/lib/lojas-fonte";
import { hojeISO } from "@/lib/financeiro/calculos";
import { agruparClientes, resumoDeClientes } from "@/lib/lojas-clientes";
import { AvisoDemo } from "../../AvisoDemo";
import { ClientesClient } from "./ClientesClient";

export const dynamic = "force-dynamic";

// Clientes: quem comprou, quanto e quando.
//
// Não há cadastro de cliente, e não vai haver — quem compra numa vitrine
// pública não faz conta. A lista é DEDUZIDA dos pedidos, e o agrupamento (o
// pedaço que erra em silêncio) mora em `lib/lojas-clientes.ts`, testado.
export default async function ClientesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dados: loja } = await fonteLoja(id);
  if (!loja) notFound();

  const { dados: pedidos, demo } = await fontePedidos(id);
  const clientes = agruparClientes(pedidos);
  const hoje = hojeISO();

  return (
    <>
      {demo && <AvisoDemo />}
      <ClientesClient
        clientes={clientes}
        resumo={resumoDeClientes(clientes, hoje)}
        hoje={hoje}
        truncado={pedidos.length >= 200}
      />
    </>
  );
}
