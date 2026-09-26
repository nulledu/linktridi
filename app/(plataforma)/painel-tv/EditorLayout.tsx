"use client";

import { Tecla } from "@/app/(plataforma)/ui/exibicao";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelConfig, SalesSnapshot } from "@/lib/types";
import { PELE_CLARA } from "@/app/painel/KioskShell";
import {
  CATALOGO,
  COLUNAS,
  GRUPOS_METRICA,
  GRUPOS_WIDGET,
  GRUPO_DA_METRICA,
  LINHAS,
  PERDAS_AO_SEPARAR,
  ROTULO_METRICA,
  cabeSeparar,
  layoutPadrao,
  metricas,
  novoId,
  podeSeparar,
  primeiroLugarVago,
  separarEmBlocos,
  widgetPadrao,
  type FormatoTela,
  type Metrica,
  type PainelLayout,
  type Slide,
  type Widget,
  type WidgetTipo,
} from "@/lib/painel-layout";
import { GradeSlide, type StatusExpedicao } from "@/app/painel/widgets/Widgets";
import type { ResumoProducao } from "@/lib/painel-producao";
import type { ResumoEstoque } from "@/lib/painel-estoque";
import { Icon } from "../Icon";
import "./editor.css";
import { Caixa } from "../ui/controles";

/**
 * Editor do painel de TV: arrasta, redimensiona e vê como fica.
 *
 * A pré-visualização NÃO é uma imitação — é o mesmo `GradeSlide` que a TV usa,
 * com os dados reais do dia. O que aparece aqui é literalmente o que sobe na
 * parede; era esse o problema do editor anterior, que só tinha campos de
 * formulário e um iframe do painel inteiro.
 *
 * Arrastar é feito com Pointer Events (mouse, trackpad e dedo no mesmo código),
 * e não com a HTML5 Drag and Drop API — aquela não dá posição contínua durante
 * o arrasto, que é justamente o que faz o widget acompanhar o cursor.
 */

type Arrasto =
  | { modo: "mover"; id: string; dx: number; dy: number }
  | { modo: "medir"; id: string }
  | null;

