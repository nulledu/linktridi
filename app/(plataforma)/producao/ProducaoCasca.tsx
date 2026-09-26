"use client";

import type { ReactNode } from "react";
import { CascaModulo, type AcaoRapida } from "../ui/CascaModulo";
import "./producao.css";

/**
 * A casca da Produção: cabeçalho + a navegação INTERNA (Visão geral · Status ·
 * Controle agora · Máquinas · Programações).
 *
 * As quatro subáreas não são módulos: são zooms da mesma Produção. Por isso
 * dividem o cabeçalho (mesmo ícone, mesma data, mesmas ações rápidas) e só o
 * título muda — quem troca de subárea continua sabendo que está na Produção.
 * A Visão geral é a primeira e a casa: é o que abre ao clicar em Produção.
 */
export interface PermsProducao { status: boolean; controle: boolean; programacoes: boolean; operacao: boolean }

export const SUBAREAS = [
  { valor: "geral", rotulo: "Visão geral", href: "/producao", icone: "layout-grid", titulo: "Produção", sub: "Acompanhe o andamento das produções, máquinas e o desempenho da operação." },
  { valor: "status", rotulo: "Status", href: "/producao/status", icone: "chart-bar", titulo: "Status da Produção", sub: "O andamento das produções e o estado de cada etapa.", perm: "status" },
  { valor: "controle", rotulo: "Controle agora", href: "/producao/controle", icone: "layout-kanban", titulo: "Controle agora", sub: "O que está acontecendo neste momento, peça por peça.", perm: "controle" },
  { valor: "maquinas", rotulo: "Máquinas", href: "/producao/maquinas", icone: "settings", titulo: "Máquinas", sub: "Status, uso e desempenho das máquinas em tempo real." },
  { valor: "programacoes", rotulo: "Programações", href: "/producao/programacoes", icone: "calendar", titulo: "Programações", sub: "O que está previsto e como a produção está se organizando.", perm: "programacoes" },
] as const;

export function ProducaoCasca({ perms, children, rota }: { perms: PermsProducao; children: ReactNode; rota?: string }) {
  const subareas = SUBAREAS.filter((s) => !("perm" in s) || perms[s.perm]).map(({ valor, rotulo, href, icone, titulo, sub }) => ({ valor, rotulo, href, icone, titulo, sub }));
  const acoes = [
    perms.controle && { id: "ctl", rotulo: "Controle agora", icone: "layout-kanban", href: "/producao/controle" },
    { id: "maq", rotulo: "Operar máquinas", icone: "settings", href: "/producao/maquinas#operar" },
    perms.programacoes && { id: "prog", rotulo: "Ver programação do dia", icone: "calendar", href: "/producao/programacoes" },
    perms.operacao && { id: "gal", rotulo: "App do galpão", icone: "barcode", href: "/operacao" },
  ].filter(Boolean) as AcaoRapida[];
  return (
    <CascaModulo modulo="da Produção" icone="tools" subareas={subareas} acoes={acoes} rota={rota} className="pv">
      {children}
    </CascaModulo>
  );
}
