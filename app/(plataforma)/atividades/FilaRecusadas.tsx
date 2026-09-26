"use client";

// ── Fila de recusadas (só supervisor) ────────────────────────────────────────
// A ordem que alguém recusou no tablet sai da fila de todo tablet e para aqui,
// com o motivo. Quem tem Atividades › Autorizar lê e, quando o problema passou,
// devolve pra fila. Sem poll: a lista chega com a página ("Atualizado há…"
// recarrega). Servidor: lib/atividades-recusadas.ts.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CartaoPainel } from "../ui/CartaoPainel";
import { CardLinha, agoLabel } from "../ui/mobile";
import { Botao } from "../ui/controles";
import { Icon } from "../Icon";
import { toast } from "../Toast";
import type { Recusada } from "@/lib/atividades-recusadas";

export function FilaRecusadas({ recusadas }: { recusadas: Recusada[] }) {
  const router = useRouter();
  const [saiu, setSaiu] = useState<Set<string>>(() => new Set());
  const [voltando, setVoltando] = useState<string | null>(null);
  const lista = recusadas.filter((r) => !saiu.has(r.id));
  if (!lista.length) return null;

  async function voltar(r: Recusada) {
    setVoltando(r.id);
    try {
      const res = await fetch("/api/atividades/recusadas", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok || res.status === 409) {
        setSaiu((s) => new Set(s).add(r.id));
        if (res.ok) toast.ok(`${r.tarefa} voltou pra fila do tablet.`);
        router.refresh();
        return;
      }
      toast.erro(d.detalhe || "Não foi possível devolver agora. Tente de novo.");
    } catch {
      toast.erro("A conexão caiu. Tente de novo.");
    } finally {
      setVoltando(null);
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <CartaoPainel icone="alert-triangle"
        titulo={`Recusadas no tablet (${lista.length})`}
        sub="Saíram da fila do tablet. Leia o motivo e devolva quando o problema tiver passado.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 10 }}>
          {lista.map((r) => (
            <CardLinha key={r.id}
              titulo={r.produto_nome ? `${r.tarefa} · ${r.produto_nome}` : r.tarefa}
              campos={[
                { label: "Recusada por", value: r.recusadaPor || "—" },
                { label: "Quando", value: agoLabel(r.em) },
              ]}
              rodape={
                <div style={{ display: "grid", gap: 10, flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13.5, fontWeight: 600, color: "var(--perigo)", overflowWrap: "anywhere" }}>
                    <Icon name="alert-triangle" size={15} color="var(--perigo)" style={{ flex: "none", marginTop: 2 }} />
                    <span>{r.motivo}</span>
                  </div>
                  {r.liberadaPor && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Liberada no tablet por {r.liberadaPor}</div>}
                  <Botao variante="secundario" icone="arrow-back-up" carregando={voltando === r.id}
                    disabled={voltando !== null} onClick={() => void voltar(r)}>Voltar pra fila</Botao>
                </div>
              } />
          ))}
        </div>
      </CartaoPainel>
    </div>
  );
}
