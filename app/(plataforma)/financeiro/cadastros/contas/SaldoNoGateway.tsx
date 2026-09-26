"use client";

// ── Saldo ao vivo no gateway (Pagar.me) ──────────────────────────────────────
// Aparece dentro do cartão da conta que é a Pagar.me: o que o gateway diz ter
// (disponível e a receber) ao lado do saldo do livro, e a diferença quando os
// dois não batem. Uma leitura ao montar e outra no Atualizar — sem poll.

import { useCallback, useEffect, useState } from "react";
import { BotaoIcone } from "../../../ui/controles";
import { moeda } from "@/lib/financeiro/calculos";

/** Conta do cadastro que representa a Pagar.me — pela instituição ou pelo nome. */
export const ehPagarme = (c: { instituicao?: string | null; nome?: string | null }) =>
  /pagar\.?\s?me/i.test(`${c.instituicao ?? ""} ${c.nome ?? ""}`);

interface Saldo { disponivel: number; aReceber: number; lidoEm: string }

export function SaldoNoGateway({ contaId, saldoDoLivro }: { contaId: string; saldoDoLivro: number }) {
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);

  const ler = useCallback(async (fresco: boolean) => {
    setLendo(true);
    try {
      const r = await fetch(`/api/financeiro/integracoes/pagarme/saldo?conta=${encodeURIComponent(contaId)}${fresco ? "&fresco=1" : ""}`, { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { saldo?: Saldo; erro?: string } | null;
      if (!r.ok || !j?.saldo) throw new Error(j?.erro ?? "Não deu para ler a Pagar.me.");
      setSaldo(j.saldo); setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para ler a Pagar.me.");
    } finally {
      setLendo(false);
    }
  }, [contaId]);

  useEffect(() => { void ler(false); }, [ler]);

  const diferenca = saldo ? Math.round((saldo.disponivel - saldoDoLivro) * 100) / 100 : 0;

  return (
    <div
      style={{
        display: "grid", gap: 4, minWidth: 0, marginTop: 4, padding: "8px 10px",
        borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <small style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>
          Na Pagar.me agora
        </small>
        <BotaoIcone
          icone="refresh" titulo="Atualizar saldo da Pagar.me" carregando={lendo}
          onClick={() => void ler(true)} style={{ margin: -6, flex: "none" }}
        />
      </div>
      {erro ? (
        <small role="alert" style={{ fontSize: 12, color: "var(--perigo)" }}>{erro}</small>
      ) : !saldo ? (
        <small style={{ fontSize: 12, color: "var(--text-dim)" }}>Lendo…</small>
      ) : (
        <>
          {/* Os dois com o mesmo peso: "a receber" é dinheiro que já é da
              empresa, só ainda não liberado — é metade da resposta. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, fontVariantNumeric: "tabular-nums" }}>
            {([["Disponível", saldo.disponivel, "var(--ok)"], ["A receber", saldo.aReceber, "var(--azul)"]] as const).map(([rotulo, valor, cor]) => (
              <span key={rotulo} style={{ display: "grid", gap: 1, minWidth: 0 }}>
                <small style={{ fontSize: 11, color: "var(--text-dim)" }}>{rotulo}</small>
                <strong style={{ fontSize: 16, fontWeight: 800, color: cor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {moeda(valor)}
                </strong>
              </span>
            ))}
          </div>
          <small style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
            Total na Pagar.me <strong style={{ color: "var(--text)" }}>{moeda(saldo.disponivel + saldo.aReceber)}</strong>
          </small>
          {diferenca !== 0 && (
            <small style={{ fontSize: 11.5, color: "var(--atencao)", fontVariantNumeric: "tabular-nums" }}>
              Livro {diferenca > 0 ? "abaixo" : "acima"} do disponível em {moeda(Math.abs(diferenca))}
            </small>
          )}
        </>
      )}
    </div>
  );
}

/** Versão de uma linha, pra coluna Saldo da tabela: só o que falta liberar. */
export function AReceberNoGateway({ contaId }: { contaId: string }) {
  const [valor, setValor] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/financeiro/integracoes/pagarme/saldo?conta=${encodeURIComponent(contaId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { saldo?: Saldo } | null) => { if (vivo && j?.saldo) setValor(j.saldo.aReceber); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [contaId]);
  if (valor == null) return null;
  return (
    <small style={{ fontSize: 11.5, color: "var(--azul)", fontVariantNumeric: "tabular-nums" }}>
      + {moeda(valor)} a receber
    </small>
  );
}
