"use client";

// Modo "um passo por vez" — o tutorial em tela cheia.
//
// Na bancada, com a peça numa mão, a página longa obriga a achar de novo onde
// parou a cada olhada. Aqui cabe UM passo na tela, e os três botões ficam em
// baixo, no alcance do polegar: [Anterior] … [Feito] … [Próximo]. O "Feito"
// fica no meio e com folga — colado no "Próximo", o polegar erra e a pessoa
// pula um passo sem querer.
//
// Decisões que valem mais que o visual:
//  • A camada vai pro <body> por PORTAL. Dentro da página ela herdaria
//    qualquer transform/overflow de ancestral e nasceria recortada ou atrás
//    da barra de atalhos. As cores da central moram no <main>, então são
//    copiadas pro invólucro — sem isso o fundo escuro de uma central virava
//    branco no modo.
//  • Troca de passo por ESMAECER, nunca deslizando de lado: percurso
//    horizontal empurra a caixa pra fora da tela e a sobra vira largura.
//  • O gesto de arrastar pro lado tem limiar e tolerância vertical
//    (`direcaoDoGesto`): quem rola o texto não pode trocar de passo.
//  • Foco preso na camada, título do passo focado a cada troca (o leitor de
//    tela anuncia onde está) e foco devolvido ao botão que abriu.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as PointerEventReact } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/app/(plataforma)/Icon";
import { travarRolagem } from "@/app/(plataforma)/ui/travaRolagem";
import { direcaoDoGesto, type PassoConteudo } from "@/lib/tridiflow-tutoriais-leitura";
import { useLeitura } from "./LeituraTutorial";
import { VideoTutorial } from "./VideoTutorial";

const TOKENS = ["--color-background", "--color-text", "--color-text-muted", "--color-primary", "--color-primary-contrast"] as const;
function tokensDe(el: Element | null): CSSProperties {
  const estilo: Record<string, string> = {};
  if (!el || typeof getComputedStyle === "undefined") return estilo;
  const cs = getComputedStyle(el);
  for (const t of TOKENS) {
    const v = cs.getPropertyValue(t).trim();
    if (v) estilo[t] = v;
  }
  return estilo as CSSProperties;
}

// Onde a seta e o arrasto pertencem ao próprio controle, não à troca de passo.
// Uma lista só pros dois gestos: se divergirem, um deles volta a roubar o vídeo.
const CONTROLE_PROPRIO = "video, audio, input, textarea, select, [contenteditable='true']";
const ehControleProprio = (alvo: EventTarget | null) =>
  alvo instanceof Element && alvo.closest(CONTROLE_PROPRIO) !== null;

const FOCAVEIS = 'a[href], button:not([disabled]), iframe, video[controls], [tabindex]:not([tabindex="-1"])';
function prenderFoco(e: KeyboardEvent, raiz: HTMLElement | null) {
  if (!raiz) return;
  const lista = Array.from(raiz.querySelectorAll<HTMLElement>(FOCAVEIS));
  if (!lista.length) return;
  const primeiro = lista[0];
  const ultimo = lista[lista.length - 1];
  const ativo = document.activeElement;
  if (!ativo || !raiz.contains(ativo)) { e.preventDefault(); primeiro.focus(); return; }
  if (e.shiftKey && ativo === primeiro) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && ativo === ultimo) { e.preventDefault(); primeiro.focus(); }
}

export function ModoPassoAPasso({ passos }: { passos: PassoConteudo[] }) {
  const { modo } = useLeitura();
  if (modo === null || passos.length < 2) return null;
  return <Camada passos={passos} />;
}

