"use client";
import "./kit-heroui.css";

import { Breadcrumbs, Pagination, ScrollShadow } from "@heroui/react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../Icon";

// ── Navigation / Utilities (HeroUI v3) ──────────────────────────────────────
//   • Trilha          — Breadcrumbs: onde estou (Lojas › Minha loja › Aparência).
//     No celular só o penúltimo nível aparece, como "‹ voltar".
//   • Paginacao       — Pagination: páginas com reticências; a 320px vira
//     "‹ 3 de 12 ›" (o Summary), porque 7 botões de 44px não cabem.
//   • SombraRolagem   — ScrollShadow: esmaecido de "tem mais pra ver" numa
//     lista que rola. NUNCA em fileira que abre popover (o mask-image vira
//     bloco de contenção — ver CLAUDE.md, "Nenhum ancestral de popover").

export function Trilha({ itens }: { itens: { rotulo: ReactNode; href?: string }[] }) {
  const voltar = [...itens].reverse().find((it, i) => i > 0 && it.href);
  return (
    <>
      <Breadcrumbs className="ui-trilha desk-only">
        {itens.map((it, i) => (
          <Breadcrumbs.Item key={i} href={i < itens.length - 1 ? it.href : undefined}>{it.rotulo}</Breadcrumbs.Item>
        ))}
      </Breadcrumbs>
      {voltar && (
        <a className="ui-trilha-voltar mob-only" href={voltar.href}>
          <Icon name="chevron-left" size={16} /> {voltar.rotulo}
        </a>
      )}
    </>
  );
}

/** Páginas visíveis: 1 … (atual−1, atual, atual+1) … total. */
function janela(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const meio = [atual - 1, atual, atual + 1].filter((n) => n > 1 && n < total);
  const out: (number | "…")[] = [1];
  if (meio[0] > 2) out.push("…");
  out.push(...meio);
  if (meio[meio.length - 1] < total - 1) out.push("…");
  out.push(total);
  return out;
}

export function Paginacao({ pagina, total, aoMudar }: { pagina: number; total: number; aoMudar: (p: number) => void }) {
  if (total <= 1) return null;
  const ir = (p: number) => aoMudar(Math.min(total, Math.max(1, p)));
  return (
    <Pagination className="ui-paginacao" aria-label="Paginação">
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous isDisabled={pagina <= 1} onPress={() => ir(pagina - 1)} aria-label="Página anterior">
            <Icon name="chevron-left" size={16} />
          </Pagination.Previous>
        </Pagination.Item>
        {janela(pagina, total).map((p, i) => p === "…"
          ? <Pagination.Item key={`e${i}`} className="desk-only"><Pagination.Ellipsis /></Pagination.Item>
          : (
            <Pagination.Item key={p} className={p === pagina ? undefined : "desk-only"}>
              <Pagination.Link isActive={p === pagina} onPress={() => ir(p)} aria-label={`Página ${p}`}>{p}</Pagination.Link>
            </Pagination.Item>
          ))}
        <Pagination.Item className="mob-only ui-paginacao__de">de {total}</Pagination.Item>
        <Pagination.Item>
          <Pagination.Next isDisabled={pagina >= total} onPress={() => ir(pagina + 1)} aria-label="Próxima página">
            <Icon name="chevron-right" size={16} />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}

export function SombraRolagem({ children, deitada, altura, style, className }: {
  children: ReactNode;
  /** Rola de lado em vez de pra baixo. */
  deitada?: boolean;
  /** Altura máxima da área que rola (CSS). */
  altura?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <ScrollShadow
      className={["ui-sombra", className].filter(Boolean).join(" ")}
      orientation={deitada ? "horizontal" : "vertical"}
      style={{ maxHeight: deitada ? undefined : altura, ...style }}
    >
      {children}
    </ScrollShadow>
  );
}
