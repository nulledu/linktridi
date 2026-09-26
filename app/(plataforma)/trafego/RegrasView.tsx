"use client";

// Tráfego Pago — Regras & Alertas. Construtor "Quando [condição] → [ação]".
// Regras salvas no workspace (marketing_config) e avaliadas AO VIVO contra as
// campanhas reais do período (mostra quantas disparam agora). Ações que mexem
// na plataforma (pausar de fato) chegam com a fase de Integrações.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { Botao, BotaoIcone, Interruptor } from "../ui/controles";
import { GlassSelect } from "../GlassPicker";
import { toast } from "../Toast";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import type { AdsOverview } from "@/lib/meta-ads";
import {
  type Regra, type MetricaRegra, type OperadorRegra, type AcaoRegra, type CampMetrica,
  METRICA_LABEL, ACAO_LABEL, ACAO_COR, descreverRegra, avaliarRegras,
} from "@/lib/trafego-regras";

const COR = { critica: "var(--perigo)", atencao: "var(--atencao)", oportunidade: "var(--ok)" } as const;
const novaRegra = (): Regra => ({ id: Math.random().toString(36).slice(2, 10), ativo: true, nome: "", escopo: "campanha", metrica: "roas", operador: "<", valor: 1.5, acao: "sugerir_pausa" });

