"use client";

/**
 * Drill do Analytics: os pedidos de uma (ou mais) etapas.
 *
 * Recebe uma LISTA de etapas porque as caixas do fluxo agrupam mais de uma do
 * ERP — "Aprovação" é a 4 e a 5, "Programação" é a 7 e a 16. Abrir só a
 * primeira mostraria metade da fila e a conta não bateria com o número que a
 * pessoa acabou de clicar, que é o jeito mais rápido de perder a confiança na
 * tela inteira.
 */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { Momento } from "../ui/Momento";
import { SkeletonRows } from "../Skeleton";
import { Fila } from "../ui/micro";
import { Campo } from "../ui/controles";
import { travarRolagem } from "../ui/travaRolagem";
import { createPortal } from "react-dom";

interface PedLinha { ref: string; cliente: string; telefone: string | null; data: string | null; urgente: boolean; valor: number }

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brData = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function PedidosDaEtapa({ etapas, nome, onClose, classe = "" }: {
  etapas: number[]; nome: string; onClose: () => void; classe?: string;
}) {
  const [pedidos, setPedidos] = useState<PedLinha[] | null>(null);
  const [err, setErr] = useState(false);
  const [busca, setBusca] = useState("");

  // `etapas` é um array novo a cada render de quem chama; sem a chave estável
  // o efeito rebuscaria a cada quadro e a folha piscaria pra sempre.
  const chave = etapas.join(",");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const soltar = travarRolagem();
    let vivo = true;
    Promise.all(etapas.map((id) =>
      fetch(`/api/producao/pedidos?etapa=${id}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => (Array.isArray(j?.pedidos) ? (j.pedidos as PedLinha[]) : null))
        .catch(() => null),
    )).then((partes) => {
      if (!vivo) return;
      // Uma etapa que falha não derruba a folha inteira: as que responderam
      // aparecem, e o aviso só entra se NENHUMA veio.
      if (partes.every((p) => p === null)) { setErr(true); return; }
      setPedidos(partes.flatMap((p) => p ?? []));
    });
    return () => { vivo = false; document.removeEventListener("keydown", onKey); soltar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, onClose]);

  const lista = useMemo(() => {
    const bt = busca.trim().toLowerCase();
    return (pedidos ?? []).filter((p) => !bt || `${p.cliente} ${p.telefone ?? ""}`.toLowerCase().includes(bt));
  }, [pedidos, busca]);

  return createPortal(
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose}>
      <div className={`apple-modal glass glass-spec sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(680px,100%)", maxHeight: "88dvh", overflowY: "auto", borderRadius: 24, padding: "clamp(16px, 5vw, 24px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, flex: 1, minWidth: 0 }}>
            {/* "carregando…" só enquanto está mesmo carregando: com o erro na
                tela embaixo, o cabeçalho dizia as duas coisas ao mesmo tempo. */}
            {nome} <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500 }}>· {pedidos ? `${pedidos.length} pedidos` : err ? "sem resposta do ERP" : "carregando…"}</span>
          </h2>
          <button onClick={onClose} className="glass-spec ui-toque" aria-label="Fechar"
            style={{ width: 36, height: 36, borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", flex: "none", display: "grid", placeItems: "center" }}>
            <Icon name="x" size={17} color="var(--text)" />
          </button>
        </div>

        {pedidos && pedidos.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Campo label="Buscar" largo>
              {(id) => <input id={id} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente ou telefone…" />}
            </Campo>
          </div>
        )}

        {err && <Momento icone="plug-off" tom="erro" titulo="Não deu pra ler o ERP" texto="Tente de novo em instantes." />}
        {/* Esqueleto com a forma da lista: a folha não muda de altura quando os
            pedidos chegam. */}
        {!pedidos && !err && <SkeletonRows rows={4} />}
        {pedidos && pedidos.length === 0 && <Momento compacto icone="inbox" titulo="Nenhum pedido nesta etapa" texto="A fila desta etapa está vazia agora." />}
        {pedidos && pedidos.length > 0 && lista.length === 0 && <Momento compacto icone="search" titulo="Nenhum pedido encontrado" texto={`Nada com “${busca}” nesta etapa.`} />}

        <Fila style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lista.map((p, i) => (
            <div key={p.ref + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface)", borderRadius: 12, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13.5, flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.cliente}</strong>
              {p.telefone && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{p.telefone}</span>}
              {p.urgente && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--perigo)", background: "color-mix(in srgb,var(--perigo) 16%,transparent)", padding: "2px 8px", borderRadius: 999 }}>urgente</span>}
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{brData(p.data)}</span>
              <span className="stat" style={{ fontSize: 15, minWidth: 90, textAlign: "right", color: "var(--ok)" }}>{brl(p.valor)}</span>
            </div>
          ))}
        </Fila>
      </div>
    </div>,
    document.body,
  );
}
