"use client";

// Card contextual de uma entidade do ERP dentro da conversa.
//
// É a vantagem de o chat morar dentro do sistema: compartilhar uma atividade
// não vira um link seco, vira um cartão que abre a atividade sem sair daqui.

import { memo } from "react";
import Link from "next/link";
import { Icon } from "../../../Icon";
import type { CardContexto } from "@/lib/chat/tipos";

const ROTULO: Record<string, { label: string; icone: string; cor: string }> = {
  atividade:  { label: "Atividade",  icone: "checklist",     cor: "var(--primary-texto)" },
  tarefa:     { label: "Tarefa",     icone: "list-check",    cor: "var(--azul)" },
  pedido:     { label: "Pedido",     icone: "shopping-bag",  cor: "var(--ok)" },
  produto:    { label: "Produto",    icone: "package",       cor: "var(--atencao)" },
  criativo:   { label: "Criativo",   icone: "photo",         cor: "var(--perigo)" },
  caixa:      { label: "Caixa",      icone: "box",           cor: "var(--indigo)" },
  colaborador:{ label: "Pessoa",     icone: "user",          cor: "var(--info)" },
  meta:       { label: "Meta",       icone: "target",        cor: "var(--amarelo)" },
};

export const CardEntidade = memo(function CardEntidade({ card }: { card: CardContexto }) {
  const def = ROTULO[card.tipo] ?? { label: card.tipo, icone: "link", cor: "var(--neutro)" };
  const cor = card.cor || def.cor;

  const conteudo = (
    <>
      <span className="ch-card__faixa" style={{ background: cor }} />
      <span className="ch-card__tipo" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name={def.icone} size={13} color={cor} />
        {def.label}
      </span>
      <span className="ch-card__titulo" style={{ display: "block" }}>{card.titulo}</span>
      {card.subtitulo && <span className="ch-card__sub" style={{ display: "block" }}>{card.subtitulo}</span>}
      {card.meta && Object.keys(card.meta).length > 0 && (
        <span className="ch-card__meta">
          {Object.entries(card.meta).slice(0, 4).map(([k, v]) => (
            <span key={k}><b style={{ fontWeight: 600 }}>{k}:</b> {String(v ?? "—")}</span>
          ))}
        </span>
      )}
    </>
  );

  // Sem URL o card ainda informa, só não navega — melhor que sumir da conversa.
  if (!card.url) return <div className="ch-card" style={{ cursor: "default" }}>{conteudo}</div>;
  return <Link href={card.url} className="ch-card" onClick={(e) => e.stopPropagation()}>{conteudo}</Link>;
});
