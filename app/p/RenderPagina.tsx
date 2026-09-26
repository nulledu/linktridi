"use client";

// RENDERIZADOR da página — o mesmo no preview do editor e no ar.
// Ter um só é o que garante "o que você vê é o que vai publicado".
//
// Aqui mora o relógio: segundos de página, progresso do vídeo e o acumulador de
// blocos liberados. Os blocos em si não sabem de tempo — só perguntam ao ctx.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONFIG_PADRAO, todosBlocos, type PaginaDoc } from "@/lib/tridiflow-pagina";
import type { Vars } from "@/lib/tridiflow";
import { varianteEfetiva, type Variante } from "@/lib/tridiflow-ab";
import { TEXTO, estiloCss, fundoDaPagina, larguraCss, varsDaPagina } from "@/lib/tridiflow-pagina-estilo";
import { CLASSES_FONTES } from "./fontes";
import {
  ESTADO_INICIAL, EVENTO_DO_MARCO, deveMostrar, lerProgresso, marcosAtingidos,
  precisaCronometro, salvarProgresso, type Adiantar, type EstadoRuntime,
} from "@/lib/tridiflow-pagina-runtime";
import type { CtxPagina, ModoRender, Viewport } from "./contexto";
import type { ProgressoVideo } from "./VideoBloco";
import { BlocoView } from "./BlocoView";
import { primariaEhEscura } from "@/lib/tridiflow-pagina-tema";

