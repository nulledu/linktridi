"use client";

// ── A fila de decisão do gestor ──────────────────────────────────────────────
// Pedido de justificativa que ninguém decidiu não muda uma hora sequer — é a
// trava que deixa o colaborador PEDIR sem se autoabonar. Mas uma trava que
// esconde o pedido vira outro defeito: a pessoa mandou o atestado, o sistema
// engoliu, e ela descobre no fim do mês que a falta continua lá.
//
// Por isso a fila aparece na primeira tela do gestor, antes da lista da equipe,
// e some sozinha quando está vazia.
//
// Carrega UMA vez por montagem (e depois de cada decisão). Sem `setInterval`:
// pedido de atestado não chega de segundo em segundo, e a regra da casa é que
// tick que não traz novidade é invocação paga à toa.

import { useCallback, useEffect, useState } from "react";
import {
  ROTULO_EFEITO, ROTULO_TIPO, formatarMinutos, minutosDoRecorte,
} from "@/lib/ponto-justificativas";
import type { Justificativa } from "@/lib/ponto";
import { Icon } from "../Icon";
import { toast } from "../Toast";
import { Botao } from "../ui/controles";

const ROTA = "/api/ponto/justificativas";
const dataBR = (dia: string) => { const [y, m, d] = dia.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };

export function PedidosPendentes({ nomePorPessoa, onDecidido }: {
  /** `ponto_pessoas.id` → nome. A lista da equipe já tem esse mapa em mãos. */
  nomePorPessoa: Map<string, string>;
  onDecidido: () => void;
}) {
  const [lista, setLista] = useState<Justificativa[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const carregar = useCallback(() => {
    fetch(`${ROTA}?pendentes=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { justificativas?: Justificativa[] }) => setLista(j?.justificativas ?? []))
      .catch(() => setLista([]));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function decidir(j: Justificativa, status: "aprovada" | "recusada") {
    setBusy(j.id);
    try {
      const r = await fetch(ROTA, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: j.id, status }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(d?.error || "Falha."); return; }
      toast.ok(status === "aprovada" ? "Aprovado." : "Recusado.");
      // Some da fila na hora, sem esperar a volta do servidor: o cartão que
      // continua ali depois do clique faz a pessoa clicar de novo.
      setLista((l) => l.filter((x) => x.id !== j.id));
      onDecidido();
    } finally { setBusy(null); }
  }

  if (lista.length === 0) return null;

  return (
    <div className="glass" style={{ padding: 16, borderRadius: "var(--r-md)", border: "1px solid var(--atencao)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ color: "var(--atencao)", display: "flex" }}><Icon name="hourglass-high" size={17} /></span>
        <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
          {lista.length === 1 ? "1 pedido de justificativa" : `${lista.length} pedidos de justificativa`}
        </strong>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Enquanto ninguém decide, as horas continuam contando como estão.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lista.map((j) => {
          const tipo = ROTULO_TIPO[j.tipo ?? "outro"] ?? ROTULO_TIPO.outro;
          const efeito = ROTULO_EFEITO[j.efeito ?? "abona"];
          // Sem a escala da pessoa aqui, o recorte vale pelo relógio — é só o
          // rótulo da fila; a conta de verdade acontece no cálculo do dia, que
          // conhece entrada, saída e almoço.
          const min = minutosDoRecorte(j, { jornadaMin: 24 * 60 });
          return (
            <div key={j.id} style={{
              border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
              background: "var(--surface)", padding: "10px 12px",
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ flex: "none", marginTop: 1, color: efeito.cor }}><Icon name={tipo.icone} size={17} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                    {nomePorPessoa.get(j.pessoaId) || "Colaborador"} · {dataBR(j.dia)}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
                    {tipo.label} ·{" "}
                    {j.horaDe && j.horaAte
                      ? <>{j.horaDe}–{j.horaAte}</>
                      : min != null ? formatarMinutos(min) : "dia inteiro"}
                    {" · "}<span style={{ color: efeito.cor, fontWeight: 700 }}>{efeito.label}</span>
                  </div>
                  {j.motivo && <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4, lineHeight: 1.45 }}>{j.motivo}</div>}
                  {j.arquivo && (
                    <a href={j.arquivo} target="_blank" rel="noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 11.5, fontWeight: 700, color: "var(--info)", textDecoration: "none", minHeight: 28 }}>
                      <Icon name="paperclip" size={14} />{j.arquivoNome || "Ver comprovante"}
                    </a>
                  )}
                </div>
              </div>
              {/* Aprovar e recusar lado a lado, mas o destrutivo não encosta no
                  principal: um erro de polegar aqui recusa um atestado. */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <Botao variante="primario" tamanho="sm" icone="check" disabled={busy === j.id} onClick={() => decidir(j, "aprovada")}>Aprovar</Botao>
                <span style={{ flex: 1, minWidth: 8 }} />
                <Botao variante="sutil" tamanho="sm" icone="x" disabled={busy === j.id} onClick={() => decidir(j, "recusada")}>Recusar</Botao>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