export function RegrasView({ period }: { period: PeriodState }) {
  const [regras, setRegras] = useState<Regra[] | null>(null);
  const [camps, setCamps] = useState<CampMetrica[]>([]);
  const [editando, setEditando] = useState<Regra | null>(null);

  useEffect(() => {
    fetch("/api/trafego/regras", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => setRegras(j.regras || [])).catch(() => setRegras([]));
  }, []);
  const carregarCamps = useCallback(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    // Resposta atrasada de outro período não sobrescreve a busca nova.
    let vivo = true;
    fetch(`/api/trafego/overview?${periodQuery(period)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d: AdsOverview | null) => { if (vivo) setCamps((d?.campanhas || []).map((c) => ({ id: c.id, name: c.name, spend: c.spend, roas: c.roas, cpa: c.cpa, ctr: c.ctr, purchases: c.purchases }))); }).catch(() => { if (vivo) setCamps([]); });
    return () => { vivo = false; };
  }, [period]);

  useEffect(() => carregarCamps(), [carregarCamps]);
  // As regras disparam em cima destas métricas: avaliar no dado velho depois de
  // "Atualizar" alarmaria (ou silenciaria) por um número que não existe mais.
  useAtualizacao(carregarCamps);

  const persistir = useCallback((next: Regra[]) => {
    setRegras(next);
    fetch("/api/trafego/regras", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regras: next }) })
      .then((r) => (r.ok ? toast.ok("Regras salvas") : toast.erro("Não deu pra salvar"))).catch(() => toast.erro("Falha ao salvar"));
  }, []);

  const disparos = useMemo(() => {
    const m = new Map<string, number>();
    for (const { regra, matches } of avaliarRegras(regras || [], camps)) m.set(regra.id, matches.length);
    return m;
  }, [regras, camps]);

  const salvarRegra = (r: Regra) => { const base = regras || []; const existe = base.some((x) => x.id === r.id); persistir(existe ? base.map((x) => (x.id === r.id ? r : x)) : [...base, r]); setEditando(null); };
  const remover = (id: string) => persistir((regras || []).filter((x) => x.id !== id));
  const toggle = (id: string) => persistir((regras || []).map((x) => (x.id === id ? { ...x, ativo: !x.ativo } : x)));

  return (
    <div className="tf-scope" style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Regras & Alertas</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 2 }}>Crie condições e o painel te avisa sozinho quando elas acontecerem.</p>
        </div>
        <Botao variante="primario" icone="circle-plus" onClick={() => setEditando(novaRegra())} style={{ marginLeft: "auto" }}>Nova regra</Botao>
      </div>

      {editando && <RegraForm regra={editando} onSalvar={salvarRegra} onCancelar={() => setEditando(null)} />}

      <div className="tf-panel" style={{ padding: regras && regras.length ? 8 : 18 }}>
        {regras == null ? (
          <div style={{ padding: 22, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Carregando…</div>
        ) : regras.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0, textAlign: "center", padding: 14 }}>Nenhuma regra ainda. Crie a primeira — ex.: “Quando ROAS abaixo de 1.5 → sugerir pausar”.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {regras.map((r) => {
              const n = disparos.get(r.id) || 0;
              const cor = COR[ACAO_COR[r.acao]];
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 12, background: "var(--surface-2)", opacity: r.ativo ? 1 : 0.55 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: cor }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{r.nome || descreverRegra(r)}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{r.nome ? descreverRegra(r) : ACAO_LABEL[r.acao]}</div>
                  </div>
                  {r.ativo && <span className="tf-num" style={{ flex: "none", fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: n > 0 ? `color-mix(in srgb, ${cor} 15%, transparent)` : "var(--surface)", color: n > 0 ? cor : "var(--text-dim)" }}>{n > 0 ? `${n} disparando` : "0 agora"}</span>}
                  <Interruptor ligado={r.ativo} onChange={() => toggle(r.id)} titulo={`${r.ativo ? "Desativar" : "Ativar"} regra ${r.nome || descreverRegra(r)}`} cor="var(--primary)" />
                  <BotaoIcone icone="edit" titulo="Editar" variante="secundario" onClick={() => setEditando(r)} style={{ flex: "none" }} />
                  <BotaoIcone icone="trash" titulo="Excluir" variante="perigo" onClick={() => remover(r.id)} style={{ flex: "none" }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RegraForm({ regra, onSalvar, onCancelar }: { regra: Regra; onSalvar: (r: Regra) => void; onCancelar: () => void }) {
  const [r, setR] = useState<Regra>(regra);
  const sel = { border: "1px solid var(--tf-line)", borderRadius: 9, padding: "8px 10px", fontSize: 13, background: "var(--surface)", color: "var(--text)", appearance: "auto" as const };
  return (
    <div className="tf-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, borderColor: "color-mix(in srgb, var(--primary) 30%, var(--tf-line))" }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>{regra.nome || "Nova regra"}</div>
      <input value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value })} placeholder="Nome da regra (opcional)"
        style={{ border: "1px solid var(--tf-line)", borderRadius: 10, padding: "9px 11px", fontSize: 13.5, background: "var(--surface)", color: "var(--text)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: "var(--text-dim)" }}>
        <span style={{ fontWeight: 700 }}>Quando</span>
        <GlassSelect value={r.metrica} onChange={(v) => setR({ ...r, metrica: v as MetricaRegra })} style={{ width: 150 }}
          options={(Object.keys(METRICA_LABEL) as MetricaRegra[]).map((k) => ({ value: k, label: METRICA_LABEL[k] }))} />
        <GlassSelect value={r.operador} onChange={(v) => setR({ ...r, operador: v as OperadorRegra })} style={{ width: 130 }}
          options={[{ value: ">", label: "acima de" }, { value: "<", label: "abaixo de" }, { value: ">=", label: "≥" }, { value: "<=", label: "≤" }]} />
        <input type="number" value={r.valor} onChange={(e) => setR({ ...r, valor: Number(e.target.value) || 0 })} style={{ ...sel, width: 100 }} />
        <span style={{ fontWeight: 700 }}>numa campanha, então</span>
        <GlassSelect value={r.acao} onChange={(v) => setR({ ...r, acao: v as AcaoRegra })} style={{ width: 160 }}
          options={(Object.keys(ACAO_LABEL) as AcaoRegra[]).map((k) => ({ value: k, label: ACAO_LABEL[k] }))} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <Botao variante="primario" onClick={() => onSalvar(r)}>Salvar regra</Botao>
        <Botao variante="secundario" onClick={onCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}
