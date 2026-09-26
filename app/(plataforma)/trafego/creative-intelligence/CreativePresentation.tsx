"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEditorDeck } from "@/lib/creative-intelligence/editor-deck";
import { periodForPreset, type CreativePeriodPreset, type CreativePeriodSelection } from "@/lib/creative-intelligence/period";
import type { CreativeIntelligencePayload } from "@/lib/creative-intelligence/types";
import { Icon } from "../../Icon";
import { DeckViewer } from "./CreativeDeck";
import { CreativePresenter } from "./CreativePresenter";
import { printCreativeReport } from "./print-report";

export function CreativePresentation({ payload, previewUrl, panelPeriod, periodSelection, onPeriodSelectionChange }: {
  payload: CreativeIntelligencePayload;
  previewUrl?: string | null;
  panelPeriod: { since: string; until: string };
  periodSelection: CreativePeriodSelection;
  onPeriodSelectionChange?: (selection: CreativePeriodSelection) => void;
}) {
  const [customSince, setCustomSince] = useState(periodSelection.since);
  const [customUntil, setCustomUntil] = useState(periodSelection.until);
  const [printError, setPrintError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const slidesRef = useRef<HTMLDivElement>(null);
  // Só sai da tela cheia quem entrou nela: se a pessoa já estava em tela
  // cheia antes de apresentar, fechar a apresentação não mexe nisso.
  const fullscreen = useRef(false);
  const presentingRef = useRef(false);
  const deck = useMemo(() => buildEditorDeck(payload), [payload]);
  const total = deck.slides.length;
  const index = Math.min(current, total - 1);
  const go = useCallback((next: number) => setCurrent(Math.max(0, Math.min(total - 1, next))), [total]);

  useEffect(() => { setCurrent(0); }, [payload.current.id]);
  useEffect(() => { presentingRef.current = presenting; }, [presenting]);

  useEffect(() => {
    setCustomSince(periodSelection.since);
    setCustomUntil(periodSelection.until);
  }, [periodSelection.since, periodSelection.until]);

  const closePresenter = useCallback(() => {
    setPresenting(false);
    if (!fullscreen.current) return;
    fullscreen.current = false;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!presenting) return;
    // Na tela cheia o Esc é do navegador: ele sai da tela cheia e a página nem
    // recebe a tecla. Sair da tela cheia por fora encerra a apresentação junto.
    const onChange = () => {
      if (document.fullscreenElement || !fullscreen.current) return;
      fullscreen.current = false;
      setPresenting(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [presenting]);

  const openPresenter = () => {
    setPresenting(true);
    const root = document.documentElement;
    // O pedido sai síncrono, dentro do clique — fora do gesto o navegador
    // recusa. Sem suporte (iPhone), a apresentação cobre a janela do mesmo jeito.
    if (document.fullscreenElement || typeof root.requestFullscreen !== "function") return;
    root.requestFullscreen().then(() => {
      if (presentingRef.current) fullscreen.current = true;
      else document.exitFullscreen?.().catch(() => undefined);
    }).catch(() => undefined);
  };

  const exportPdf = () => {
    const slides = slidesRef.current;
    // A tinta da marca da pessoa vai junto: o PDF sai com a mesma cor da tela.
    const accent = slides ? getComputedStyle(slides).getPropertyValue("--primary").trim() : "";
    const opened = slides ? printCreativeReport(slides, `Resumo criativo — ${payload.current.name}`, { accent }) : false;
    setPrintError(!opened);
  };

  const selectPreset = (preset: CreativePeriodPreset) => {
    if (!onPeriodSelectionChange) return;
    if (preset === "custom") {
      onPeriodSelectionChange({ ...periodSelection, preset });
      return;
    }
    if (preset === "panel") {
      onPeriodSelectionChange({ preset, ...panelPeriod });
      return;
    }
    onPeriodSelectionChange({ preset, ...periodForPreset(preset) });
  };

  return (
    <div className="ci-presentation">
      <div className="ci-report-toolbar">
        <div className="ci-report-controls">
          <label>Período<select value={periodSelection.preset} onChange={(event) => selectPreset(event.target.value as CreativePeriodPreset)}><option value="panel">Período do painel</option><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="7">7 dias</option><option value="14">14 dias</option><option value="30">30 dias</option><option value="custom">Personalizado</option></select></label>
        </div>
        <div className="ci-report-actions">
          <button type="button" className="ci-btn-primario" onClick={openPresenter}><Icon name="player-play" size={15} color="currentColor" /> Apresentar</button>
          <button type="button" onClick={exportPdf}><Icon name="printer" size={15} color="currentColor" /> Exportar PDF</button>
        </div>
      </div>
      {periodSelection.preset === "custom" && <div className="ci-custom-period"><label>De<input type="date" value={customSince} onChange={(event) => setCustomSince(event.target.value)} /></label><label>Até<input type="date" value={customUntil} onChange={(event) => setCustomUntil(event.target.value)} /></label><button disabled={!onPeriodSelectionChange || !customSince || !customUntil || customSince > customUntil} onClick={() => onPeriodSelectionChange?.({ preset: "custom", since: customSince, until: customUntil })}>Aplicar período</button></div>}
      <div className="ci-report-context">Resumo para edição com dados de {deck.periodLabel} · {total} slides</div>
      {printError && <div className="ci-error" role="alert"><Icon name="alert-triangle" size={15} color="currentColor" /> Permita pop-ups para abrir a versão pronta para PDF.</div>}

      <DeckViewer deck={deck} payload={payload} previewUrl={previewUrl} current={index} onGo={go} slidesRef={slidesRef} />

      {presenting && <CreativePresenter deck={deck} payload={payload} previewUrl={previewUrl} current={index} onGo={go} onClose={closePresenter} />}
    </div>
  );
}
