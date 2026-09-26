"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import "../operacao/geral/visao-geral.css";

/**
 * Cartão de bloco dos painéis da Operação (Visão geral, Logística): ladrilho
 * com ícone, título, subtítulo e o "Ver todos" à direita. Nasceu local na
 * Visão geral; virou peça do kit quando a Logística ganhou o mesmo desenho.
 * `href` navega; `onVer` é pra quando o "ver todos" mora na mesma tela.
 */
export function CartaoPainel({ icone, titulo, sub, href, onVer, id, children, acoes, verRotulo = "Ver todos" }: {
  /** `titulo` aceita nó pra levar uma contagem ao lado ("Pendências ②"). */
  icone: string; titulo: ReactNode; sub?: ReactNode; href?: string; onVer?: () => void; id?: string; children: ReactNode;
  /** Controles à direita do cabeçalho (seletor de série, período). Moram no
   *  lugar do "Ver todos" quando não há um. */
  acoes?: ReactNode;
  verRotulo?: string;
}) {
  const ver = <>{verRotulo} <Icon name="chevron-right" size={14} color="var(--text-dim)" /></>;
  return (
    <section className="mc-card og-cartao" id={id}>
      <div className="og-cartao-cab">
        <span className="og-cartao-icone" aria-hidden><Icon name={icone} size={18} color="var(--primary)" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{titulo}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {href ? <Link href={href} className="og-ver">{ver}</Link>
          : onVer ? <button type="button" className="og-ver og-ver-btn" onClick={onVer}>{ver}</button> : null}
        {acoes && <div className="og-cartao-acoes">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

export function VazioPainel({ texto }: { texto: string }) {
  return <p className="og-limpo">{texto}</p>;
}
