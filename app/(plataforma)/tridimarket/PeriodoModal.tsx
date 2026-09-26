"use client";

// Seletor de período do TridiMarket — modal com PRESETS (coluna) + calendário de
// FAIXA de dois meses (igual ao pedido do usuário). Rascunho local: só aplica ao
// clicar "Atualizar" (Cancelar/ESC descartam). Não toca o PeriodPicker global do
// resto do app (que outra área usa e edita em paralelo).
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { montarPeriodo, PERIODOS, rotuloPeriodo, type ChavePeriodo } from "../../../lib/tridimarket/periodo";
import type { Filtros } from "./Filtros";
import { INDIGO } from "./ui";
import { useIsMobile } from "../ui/useMediaQuery";
import { Botao, BotaoIcone } from "../ui/controles";

const DOW = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const primeiroDoMes = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMes = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Draft = { periodo: ChavePeriodo; de: string; ate: string };
type Range = { de: string; ate: string } | null;   // YYYY-MM-DD

export function SeletorPeriodo({ filtros, setFiltros }: { filtros: Filtros; setFiltros: (f: Partial<Filtros>) => void }) {
  const [aberto, setAberto] = useState(false);
  const per = montarPeriodo(filtros.periodo, new Date(), { de: filtros.de, ate: filtros.ate });
  return (
    <>
      <button onClick={() => setAberto(true)} aria-haspopup="dialog" aria-label="Período"
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: "var(--r-sm)", cursor: "pointer",
          border: `1px solid ${aberto ? INDIGO : "var(--border)"}`, background: "var(--surface)", color: "var(--text)",
          fontSize: 12.5, fontWeight: 700,
        }}>
        <Icon name="calendar" size={15} color={INDIGO} />
        <span style={{ whiteSpace: "nowrap" }}>{rotuloPeriodo(per)}</span>
        <Icon name="chevron-down" size={14} color="var(--text-dim)" />
      </button>
      {aberto && (
        <ModalPeriodo
          filtros={filtros}
          onAplicar={(d) => { setFiltros({ periodo: d.periodo, de: d.de, ate: d.ate }); setAberto(false); }}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

function ModalPeriodo({ filtros, onAplicar, onFechar }: { filtros: Filtros; onAplicar: (d: Draft) => void; onFechar: () => void }) {
  const hoje = new Date();
  // No celular a folha tem ~300px: a coluna de presets vira uma fileira que rola
  // de lado (.tab-strip) e o calendário mostra UM mês — dois meses empilhados
  // dariam ~700px de rolagem antes de chegar em "Atualizar".
  const celular = useIsMobile();
  const tiras = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft>({ periodo: filtros.periodo, de: filtros.de || "", ate: filtros.ate || "" });
  const [mesRef, setMesRef] = useState<Date>(() => {
    // Mostra o mês do INÍCIO do período atual (senão o corrente). Trava em ~13
    // meses atrás pra "Máximo" (que começa em 2000) não jogar o calendário longe.
    const p = montarPeriodo(filtros.periodo, hoje, { de: filtros.de, ate: filtros.ate });
    const ini = new Date(p.de);
    const min = addMes(primeiroDoMes(hoje), -13);
    return ini < min ? primeiroDoMes(hoje) : primeiroDoMes(ini);
  });

  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [onFechar]);

  // Fileira que rola de lado só serve se a opção marcada estiver visível.
  useEffect(() => {
    if (!celular) return;
    const marcado = tiras.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    marcado?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [celular, draft.periodo]);

  // Faixa destacada no calendário — do rascunho atual (preset ou custom).
  const range: Range = useMemo(() => {
    if (draft.periodo === "custom") {
      if (draft.de && draft.ate) return draft.de <= draft.ate ? { de: draft.de, ate: draft.ate } : { de: draft.ate, ate: draft.de };
      if (draft.de) return { de: draft.de, ate: draft.de };
      return null;
    }
    const p = montarPeriodo(draft.periodo, hoje);
    return { de: ymd(new Date(p.de)), ate: ymd(new Date(p.ate)) };
  }, [draft, hoje]);

  // Clique num dia: 1º define o início (limpa fim); 2º define o fim (ou reinicia).
  const pickDia = (iso: string) => setDraft((d) => {
    if (d.periodo !== "custom" || !d.de || (d.de && d.ate)) return { periodo: "custom", de: iso, ate: "" };
    return { periodo: "custom", de: d.de, ate: iso };
  });

  const aplicar = () => {
    if (draft.periodo === "custom" && draft.de && !draft.ate) onAplicar({ periodo: "custom", de: draft.de, ate: draft.de });
    else onAplicar(draft);
  };

  const navBtn = (dir: -1 | 1) => (
    <BotaoIcone icone={dir < 0 ? "chevron-left" : "chevron-right"} titulo={dir < 0 ? "Mês anterior" : "Próximo mês"}
      variante="secundario" tamanho="sm" onClick={() => setMesRef((m) => addMes(m, dir))} style={{ flex: "none" }} />
  );

  return createPortal(
    <div onClick={onFechar} role="dialog" aria-modal="true" aria-label="Selecionar período" className="sheet-host"
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(15,16,22,.5)", backdropFilter: "blur(2px)", display: "grid", placeItems: "center", padding: 16, animation: "tfFade .16s ease both" }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet"
        style={{ width: "min(880px, 100%)", maxHeight: "92dvh", overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", boxShadow: "0 30px 80px -20px rgba(0,0,0,.5)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>Selecionar Período</span>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onFechar} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
          {/* Presets: coluna no computador, fileira rolável no celular. */}
          <div ref={tiras} className={celular ? "tab-strip" : undefined}
            style={celular
              ? { gap: 6, padding: "10px 12px", width: "100%", borderBottom: "1px solid var(--border)", borderRadius: 0 }
              : { display: "flex", flexDirection: "column", gap: 2, padding: 12, minWidth: 190, borderRight: "1px solid var(--border)" }}>
            {PERIODOS.map((p) => {
              const on = draft.periodo === p.chave;
              return (
                <button key={p.chave} onClick={() => setDraft({ periodo: p.chave, de: "", ate: "" })} aria-pressed={on}
                  style={{
                    textAlign: "left", padding: "9px 12px", borderRadius: "var(--r-xs)", cursor: "pointer",
                    border: celular ? `1px solid ${on ? INDIGO : "var(--border)"}` : "none",
                    fontSize: 13.5, fontWeight: on ? 800 : 600,
                    background: on ? `color-mix(in srgb, ${INDIGO} 14%, transparent)` : "transparent",
                    color: on ? INDIGO : "var(--text)",
                  }}>{p.label}</button>
              );
            })}
          </div>

          {/* Calendário: dois meses no computador, um no celular. */}
          <div style={{ flex: 1, minWidth: "min(100%, 300px)", padding: "16px 20px", display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
            {celular ? (
              <MesGrade base={mesRef} range={range} hoje={ymd(hoje)} onPick={pickDia} navEsq={navBtn(-1)} navDir={navBtn(1)} />
            ) : (
              <>
                <MesGrade base={mesRef} range={range} hoje={ymd(hoje)} onPick={pickDia} navEsq={navBtn(-1)} />
                <MesGrade base={addMes(mesRef, 1)} range={range} hoje={ymd(hoje)} onPick={pickDia} navDir={navBtn(1)} />
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={aplicar}>Atualizar</Botao>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MesGrade({ base, range, hoje, onPick, navEsq, navDir }: {
  base: Date; range: Range; hoje: string; onPick: (iso: string) => void;
  // Com dois meses cada um leva uma seta; com um mês só, ele leva as duas.
  navEsq?: React.ReactNode; navDir?: React.ReactNode;
}) {
  const y = base.getFullYear(), m = base.getMonth();
  const nome = cap(base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
  const primeiroDia = new Date(y, m, 1).getDay();     // 0 = DOM
  const numDias = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<number | null>(primeiroDia).fill(null), ...Array.from({ length: numDias }, (_, i) => i + 1)];
  return (
    <div style={{ width: 250, maxWidth: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        {navEsq ?? <span style={{ width: 30, flex: "none" }} />}
        <span style={{ fontSize: 15, fontWeight: 800 }}>{nome}</span>
        {navDir ?? <span style={{ width: 30, flex: "none" }} />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
        {DOW.map((w) => <span key={w} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "var(--text-dim)", letterSpacing: ".02em" }}>{w}</span>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (d == null) return <span key={`e${i}`} />;
          const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const ext = !!range && (iso === range.de || iso === range.ate);
          const entre = !!range && iso > range.de && iso < range.ate;
          const ehHoje = iso === hoje;
          return (
            <button key={iso} onClick={() => onPick(iso)}
              style={{
                height: 34, border: "none", cursor: "pointer", fontSize: 13,
                borderRadius: entre ? 0 : 9,
                fontWeight: ext ? 800 : ehHoje ? 800 : 600,
                background: ext ? INDIGO : entre ? `color-mix(in srgb, ${INDIGO} 14%, transparent)` : "transparent",
                color: ext ? "#fff" : entre ? INDIGO : "var(--text)",
                outline: ehHoje && !ext ? `1.5px solid ${INDIGO}` : "none", outlineOffset: -2,
              }}>{d}</button>
          );
        })}
      </div>
    </div>
  );
}
