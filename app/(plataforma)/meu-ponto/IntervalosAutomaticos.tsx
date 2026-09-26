"use client";
// Chave dos intervalos automáticos da produção (lib/ponto-intervalos.ts).
// Ligado: o tablet de atividades pausa e toca a sirene nas janelas, e o ponto
// ganha a saída/volta do intervalo de quem está na lista (desde `desde`).
import { useEffect, useState } from "react";
import { Botao, Chips, Interruptor } from "../ui/controles";
import { toast } from "../Toast";

type Janela = { rotulo: string; inicio: string; fim: string; pessoas: string[] };
type Retorno = { dia: string; janela: string; colaborador_nome: string | null; voltou_em: string; atraso_s: number };
type Resp = { retornos?: Retorno[]; ativo: boolean; desde: string; janelas: Janela[]; salvavel: boolean; pessoas: { id: string; nome: string }[] };

const dataBr = (d: string) => d.split("-").reverse().join("/");
const duracao = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`);
const horaSp = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function IntervalosAutomaticos({ onMudou }: { onMudou?: () => void }) {
  const [cfg, setCfg] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/ponto/intervalos", { cache: "no-store" }).then((r) => r.json())
      .then((j: Resp & { error?: string }) => { if (!j.error && Array.isArray(j.janelas) && Array.isArray(j.pessoas)) setCfg(j); }).catch(() => undefined);
  }, []);
  if (!cfg) return null;

  async function salvar(patch: Partial<Pick<Resp, "ativo" | "janelas">>) {
    if (!cfg) return;
    const antes = cfg;
    setCfg({ ...cfg, ...patch });
    setBusy(true);
    try {
      const r = await fetch("/api/ponto/intervalos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setCfg(antes); toast.erro(d?.error || "Não consegui salvar os intervalos."); return; }
      if (d?.lancados) { toast.ok(`${d.lancados} batidas de intervalo lançadas.`); onMudou?.(); }
    } finally { setBusy(false); }
  }

  async function lancar() {
    setBusy(true);
    try {
      const r = await fetch("/api/ponto/intervalos", { method: "POST" });
      const d = await r.json().catch(() => null);
      if (!r.ok) { toast.erro(d?.error || "Falha ao lançar."); return; }
      toast.ok(d?.lancados ? `${d.lancados} batidas de intervalo lançadas.` : "Nada novo pra lançar.");
      if (d?.lancados) onMudou?.();
    } finally { setBusy(false); }
  }

  const opcoes = cfg.pessoas.map((p) => ({ valor: p.id, rotulo: p.nome }));
  return (
    <div className="glass" style={{ padding: 16, borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <Interruptor
        ligado={cfg.ativo} pendente={busy} desativado={!cfg.salvavel}
        onChange={(v) => salvar({ ativo: v })}
        rotulo="Intervalos automáticos da produção"
        dica={cfg.salvavel
          ? `O tablet pausa as atividades e toca a sirene; o ponto lança a saída e a volta. Valendo desde ${dataBr(cfg.desde)}.`
          : "Rode supabase/ponto_intervalos_auto.sql pra poder mudar. Até lá vale a lista padrão, ligada."}
      />
      {cfg.ativo && cfg.janelas.map((j, i) => (
        <div key={j.rotulo + i} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{j.rotulo} · {j.inicio}–{j.fim}</span>
          <Chips
            rotulo={`Quem faz o intervalo da ${j.rotulo}`} opcoes={opcoes} valor={j.pessoas}
            onMuda={(v) => cfg.salvavel && salvar({ janelas: cfg.janelas.map((x, k) => (k === i ? { ...x, pessoas: v } : x)) })}
          />
        </div>
      ))}
      {cfg.ativo && !!cfg.retornos?.length && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Quanto demoraram pra voltar (7 dias)</span>
          {cfg.retornos.slice(0, 40).map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13, padding: "6px 0", borderTop: i ? "1px solid var(--border)" : undefined }}>
              <span style={{ flex: "1 1 140px", minWidth: 0, color: "var(--text)", fontWeight: 600 }}>{r.colaborador_nome || "—"}</span>
              <span style={{ color: "var(--text-dim)" }}>{dataBr(r.dia).slice(0, 5)} · {r.janela} · voltou {horaSp(r.voltou_em)}</span>
              <span className="mt-num" style={{ fontWeight: 700, color: r.atraso_s > 60 ? "var(--atencao)" : "var(--text)" }}>+{duracao(r.atraso_s)}</span>
            </div>
          ))}
        </div>
      )}
      {cfg.ativo && (
        <Botao variante="sutil" icone="clock" onClick={lancar} disabled={busy} style={{ alignSelf: "flex-start" }}>
          Lançar intervalos que faltam
        </Botao>
      )}
    </div>
  );
}
