import { redirect } from "next/navigation";
import { contextoFinanceiro } from "../../contexto";
import { contatoCanonicoDoFornecedor } from "@/lib/financeiro/db";

export const dynamic = "force-dynamic";

/**
 * Compatibilidade para favoritos e links antigos de fornecedores.
 *
 * Fornecedor virou um papel da identidade em Contatos e empresas. Quando o
 * link antigo traz o id da extensão, resolvemos o contato canônico antes de
 * redirecionar; links já migrados continuam chegando ao mesmo registro.
 */
export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string | string[] }>;
}) {
  const { escopo } = await contextoFinanceiro("cadastros");
  const editar = (await searchParams).editar;
  const editarLegado = Array.isArray(editar) ? editar[0] : editar;

  if (!editarLegado) redirect("/financeiro/cadastros/contatos?papel=fornecedor");

  const resolucao = await contatoCanonicoDoFornecedor(escopo, editarLegado);
  const contatoCanonico = resolucao.dados ?? editarLegado;
  redirect(`/financeiro/cadastros/contatos?papel=fornecedor&editar=${encodeURIComponent(contatoCanonico)}`);
}