/** `#totem` no link, `id="totem"` na seção. Qualquer outro caractere sai. */
function ancoraSegura(a: string | undefined): string | undefined {
  const v = (a ?? "").toLowerCase().replace(/^#/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return v || undefined;
}

export function RenderPagina({
  doc, paginaId, modo, viewport, vars, variante, onEvento, selecionado, onSelecionar, onEditarTexto, revelarTudo, onAcaoBloco, onMoverBloco, adiantar, simular,
}: {
  doc: PaginaDoc;
  paginaId: string;
  modo: ModoRender;
  viewport: Viewport;
  /** Valores de `{{variavel}}` — só a página publicada passa. Ausente = nenhuma
   *  substituição, que é o que o editor quer: lá o autor precisa ver a tag. */
  vars?: Vars;
  /** Versão do teste A/B a desenhar. Ausente = "a", o controle. */
  variante?: Variante;
  /** A página está dentro de uma MOLDURA (editor ou prévia), não ocupando a
   *  janela. Aí a media query não serve e `viewport` é quem decide o layout.
   *  Padrão: ligado no editor, desligado na página publicada de verdade. */
  simular?: boolean;
  onEvento?: (evento: string, meta?: Record<string, unknown>) => void;
  selecionado?: string | null;
  onSelecionar?: (id: string | null) => void;
  onEditarTexto?: (blocoId: string, texto: string) => void;
  revelarTudo?: boolean;
  /** Só o EDITOR passa: liga as ações de hover no canvas. */
  onAcaoBloco?: CtxPagina["onAcaoBloco"];
  onMoverBloco?: CtxPagina["onMoverBloco"];
  /** Só a PRÉVIA passa: adianta o relógio/vídeo pra ver a página como ela fica
   *  depois de X tempo, sem esperar. Não grava nada e não dispara evento — é
   *  faz-de-conta em cima do mesmo renderizador. */
  adiantar?: Adiantar | null;
}) {
  const config = { ...CONFIG_PADRAO, ...doc.config };
  const lembrar = config.lembrarProgresso !== false;

  const [estado, setEstado] = useState<EstadoRuntime>(ESTADO_INICIAL);
  const [liberados, setLiberados] = useState<Set<string>>(() => new Set());
  const marcosVistos = useRef<Set<number>>(new Set());
  const t0 = useRef<number>(0);

  const blocos = useMemo(() => todosBlocos(doc), [doc]);
  const usaCronometro = useMemo(() => precisaCronometro(blocos), [blocos]);

  // Retoma o progresso de quem já estava vendo (F5 no meio da VSL não devolve
  // o visitante pro começo da liberação). Config `lembrarProgresso` desliga.
  useEffect(() => {
    if (modo !== "publicado") return;
    const p = lerProgresso(paginaId, lembrar);
    t0.current = Date.now() - (p?.segundosPagina ?? 0) * 1000;
    if (p) {
      setEstado((e) => ({ ...e, segundosPagina: p.segundosPagina, segundosVideo: p.segundosVideo, percentualVideo: p.percentual }));
    }
  }, [modo, paginaId, lembrar]);

  // Relógio da página — só liga se algum bloco depende de tempo.
  useEffect(() => {
    if (modo !== "publicado" || !usaCronometro) return;
    if (!t0.current) t0.current = Date.now();
    const t = setInterval(() => {
      setEstado((e) => ({ ...e, segundosPagina: Math.floor((Date.now() - t0.current) / 1000) }));
    }, 1000);
    return () => clearInterval(t);
  }, [modo, usaCronometro]);

  // Progresso do vídeo → estado + eventos de marco (uma vez cada).
  const onVideo = useCallback((p: ProgressoVideo) => {
    setEstado((e) => {
      const novo: EstadoRuntime = {
        ...e,
        videoReporta: p.reporta ?? e.videoReporta,
        videoIniciou: p.iniciou ?? e.videoIniciou,
        videoTerminou: p.terminou ?? e.videoTerminou,
        segundosVideo: p.segundos != null ? Math.max(e.segundosVideo, p.segundos) : e.segundosVideo,
        // percentual nunca anda pra trás: quem arrasta o vídeo pra trás não
        // "des-libera" a oferta.
        percentualVideo: p.percentual != null ? Math.max(e.percentualVideo, p.percentual) : e.percentualVideo,
      };
      return novo;
    });
    if (modo !== "publicado") return;
    if (p.iniciou && !marcosVistos.current.has(0)) { marcosVistos.current.add(0); onEvento?.("video_started"); }
    const pct = p.terminou ? 100 : (p.percentual ?? 0);
    for (const m of marcosAtingidos(pct)) {
      if (marcosVistos.current.has(m)) continue;
      marcosVistos.current.add(m);
      onEvento?.(EVENTO_DO_MARCO[m]);
    }
  }, [modo, onEvento]);

  // Acumula liberados: uma vez visível, sempre visível nesta visita.
  useEffect(() => {
    const novos: string[] = [];
    for (const b of blocos) {
      if ((b.visivel?.modo ?? "sempre") === "sempre") continue;
      if (liberados.has(b.id)) continue;
      if (deveMostrar(b.visivel, estado, false)) novos.push(b.id);
    }
    if (novos.length) setLiberados((s) => { const n = new Set(s); for (const id of novos) n.add(id); return n; });
  }, [estado, blocos, liberados]);

  // Salva o progresso pra sobreviver ao F5.
  useEffect(() => {
    if (modo !== "publicado") return;
    salvarProgresso(paginaId, lembrar, {
      segundosPagina: estado.segundosPagina, segundosVideo: estado.segundosVideo, percentual: estado.percentualVideo,
    });
  }, [modo, paginaId, lembrar, estado.segundosPagina, estado.segundosVideo, estado.percentualVideo]);

  const simulando = simular ?? (modo === "preview");

  // Estado que os blocos enxergam. `adiantar` só ENTRA por cima do estado real
  // (nunca volta atrás) e só existe na prévia: o publicado não recebe a prop,
  // então o caminho de quem visita a página é exatamente o de antes.
  const estadoVisto: EstadoRuntime = adiantar
    ? {
        ...estado,
        segundosPagina: Math.max(estado.segundosPagina, adiantar.segundosPagina ?? 0),
        segundosVideo: Math.max(estado.segundosVideo, adiantar.segundosVideo ?? 0),
        percentualVideo: Math.max(estado.percentualVideo, adiantar.percentualVideo ?? 0),
        videoIniciou: estado.videoIniciou || !!adiantar.videoIniciou,
        videoTerminou: estado.videoTerminou || !!adiantar.videoTerminou,
        videoReporta: estado.videoReporta || !!adiantar.videoReporta,
      }
    : estado;

  const ctx: CtxPagina = {
    modo, viewport, vars: vars ?? {},
    variante: varianteEfetiva(config.teste, variante ?? null),
    estado: estadoVisto, liberados, config,
    onEvento: onEvento ?? (() => {}),
    onVideo,
    selecionado, onSelecionar, onEditarTexto, revelarTudo, onAcaoBloco, onMoverBloco,
  };

  return (
    <div
      // No preview a media query olharia a JANELA, não a moldura de 390px — a
      // classe de simulação é o que faz o celular do editor bater com o real.
      // Na página publicada não entra classe nenhuma: lá quem manda é o CSS.
      className={[
        "tfp-pagina",
        CLASSES_FONTES,
        simulando ? (viewport === "mobile" ? "tfp-sim-mobile" : "tfp-sim-desktop") : "",
        // No editor as animações ficam paradas: um bloco que reaparece a cada
        // tecla digitada atrapalha quem está montando a página.
        config.semAnimacoes || modo === "preview" ? "tfp-sem-anim" : "",
        config.destaque === "suave" ? "tfp-destaque-suave" : "",
        config.destaque === "cor" ? "tfp-destaque-cor" : "",
        // Só no ar: no editor quem monta precisa ver tudo parado no lugar.
        config.rolagemViva && !config.semAnimacoes && modo === "publicado" ? "tfp-rolagem-viva" : "",
        primariaEhEscura(config.corPrimaria) ? "tfp-primaria-escura" : "",
      ].filter(Boolean).join(" ")}
      onClick={() => { if (modo === "preview") onSelecionar?.(null); }}
      style={{
        ...varsDaPagina(config),
        ...fundoDaPagina(config),
        color: config.corTexto ?? undefined,
        fontFamily: "var(--tfp-font)",
        minHeight: modo === "publicado" ? "100dvh" : undefined,
        width: "100%",
      }}
    >
      {doc.secoes.filter((s) => !s.oculto).map((s) => {
        const escondeAqui = viewport === "mobile" ? s.estilo?.ocultarMobile : s.estilo?.ocultarDesktop;
        if (escondeAqui) return null;
        return (
          <section key={s.id} id={ancoraSegura(s.ancora)} data-secao={s.id} style={{ ...estiloCss(s.estilo, viewport === "mobile"), width: "100%" }}>
            <div style={{
              // Largura escolhida no inspetor da seção; sem escolha, a da página.
              maxWidth: s.estilo?.largura ? larguraCss(s.estilo.largura, config) : `${config.larguraMax ?? CONFIG_PADRAO.larguraMax}px`,
              marginInline: "auto", display: "grid", gap: 14,
            }}>
              {/* secaoId/indice: só os blocos da RAIZ recebem, e é o que
                  habilita o arraste no canvas (ver BlocoView). */}
              {s.blocos.map((b, i) => <BlocoView key={b.id} bloco={b} ctx={ctx} paginaId={paginaId} secaoId={s.id} indice={i} />)}
            </div>
          </section>
        );
      })}

      {doc.secoes.length === 0 && modo === "preview" && (
        <div style={{ padding: "70px 20px", textAlign: "center", opacity: TEXTO.secundario, fontSize: 14 }}>
          Comece adicionando uma seção pela barra da esquerda.
        </div>
      )}
    </div>
  );
}
