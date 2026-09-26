"use client";

import { Abas } from "../ui/Abas";
import { rotaAtiva, type NavItem } from "@/lib/rbac";

/**
 * A navegação INTERNA da Operação: Visão geral · Atividades · Produção ·
 * Estoque · Logística.
 *
 * Na barra lateral a Operação é um item só (o `hub` do grupo Operacional em lib/rbac.ts) —
 * as quatro áreas são um fluxo (falta insumo → produz → alguém executa →
 * entra no estoque → sai na logística), não quatro sistemas. Quem troca de
 * uma pra outra troca aqui, no topo da tela.
 *
 * Mora no Shell, FORA do wrapper com `key={pathname}`: assim a fileira não
 * remonta a cada navegação e a pílula do `<Abas>` desliza de uma área pra
 * outra. As abas são as áreas que a pessoa TEM — o hub já chega filtrado
 * pela grade de permissões.
 */
export function OperacaoAbas({ pathname, nav }: { pathname: string; nav: NavItem[] }) {
  const grupo = nav.find((i) => i.type === "group" && i.hub);
  const hub = grupo?.type === "group" ? grupo.hub : undefined;
  if (!hub) return null;
  const atual = rotaAtiva(pathname, hub.modulo.href) ? "geral" : hub.areas.find((c) => rotaAtiva(pathname, c.href))?.key;
  if (!atual) return null;
  const itens = [
    { valor: "geral", rotulo: "Visão geral", href: hub.modulo.href },
    ...hub.areas.map((c) => ({ valor: c.key, rotulo: c.label, href: c.href })),
  ];
  return (
    <div style={{ marginBottom: 18, minWidth: 0 }}>
      <Abas itens={itens} valor={atual} ariaLabel="Áreas da Operação" />
    </div>
  );
}
