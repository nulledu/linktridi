"use client";

import type { ReactNode } from "react";
import { CascaModulo, type AcaoRapida, type Subarea } from "../ui/CascaModulo";
import "../producao/producao.css";
import "./design.css";

/**
 * Design é um painel de GESTÃO: uma tela só, sem abas. Quem abre quer ver o
 * estado do setor, não produzir arte — as telas de trabalho (kanban,
 * biblioteca, programação) saíram do módulo (ver `_guardado/LEIA-ME.md`).
 * "Equipe" é a única outra rota, e abre pelo atalho do painel.
 */
export const SUBAREAS_DESIGN: Subarea[] = [
  { valor: "geral", rotulo: "Visão geral", href: "/design", icone: "layout-grid", titulo: "Design", sub: "O estado do setor: o que entra, o que está parado, o que trava e quanto tempo leva." },
  // Fora da fileira: abre pelo atalho do painel. Duas abas pra um módulo de
  // uma tela só seriam duas abas sem motivo.
  { valor: "equipe", rotulo: "Equipe", href: "/design/equipe", icone: "users", titulo: "Desempenho da equipe", sub: "Artes, contornos, aprovações e reprovações por pessoa.", naAba: false },
];

export function DesignCasca({ children, rota }: { children: ReactNode; rota?: string }) {
  const acoes: AcaoRapida[] = [
    { id: "eqp", rotulo: "Desempenho por pessoa", icone: "users", href: "/design/equipe" },
    { id: "atv", rotulo: "Distribuir tarefa do setor", icone: "list-check", href: "/atividades" },
    { id: "prd", rotulo: "Produção (o que já aprovou)", icone: "tools", href: "/producao" },
  ];
  return (
    <CascaModulo modulo="do Design" icone="palette" subareas={SUBAREAS_DESIGN} acoes={acoes} rota={rota} className="pv dv">
      {children}
    </CascaModulo>
  );
}
