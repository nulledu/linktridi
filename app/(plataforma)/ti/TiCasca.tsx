"use client";

import type { ReactNode } from "react";
import { CascaModulo, type AcaoRapida, type Subarea } from "../ui/CascaModulo";
import "../producao/producao.css";
import "./ti.css";

/**
 * TI = Visão geral + Roadmaps (o núcleo) + Equipe + Permissões + Infra.
 * Mesma casca da Produção/Design: subárea é zoom do módulo, não outro módulo.
 *
 * Duas absorções (22/09/2026, pedido do dono):
 * · Permissões — o que era RH › Gestão (/rh/gestao): cadastro das contas,
 *   convite de primeiro acesso e a GRADE de permissões (todas as áreas, TI
 *   inclusive). Só pro papel admin, como sempre foi.
 * · Infra — o que era o item "Acessos & Infra" da barra: domínios,
 *   hospedagens, VPS e o Cofre. Abre pela área `infraestrutura`, como sempre.
 *
 * As abas se montam pelas CHAVES da pessoa: quem só tem Infra vê só a Infra;
 * quem só tem TI não vê a Infra. Ninguém ganhou poder na mudança de casa.
 */
const SUBAREAS_TI: Subarea[] = [
  { valor: "geral", rotulo: "Visão geral", href: "/ti", icone: "layout-grid", titulo: "TI", sub: "Projetos de tecnologia: o que anda, o que está atrasado e quem cuida." },
  { valor: "roadmaps", rotulo: "Roadmaps", href: "/ti/roadmaps", icone: "chart-dots", titulo: "Roadmaps", sub: "A evolução de cada projeto, etapa por etapa." },
  { valor: "equipe", rotulo: "Equipe", href: "/ti/equipe", icone: "users", titulo: "Equipe de TI", sub: "Quem tem acesso à área e o que cada pessoa pode fazer." },
  { valor: "permissoes", rotulo: "Permissões", href: "/ti/permissoes", icone: "shield-check", titulo: "Permissões", sub: "Cadastro das contas, acesso ao sistema e os aparelhos pareados." },
  { valor: "infra", rotulo: "Infra", href: "/ti/infraestrutura", icone: "key", titulo: "Acessos & Infra", sub: "Domínios, hospedagens, VPS e o cofre de senhas da empresa." },
];

export function TiCasca({ children, rota, temTi = true, temInfra = true, ehAdmin = true }: {
  children: ReactNode; rota?: string;
  temTi?: boolean; temInfra?: boolean; ehAdmin?: boolean;
}) {
  const subareas = SUBAREAS_TI.filter((s) => {
    if (s.valor === "infra") return temInfra;
    if (s.valor === "permissoes") return ehAdmin;
    return temTi;
  });
  const acoes: AcaoRapida[] = [
    ...(temTi ? [
      { id: "novo", rotulo: "Novo roadmap", icone: "plus", href: "/ti/roadmaps?novo=1" },
      { id: "atra", rotulo: "O que está atrasado", icone: "clock-hour-4", href: "/ti/roadmaps?filtro=atrasados" },
      { id: "tar", rotulo: "Tarefas da Central", icone: "checklist", href: "/central/tarefas" },
    ] : []),
    ...(ehAdmin ? [{ id: "perm", rotulo: "Conceder acesso", icone: "shield-check", href: "/ti/permissoes" }] : []),
    ...(temInfra ? [{ id: "infra", rotulo: "Domínios e cofre", icone: "key", href: "/ti/infraestrutura" }] : []),
  ];
  return (
    <CascaModulo modulo="da TI" icone="device-laptop" subareas={subareas} acoes={acoes} rota={rota} className="pv ti">
      {children}
    </CascaModulo>
  );
}