export function EditorLayout({
  layout,
  onChange,
  sales,
  config,
  compacto,
  formato = "16:9",
  polegadas = 50,
  numeroCurto = false,
}: {
  layout: PainelLayout;
  onChange: (l: PainelLayout) => void;
  sales: SalesSnapshot | null;
  config: PanelConfig;
  /**
   * Formato da tela do perfil. A moldura da prévia muda junto: montar um painel
   * de TV em pé dentro de uma moldura deitada é desenhar para uma tela que não
   * existe — e o erro só aparece na parede, depois de instalado.
   */
  formato?: FormatoTela;
  /** Polegadas do perfil — a prévia desenha o texto no tamanho que a TV usará. */
  polegadas?: number;
  /** Números curtos na tela inteira (decisão do perfil). */
  numeroCurto?: boolean;
  /** Montado DENTRO de uma coluna (a tela de configuração já tem inspetor ao
   *  lado). Aí o inspetor de widget empilha mais cedo, senão os 300px dele
   *  transbordam a coluna e invadem o painel vizinho. */
  compacto?: boolean;
}) {
  const [slideAtivo, setSlideAtivo] = useState(0);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [paletaAberta, setPaletaAberta] = useState(false);
  const arrasto = useRef<Arrasto>(null);
  const grade = useRef<HTMLDivElement | null>(null);

  /*
   * A tela em edição, SEMPRE dentro do perfil atual.
   *
   * `slideAtivo` é um índice e sobrevive à troca de perfil: quem estava na 5ª
   * tela do Comercial e clicava em Produção (que tem 3) ficava com o índice 4
   * apontando para o vazio — o editor abria em branco, sem abas, sem prévia e
   * sem erro nenhum no console. Parece que o perfil perdeu as telas.
   *
   * Prender o índice ao último disponível resolve na leitura, sem um efeito que
   * corrija o estado depois da pintura (que daria um quadro em branco antes).
   */
  const iSlide = Math.min(slideAtivo, Math.max(0, layout.slides.length - 1));
  const slide: Slide | undefined = layout.slides[iSlide];
  const widget = slide?.widgets.find((w) => w.id === selecionado) ?? null;
  // A pré-visualização é a TV de verdade, então busca a produção de verdade —
  // uma vez, ao abrir o editor. Sem isso o widget de produção seria o único que
  // aparece vazio aqui e cheio lá, e ninguém confia numa prévia que mente.
  const [producao, setProducao] = useState<ResumoProducao | null | undefined>(undefined);
  const [expedicao, setExpedicao] = useState<StatusExpedicao | null | undefined>(undefined);
  const [estoque, setEstoque] = useState<ResumoEstoque | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    fetch("/api/producao/painel", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) setProducao(j?.disponivel ? (j as ResumoProducao) : null); })
      .catch(() => { if (vivo) setProducao(null); });
    fetch("/api/logistica/painel", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) setExpedicao(j && !j.error ? (j as StatusExpedicao) : null); })
      .catch(() => { if (vivo) setExpedicao(null); });
    fetch("/api/estoque/painel", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) setEstoque(j?.disponivel ? (j as ResumoEstoque) : null); })
      .catch(() => { if (vivo) setEstoque(null); });
    return () => { vivo = false; };
  }, []);

  const dados = useMemo(
    () => ({ sales, config, producao, expedicao, estoque, curtos: numeroCurto }),
    [sales, config, producao, expedicao, estoque, numeroCurto],
  );

  /**
   * Quem está por cima de quem.
   *
   * Sobrepor é PERMITIDO — às vezes é o que se quer (um texto sobre uma faixa).
   * O que não pode é acontecer sem a pessoa perceber: na TV o resultado é um
   * número escrito por cima do outro, e ninguém revisa uma TV. Por isso o
   * editor marca em vermelho em vez de impedir o movimento.
   */
  const conflitos = useMemo(() => {
    const ws = slide?.widgets ?? [];
    const marcados = new Set<string>();
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length; j++) {
        const a = ws[i], b = ws[j];
        const cruza = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        if (cruza) { marcados.add(a.id); marcados.add(b.id); }
      }
    }
    return marcados;
  }, [slide?.widgets]);

  /* ── edição do modelo ───────────────────────────────────────────────────── */

  const trocarSlide = useCallback(
    (i: number, muda: (s: Slide) => Slide) => {
      const slides = layout.slides.map((s, idx) => (idx === i ? muda(s) : s));
      onChange({ ...layout, slides });
    },
    [layout, onChange],
  );

  const trocarWidget = useCallback(
    (id: string, muda: (w: Widget) => Widget) =>
      trocarSlide(iSlide, (s) => ({
        ...s,
        widgets: s.widgets.map((w) => (w.id === id ? muda(w) : w)),
      })),
    [iSlide, trocarSlide],
  );

  function adicionar(tipo: WidgetTipo) {
    if (!slide) return;
    const base = widgetPadrao(tipo, novoId());
    const { x, y } = primeiroLugarVago(slide.widgets, base.w, base.h);
    const novo = { ...base, x, y };
    trocarSlide(iSlide, (s) => ({ ...s, widgets: [...s.widgets, novo] }));
    setSelecionado(novo.id);
    setPaletaAberta(false);
  }

  function remover(id: string) {
    trocarSlide(iSlide, (s) => ({ ...s, widgets: s.widgets.filter((w) => w.id !== id) }));
    setSelecionado(null);
  }

  /**
   * Troca a tela pronta pelas partes que a compõem, no MESMO lugar.
   *
   * Sem desfazer nada e sem pedir confirmação: o Ctrl+Z já cobre o
   * arrependimento, e caixa de confirmação para ação reversível é a que ensina
   * a pessoa a clicar em "ok" sem ler.
   */
  function separar(id: string) {
    if (!slide) return;
    const alvo = slide.widgets.find((w) => w.id === id);
    if (!alvo) return;
    const pecas = separarEmBlocos(alvo, () => novoId());
    if (pecas.length === 0) return;
    trocarSlide(iSlide, (s) => ({
      ...s,
      widgets: s.widgets.flatMap((w) => (w.id === id ? pecas : [w])),
    }));
    setSelecionado(pecas[0].id);
  }

  /* ── o palco em tamanho de TV ───────────────────────────────────────────── */

  /**
   * O tamanho REAL do palco de cada formato.
   *
   * 1280×720 é o palco do `KioskShell` — a TV desenha nele e escala para a
   * tela, seja ela 1080p ou 4K. Os outros formatos mantêm a mesma largura de
   * referência para que a régua de fonte não mude de assunto entre um e outro.
   */
  const palco = useMemo(() => {
    const [a, b] = formato.split(":").map(Number);
    const larg = 1280;
    return { w: larg, h: Math.round((larg * b) / a) };
  }, [formato]);

  const moldura = useRef<HTMLDivElement>(null);
  const [zoomPalco, setZoomPalco] = useState(0);

  useEffect(() => {
    const el = moldura.current;
    if (!el) return;
    // `offsetWidth`, não `getBoundingClientRect`: o rect já vem com o
    // `transform` aplicado e realimentaria a própria escala.
    const medir = () => {
      if (el.offsetWidth) setZoomPalco(el.offsetWidth / palco.w);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [palco.w]);

  /* ── arrastar e redimensionar ───────────────────────────────────────────── */

  /** Converte pixel do ponteiro em célula da grade. */
  function celulaDe(e: React.PointerEvent | PointerEvent) {
    const el = grade.current;
    if (!el) return { cx: 0, cy: 0 };
    const r = el.getBoundingClientRect();
    return {
      cx: Math.floor(((e.clientX - r.left) / r.width) * COLUNAS),
      cy: Math.floor(((e.clientY - r.top) / r.height) * LINHAS),
    };
  }

  function aoPegar(e: React.PointerEvent, w: Widget, modo: "mover" | "medir") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelecionado(w.id);
    const { cx, cy } = celulaDe(e);
    // Guarda a distância entre o ponto onde a pessoa pegou e o canto do widget.
    // Sem isso o bloco "pula" para debaixo do cursor no primeiro movimento.
    arrasto.current =
      modo === "mover" ? { modo, id: w.id, dx: cx - w.x, dy: cy - w.y } : { modo: "medir", id: w.id };
  }

  function aoMover(e: React.PointerEvent) {
    const a = arrasto.current;
    if (!a || !slide) return;
    const alvo = slide.widgets.find((w) => w.id === a.id);
    if (!alvo) return;
    const { cx, cy } = celulaDe(e);

    if (a.modo === "mover") {
      const x = Math.max(0, Math.min(COLUNAS - alvo.w, cx - a.dx));
      const y = Math.max(0, Math.min(LINHAS - alvo.h, cy - a.dy));
      if (x !== alvo.x || y !== alvo.y) trocarWidget(alvo.id, (w) => ({ ...w, x, y }));
    } else {
      const w = Math.max(1, Math.min(COLUNAS - alvo.x, cx - alvo.x + 1));
      const h = Math.max(1, Math.min(LINHAS - alvo.y, cy - alvo.y + 1));
      if (w !== alvo.w || h !== alvo.h) trocarWidget(alvo.id, (o) => ({ ...o, w, h }));
    }
  }

  const aoSoltar = () => { arrasto.current = null; };

  /** Teclado: mover e redimensionar sem mouse (e no controle remoto da TV). */
  function aoTeclar(e: React.KeyboardEvent) {
    if (!widget) return;
    const passo = e.shiftKey ? 1 : 1;
    const mapa: Record<string, [number, number]> = {
      ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo],
    };
    const d = mapa[e.key];
    if (d) {
      e.preventDefault();
      if (e.shiftKey) {
        trocarWidget(widget.id, (w) => ({
          ...w,
          w: Math.max(1, Math.min(COLUNAS - w.x, w.w + d[0])),
          h: Math.max(1, Math.min(LINHAS - w.y, w.h + d[1])),
        }));
      } else {
        trocarWidget(widget.id, (w) => ({
          ...w,
          x: Math.max(0, Math.min(COLUNAS - w.w, w.x + d[0])),
          y: Math.max(0, Math.min(LINHAS - w.h, w.y + d[1])),
        }));
      }
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remover(widget.id);
    }
  }

  /* ── slides ─────────────────────────────────────────────────────────────── */

  function novoSlide() {
    const s: Slide = {
      id: novoId("s"),
      nome: `Slide ${layout.slides.length + 1}`,
      duracaoMs: null,
      ativo: true,
      widgets: [],
    };
    onChange({ ...layout, slides: [...layout.slides, s] });
    setSlideAtivo(layout.slides.length);
    setSelecionado(null);
  }

  /**
   * Duplicar é como se monta painel de verdade: a segunda tela quase sempre é
   * a primeira com dois blocos trocados. Sem isto, a pessoa remonta tudo do
   * zero e desiste no terceiro slide.
   */
  function duplicarSlide(i: number) {
    const orig = layout.slides[i];
    const copia: Slide = {
      ...orig,
      id: novoId("s"),
      nome: `${orig.nome} (cópia)`.slice(0, 40),
      // Id novo em cada widget: id repetido faria o React embaralhar os dois
      // slides na hora de desenhar.
      widgets: orig.widgets.map((w) => ({ ...w, id: novoId() })),
    };
    const slides = [...layout.slides];
    slides.splice(i + 1, 0, copia);
    onChange({ ...layout, slides });
    setSlideAtivo(i + 1);
    setSelecionado(null);
  }

  function moverSlide(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= layout.slides.length) return;
    const slides = [...layout.slides];
    [slides[i], slides[j]] = [slides[j], slides[i]];
    onChange({ ...layout, slides });
    setSlideAtivo(j);
  }

  function removerSlide(i: number) {
    if (layout.slides.length <= 1) return;   // painel sem slide nenhum é tela preta
    onChange({ ...layout, slides: layout.slides.filter((_, idx) => idx !== i) });
    setSlideAtivo(Math.max(0, i - 1));
    setSelecionado(null);
  }

  if (!slide) return null;

  return (
    <div className="ed">
      {/* ── abas de slides ─────────────────────────────────────────────────── */}
      <div className="ed-slides tab-strip">
        {layout.slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`ed-slide ${i === iSlide ? "on" : ""} ${s.ativo ? "" : "off"}`}
            onClick={() => { setSlideAtivo(i); setSelecionado(null); }}
          >
            <span>{s.nome}</span>
            <small>{s.widgets.length}</small>
          </button>
        ))}
        <button type="button" className="ed-slide ed-add" onClick={novoSlide}>
          <Icon name="plus" size={16} /> Slide
        </button>
      </div>

      <div className={compacto ? "ed-corpo ed-corpo--compacto" : "ed-corpo"}>
        {/* ── canvas ───────────────────────────────────────────────────────── */}
        <div className="ed-canvas-area">
          <div className="ed-canvas-topo">
            <input
              className="ed-nome"
              value={slide.nome}
              onChange={(e) => trocarSlide(iSlide, (s) => ({ ...s, nome: e.target.value.slice(0, 40) }))}
              aria-label="Nome do slide"
            />
            <label className="ed-check">
              <Caixa marcado={slide.ativo} onChange={(marc) => trocarSlide(iSlide, (s) => ({ ...s, ativo: marc }))} />
              exibir na TV
            </label>
            <label className="ed-dur">
              tempo
              <input
                type="number"
                min={3}
                max={300}
                value={slide.duracaoMs ? Math.round(slide.duracaoMs / 1000) : ""}
                placeholder={String(Math.round(config.slideIntervalMs / 1000))}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  trocarSlide(iSlide, (s) => ({
                    ...s,
                    duracaoMs: v === "" ? null : Math.max(3, Math.min(300, Number(v))) * 1000,
                  }));
                }}
              />
              s
            </label>
            <div className="ed-espaco" />
            {/* Acrescentar bloco é O QUE se faz nesta tela; duplicar, mover e
                apagar o slide são manutenção. Todos tinham a mesma cara de
                botão cinza, então a ação principal se escondia no meio de
                cinco irmãos — e a lixeira ficava do lado dela. */}
            <button type="button" className="ed-btn ed-btn--principal" onClick={() => setPaletaAberta(true)}>
              <Icon name="plus" size={16} /> Widget
            </button>
            <span className="ed-sep" aria-hidden />
            <button type="button" className="ed-btn ed-icone" title="duplicar slide" onClick={() => duplicarSlide(iSlide)}>
              <Icon name="copy" size={16} />
            </button>
            {layout.slides.length > 1 && (
              <>
                <button type="button" className="ed-btn ed-icone" title="mover para trás" onClick={() => moverSlide(iSlide, -1)}>
                  <Icon name="chevronLeft" size={16} />
                </button>
                <button type="button" className="ed-btn ed-icone" title="mover para a frente" onClick={() => moverSlide(iSlide, 1)}>
                  <Icon name="chevronRight" size={16} />
                </button>
                <button type="button" className="ed-btn ed-perigo" onClick={() => removerSlide(iSlide)}>
                  <Icon name="trash" size={16} />
                </button>
              </>
            )}
          </div>

          {/* A moldura tem o formato DO PERFIL — 16:9, 9:16 (TV em pé, como a
              da doca), 21:9 ou 4:3. O conteúdo escala junto. */}
          <div
            className="ed-tv"
            ref={moldura}
            style={{
              ["--p-primaria" as string]: config.theme.primary,
              ["--p-secundaria" as string]: config.theme.secondary,
              aspectRatio: formato.replace(":", " / "),
              /*
               * A moldura usa a PELE da parede, não o fundo configurado.
               *
               * O painel de vendas passou a pintar o palco com `PELE_CLARA`
               * (ver `KioskShell`), e a prévia continuava preta: cartão branco
               * sobre fundo preto aqui, cartão branco sobre lavanda lá. A
               * prévia existe justamente para não haver duas telas — mostrar
               * outro fundo é o defeito que ela deveria pegar.
               */
              background: PELE_CLARA,
            }}
            onKeyDown={aoTeclar}
            tabIndex={-1}
          >
            {/*
              O PALCO em tamanho de TV, reduzido por `transform`.
              A prévia mentia por um motivo mecânico: todo tamanho de fonte dos
              blocos é `clamp(mínimo, unidade-de-container, teto)`, e num quadro
              de 700px de largura quase tudo batia no MÍNIMO — números de 16px,
              rótulos de 13px, tudo do mesmo tamanho. Na TV, os mesmos blocos
              resolvem 74px e 20px. Ou seja: o editor mostrava uma hierarquia que
              a parede não tem.
              Desenhando no tamanho real (1280×720, o palco do `KioskShell`) e
              encolhendo o conjunto, cada `clamp` resolve exatamente como lá — a
              prévia vira uma miniatura fiel, e não outro layout.
            */}
            <div
              className="ed-palco"
              style={{ width: palco.w, height: palco.h, transform: `scale(${zoomPalco})` }}
            >
            <div
              className="ed-grade"
              ref={grade}
              onPointerMove={aoMover}
              onPointerUp={aoSoltar}
              onPointerCancel={aoSoltar}
              onClick={() => setSelecionado(null)}
            >
              {/* fundo quadriculado: mostra onde as coisas encaixam */}
              <div className="ed-guias" aria-hidden />
              <GradeSlide widgets={slide.widgets} dados={dados} className="ed-render" polegadas={polegadas} />

              {/* camada de manipulação, por cima do desenho real */}
              {slide.widgets.map((w) => (
                <div
                  key={w.id}
                  className={`ed-alca ${selecionado === w.id ? "sel" : ""} ${conflitos.has(w.id) ? "conflito" : ""}`}
                  style={{
                    gridColumn: `${w.x + 1} / span ${w.w}`,
                    gridRow: `${w.y + 1} / span ${w.h}`,
                  }}
                  onPointerDown={(e) => aoPegar(e, w, "mover")}
                  onClick={(e) => { e.stopPropagation(); setSelecionado(w.id); }}
                >
                  <span className="ed-tag">{CATALOGO.find((c) => c.tipo === w.tipo)?.nome ?? w.tipo}</span>
                  <button
                    type="button"
                    className="ed-x"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); remover(w.id); }}
                    aria-label="remover widget"
                  >
                    <Icon name="x" size={14} />
                  </button>
                  <span
                    className="ed-medir"
                    onPointerDown={(e) => aoPegar(e, w, "medir")}
                    aria-label="redimensionar"
                  />
                </div>
              ))}
            </div>
            </div>
          </div>

          <p className="ed-dica">
            Arraste para mover, puxe o canto para redimensionar. Com um widget
            selecionado: setas movem, <Tecla sempre>Shift</Tecla>+setas redimensionam,
            <Tecla sempre>Del</Tecla> remove.
          </p>
          {conflitos.size > 0 && (
            <p className="ed-alerta">
              <Icon name="alert-triangle" size={16} />
              {conflitos.size} blocos estão sobrepostos — na TV um vai escrever por cima do outro.
            </p>
          )}
        </div>

        {/* ── inspetor ─────────────────────────────────────────────────────── */}
        <aside className="ed-lado">
          {widget ? (
            <Inspetor
              w={widget}
              onChange={(muda) => trocarWidget(widget.id, muda)}
              onRemover={() => remover(widget.id)}
              onSeparar={() => separar(widget.id)}
            />
          ) : (
            <div className="ed-vazio-lado">
              <Icon name="settings" size={28} />
              <p>Escolha um widget na tela para configurar.</p>
              <button type="button" className="ed-btn" onClick={() => setPaletaAberta(true)}>
                <Icon name="plus" size={16} /> Adicionar widget
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* ── paleta ───────────────────────────────────────────────────────────── */}
      {paletaAberta && (
        <div className="sheet-host ed-paleta-host" onClick={() => setPaletaAberta(false)}>
          <div className="sheet ed-paleta" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>Adicionar widget</h3>
              <button type="button" onClick={() => setPaletaAberta(false)} aria-label="fechar">
                <Icon name="x" size={20} />
              </button>
            </header>
            {/* Agrupado: catorze blocos numa lista só viram uma parede, e
                quem procura "produtividade" acaba varrendo tudo. */}
            {GRUPOS_WIDGET.map((grupo) => {
              const doGrupo = CATALOGO.filter((c) => c.grupo === grupo);
              if (doGrupo.length === 0) return null;
              return (
                <div key={grupo} className="ed-paleta-grupo">
                  <h4>{grupo}</h4>
                  <div className="ed-paleta-grade">
                    {doGrupo.map((c) => (
                      <button key={c.tipo} type="button" onClick={() => adicionar(c.tipo)}>
                        <Icon name={c.icone} size={22} />
                        <strong>{c.nome}</strong>
                        <span>{c.descricao}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── inspetor de um widget ─────────────────────────────────────────────────── */

function Inspetor({
  w,
  onChange,
  onRemover,
  onSeparar,
}: {
  w: Widget;
  onChange: (muda: (w: Widget) => Widget) => void;
  onRemover: () => void;
  onSeparar: () => void;
}) {
  const set = (k: string, v: string | number | boolean) =>
    onChange((o) => ({ ...o, opcoes: { ...o.opcoes, [k]: v } }));

  return (
    <div className="ed-inspetor">
      <header>
        <strong>{CATALOGO.find((c) => c.tipo === w.tipo)?.nome ?? w.tipo}</strong>
        <button aria-label="Remover bloco" type="button" className="ed-btn ed-perigo" onClick={onRemover}>
          <Icon name="trash" size={16} />
        </button>
      </header>

      {/* Tela pronta não tem opção — e é bom que não tenha: ela É o painel que
          já está na parede. O inspetor explica em vez de ficar vazio, e oferece
          a única coisa que ela não deixa fazer: mexer no que está dentro. */}
      {w.tipo.startsWith("classico-") && (
        <>
          <p className="ed-dica">
            É a tela do painel de sempre, inteira. Em “Tela toda” ela fica idêntica
            à TV de hoje; em qualquer tamanho menor, vira a mesma tela reduzida.
          </p>
          {podeSeparar(w.tipo) && !cabeSeparar(w) && (
            <p className="ed-dica">
              Para separar em blocos, aumente esta tela — no tamanho atual as partes
              não teriam linha suficiente e cairiam umas sobre as outras.
            </p>
          )}
          {podeSeparar(w.tipo) && cabeSeparar(w) && (
            <>
              <button type="button" className="ed-btn ed-largo" onClick={onSeparar}>
                <Icon name="layout-grid" size={16} /> Separar em blocos
              </button>
              {/* O que se perde vai ANTES do clique. Separar é o tipo de coisa
                  que a pessoa faz uma vez e descobre o que sumiu depois, quando
                  já rearranjou tudo. */}
              <p className="ed-dica">
                Mesmo desenho, no mesmo lugar — só que cada parte vira um bloco que
                você move e redimensiona.
                {PERDAS_AO_SEPARAR[w.tipo] && PERDAS_AO_SEPARAR[w.tipo] !== "nada — a tela já é uma lista só" && (
                  <> Fica de fora: {PERDAS_AO_SEPARAR[w.tipo]}.</>
                )}{" "}
                Dá para voltar com <Tecla sempre>Ctrl</Tecla>+<Tecla sempre>Z</Tecla>.
              </p>
            </>
          )}
        </>
      )}

      {w.tipo === "kpi" && (
        <>
          <label>
            Métrica
            {/* Em grupos: são vinte e cinco, e num select liso a pessoa
                precisa saber o nome antes de achar. */}
            <select value={String(w.opcoes.metrica ?? "faturamento_mes")} onChange={(e) => set("metrica", e.target.value)}>
              {GRUPOS_METRICA.map((g) => (
                <optgroup key={g} label={g}>
                  {metricas
                    .filter((m) => GRUPO_DA_METRICA[m as Metrica] === g)
                    .map((m) => (
                      <option key={m} value={m}>{ROTULO_METRICA[m as Metrica]}</option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            Rótulo (vazio = automático)
            <input
              value={String(w.opcoes.rotulo ?? "")}
              placeholder={ROTULO_METRICA[String(w.opcoes.metrica ?? "faturamento_mes") as Metrica]}
              onChange={(e) => set("rotulo", e.target.value)}
            />
          </label>
          {/* Alvo é opcional: sem ele o número fica branco e sem alarme. Um
              painel não deve inventar expectativa que ninguém definiu. */}
          <label>
            Alvo (vazio = sem cor)
            <input
              type="number"
              min={0}
              value={String(w.opcoes.alvo ?? "")}
              placeholder="sem alvo"
              /* Campo vazio guarda VAZIO, não zero: zero é um alvo de verdade
                 ("nenhuma impedida") e antes era indistinguível de "sem alvo",
                 então escrevê-lo não pintava nada. */
              onChange={(e) => set("alvo", e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>
          {String(w.opcoes.alvo ?? "") !== "" && (
            <label>
              Verde quando o número está
              <select value={String(w.opcoes.direcao ?? "maior")} onChange={(e) => set("direcao", e.target.value)}>
                <option value="maior">acima do alvo (faturamento, ROAS)</option>
                <option value="menor">abaixo do alvo (custo, CPA)</option>
              </select>
            </label>
          )}
          {/* Contexto. Um número sozinho não diz se está bom — é a regra que
              todo guia de painel de parede repete. As duas opções ficam
              silenciosas quando a métrica não tem comparação honesta. */}
          <label className="ed-check">
            <Caixa marcado={w.opcoes.variacao === true} onChange={(marc) => set("variacao", marc)} />
            comparar com o período anterior
          </label>
          <label className="ed-check">
            <Caixa marcado={w.opcoes.faisca === true} onChange={(marc) => set("faisca", marc)} />
            mini-gráfico dos últimos dias
          </label>
        </>
      )}

      {(w.tipo === "meta" || w.tipo === "anel") && (
        <label className="ed-check">
          <Caixa marcado={w.opcoes.ritmo !== false} onChange={(marc) => set("ritmo", marc)} />
          cor pelo ritmo do mês
        </label>
      )}

      {/* PERÍODO vale para todo bloco que ordena gente por venda. Antes só
          pódio e ranking tinham o controle: os blocos novos guardavam a opção,
          respeitavam a opção e não davam como mudá-la pela tela — só editando o
          JSON, que é o mesmo que não existir. */}
      {(w.tipo === "podio" || w.tipo === "ranking" || w.tipo === "lidera" ||
        w.tipo === "equipe" || w.tipo === "metas-time" || w.tipo === "destaque") && (
        <label>
          Período
          <select value={String(w.opcoes.periodo ?? "mes")} onChange={(e) => set("periodo", e.target.value)}>
            <option value="dia">Hoje</option>
            <option value="semana">Semana</option>
            <option value="mes">Mês</option>
          </select>
        </label>
      )}

      {/* A curva e o recorde desenham a série de UMA métrica — e a escolha
          estava presa no padrão. Só as métricas que têm série de verdade
          aparecem: oferecer ROAS aqui seria prometer um gráfico que o servidor
          não manda. */}
      {(w.tipo === "curva" || w.tipo === "recorde" || w.tipo === "barras") && (
        <label>
          Série
          <select
            value={String(w.opcoes.metrica ?? (w.tipo === "curva" ? "receita_paga" : "faturamento_mes"))}
            onChange={(e) => set("metrica", e.target.value)}
          >
            <option value="faturamento_mes">Faturamento do mês</option>
            <option value="receita_paga">Receita de tráfego pago</option>
            <option value="gasto_trafego">Gasto com tráfego</option>
          </select>
        </label>
      )}

      {w.tipo === "ranking" && (
        <>
          <label className="ed-check">
            <Caixa marcado={w.opcoes.pedidos !== false} onChange={(marc) => set("pedidos", marc)} />
            mostrar a contagem de vendas
          </label>
          {/* O total sozinho premia quem já está na frente; a distância é o que
              diz algo a quem está atrás. */}
          <label className="ed-check">
            <Caixa marcado={w.opcoes.gap === true} onChange={(marc) => set("gap", marc)} />
            mostrar quanto falta para o de cima
          </label>
          {/* Existe para a tabela conviver com um pódio: sem pular, os três
              primeiros aparecem duas vezes, um bloco do lado do outro. */}
          <label>
            Começar no colocado
            <input
              type="number"
              min={1}
              max={12}
              value={Number(w.opcoes.pular ?? 0) + 1}
              onChange={(e) => set("pular", Math.max(0, Math.min(11, Number(e.target.value) - 1)))}
            />
          </label>
        </>
      )}

      {w.tipo === "produtos" && (
        <label>
          Ordenar e medir por
          <select value={String(w.opcoes.metrica ?? "quantidade")} onChange={(e) => set("metrica", e.target.value)}>
            <option value="quantidade">Quantidade vendida</option>
            <option value="receita">Receita</option>
          </select>
        </label>
      )}

      {(w.tipo === "ranking" || w.tipo === "produtos" || w.tipo === "producao" ||
        w.tipo === "metas-time" || w.tipo === "etapas" || w.tipo === "falta" ||
        w.tipo === "barras") && (
        <label>
          {w.tipo === "barras" ? "Quantos dias" : "Quantas linhas"}
          {/* Produção aceita ZERO — é assim que o bloco vira só a faixa de
              números, com as pessoas mostradas embaixo pelo cartão. Sem poder
              digitar 0 aqui, quem mexesse no campo não tinha como voltar. */}
          <input
            type="number"
            min={w.tipo === "producao" ? 0 : 1}
            max={12}
            value={Number(w.opcoes.linhas ?? 5)}
            onChange={(e) => {
              const piso = w.tipo === "producao" ? 0 : 1;
              set("linhas", Math.max(piso, Math.min(12, Number(e.target.value))));
            }}
          />
        </label>
      )}
      {w.tipo === "producao" && Number(w.opcoes.linhas ?? 5) === 0 && (
        <p className="ed-dica">Só os números do turno — sem a fila de nomes.</p>
      )}

      {/* Rótulo próprio nos blocos que têm um título curto na tela. Vazio =
          automático, então quem não quiser decidir não precisa. */}
      {(w.tipo === "anel" || w.tipo === "curva" || w.tipo === "destaque") && (
        <label>
          Rótulo (vazio = automático)
          <input
            value={String(w.opcoes.rotulo ?? "")}
            placeholder={w.tipo === "anel" ? "da meta" : w.tipo === "destaque" ? "Destaque" : "o nome da métrica"}
            onChange={(e) => set("rotulo", e.target.value)}
          />
        </label>
      )}

      {/* Os blocos novos estavam SEM controle nenhum: entravam com o padrão e
          não havia como mudar pela tela — só editando o JSON. */}
      {w.tipo === "pessoas" && (
        <label>
          Quantos cartões
          <input
            type="number"
            min={1}
            max={8}
            value={Number(w.opcoes.cartoes ?? 4)}
            onChange={(e) => set("cartoes", Math.max(1, Math.min(8, Number(e.target.value))))}
          />
        </label>
      )}

      {w.tipo === "imagem" && (
        <>
          <label>
            Endereço da imagem
            <input
              value={String(w.opcoes.url ?? "")}
              placeholder="https://…"
              onChange={(e) => set("url", e.target.value.trim())}
            />
          </label>
          {/* Cortar é o padrão porque a TV tem proporção fixa e a foto quase
              nunca tem: "caber inteira" deixa duas tarjas pretas do lado. */}
          <label className="ed-check">
            <Caixa marcado={w.opcoes.preencher !== false} onChange={(marc) => set("preencher", marc)} />
            preencher o bloco (cortando o que sobra)
          </label>
        </>
      )}

      {w.tipo === "texto" && (
        <>
          <label>
            Texto
            <input value={String(w.opcoes.texto ?? "")} onChange={(e) => set("texto", e.target.value)} />
          </label>
          <label>
            Tamanho
            <select value={String(w.opcoes.tamanho ?? "titulo")} onChange={(e) => set("tamanho", e.target.value)}>
              <option value="titulo">Título</option>
              <option value="subtitulo">Subtítulo</option>
              <option value="corpo">Corpo</option>
            </select>
          </label>
        </>
      )}

      {w.tipo === "relogio" && (
        <label className="ed-check">
          <Caixa marcado={w.opcoes.hora !== false} onChange={(marc) => set("hora", marc)} />
          mostrar a hora
        </label>
      )}

      {/* Atalhos de tamanho. Digitar quatro números para dizer "metade da
          tela" é o tipo de atrito que faz a pessoa desistir de montar e
          deixar o padrão. Os campos continuam aí para o ajuste fino. */}
      <div className="ed-presets">
        {([
          ["Tela toda", 0, 0, COLUNAS, LINHAS],
          ["Metade ←", 0, w.y, COLUNAS / 2, w.h],
          ["Metade →", COLUNAS / 2, w.y, COLUNAS / 2, w.h],
          ["Faixa larga", 0, w.y, COLUNAS, Math.min(w.h, 3)],
          ["Um terço", w.x, w.y, COLUNAS / 3, w.h],
        ] as [string, number, number, number, number][]).map(([nome, x, y, larg, alt]) => (
          <button
            key={nome}
            type="button"
            onClick={() =>
              onChange((o) => ({
                ...o,
                x: Math.max(0, Math.min(COLUNAS - larg, x)),
                y: Math.max(0, Math.min(LINHAS - alt, y)),
                w: larg,
                h: alt,
              }))
            }
          >
            {nome}
          </button>
        ))}
      </div>

      <div className="ed-pos">
        <label>x<input type="number" min={0} max={COLUNAS - 1} value={w.x} onChange={(e) => onChange((o) => ({ ...o, x: Math.max(0, Math.min(COLUNAS - o.w, Number(e.target.value))) }))} /></label>
        <label>y<input type="number" min={0} max={LINHAS - 1} value={w.y} onChange={(e) => onChange((o) => ({ ...o, y: Math.max(0, Math.min(LINHAS - o.h, Number(e.target.value))) }))} /></label>
        <label>larg.<input type="number" min={1} max={COLUNAS} value={w.w} onChange={(e) => onChange((o) => ({ ...o, w: Math.max(1, Math.min(COLUNAS - o.x, Number(e.target.value))) }))} /></label>
        <label>alt.<input type="number" min={1} max={LINHAS} value={w.h} onChange={(e) => onChange((o) => ({ ...o, h: Math.max(1, Math.min(LINHAS - o.y, Number(e.target.value))) }))} /></label>
      </div>
    </div>
  );
}

export { layoutPadrao };
