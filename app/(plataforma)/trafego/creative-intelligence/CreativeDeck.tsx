"use client";

import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import type { EditorDeck, EditorSlideId, EngagementGroup } from "@/lib/creative-intelligence/editor-deck";
import { METRIC_DEFINITIONS } from "@/lib/creative-intelligence/metrics";
import { clipDoTrapezio, corDaFaixa, trapeziosDoFunil } from "@/lib/funil-forma";
import type { CreativeIntelligencePayload } from "@/lib/creative-intelligence/types";
import { Icon } from "../../Icon";
import { formatMetric, metricTone } from "./ui";

export const SLIDE_LABELS: Record<EditorSlideId, { kicker: string; short: string }> = {
  capa: { kicker: "Resumo para edição", short: "Capa" },
  sinais: { kicker: "Métricas dos editores", short: "Editores" },
  retencao: { kicker: "Retenção", short: "Retenção" },
  engajamento: { kicker: "Engajamento", short: "Engajamento" },
  leitura: { kicker: "Leitura para edição", short: "Leitura" },
  testes: { kicker: "Próximas versões", short: "Testes" },
};

// Posição na cascata de entrada do slide (a demora sai do token, no CSS).
const rise = (i: number) => ({ "--i": i }) as CSSProperties;
const fill = (v: number) => ({ "--v": Math.max(0, Math.min(1, v)) }) as CSSProperties;

type DeckContent = { deck: EditorDeck; payload: CreativeIntelligencePayload; previewUrl?: string | null };

/**
 * Os slides. TODOS ficam no DOM e só o atual aparece: o PDF clona o conjunto
 * inteiro, e trocar de slide é tirar/pôr `hidden` — sair do display:none é o
 * que reinicia a cascata de entrada do slide que chega.
 */
