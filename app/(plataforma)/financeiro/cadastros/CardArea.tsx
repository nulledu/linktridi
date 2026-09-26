"use client";

import Link from "next/link";
import { Icon } from "../../Icon";

/**
 * O cartão de uma área de cadastro.
 *
 * É um `<a>` do tamanho do cartão inteiro — e por isso leva `.ui-card-alvo`:
 * link com tamanho de cartão não herda o afundamento do toque da fundação, e
 * sem ele o cartão não responde ao dedo (ver a memória "cartão que é alvo").
 */
export function CardArea({ href, icone, cor, titulo, descricao, quantidade }: {
  href: string; icone: string; cor: string; titulo: string; descricao: string; quantidade: number;
}) {
  return (
    <Link
      href={href}
      className="ui-card-alvo"
      style={{
        display: "grid", gap: 10, padding: 16, borderRadius: "var(--r-md)", minWidth: 0,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        textDecoration: "none", color: "var(--text)", minHeight: "var(--tap)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center",
          background: `color-mix(in srgb, ${cor} 14%, transparent)`,
        }}
      >
        <Icon name={icone} size={21} color={cor} />
      </span>

      <strong style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.01em" }}>{titulo}</strong>
      <span style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>{descricao}</span>

      <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <strong style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: cor }}>
          {quantidade} {quantidade === 1 ? "item" : "itens"}
        </strong>
        <Icon name="chevron-right" size={16} color="var(--text-dim)" />
      </span>
    </Link>
  );
}
