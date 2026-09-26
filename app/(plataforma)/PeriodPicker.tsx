"use client";
import "./period-picker.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PeriodKey } from "@/lib/period";
import { Icon } from "./Icon";
import { Botao } from "./ui/controles";
import { CalendarioIntervalo } from "./ui/calendario";
import { duracaoCss, origemDaAncora, useAbrirFechar, type OrigemFolha } from "./ui/micro";

export interface PeriodState { key: PeriodKey; from: string; to: string }
export const DEFAULT_PERIOD: PeriodState = { key: "mes", from: "", to: "" };

export function periodQuery(p: PeriodState): string {
  const q = new URLSearchParams({ period: p.key });
  if (p.key === "custom" && p.from && p.to) { q.set("from", p.from); q.set("to", p.to); }
  return q.toString();
}

const CHIPS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Este mês" },
];

const brLabel = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}`; };

const LARGURA_POP = 300;

// Classes que redefinem TOKENS de cor por ambiente. O painel sai pro <body>, então
// leva o escopo consigo — senão a Tridify (superfícies SÓLIDAS) volta pro
// `--surface` translúcido do global e o calendário destoa da tela que o abriu.
const ESCOPOS = ".tf-scope, .tf-workspace, .tm-workspace";

/* ── O painel NÃO mora dentro da fileira; mora no <body> ─────────────────────
   Ancorado como filho do invólucro do botão, ele herdava tudo que os ancestrais
   fizessem — e a fileira de filtro faz duas coisas fatais:

     • `transform: scale(.97)` no `:active` (a resposta de toque). Transform ≠
       `none` cria CONTEXTO DE EMPILHAMENTO: o `z-index` do calendário passava a
       valer só dentro do invólucro de 82×30 e a folha ia PARA TRÁS dos cards no
       instante do mousedown. Medido: mousedown no BUTTON "15", mouseup no
       `.tf-panel` do ROAS, click num ancestral comum — o `onClick` do dia nunca
       rodava.
     • `mask-image` (o esmaecido de "tem mais pra ver") faz da fileira o BLOCO DE
       CONTENÇÃO do `position: fixed`: no celular a folha nascia recortada dentro
       da fileira de 44px em vez de presa embaixo da tela.

   Guardar cada propriedade de cada ancestral é jogo perdido — a coluna de
   conteúdo tem `overflow: hidden`, cartão tem `backdrop-filter`, e qualquer
   `transform` novo em qualquer ancestral reabre o mesmo buraco. No <body> nada
   disso alcança: sem ancestral, não há contexto de empilhamento, bloco de
   contenção nem recorte pra herdar. */
function FolhaAncorada({ ancora, aberto, onFechar, children }: {
  ancora: React.RefObject<HTMLElement | null>;
  aberto: boolean;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const [caixa, setCaixa] = useState<{ top: number; left: number; origem: OrigemFolha } | null>(null);
  const [escopo, setEscopo] = useState("");

  // A folha precisa SOBREVIVER ao `aberto = false` pra caber o fechamento
  // (`.is-closing` → desmonta). Abrir é convite, fechar é sair da frente: quem
  // manda no relógio é a escala do `:root` (250ms abre, 150ms fecha).
  // Sem essa escala aplicada (nenhum `globals.css` — é o caso do jsdom nos
  // testes) não há transição pra esperar e segurar o nó montado por 150ms só
  // deixaria um fantasma no DOM que ninguém vê sumir.
  const { montado, classe } = useAbrirFechar(aberto, "--dropdown-close-dur");
  const [comEscala] = useState(() => duracaoCss("--dropdown-close-dur", 0) > 0);
  const vivo = comEscala ? montado : aberto;

  useEffect(() => {
    // A caixa NÃO é zerada ao fechar: o painel continua em cena durante o
    // fechamento, e sem posição ele sumiria de uma vez em vez de sair.
    if (!aberto) return;
    const medir = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      // Não passa da borda direita: o painel tem largura fixa e o botão pode
      // estar encostado no fim do cabeçalho.
      const top = r.bottom + 8;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - LARGURA_POP - 8));
      // De qual canto ela cresce, medido a partir do botão: o olho segue a
      // ORIGEM, não a posição final — folha que abre pra cima mas cresce do topo
      // parece ter vindo do lugar errado.
      setCaixa({ top, left, origem: origemDaAncora(r, { top, left }) });
    };
    setEscopo(ancora.current?.closest(ESCOPOS)?.className ?? "");
    medir();
    // Captura: na Tridify quem rola é a coluna de conteúdo, não a página — sem
    // `true` o painel ficaria parado enquanto o botão sobe.
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => { window.removeEventListener("scroll", medir, true); window.removeEventListener("resize", medir); };
  }, [aberto, ancora]);

  useEffect(() => {
    if (!aberto) return;
    // O painel não é mais descendente da âncora: o teste de "tocou fora" tem que
    // olhar as DUAS caixas, senão clicar num dia fecharia a folha.
    const onDown = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!ancora.current?.contains(alvo) && !painel.current?.contains(alvo)) onFechar();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [aberto, ancora, onFechar]);

  // `caixa` só existe depois do efeito → no servidor não renderiza nada.
  if (!vivo || !caixa) return null;
  return createPortal(
    <div className={escopo}>
      {/* A regra do transform residual vale pra ANCESTRAL de popover. Aqui o
          transform é do próprio painel, que já mora no <body> e não tem nenhum
          descendente `position: fixed` pra ancorar errado — o calendário inteiro
          é grade e botão. Por isso a receita pode escalar à vontade. */}
      <div ref={painel} className={`glass glass-spec gp-pop t-dropdown ${classe}`.trim()} data-origin={caixa.origem}
        style={{ position: "fixed", top: caixa.top, left: caixa.left, zIndex: 1400, borderRadius: 18, padding: 14, width: LARGURA_POP }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function PeriodPicker({ value, onChange }: { value: PeriodState; onChange: (p: PeriodState) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const fechar = useCallback(() => setOpen(false), []);

  return (
    /* `.filtro-faixa`: no computador é uma linha que quebra; no celular quebrar
       espalhava os seis chips + o seletor de datas em TRÊS fileiras. Este
       componente aparece em Tráfego, Comercial e nos relatórios — em cada um
       deles eram ~150px de cromo antes de qualquer conteúdo. Rolando de lado,
       vira uma fileira só. */
    <div className="filtro-faixa" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {CHIPS.map((c) => {
        const on = value.key === c.key;
        return (
          <button key={c.key} onClick={() => onChange({ key: c.key, from: "", to: "" })} className="glass glass-spec pp-pilula"
            style={{ padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: on ? "var(--on-primary, #fff)" : "var(--text)", background: on ? "var(--primary-acao, var(--primary))" : undefined }}>
            {c.label}
          </button>
        );
      })}
      <div ref={wrap} className="pp-datas" style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} className="glass glass-spec pp-pilula"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", color: value.key === "custom" ? "var(--on-primary, #fff)" : "var(--text)", background: value.key === "custom" ? "var(--primary-acao, var(--primary))" : undefined }}>
          <Icon name="calendar" size={15} color={value.key === "custom" ? "#fff" : "var(--text)"} />
          {value.key === "custom" && value.from && value.to ? `${brLabel(value.from)} → ${brLabel(value.to)}` : "Datas"}
        </button>
        <FolhaAncorada ancora={wrap} aberto={open} onFechar={fechar}>
          <Calendar
            from={value.from} to={value.to}
            onApply={(from, to) => { onChange({ key: "custom", from, to }); setOpen(false); }}
          />
        </FolhaAncorada>
      </div>
    </div>
  );
}

// Dropdown ÚNICO de intervalo: um botão "24/07 → 31/07" que abre o mesmo
// calendário de faixa do PeriodPicker. Existe pra telas que só querem "de..até"
// sem os chips de período (Registros de ponto) — antes eram dois campos de data
// soltos, e o usuário tinha que acertar as duas pontas separadas.
export function IntervaloDropdown({ from, to, onChange, style }: {
  from: string; to: string;
  onChange: (from: string, to: string) => void;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const fechar = useCallback(() => setOpen(false), []);

  // Mesmo dia nas duas pontas lê melhor como uma data só.
  const rotulo = from && to ? (from === to ? brLabel(from) : `${brLabel(from)} → ${brLabel(to)}`) : "Escolher datas";

  return (
    <div ref={wrap} style={{ position: "relative", ...style }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 13px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>
        <Icon name="calendar" size={15} color="var(--text-dim)" />
        <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap" }}>{rotulo}</span>
        <Icon name="chevron-down" size={14} color="var(--text-dim)" />
      </button>
      <FolhaAncorada ancora={wrap} aberto={open} onFechar={fechar}>
        <Calendar from={from} to={to} onApply={(a, b) => { onChange(a, b); setOpen(false); }} />
      </FolhaAncorada>
    </div>
  );
}

// A grade é a do sistema (`CalendarioIntervalo`, RangeCalendar do HeroUI); aqui
// só mora o rodapé "início → fim · Aplicar", porque filtro troca a tela inteira
// e não deve recarregar a cada toque.
function Calendar({ from, to, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const [a, setA] = useState<string>(from);
  const [b, setB] = useState<string>(to);
  return (
    <div>
      <CalendarioIntervalo de={a} ate={b} onChange={(x, y) => { setA(x); setB(y); }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{a ? brLabel(a) : "início"} → {b ? brLabel(b) : "fim"}</span>
        <Botao variante="primario" tamanho="sm" onClick={() => a && b && onApply(a, b)} disabled={!a || !b} style={{ marginLeft: "auto" }}>Aplicar</Botao>
      </div>
    </div>
  );
}