export function DeckSlides({ deck, payload, previewUrl, current, slidesRef }: DeckContent & { current: number; slidesRef?: Ref<HTMLDivElement> }) {
  const total = deck.slides.length;
  return (
    <div ref={slidesRef} className="ci-slides" data-report-type="editor">
      {deck.slides.map((id, index) => (
        <article
          key={id}
          className="ci-slide"
          data-slide={id}
          hidden={index !== current}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} de ${total}: ${SLIDE_LABELS[id].kicker}`}
        >
          {id !== "capa" && <span className="ci-slide-kicker ci-rise" style={rise(0)}>{SLIDE_LABELS[id].kicker}</span>}
          <div className="ci-slide-body">
            {id === "capa" && <Cover deck={deck} payload={payload} previewUrl={previewUrl} />}
            {id === "sinais" && <Signals deck={deck} />}
            {id === "retencao" && <Retention deck={deck} />}
            {id === "engajamento" && <Engagement deck={deck} />}
            {id === "leitura" && <Reading deck={deck} />}
            {id === "testes" && <Tests deck={deck} />}
          </div>
          <footer className="ci-slide-foot"><span>{payload.current.name} · {deck.periodLabel}</span><span>{index + 1} / {total}</span></footer>
        </article>
      ))}
    </div>
  );
}

function Cover({ deck, payload, previewUrl }: DeckContent) {
  const tags = payload.current.tags ?? [];
  return (
    <div className="ci-cover" data-midia={previewUrl ? "true" : undefined}>
      {previewUrl && <figure className="ci-cover-media ci-rise" style={rise(0)}><img src={previewUrl} alt="Prévia do criativo" /></figure>}
      <div className="ci-cover-text">
        <span className="ci-slide-kicker ci-rise" style={rise(0)}>{SLIDE_LABELS.capa.kicker}</span>
        <h2 className="ci-rise" style={rise(1)}>{payload.current.name}</h2>
        <p className="ci-cover-period ci-rise" style={rise(2)}>{deck.periodLabel}</p>
        {(tags.length > 0 || deck.sampleSize > 1) && (
          <div className="ci-cover-meta ci-rise" style={rise(3)}>
            {tags.map((tag) => <span key={tag}>{tag}</span>)}
            {deck.sampleSize > 1 && <span>Mediana de {deck.sampleSize} criativos da conta</span>}
          </div>
        )}
      </div>
      <div className="ci-cover-score ci-rise" style={rise(3)}>
        <ScoreRing score={payload.score.overallScore} />
        <span>Creative Score</span>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const value = score == null ? null : Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className="ci-ring" role="img" aria-label={value == null ? "Creative Score indisponível" : `Creative Score ${value} de 100`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ci-ring-trilho" cx="60" cy="60" r="52" />
        {value ? <circle className="ci-ring-valor" cx="60" cy="60" r="52" pathLength={100} strokeDasharray={`${value} 100`} transform="rotate(-90 60 60)" /> : null}
      </svg>
      <div aria-hidden="true"><strong>{value ?? "–"}</strong><small>/ 100</small></div>
    </div>
  );
}

function Signals({ deck }: { deck: EditorDeck }) {
  return (
    <>
      <h3 className="ci-rise" style={rise(1)}>O que o público fez</h3>
      <div className="ci-signals">
        {deck.signals.map((signal, index) => {
          const top = Math.max(signal.value ?? 0, signal.median ?? 0);
          return (
            <div key={signal.key} className="ci-signal ci-rise" style={rise(2 + index)} data-tone={metricTone(signal.key)}>
              <small>{signal.label}</small>
              <strong>{formatMetric(signal.key, signal.value)}</strong>
              <span className="ci-signal-name">{signal.explanation}</span>
              {signal.value != null && signal.median != null && top > 0 && (
                <div className="ci-signal-bars" aria-hidden="true">
                  <i style={fill(signal.value / top)} />
                  <i data-apoio="true" style={fill(signal.median / top)} />
                </div>
              )}
              <em data-verdict={signal.verdict}>{signal.comparison}</em>
            </div>
          );
        })}
      </div>
      <div className="ci-legend ci-rise" style={rise(5)} aria-hidden="true">
        <span><i />Este criativo</span>
        <span><i data-apoio="true" />Mediana da conta</span>
      </div>
    </>
  );
}

function Retention({ deck }: { deck: EditorDeck }) {
  const drop = deck.biggestDrop;
  const faixas = trapeziosDoFunil(deck.retention.length, 0.4);
  return (
    <>
      <h3 className="ci-rise" style={rise(1)}>Onde o público sai</h3>
      <div className="ci-retention">
        {/* Funil clássico: trapézios, escuro em cima, texto branco dentro. */}
        <ol className="ci-funil">
          {deck.retention.map((step, index) => {
            const faixa = faixas[index];
            return (
              <li key={step.key} className="ci-rise" style={{ ...rise(2 + index), background: corDaFaixa(index, faixas.length), clipPath: clipDoTrapezio(faixa.topo, faixa.fundo) }} data-queda={drop?.to.key === step.key ? "true" : undefined}>
                <span>{step.label}</span>
                <strong>{Math.round(step.share)}%</strong>
              </li>
            );
          })}
        </ol>
        {drop && (
          <aside className="ci-retention-callout ci-rise" style={rise(4)}>
            <small>Maior saída</small>
            <strong>{drop.lost} de cada 100</strong>
            <p>
              pessoas que passaram dos 3 segundos {drop.from.key === "videoViews3s" ? `saem antes de chegar ${drop.to.chegada}` : `saem entre ${drop.from.trecho} e ${drop.to.trecho}`}.
              {" "}Revise esse trecho primeiro.
            </p>
          </aside>
        )}
      </div>
    </>
  );
}

const GRUPOS: Array<{ id: EngagementGroup; label: string }> = [
  { id: "resultado", label: "Resultado" },
  { id: "publico", label: "Público" },
];

function Engagement({ deck }: { deck: EditorDeck }) {
  // Cascata com teto: oito números em fila atrasariam o último quase um segundo.
  let ordem = 2;
  const proxima = () => rise(Math.min(ordem++, 6));
  return (
    <>
      <h3 className="ci-rise" style={rise(1)}>Como o anúncio performou</h3>
      <div className="ci-engajamento">
        {GRUPOS.map((grupo) => {
          const itens = deck.engagement.filter((item) => item.group === grupo.id);
          return (
            <section key={grupo.id} className="ci-eng-grupo" data-grupo={grupo.id} aria-label={grupo.label}>
              <small className="ci-eng-titulo ci-rise" style={proxima()}>{grupo.label}</small>
              <div className="ci-eng-itens" style={{ "--cols": itens.length } as CSSProperties}>
                {itens.map((item) => (
                  <div key={item.key} className="ci-eng-item ci-rise" style={proxima()} data-tone={metricTone(item.key)}>
                    <span>{METRIC_DEFINITIONS[item.key].label}</span>
                    <strong>{formatMetric(item.key, item.value)}</strong>
                    {item.note && <em data-tom={item.tone ?? undefined}>{item.note}</em>}
                  </div>
                ))}
              </div>
              {grupo.id === "publico" && deck.engagementPending && (
                <p className="ci-eng-aviso">Curtidas, comentários e compartilhamentos entram a partir da próxima sincronização com a Meta.</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Reading({ deck }: { deck: EditorDeck }) {
  const { reading } = deck;
  const evidence = reading.evidence;
  return (
    <div className="ci-reading">
      <h3 className="ci-rise" style={rise(1)}>{reading.title}</h3>
      <p className="ci-rise" style={rise(2)}>{reading.description}</p>
      {evidence && (
        <p className="ci-reading-evidence ci-rise" style={rise(3)}>
          <Icon name="chart-bar" size={15} color="var(--primary-texto)" />
          <span>{METRIC_DEFINITIONS[evidence.key].label} {formatMetric(evidence.key, evidence.value)} · mediana {formatMetric(evidence.key, evidence.median)}</span>
        </p>
      )}
      <div className="ci-editor-note ci-rise" style={rise(4)}>
        <Icon name="bulb" size={18} color="var(--primary-texto)" />
        <span>Compare sempre versões no mesmo período. Uma mudança por vez deixa claro qual escolha de edição fez diferença.</span>
      </div>
    </div>
  );
}

function Tests({ deck }: { deck: EditorDeck }) {
  return (
    <>
      <h3 className="ci-rise" style={rise(1)}>O que testar agora</h3>
      <ol className="ci-editor-tests">
        {deck.tests.map((test, index) => (
          <li key={test.text} className="ci-rise" style={rise(2 + index)}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            <div><span>{test.text}</span>{test.reason && <small>{test.reason}</small>}</div>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Setas + etapas nomeadas + contador. As etapas são o sumário: pular direto pra "Testes". */
export function DeckNav({ deck, current, onGo, children }: { deck: EditorDeck; current: number; onGo: (index: number) => void; children?: ReactNode }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const total = deck.slides.length;
  useEffect(() => {
    // Traz a etapa atual pra vista SÓ na horizontal: scrollIntoView também
    // rolaria a coluna do modal, e o deck pularia de lugar a cada seta.
    const strip = stripRef.current;
    const step = strip?.children[current] as HTMLElement | undefined;
    if (!strip || !step || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = step.offsetLeft - (strip.clientWidth - step.offsetWidth) / 2;
  }, [current]);
  return (
    <nav className="ci-deck-nav" aria-label="Slides da apresentação">
      {children}
      <button type="button" className="ci-deck-arrow" aria-label="Slide anterior" disabled={current === 0} onClick={() => onGo(current - 1)}>
        <Icon name="chevron-left" size={18} color="currentColor" />
      </button>
      <div ref={stripRef} className="tab-strip ci-deck-steps">
        {deck.slides.map((id, index) => (
          <button
            type="button"
            key={id}
            aria-current={index === current ? "step" : undefined}
            aria-label={`Ir para o slide ${index + 1}: ${SLIDE_LABELS[id].kicker}`}
            onClick={() => onGo(index)}
          >
            <b>{index + 1}</b><span>{SLIDE_LABELS[id].short}</span>
          </button>
        ))}
      </div>
      <span className="ci-deck-count" aria-live="polite">{current + 1} / {total}</span>
      <button type="button" className="ci-deck-arrow" aria-label="Próximo slide" disabled={current >= total - 1} onClick={() => onGo(current + 1)}>
        <Icon name="chevron-right" size={18} color="currentColor" />
      </button>
    </nav>
  );
}

/** Arrastar pro lado troca de slide no toque. Mouse fica de fora: arrastar com ele é selecionar texto. */
export function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  return {
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse") start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    },
    onPointerUp: (event: ReactPointerEvent) => {
      const origin = start.current;
      start.current = null;
      if (!origin || origin.id !== event.pointerId) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      if (dx < 0) onNext(); else onPrev();
    },
    onPointerCancel: () => { start.current = null; },
  };
}

/** O deck dentro da aba: um slide por vez no palco, navegação logo abaixo. */
export function DeckViewer({ deck, payload, previewUrl, current, onGo, slidesRef }: DeckContent & {
  current: number;
  onGo: (index: number) => void;
  slidesRef?: Ref<HTMLDivElement>;
}) {
  const total = deck.slides.length;
  const swipe = useSwipe(() => onGo(current - 1), () => onGo(current + 1));
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = ({ ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: total - 1 } as Record<string, number>)[event.key];
    if (target == null) return;
    event.preventDefault();
    // O modal do criativo usa ← → pra trocar de CRIATIVO (listener no window).
    // Com o foco no deck a seta é do slide e não pode vazar pra lá.
    event.stopPropagation();
    onGo(target);
  };
  return (
    <section className="ci-deck" aria-roledescription="apresentação" aria-label={`Resumo para edição: ${payload.current.name}`} onKeyDown={onKeyDown}>
      <div className="ci-deck-stage" tabIndex={0} {...swipe}>
        <DeckSlides deck={deck} payload={payload} previewUrl={previewUrl} current={current} slidesRef={slidesRef} />
      </div>
      <DeckNav deck={deck} current={current} onGo={onGo} />
    </section>
  );
}
