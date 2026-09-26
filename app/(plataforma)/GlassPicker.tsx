"use client";

// Componentes liquid-glass reutilizáveis para substituir <select> e <datalist>
// nativos: GlassSelect (lista fixa de opções) e GlassCombobox (busca + favoritos).
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { duracaoCss, origemDaAncora, useAbrirFechar, type OrigemFolha } from "./ui/micro";
import { useIsMobile } from "./ui/useMediaQuery";
import { CalendarioDia } from "./ui/calendario";
import { ordenarPorRelevancia } from "@/lib/busca-em-opcoes";
import { ComboBox, Header, Input, ListBox } from "@heroui/react";

// O visual do gatilho mora em `.gp-gatilho` (globals.css), não num objeto
// inline aqui. A diferença não é estética: enquanto os valores eram inline,
// NENHUMA folha de estilo conseguia alinhá-los com o `<input>` ao lado — inline
// vence classe. Era por isso que um `GlassSelect` dentro de um `Campo` nascia
// 6px mais baixo, com outro raio e outra tinta que o campo de texto vizinho.
// Com a classe, o `.ui-campo .gp-gatilho` do globals.css faz os dois medirem a
// mesma coisa, e quem chama continua podendo mandar pelo `style` (inline segue
// vencendo a classe — é exatamente o que a prop promete).
//
// Piso de toque do gatilho no celular. Continua inline porque quem chama também
// manda `style`, e o piso de 44px não pode ser derrubado por um `minHeight`
// menor vindo de uma tela.
const gatilhoToque = (celular: boolean): React.CSSProperties | null =>
  (celular ? { minHeight: "var(--tap)" } : null);

// "x" de limpar: a fundação já lhe dá 44x44 (é [role=button] com um svg único).
// Sem a margem negativa esses 44px entrariam no layout e o campo inteiro cresceria
// pra ~64px de altura — ela devolve o espaço mantendo o alvo grande.
const limparToque = (celular: boolean): React.CSSProperties =>
  ({ display: "inline-flex", padding: 2, ...(celular ? { margin: "-13px -8px" } : null) });

/**
 * Vida da folha: ela precisa SOBREVIVER ao `aberto = false` pra caber o
 * fechamento (`.is-closing` → desmonta). Abrir é convite, fechar é sair da
 * frente — quem manda no relógio é a escala do `:root` (250ms pra abrir,
 * 150ms pra fechar), nunca um número escrito aqui.
 *
 * Sem essa escala declarada (nenhum `globals.css` aplicado — é o caso do jsdom
 * nos testes) não há transição nenhuma pra esperar, e segurar o nó montado por
 * 150ms só deixaria um fantasma no DOM que ninguém vê sumir. Aí some na hora.
 */
export function useFolha(aberto: boolean) {
  const { montado, classe } = useAbrirFechar(aberto, "--dropdown-close-dur");
  const [comEscala] = useState(() => duracaoCss("--dropdown-close-dur", 0) > 0);
  return { vivo: comEscala ? montado : aberto, classe };
}