function Camada({ passos }: { passos: PassoConteudo[] }) {
  const l = useLeitura();
  const total = passos.length;
  const n = Math.min(Math.max(l.modo ?? 1, 1), total);
  const passo = passos[n - 1];
  const feito = l.ehFeito(n);
  const camada = useRef<HTMLDivElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ x: number; y: number; id: number } | null>(null);
  // Lido uma vez, ao abrir: as cores da central não mudam com o modo aberto.
  const [tokens] = useState(() => tokensDe(l.escopo()));

  // Trava a rolagem do fundo enquanto a camada existe (a função devolvida
  // pelo `travarRolagem` é o próprio cleanup).
  useEffect(() => travarRolagem(), []);

  // A cada troca: o endereço acompanha (`#passo-N` pode ser mandado por
  // link), o texto volta ao começo e o foco vai pro título.
  useEffect(() => {
    try { history.replaceState(null, "", `#passo-${n}`); } catch { /* sandbox sem history */ }
    if (palco.current) palco.current.scrollTop = 0;
    titulo.current?.focus({ preventScroll: true });
  }, [n]);

  const ir = (m: number) => { if (m >= 1 && m <= total) l.irNoModo(m); };
  const marcar = () => {
    // Marcou: segue pro próximo, como na página. No último, só marca — quem
    // encerra é o "Concluir".
    if (l.alternar(n) && n < total) ir(n + 1);
  };

  // Sem lista de dependências de propósito: re-registra a cada render pra
  // sempre enxergar o passo atual (é barato e evita fechar sobre um `n` velho).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); l.fecharModo(); return; }
      if (e.key === "Tab") { prenderFoco(e, camada.current); return; }
      // Seta dentro do vídeo é do vídeo (avançar/voltar o tempo).
      if (ehControleProprio(e.target)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); ir(n + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); ir(n - 1); }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  // Mouse fica de fora do gesto: arrastar com ele é selecionar texto, e no
  // computador as setas e os botões já fazem o serviço.
  const aoTocar = (e: PointerEventReact) => {
    if (e.pointerType === "mouse" || !e.isPrimary) return;
    // Os controles nativos do <video> sobem o toque até aqui com o próprio
    // vídeo como alvo, e o `pan-y` não consome arrasto de lado: sem este
    // filtro, arrastar a barra de tempo trocava de passo e o `key={n}`
    // desmontava o vídeo que estava tocando.
    if (ehControleProprio(e.target)) { gesto.current = null; return; }
    gesto.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const aoSoltar = (e: PointerEventReact) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g || g.id !== e.pointerId) return;
    const d = direcaoDoGesto(e.clientX - g.x, e.clientY - g.y);
    if (d) ir(n + d);
  };

  return createPortal(
    <div ref={camada} className="tut-modo" role="dialog" aria-modal="true" aria-label="Passo a passo" style={tokens}>
      <div className="tut-modo-topo">
        <span className="tut-modo-conta" aria-hidden="true">{`Passo ${n} de ${total}`}</span>
        <button type="button" className="tut-modo-fechar" onClick={() => l.fecharModo()} aria-label="Fechar passo a passo">
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="tut-modo-trilha" aria-hidden="true">
        <div style={{ transform: n >= total ? "none" : `scaleX(${n / total})` }} />
      </div>
      <div ref={palco} className="tut-modo-palco" onPointerDown={aoTocar} onPointerUp={aoSoltar}
        onPointerCancel={() => { gesto.current = null; }}>
        <div key={n} className="tut-modo-passo">
          <h2 ref={titulo} tabIndex={-1}>
            <span className="sr-only">{`Passo ${n} de ${total}: `}</span>{passo.titulo}
          </h2>
          {passo.html && <div className="rte" dangerouslySetInnerHTML={{ __html: passo.html }} />}
          {passo.imagemUrl && <figure><img src={passo.imagemUrl} alt={passo.imagemAlt} /></figure>}
          {passo.videoUrl && <VideoTutorial url={passo.videoUrl} capa={passo.videoCapaUrl} />}
        </div>
      </div>
      <div className="tut-modo-base">
        <button type="button" className="tut-modo-anterior" onClick={() => ir(n - 1)} disabled={n === 1}>
          <Icon name="chevron-left" size={20} /><span>Anterior</span>
        </button>
        <button type="button" className="tut-modo-feito" aria-pressed={feito} onClick={marcar}>
          <Icon name={feito ? "circle-check" : "circle"} size={18} />Feito
        </button>
        {n < total ? (
          <button type="button" className="tut-botao tut-modo-proximo" onClick={() => ir(n + 1)}>
            Próximo<Icon name="chevron-right" size={18} />
          </button>
        ) : (
          <button type="button" className="tut-botao tut-modo-proximo" onClick={() => l.fecharModo("fim")}>
            Concluir<Icon name="check" size={18} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
