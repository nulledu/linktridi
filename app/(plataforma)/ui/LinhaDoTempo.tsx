"use client";

// ── Linha do tempo (roadmap) ─────────────────────────────────────────────────
// Etapas em sequência com conectores que acompanham a progressão: concluída
// pinta o trilho, ativa pulsa, pendente fica vazia, bloqueada/atrasada avisa
// sem gritar. Horizontal com rolagem PRÓPRIA (nunca da página) — no celular a
// fileira rola de lado como o `.tab-strip`. Densidade `compacta`/`padrao`/
// `espacada`. Nasceu na TI (roadmaps); é genérica de propósito.
//
// Cor vem da paleta semântica (--ok/--atencao/--primary): concluído é verde em
// qualquer tema e não muda quando a pessoa troca o destaque de gráfico.
import { type ReactNode, useEffect, useRef } from "react";
import { Icon } from "../Icon";
import "./linha-do-tempo.css";

export type StatusDaEtapa = "concluida" | "ativa" | "pendente" | "bloqueada" | "atrasada";

export interface ItemDaLinha {
  id: string;
  titulo: string;
  descricao?: string;
  status: StatusDaEtapa;
  /** Linha pequena acima do título (data, período). */
  topo?: ReactNode;
  /** Linha pequena abaixo (progresso, responsável). */
  baixo?: ReactNode;
}

const ICONE: Record<StatusDaEtapa, string> = {
  concluida: "check", ativa: "circle-dot", pendente: "circle-dot", bloqueada: "alert-triangle", atrasada: "clock-hour-4",
};

export function LinhaDoTempo({ itens, selecionado, onSelecionar, densidade = "padrao" }: {
  itens: ItemDaLinha[];
  /** id do item destacado (abre o painel de detalhe de quem usa). */
  selecionado?: string | null;
  onSelecionar?: (id: string) => void;
  densidade?: "compacta" | "padrao" | "espacada";
}) {
  const faixa = useRef<HTMLDivElement>(null);
  // Traz o item selecionado (ou o ativo) pra vista — mesma cortesia do .tab-strip.
  useEffect(() => {
    const alvo = faixa.current?.querySelector<HTMLElement>('[data-vista="1"]');
    alvo?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selecionado]);

  const emFoco = selecionado ?? itens.find((i) => i.status === "ativa")?.id ?? null;

  return (
    <div className={`ldt ldt--${densidade}`} ref={faixa} role="list" aria-label="Linha do tempo">
      {itens.map((item, i) => (
        <div key={item.id} role="listitem" className="ldt-item" data-status={item.status}
          data-sel={selecionado === item.id ? "1" : undefined}
          data-vista={emFoco === item.id ? "1" : undefined}>
          {i < itens.length - 1 && <span className="ldt-fio" aria-hidden data-feito={item.status === "concluida" ? "1" : undefined} />}
          <button type="button" className="ldt-no" onClick={onSelecionar ? () => onSelecionar(item.id) : undefined}
            aria-current={selecionado === item.id ? "step" : undefined}>
            <span className="ldt-bola"><Icon name={ICONE[item.status]} size={13} /></span>
            <span className="ldt-corpo">
              {item.topo != null && <span className="ldt-topo">{item.topo}</span>}
              <span className="ldt-titulo">{item.titulo}</span>
              {item.descricao ? <span className="ldt-desc">{item.descricao}</span> : null}
              {item.baixo != null && <span className="ldt-baixo">{item.baixo}</span>}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
