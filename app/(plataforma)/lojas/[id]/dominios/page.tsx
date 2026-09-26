import { notFound } from "next/navigation";
import { fonteLoja } from "@/lib/lojas-fonte";
import { DominiosClient } from "../../dominios/DominiosClient";
import { dadosDeDominios } from "../../dominios/page";

export const dynamic = "force-dynamic";

/**
 * Os endereços, vistos de dentro de uma loja.
 *
 * Antes esta rota REDIRECIONAVA pra `/lojas/dominios`, que era um "em breve" —
 * clicar em "Domínios" na barra da loja levava a um aviso de recurso futuro
 * sobre um recurso que já existia, escondido no passo 1 de Configurações.
 *
 * O cadastro continua sendo do SISTEMA (o mesmo host não pode estar apontado em
 * dois lugares sem um saber do outro), então é a MESMA tela — só começa
 * filtrada nesta loja, com um botão pra ver todos.
 */
export default async function DominiosDaLojaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ dados: loja }, d] = await Promise.all([fonteLoja(id), dadosDeDominios()]);
  if (!loja) notFound();

  return (
    <DominiosClient
      dominios={d.dominios}
      lojas={d.lojas}
      lojaAtual={{ id: loja.id, nome: loja.nome, publicada: loja.status === "publicada" }}
      podeEscrever={d.podeEscrever}
    />
  );
}
