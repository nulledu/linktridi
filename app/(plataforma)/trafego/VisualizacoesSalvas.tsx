"use client";

// ── Tridify · Visualizações salvas (§5) ──────────────────────────────────────
// Salva uma COMBINAÇÃO de análise (período + contas selecionadas) com um nome e
// aplica em 1 clique. Layout do painel e conjunto de métricas já são salvos por
// usuário nos próprios widgets; aqui guardamos os filtros que cruzam as abas.
// Persistente por usuário (localStorage).

import { tfSet } from "./ajustes-na-conta";
import { useEffect, useRef, useState } from "react";
import type { PeriodState } from "../PeriodPicker";
import { Icon } from "../Icon";
import { TrocaIcone, useAbrirFechar } from "../ui/micro";
import { Botao, BotaoIcone } from "../ui/controles";
interface Visao { nome: string; period: PeriodState; contas: string[] }

export function VisualizacoesSalvas({ userId, period, contas, onApply }: {
  userId: string; period: PeriodState; contas: string[]; onApply: (p: PeriodState, c: string[]) => void;
}) {
  const key = `trafego.visoes.${userId}`;
  const [visoes, setVisoes] = useState<Visao[]>([]);
  const [aberto, setAberto] = useState(false);
  // Receita t-dropdown (transitions.dev): monta → is-open; fecha → is-closing
  // e desmonta depois de --dropdown-close-dur. Antes abria em corte seco.
  const pop = useAbrirFechar(aberto, "--dropdown-close-dur");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const s = localStorage.getItem(key); if (s) setVisoes(JSON.parse(s)); } catch { /* */ } }, [key]);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora); return () => document.removeEventListener("mousedown", fora);
  }, []);

  function persistir(v: Visao[]) { setVisoes(v); try { tfSet(key, JSON.stringify(v)); } catch { /* */ } }
  function salvar() {
    const nome = prompt("Nome da visualização (ex.: Meta principal · 7 dias):"); if (!nome) return;
    persistir([{ nome, period, contas }, ...visoes.filter((v) => v.nome !== nome)]);
    setAberto(false);
  }
  function aplicar(v: Visao) { onApply(v.period, v.contas); setAberto(false); }
  function remover(nome: string) { persistir(visoes.filter((v) => v.nome !== nome)); }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setAberto((v) => !v)} title="Visualizações salvas"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text)", fontSize: 12.5, fontWeight: 700 }}>
        <Icon name="star" size={14} color="var(--primary-texto)" /> Visualizações
        <TrocaIcone ligado={aberto} a="chevron-down" b="chevron-up" size={13} corA="var(--text-dim)" corB="var(--text-dim)" />
      </button>
      {pop.montado && (
        // .gp-pop: no celular a fundação prende embaixo como folha — os 280px
        // fixos com right:0 nasciam pela metade fora da tela de 320px.
        <div className={`gp-pop t-dropdown ${pop.classe}`.trim()} data-origin="top-right" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, width: 280, borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 20px 50px -18px rgba(0,0,0,.55)", padding: 10 }}>
          <Botao variante="secundario" bloco icone="plus" onClick={salvar} style={{ marginBottom: 8 }}>Salvar a visualização atual</Botao>
          {visoes.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "6px 8px" }}>Nenhuma salva ainda. Salve os filtros que você mais usa.</div>}
          {visoes.map((v) => (
            <div key={v.nome} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10 }}>
              <button onClick={() => aplicar(v)} style={{ flex: 1, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", color: "var(--text)", minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.nome}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{v.contas.length === 0 ? "Todas as contas" : `${v.contas.length} conta(s)`}</div>
              </button>
              <BotaoIcone icone="x" titulo="Remover" tamanho="sm" onClick={() => remover(v.nome)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
