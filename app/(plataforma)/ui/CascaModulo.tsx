"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "../Icon";
import { Abas } from "./Abas";
import { Dropdown } from "./Dropdown";
import "../operacao/geral/visao-geral.css";

/**
 * Casca de módulo com subáreas: cabeçalho único (ícone, título, data, Ações
 * rápidas) + a navegação interna em `Abas` com `href`.
 *
 * Nasceu na Produção e virou do kit quando o Design ganhou a mesma
 * arquitetura. A regra que ela carrega: subárea é ZOOM do módulo, não outro
 * módulo — então o cabeçalho é o mesmo em todas e só título/subtítulo mudam.
 * A primeira subárea é a Visão geral (a casa); a atual é a de `href` mais
 * longo que casa com a rota.
 */
export interface Subarea {
  valor: string; rotulo: string; href: string; icone: string; titulo: string; sub: string;
  /** `false` = rota do módulo que não entra na fileira (abre por um cartão). */
  naAba?: boolean;
}
export interface AcaoRapida { id: string; rotulo: string; icone: string; href: string }

export function CascaModulo({ modulo, icone, subareas, acoes, rota, className, children }: {
  /** Nome pro leitor de tela ("Subáreas da Produção"). */
  modulo: string;
  /** Ícone do cabeçalho na Visão geral (as subáreas usam o delas). */
  icone: string;
  subareas: Subarea[];
  acoes?: AcaoRapida[];
  /** Rota forçada — só pro banco de provas, que não mora na rota real. */
  rota?: string;
  /** Escopo de CSS do módulo (`pv`, `dv`…). */
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const caminho = rota ?? pathname ?? subareas[0]?.href ?? "/";
  const atual = [...subareas].sort((a, b) => b.href.length - a.href.length)
    .find((s) => caminho === s.href || caminho.startsWith(s.href + "/")) ?? subareas[0];
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const casa = atual === subareas[0];
  const abas = subareas.filter((s) => s.naAba !== false);

  return (
    <div className={className ? `og ${className}` : "og"}>
      <header className="og-cab">
        <span className="og-cab-icone" aria-hidden><Icon name={casa ? icone : atual.icone} size={22} color="var(--primary)" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="og-titulo">{atual.titulo}</h1>
          <p className="og-sub">{atual.sub}</p>
        </div>
        <div className="og-cab-acoes">
          <span className="og-data"><Icon name="calendar" size={15} color="var(--text-dim)" />Hoje, {hoje}</span>
          {acoes && acoes.length > 0 && <Dropdown titulo="Ações rápidas" rotulo="Ações rápidas" icone="bolt" alinhar="fim" itens={acoes} />}
        </div>
      </header>
      {abas.length > 1 && (
        <Abas ariaLabel={`Subáreas ${modulo}`} valor={atual.valor}
          itens={abas.map((s) => ({ valor: s.valor, href: s.href, rotulo: <><Icon name={s.icone} size={15} color="currentColor" /> {s.rotulo}</> }))} />
      )}
      {children}
    </div>
  );
}
