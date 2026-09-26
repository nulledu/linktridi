import { redirect } from "next/navigation";
import { requireRh, semPermissaoDoRh } from "@/lib/rh/gate";

export const dynamic = "force-dynamic";

/**
 * `/rh` não tem tela própria: o módulo COMEÇA nos colaboradores.
 *
 * Uma "visão geral do RH" acima da visão geral dos colaboradores seria um
 * degrau a mais para chegar na mesma informação — os números do topo da lista
 * já são o retrato da equipe. Quando Currículos e Calendário tiverem conteúdo,
 * a decisão se revisita; hoje um painel de entrada mostraria os mesmos cinco
 * números com um clique a mais.
 *
 * Quem não tem `rh:ver` (só o Calendário, digamos) cai na porta que tem, em vez
 * de numa tela de "sem permissão" que ele não precisava ver.
 */
export default async function RhPage() {
  const { poderes } = await requireRh();
  if (poderes.ver) redirect("/rh/colaboradores");
  if (poderes.calendario) redirect("/rh/calendario");
  if (poderes.curriculos) redirect("/rh/curriculos");
  redirect(semPermissaoDoRh("ver"));
}