// Painel flutuante posicionado via portal (escapa de overflow:hidden/scroll dos pais).
// `alinhar="fim"` encosta a borda DIREITA na do gatilho — é o caso do "⋯" no
// canto de uma linha, que abriria pra fora da tela se crescesse pra direita.
export function Panel({ anchor, aberto, classe, onClose, children, width, alinhar = "inicio" }: {
  anchor: HTMLElement | null; aberto: boolean; classe: string;
  onClose: () => void; children: React.ReactNode; width?: number;
  alinhar?: "inicio" | "fim";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const celular = useIsMobile();
  const [pos, setPos] = useState<{ left: number; top: number; w: number; up: boolean; origem: OrigemFolha } | null>(null);
  // No celular a fundação (.gp-pop) prende o painel embaixo da tela — o que o
  // teclado cobre inteiro. A visualViewport diz quanto o teclado ocupa: subimos a
  // folha e encolhemos a lista pra ela caber no que sobrou de tela.
  const [tec, setTec] = useState({ alt: 0, disp: 0 });
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!celular || !vv) { setTec({ alt: 0, disp: 0 }); return; }
    const medir = () => setTec({ alt: Math.max(0, window.innerHeight - vv.height - vv.offsetTop), disp: vv.height });
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => { vv.removeEventListener("resize", medir); vv.removeEventListener("scroll", medir); };
  }, [celular]);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = width || r.width;
      const spaceBelow = window.innerHeight - r.bottom;
      const up = spaceBelow < 300 && r.top > spaceBelow;
      let left = alinhar === "fim" ? r.right - w : r.left;
      if (left < 8) left = 8;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      // De qual canto ela cresce: o olho segue a ORIGEM, não a posição final —
      // folha que sobe mas cresce do topo parece ter vindo do lugar errado.
      // Quando abre pra cima, quem fica encostado no gatilho é a borda de baixo
      // (6px acima dele), e é essa borda que o `origemDaAncora` precisa medir.
      const top = up ? r.top : r.bottom + 6;
      setPos({ left, top, w, up, origem: origemDaAncora(r, { top: up ? r.top - 6 : top, left }) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [anchor, width, alinhar]);

  useEffect(() => {
    // Só enquanto de fato ABERTA: durante o fechamento o painel continua no DOM
    // e escutar aqui seria pedir pra fechar o que já está saindo.
    if (!aberto) return;
    // O painel está no <body>, não dentro da âncora: o "tocou fora" tem que
    // olhar as DUAS caixas, senão clicar numa opção fecharia a lista antes do
    // `onClick` da linha rodar.
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [aberto, anchor, onClose]);

  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <>
      {/* Véu de verdade no celular: a "sombra gigante" da fundação só PARECE um
          véu — sem este elemento o toque fora atravessa e clica no que está atrás.
          Sai no instante em que o fechamento começa: ficar mais 150ms no ar
          engoliria o próximo toque da pessoa. */}
      {celular && aberto && <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: "calc(var(--z-pop, 1400) - 1)" }} />}
      <div ref={ref} className={`glass glass-spec gp-pop t-dropdown ${classe}`.trim()} data-origin={pos.origem}
        style={{
          // Acima da folha (véu 1200 / painel 1201): um dropdown aberto DENTRO
          // de um painel lateral nascia atrás do véu e o toque na opção fechava
          // o painel. Ver `--z-pop` no globals.css.
          position: "fixed", left: pos.left, width: pos.w, zIndex: "var(--z-pop, 1400)",
          ...(pos.up ? { bottom: window.innerHeight - pos.top + 6 } : { top: pos.top }),
          // Raio, respiro e sombra moram no `.gp-pop` (globals.css, "DROPDOWN
          // DO SISTEMA"): inline aqui venceria a folha e cada tela desenharia
          // uma folha diferente.
          maxHeight: 320, overflowY: "auto",
          // Levanta a folha por MARGEM, não por `transform`: no celular a
          // fundação prende `bottom` com `!important`, então a margem é o que
          // sobra pra empurrar — e um `transform` inline venceria o da receita
          // `.t-dropdown` justamente quando o teclado sobe (o campo de busca
          // recebe foco sozinho ao abrir), matando a entrada no meio.
          ...(celular && tec.alt > 0 ? { marginBottom: tec.alt } : null),
        }}>
        {celular
          ? <div style={{ maxHeight: tec.disp ? Math.max(180, tec.disp - 28) : undefined, overflowY: "auto" }}>{children}</div>
          : children}
      </div>
    </>,
    document.body,
  );
}

// Linha de opção no desenho do dropdown do sistema (`.gp-row`): hover neutro,
// e o escolhido marcado pelo indicador à ESQUERDA, em tinta apagada — a cor
// da pessoa não pinta a linha. A coluna do indicador existe em toda linha, pra
// o texto de todas começar no mesmo x.
function Row({ selected, disabled, onClick, children }: {
  active?: boolean; selected?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" className="gp-row" data-ind="" onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      disabled={disabled} aria-disabled={disabled || undefined} aria-selected={selected}>
      <span className="gp-ind" aria-hidden>{selected && <Icon name="check" size={14} />}</span>
      <span className="gp-row-rot" style={{ flex: 1 }}>{children}</span>
    </button>
  );
}

