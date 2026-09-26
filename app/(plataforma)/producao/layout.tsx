import type { ReactNode } from "react";
import { requireModuleKeys } from "@/lib/require-auth";
import { ProducaoCasca } from "./ProducaoCasca";

/**
 * Produção = uma Visão geral (o cockpit) + quatro subáreas que aprofundam
 * cada bloco dela. A casca (cabeçalho + navegação interna) mora aqui pra que
 * as cinco rotas pareçam uma tela só com cinco zooms, não cinco módulos.
 *
 * As sub-permissões antigas das abas continuam mandando: `producao:status`
 * abre Status, `producao:controle` abre Controle agora, `producao:dia`
 * (pedidos do dia) abre Programações. Máquinas é de todo mundo do módulo —
 * é onde o operador marca "em andamento" e "feita".
 */
export default async function ProducaoLayout({ children }: { children: ReactNode }) {
  const { keys } = await requireModuleKeys("producao");
  const perms = {
    status: keys.includes("producao:status"),
    controle: keys.includes("producao:controle"),
    programacoes: keys.includes("producao:dia"),
    operacao: keys.includes("estoque"),
  };
  return <ProducaoCasca perms={perms}>{children}</ProducaoCasca>;
}