// ── Date picker custom (substitui <input type="date">/datetime nativos) ──
const pad2 = (n: number) => String(n).padStart(2, "0");

export function GlassDate({ value, onChange, withTime = false, placeholder, style, clearable = true, title, min, max, id, disabled, "aria-label": ariaLabel }: {
  value: string;                       // "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm"
  onChange: (v: string) => void;
  withTime?: boolean; placeholder?: string; style?: React.CSSProperties; clearable?: boolean; title?: string;
  /** Limites em "YYYY-MM-DD", como no `min`/`max` do `<input type="date">`. Dia
   *  fora da faixa aparece APAGADO em vez de sumir: um calendário que pula de 12
   *  para 15 sem explicar deixa a pessoa procurando o que ela mesma fez de
   *  errado. Vale também pro atalho "Hoje", que some quando hoje não cabe. */
  min?: string; max?: string;
  /** Vai no gatilho, pra um `<label htmlFor>` continuar funcionando ao trocar um
   *  `<input type="date">` por este componente. */
  id?: string;
  disabled?: boolean;
  /** Nome pro leitor de tela quando não há `<label>`. Sem ele, o gatilho é lido
   *  pelo próprio conteúdo — ou seja, "De" enquanto está vazio e "12/04/1990"
   *  depois de preenchido, que é justamente quando o nome faz falta. */
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const celular = useIsMobile();
  const { vivo, classe } = useFolha(open);
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = withTime ? (value.slice(11, 16) || "08:00") : "";
  const now = new Date();
  const hojeISO = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const emit = (iso: string, t?: string) => onChange(!iso ? "" : withTime ? `${iso}T${t ?? (timePart || "08:00")}` : iso);

  const foraDaFaixa = (iso: string) => (!!min && iso < min) || (!!max && iso > max);
  const display = datePart ? `${datePart.slice(8, 10)}/${datePart.slice(5, 7)}/${datePart.slice(0, 4)}${withTime ? ` · ${timePart}` : ""}` : "";
  const footBtn: React.CSSProperties = { border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", padding: "2px 4px" };

  return (
    <>
      <button type="button" className="gp-gatilho" ref={setAnchor} id={id} title={title} disabled={disabled}
        aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)} style={{ ...style, ...gatilhoToque(celular) }}>
        <Icon name="calendar" size={16} color="var(--text-dim)" />
        <span style={{ flex: 1, color: datePart ? "var(--text)" : "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{display || placeholder || "Selecionar data"}</span>
        {clearable && datePart && (
          <span role="button" tabIndex={0} aria-label="Limpar data"
            onClick={(e) => { e.stopPropagation(); emit(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); emit(""); } }}
            style={limparToque(celular)}><Icon name="x" size={14} color="var(--text-dim)" /></span>
        )}
      </button>
      {vivo && (
        <Panel anchor={anchor} aberto={open} classe={classe} onClose={() => setOpen(false)} width={272}>
          <div style={{ padding: 4 }}>
            <CalendarioDia valor={datePart} min={min} max={max} rotulo={ariaLabel ?? title ?? "Data"}
              onChange={(iso) => { emit(iso); if (!withTime) setOpen(false); }} />
            {withTime && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <Icon name="clock" size={15} color="var(--text-dim)" />
                <input type="time" value={timePart} onChange={(e) => emit(datePart || hojeISO, e.target.value)}
                  style={{ flex: 1, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13 }} />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <button type="button" onClick={() => { emit(""); setOpen(false); }} style={footBtn}>Limpar</button>
              {!foraDaFaixa(hojeISO) && (
                <button type="button" onClick={() => { emit(hojeISO); if (!withTime) setOpen(false); }} style={{ ...footBtn, color: "var(--primary-texto, var(--primary))" }}>Hoje</button>
              )}
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

// ── Hora custom (substitui <input type="time">) ──────────────────────────────
//
// O campo nativo de hora é o último controle de sistema que sobrava nos
// formulários: ao lado de um `GlassDate` ele entrega dois carimbos "hh:mm" com
// setinhas do navegador, tipografia própria e um ícone de relógio que muda de
// desenho a cada sistema operacional. Aqui o gatilho é o mesmo `.gp-gatilho` dos
// outros, e a folha é a mesma `Panel` — nenhuma armadilha de popover é
// reimplementada (portal pro <body>, "tocou fora" olhando as duas caixas,
// folha presa embaixo no celular).
//
// Duas colunas em vez de uma lista de 288 linhas: hora e minuto são dois
// números, e rolar até "17" numa lista única de 5 em 5 minutos custa 200 linhas.
const HORAS = Array.from({ length: 24 }, (_, h) => pad2(h));

export function GlassTime({ value, onChange, id, title, placeholder = "--:--", passo = 5, clearable = true, style, disabled, "aria-label": ariaLabel }: {
  value: string;                       // "HH:mm" (vazio = sem hora)
  onChange: (v: string) => void;
  id?: string; title?: string; placeholder?: string;
  /** De quantos em quantos minutos a coluna da direita anda. `5` cobre reunião
   *  e expediente; quem precisa de minuto cravado troca pra `1`. */
  passo?: number;
  clearable?: boolean; style?: React.CSSProperties; disabled?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const celular = useIsMobile();
  const aberto = open && !disabled;
  const { vivo, classe } = useFolha(aberto);

  const hh = /^\d{2}:\d{2}$/.test(value) ? value.slice(0, 2) : "";
  const mm = /^\d{2}:\d{2}$/.test(value) ? value.slice(3, 5) : "";
  const minutos = Array.from({ length: Math.ceil(60 / passo) }, (_, i) => pad2(i * passo));
  // O minuto GRAVADO entra na coluna mesmo fora do passo: um horário que veio
  // do banco às 08:37 sumiria da lista e o próximo toque o trocaria por 08:35
  // sem ninguém pedir — o mesmo defeito do `<select>` sem o valor atual.
  const colunaMin = mm && !minutos.includes(mm) ? [...minutos, mm].sort() : minutos;

  return (
    <>
      <button type="button" className="gp-gatilho" ref={setAnchor} id={id} title={title} aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)} style={{ ...style, ...gatilhoToque(celular) }}>
        <Icon name="clock" size={16} color="var(--text-dim)" />
        <span style={{ flex: 1, color: value ? "var(--text)" : "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{value || placeholder}</span>
        {clearable && value && (
          <span role="button" tabIndex={0} aria-label="Limpar hora"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onChange(""); } }}
            style={limparToque(celular)}><Icon name="x" size={14} color="var(--text-dim)" /></span>
        )}
      </button>
      {vivo && (
        <Panel anchor={anchor} aberto={aberto} classe={classe} onClose={() => setOpen(false)} width={Math.max(anchor?.offsetWidth || 180, 180)}>
          {/* Classe, não `style` inline: a rede mobile da fundação colapsa
              qualquer `grid-template-columns: 1fr 1fr` escrito inline pra UMA
              coluna abaixo de 560px. A regra está certa pro caso geral (duas
              colunas de conteúdo não cabem num telefone) e errada pra este:
              são dois números de dois dígitos, e empilhados eles viram uma
              folha de 500px com dois roladores. */}
          <div className="gp-horas">
            {([["Hora", HORAS, hh, (v: string) => onChange(`${v}:${mm || "00"}`)],
               ["Min", colunaMin, mm, (v: string) => { onChange(`${hh || "08"}:${v}`); setOpen(false); }]] as const).map(([rotulo, itens, atual, escolher]) => (
              <div key={rotulo} style={{ minWidth: 0 }}>
                <p className="gp-cab" style={{ margin: 0 }}>{rotulo}</p>
                <div role="listbox" aria-label={rotulo}>
                  {itens.map((v) => (
                    <Row key={v} selected={v === atual} active={v === atual} onClick={() => escolher(v)}>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
                    </Row>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

// ── Select custom (lista fixa) — com busca quando há muitas opções ──
export function GlassSelect({ value, onChange, options, placeholder = "Selecionar…", style, disabled, title, searchable, id, "aria-labelledby": rotuladoPor, "aria-label": ariaLabel }: {
  value: string; onChange: (v: string) => void;
  /** `disabled` mostra a opção mas impede a escolha — o mesmo que o `<option
   *  disabled>` nativo fazia. Some-la esconderia a informação ("já está
   *  vinculado a fulano"), que é justamente o que a pessoa precisa ler. */
  options: { value: string; label: string; disabled?: boolean }[]; placeholder?: string; style?: React.CSSProperties;
  disabled?: boolean; title?: string; searchable?: boolean;
  /** Vai no gatilho, pra um `<label htmlFor>` continuar funcionando ao trocar um
   *  `<select>` nativo por este componente. `<button>` é elemento rotulável, então
   *  clicar no rótulo foca o gatilho e o leitor de tela anuncia o nome junto. */
  id?: string;
  /** Quando o rótulo NÃO pode ser um `<label>` — é o caso de toda fileira de
   *  filtros, porque um `<label>` em volta de um `<button>` dispara o botão ao
   *  ser clicado e a lista abria sozinha ao tocar no texto. Aqui o vínculo é
   *  pelo `id` do texto que rotula. */
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const celular = useIsMobile();
  const aberto = open && !disabled;
  const { vivo, classe } = useFolha(aberto);
  const cur = options.find((o) => o.value === value);
  const comBusca = searchable ?? options.length > 8;   // auto: lista longa → busca
  useEffect(() => { if (open && comBusca) setTimeout(() => inputRef.current?.focus(), 10); }, [open, comBusca]);
  // Limpa a busca quando a folha SAI DE CENA, não quando manda fechar: apagar o
  // filtro antes disso repovoaria a lista inteira no meio do fecho.
  useEffect(() => { if (!vivo) setQ(""); }, [vivo]);
  // ORDENA por relevância em vez de só filtrar. Era `includes` puro, e nas 89
  // localizações do galpão isso enterrava a resposta exata: digitar "A" casava
  // com 65 opções e punha a "A · Rua A" em 10º; digitar "E" a punha em 65º.
  // O conjunto que casa é o mesmo — muda quem vem primeiro. Ver
  // lib/busca-em-opcoes.ts.
  const filtered = ordenarPorRelevancia(options, q, (o) => o.label);
  return (
    <>
      <button type="button" className="gp-gatilho" ref={setAnchor} id={id} title={title} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-labelledby={rotuladoPor} aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{ ...style, ...gatilhoToque(celular) }}>
        <span style={{ flex: 1, color: cur ? "var(--text)" : "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {cur ? cur.label : placeholder}
        </span>
        <Icon name="chevron-down" size={16} color="var(--text-dim)" />
      </button>
      {vivo && (
        <Panel anchor={anchor} aberto={aberto} classe={classe} onClose={() => setOpen(false)} width={Math.max(anchor?.offsetWidth || 200, comBusca ? 240 : 0)}>
          {comBusca && (
            <div style={{ position: "sticky", top: -6, padding: 4, marginBottom: 2, background: "transparent" }}>
              <div className="gp-busca">
                <Icon name="search" size={15} color="var(--text-dim)" />
                <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
                  onKeyDown={(e) => { const alvo = filtered.find((o) => !o.disabled); if (e.key === "Enter" && alvo) { onChange(alvo.value); setOpen(false); } }}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", boxShadow: "none", color: "var(--text)", fontSize: 13.5 }} />
              </div>
            </div>
          )}
          {filtered.map((o) => (
            <Row key={o.value} selected={o.value === value} active={o.value === value} disabled={o.disabled}
              onClick={() => { onChange(o.value); setOpen(false); }}>{o.label}</Row>
          ))}
          {filtered.length === 0 && <div style={{ padding: "10px", fontSize: 13, color: "var(--text-dim)" }}>Nada encontrado.</div>}
        </Panel>
      )}
    </>
  );
}

// ── Autocomplete de seleção MÚLTIPLA (busca + etiquetas) ─────────────────────
// É a "lógica de autocomplete" do HeroUI (Autocomplete): um GlassSelect que
// combina lista filtrável com escolha de VÁRIOS itens, mostrados como etiquetas
// removíveis dentro do gatilho. A gramática (busca autofoco, item com indicador
// à esquerda, estado vazio, tag por selecionado) veio do HeroUI; o motor é o
// nosso — a folha é o `Panel` (portal, presa embaixo no celular, véu de verdade,
// fecho no ritmo da escala) e o desenho é o `.gp-*` do globals.css.
//
// Para escolher UM valor com busca, continua sendo o `GlassSelect searchable`.
// A folha aqui NÃO fecha ao escolher: seleção múltipla, marca e desmarca sem
// perder o lugar; quem fecha é o toque fora, o Esc ou o gatilho.
export function GlassMultiSelect({ value, onChange, options, placeholder = "Selecionar…", vazio = "Nada encontrado.", searchable, style, disabled, id, "aria-labelledby": rotuladoPor, "aria-label": ariaLabel }: {
  value: string[]; onChange: (v: string[]) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  /** Texto quando a busca não casa nada (ou a lista chega vazia). */
  vazio?: string;
  /** Força a caixa de busca. Sem isto: lista com mais de 8 opções ganha busca. */
  searchable?: boolean;
  style?: React.CSSProperties; disabled?: boolean; id?: string;
  "aria-labelledby"?: string; "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const celular = useIsMobile();
  const aberto = open && !disabled;
  const { vivo, classe } = useFolha(aberto);
  const comBusca = searchable ?? options.length > 8;
  const escolhidos = value.map((v) => options.find((o) => o.value === v)).filter(Boolean) as { value: string; label: string }[];
  useEffect(() => { if (open && comBusca) setTimeout(() => inputRef.current?.focus(), 10); }, [open, comBusca]);
  useEffect(() => { if (!vivo) setQ(""); }, [vivo]);
  const filtered = ordenarPorRelevancia(options, q, (o) => o.label);
  // Marca/desmarca sem fechar: é o que distingue a múltipla da única.
  const alterna = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const remover = (v: string) => onChange(value.filter((x) => x !== v));
  return (
    <>
      <button type="button" className="gp-gatilho gp-gatilho--multi" ref={setAnchor} id={id} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-labelledby={rotuladoPor} aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{ ...style, ...gatilhoToque(celular) }}>
        <span className="gp-tags" style={{ flex: 1 }}>
          {escolhidos.length === 0
            ? <span style={{ color: "var(--text-dim)" }}>{placeholder}</span>
            : escolhidos.map((o) => (
              // A etiqueta é um alvo próprio DENTRO do gatilho; o "x" precisa
              // matar o clique antes de ele borbulhar e reabrir/fechar a folha.
              <span key={o.value} className="gp-tag">
                {o.label}
                <span role="button" tabIndex={0} aria-label={`Remover ${o.label}`}
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); remover(o.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); remover(o.value); } }}
                  className="gp-tag-x"><Icon name="x" size={13} color="var(--text-dim)" /></span>
              </span>
            ))}
        </span>
        <Icon name="chevron-down" size={16} color="var(--text-dim)" />
      </button>
      {vivo && (
        <Panel anchor={anchor} aberto={aberto} classe={classe} onClose={() => setOpen(false)} width={Math.max(anchor?.offsetWidth || 220, comBusca ? 240 : 0)}>
          {comBusca && (
            <div style={{ position: "sticky", top: -6, padding: 4, marginBottom: 2, background: "transparent" }}>
              <div className="gp-busca">
                <Icon name="search" size={15} color="var(--text-dim)" />
                <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
                  onKeyDown={(e) => { const alvo = filtered.find((o) => !o.disabled); if (e.key === "Enter" && alvo) { alterna(alvo.value); setQ(""); } }}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", boxShadow: "none", color: "var(--text)", fontSize: 13.5 }} />
              </div>
            </div>
          )}
          {filtered.map((o) => (
            <Row key={o.value} selected={value.includes(o.value)} disabled={o.disabled}
              onClick={() => alterna(o.value)}>{o.label}</Row>
          ))}
          {filtered.length === 0 && <div style={{ padding: "10px", fontSize: 13, color: "var(--text-dim)" }}>{vazio}</div>}
        </Panel>
      )}
    </>
  );
}

// ── Combobox com busca + favoritos (ex.: produtos mais vendidos) ──
// Desenho e comportamento do `ComboBox` do HeroUI (React Aria): campo digitável
// com a lista embaixo, teclado completo e popover portado pro <body>. A lista é
// NOSSA (controlada): sem busca mostra os favoritos; com busca, a mesma escada
// de relevância do GlassSelect com teto de 60 — sem ordenar, a resposta exata
// podia cair fora do corte. Por isso o filtro interno do React Aria fica
// desligado (`defaultFilter` sempre verdadeiro).
export function GlassCombobox({ value, onChange, options, featured = [], placeholder = "Buscar…", featuredLabel = "Mais vendidos", allowCustom = true, style }: {
  value: string; onChange: (v: string) => void; options: string[]; featured?: string[];
  placeholder?: string; featuredLabel?: string; allowCustom?: boolean; style?: React.CSSProperties;
}) {
  const [q, setQ] = useState(value);
  const celular = useIsMobile();
  useEffect(() => { setQ(value); }, [value]);

  const ql = q.trim();
  const buscando = !!ql && ql !== value;
  const lista = buscando ? ordenarPorRelevancia(options, ql, (o) => o).slice(0, 60) : featured;
  // Sair do campo confirma o que foi digitado (valor livre) ou devolve o último
  // valor válido quando a tela não aceita texto fora da lista.
  const confirmar = () => {
    if (ql === value) return;
    if (!ql) onChange("");
    else if (allowCustom) onChange(ql);
    else setQ(value);
  };

  return (
    <ComboBox aria-label={placeholder} fullWidth allowsCustomValue={allowCustom} allowsEmptyCollection
      inputValue={q} onInputChange={setQ} defaultFilter={() => true}
      selectedKey={lista.includes(value) ? value : null}
      onSelectionChange={(k) => { if (k == null) return; const v = String(k); setQ(v); onChange(v); }}
      style={style}>
      <ComboBox.InputGroup style={gatilhoToque(celular) ?? undefined}>
        <Input placeholder={placeholder} onBlur={confirmar}
          onKeyDown={(e) => { if (e.key === "Enter" && allowCustom && ql && !lista.includes(ql)) confirmar(); }} />
        {value && (
          <span role="button" tabIndex={0} aria-label="Limpar"
            onClick={() => { setQ(""); onChange(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setQ(""); onChange(""); } }}
            style={limparToque(celular)}><Icon name="x" size={14} color="var(--text-dim)" /></span>
        )}
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox renderEmptyState={() => (
          <div style={{ padding: 10, fontSize: 13, color: "var(--text-dim)" }}>
            {buscando ? (allowCustom ? `Nenhum produto encontrado — Enter usa “${ql}”.` : "Nenhum produto encontrado.") : "Digite para pesquisar entre todos os produtos."}
          </div>
        )}>
          {!buscando && featured.length > 0 ? (
            <ListBox.Section>
              <Header>{featuredLabel}</Header>
              {lista.map((o) => <ListBox.Item key={o} id={o} textValue={o}>{o}<ListBox.ItemIndicator /></ListBox.Item>)}
            </ListBox.Section>
          ) : lista.map((o) => <ListBox.Item key={o} id={o} textValue={o}>{o}<ListBox.ItemIndicator /></ListBox.Item>)}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
