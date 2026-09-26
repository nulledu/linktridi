"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MICRO-TRANSIÇÕES — a parte que precisa de JS
//
// O CSS do bloco "MICRO-TRANSIÇÕES" e das receitas `t-*` do `globals.css` faz
// quase tudo sozinho. Este arquivo existe só para as quatro coisas que CSS não
// alcança:
//
//   1. saber que a peça entrou na tela           → IntersectionObserver
//   2. saber onde o ponteiro está                → variáveis escritas no nó
//   3. contar de um número até outro             → requestAnimationFrame
//   4. a conta do palco 3D e do leque            → `abs()` não existe no
//      WebView antigo do tablet (Chrome 51 no browserslist), então a
//      matemática é feita aqui e entregue pronta como transform inline
//
// REGRA que atravessa o arquivo inteiro: **nada aqui provoca re-render por
// movimento do ponteiro.** Um `setState` a 60 Hz num cartão remonta a subárvore
// inteira, e num painel com 20 cartões isso é 1200 renders por segundo. Tudo
// que segue o ponteiro é escrito com `style.setProperty` direto no nó.
//
// CATÁLOGO DO ACABAMENTO (repertório Kinetics, adaptado à escala do projeto).
// Veja tudo em /dev-micro. Número = efeito em .claude/skills/kinetics/efeitos.
//
//   Aqui (ui/micro.tsx):
//   · <TrocaTexto ligado a="Copiar" b="Copiado" />      troca de texto no mesmo lugar (016)
//   · <Progresso valor={0.62} rotulo="Meta do mês" />    barra que cresce ao aparecer (057)
//       props: valor, max=1, rotulo, cor, altura=8
//   · <AnelProgresso valor={0.72} rotulo="Meta">72%</AnelProgresso>  anel (068)
//       props: valor, max=1, rotulo, cor, tamanho=44, espessura=5, children=centro
//
//   No kit (ui/controles.tsx):
//   · <Botao estado="ocioso|carregando|ok|erro">       giro → check desenhado / tremor (072 063 065 103)
//   · const a = useAcao(fn); <Botao estado={a.estado} onClick={() => a.rodar()}>
//   · <BotaoCopiar texto="..." [soIcone] />  e  useCopiar()                    (016)
//   · <Chips rotulo opcoes valor={T[]} onMuda />  e  <Chip ativo onClick>      (018 027)
//   · <Caixa marcado onChange rotulo? />   checkbox com traço desenhado        (060)
//   · <Interruptor> já é o Switch Spring (059): passa do ponto e estica no toque.
//
//   Só CSS (globals.css, bloco "ACABAMENTO"):
//   · `.ui-card-alvo` sobe 3px no ponteiro fino (127 Hover Lift); no dedo, só a
//     resposta de toque da fundação.
//   · Pilha de avisos (`toast`): entra passando do ponto (004), máx. 3 (075),
//     toque dispensa, `aria-live`.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Children, cloneElement, isValidElement,
  useCallback, useEffect, useId, useRef, useState,
  type CSSProperties, type ReactNode,
} from "react";
import { Icon } from "../Icon";
import { projetar, rastro } from "./gestos";

// ── Preferências do sistema ──────────────────────────────────────────────────

/** `true` quando a pessoa pediu menos movimento no sistema operacional.
 *  Lido sob demanda (não em estado) porque quem consulta são efeitos, e um
 *  listener por componente custaria mais do que a resposta vale. */
export function menosMovimento(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** `true` num aparelho de toque. Não é "é celular": um tablet de 1024px tem
 *  dedo, e é justamente onde o ímã e a inclinação atrapalhariam. */
function ponteiroGrosso(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

// ── 1. Revelar ao entrar na tela ─────────────────────────────────────────────

/**
 * Marca `data-mt="on"` no nó quando ele entra no campo de visão. O visual
 * inteiro é do CSS (`.mt-surge`) — aqui só se decide QUANDO.
 *
 * `umaVez` é o padrão: uma peça que reaparece toda vez que a pessoa rola pra
 * cima e pra baixo transforma a rolagem numa discoteca. O caso de repetir
 * existe (carrossel de destaque), mas é exceção.
 *
 * Sem `IntersectionObserver` (WebView antigo) a peça acende na hora: o modo de
 * falha de um efeito decorativo nunca pode ser conteúdo invisível.
 */
export function useRevelar<T extends HTMLElement = HTMLDivElement>(
  { umaVez = true, margem = "0px 0px -12% 0px", fracao = 0.08 }: {
    umaVez?: boolean; margem?: string; fracao?: number;
  } = {},
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const acende = () => el.setAttribute("data-mt", "on");

    if (typeof IntersectionObserver === "undefined" || menosMovimento()) { acende(); return; }

    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) {
          acende();
          if (umaVez) obs.unobserve(e.target);
        } else if (!umaVez) {
          e.target.removeAttribute("data-mt");
        }
      }
    }, { rootMargin: margem, threshold: fracao });

    obs.observe(el);
    return () => obs.disconnect();
  }, [umaVez, margem, fracao]);

  return ref;
}

export type Direcao = "baixo" | "cima" | "esquerda" | "direita" | "zoom" | "surgir" | "foco";

/**
 * Envelope de entrada. `indice` escalona uma grade inteira sem que quem
 * escreve precise calcular atraso nenhum.
 */
export function Revelar({
  de = "baixo", indice = 0, atrasoMs, umaVez = true, className = "", style, children, ...rest
}: {
  de?: Direcao; indice?: number; atrasoMs?: number; umaVez?: boolean;
  className?: string; style?: CSSProperties; children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "children">) {
  const ref = useRevelar<HTMLDivElement>({ umaVez });
  return (
    <div
      ref={ref}
      className={className ? `mt-surge ${className}` : "mt-surge"}
      data-mt-de={de}
      style={{ ["--mt-i" as string]: indice, ["--mt-atraso" as string]: atrasoMs != null ? `${atrasoMs}ms` : `min(calc(${indice} * var(--mt-passo)), var(--mt-teto))`, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Fila escalonada: a lista inteira entra em cascata sem envolver cada item.
 * Serve para `<tbody>`, grade de cartões e lista de cartões do celular.
 *
 * O `--mt-i` vai em cada FILHO, então o componente clona os filhos para
 * carimbar o índice. Fazer isso por `:nth-child()` no CSS exigiria uma regra
 * por posição — e a tabela tem 200 linhas.
 */
export function Fila({ as: Tag = "div", className = "", children, style, ...rest }: {
  as?: keyof React.JSX.IntrinsicElements; className?: string; children: ReactNode; style?: CSSProperties;
} & Record<string, unknown>) {
  let i = 0;
  // `Children.map` renumeraria as chaves (prefixo ".0"), e a chave é o que
  // segura a identidade da linha entre renders: renumerar faz o React remontar
  // a lista inteira quando um item muda, e a animação de entrada dispararia de
  // novo em cima de dado que já estava lá. `Children.toArray` + `cloneElement`
  // preserva a chave original.
  const filhos = Children.toArray(children).map((filho) =>
    isValidElement<{ style?: CSSProperties }>(filho)
      ? cloneElement(filho, { style: { ["--mt-i" as string]: i++, ...filho.props.style } })
      : filho,
  );

  const Comp = Tag as React.ElementType;
  return <Comp className={className ? `mt-fila ${className}` : "mt-fila"} style={style} {...rest}>{filhos}</Comp>;
}

/**
 * Fileira que levanta — a receita `avatar-group-hover` do transitions.dev.
 *
 * O CSS do `.t-avatar` já morava no `globals.css` sem ninguém para acioná-lo:
 * ele lê `--shift` e `--scale-active`, e essas duas variáveis são escritas em
 * JS. Sem o orquestrador a regra estava instalada e morta.
 *
 * O item sob o ponteiro sobe e cresce; os vizinhos sobem menos, por queda
 * exponencial da distância (`lift * falloff^d`) — é isso que faz a fileira
 * responder como um grupo, e não como três peças independentes.
 *
 * A CURVA É ESCRITA INLINE ANTES das variáveis, e essa ordem não é estilo: o
 * navegador usa a `transition-timing-function` VIGENTE no instante em que a
 * propriedade muda. Escrevendo a curva antes, a ida ganha a saída limpa e a
 * volta ganha o repique — sem precisar de uma segunda declaração nem de uma
 * classe `.saindo`. Escrever depois pega a curva errada nos dois sentidos.
 *
 * Devolve o que prender na fileira e em cada item. No dedo não liga nada:
 * `mouseenter` não existe no toque, e a fileira já responde pelo `:active`.
 */
export function useFileiraQueLevanta<T extends HTMLElement = HTMLDivElement>() {
  const raiz = useRef<T | null>(null);

  const mover = useCallback((ativo: number | null, fase: "entra" | "sai") => {
    const el = raiz.current;
    if (!el || menosMovimento()) return;
    const cs = getComputedStyle(document.documentElement);
    const num = (nome: string, padrao: number) => {
      const v = parseFloat(cs.getPropertyValue(nome));
      return Number.isFinite(v) ? v : padrao;
    };
    const curva = (nome: string, padrao: string) => cs.getPropertyValue(nome).trim() || padrao;

    const lift = num("--avatar-lift", -4);
    const queda = num("--avatar-falloff", 0.45);
    const escala = num("--avatar-scale", 1.05);
    const tf = fase === "sai"
      ? curva("--avatar-ease-out", "cubic-bezier(0.34, 3.85, 0.64, 1)")
      : curva("--avatar-ease-in", "cubic-bezier(0.22, 1, 0.36, 1)");

    el.querySelectorAll<HTMLElement>(".t-avatar").forEach((item, i) => {
      item.style.transitionTimingFunction = tf;
      if (ativo == null) {
        item.style.setProperty("--shift", "0px");
        item.style.setProperty("--scale-active", "1");
        return;
      }
      const d = Math.abs(i - ativo);
      item.style.setProperty("--shift", `${(lift * Math.pow(queda, d)).toFixed(3)}px`);
      item.style.setProperty("--scale-active", i === ativo ? String(escala) : "1");
    });
  }, []);

  return {
    raiz,
    daFileira: { ref: raiz, onMouseLeave: () => mover(null, "sai") },
    doItem: (i: number) => ({ className: "t-avatar", onMouseEnter: () => mover(i, "entra") }),
  };
}

// ── 2. Ponteiro ──────────────────────────────────────────────────────────────

export type ModoPonteiro = "inclina" | "ima" | "brilho";

/**
 * Devolve os manipuladores que fazem a peça responder ao ponteiro. Escreve
 * variáveis CSS no próprio nó — zero re-render.
 *
 * No dedo NADA disso liga: o ímã faria o alvo fugir do toque, e a inclinação
 * exigiria manter o dedo parado sobre um cartão, que não é um gesto que
 * exista. A peça continua respondendo pelo `:active` do CSS.
 */
export function usePonteiro<T extends HTMLElement = HTMLDivElement>(
  modo: ModoPonteiro,
  { forca = 0.32, giro = 9, alcance = 60 }: { forca?: number; giro?: number; alcance?: number } = {},
) {
  const ref = useRef<T | null>(null);
  const inerte = useRef(false);

  useEffect(() => { inerte.current = ponteiroGrosso() || menosMovimento(); }, []);

  const limpar = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.removeAttribute("data-mt");
    el.style.removeProperty("--mt-rx");
    el.style.removeProperty("--mt-ry");
    el.style.removeProperty("--mt-dx");
    el.style.removeProperty("--mt-dy");
  }, []);

  const mover = useCallback((e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el || inerte.current || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // Fração de -0.5 a 0.5 a partir do centro. Trabalhar em fração (e não em
    // px) faz o mesmo código servir a um chip de 30px e a um cartão de 400.
    const fx = (e.clientX - r.left) / r.width - 0.5;
    const fy = (e.clientY - r.top) / r.height - 0.5;

    if (modo === "inclina") {
      // O eixo Y controla rotateX e o X controla rotateY — trocar os dois é o
      // erro clássico: o cartão inclina pro lado errado e parece quebrado.
      el.style.setProperty("--mt-rx", `${(-fy * giro).toFixed(2)}deg`);
      el.style.setProperty("--mt-ry", `${(fx * giro).toFixed(2)}deg`);
    } else if (modo === "ima") {
      const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      const perto = dist < alcance + Math.max(r.width, r.height) / 2;
      el.style.setProperty("--mt-dx", perto ? `${(fx * r.width * forca).toFixed(1)}px` : "0px");
      el.style.setProperty("--mt-dy", perto ? `${(fy * r.height * forca).toFixed(1)}px` : "0px");
    } else {
      el.style.setProperty("--mt-x", `${((fx + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--mt-y", `${((fy + 0.5) * 100).toFixed(1)}%`);
    }
    el.setAttribute("data-mt", "on");
  }, [modo, forca, giro, alcance]);

  return {
    ref,
    props: { onPointerMove: mover, onPointerLeave: limpar, onPointerCancel: limpar, onBlur: limpar },
  };
}

/**
 * Cartão que inclina em 3D com brilho seguindo o cursor (receita `card-tilt`).
 *
 * O ponteiro é rastreado no invólucro PLANO, nunca no cartão que gira: as
 * bordas em rotação escorregam por baixo do cursor e o hover fica piscando.
 */
export function CartaoInclina({
  giro = 9, brilho = true, className = "", cardClassName = "", style, children,
}: {
  giro?: number; brilho?: boolean; className?: string; cardClassName?: string;
  style?: CSSProperties; children: ReactNode;
}) {
  const fora = useRef<HTMLDivElement | null>(null);
  const cartao = useRef<HTMLDivElement | null>(null);
  const inerte = useRef(false);
  useEffect(() => { inerte.current = ponteiroGrosso() || menosMovimento(); }, []);

  const mover = (e: React.PointerEvent<HTMLDivElement>) => {
    const w = fora.current, c = cartao.current;
    if (!w || !c || inerte.current || e.pointerType === "touch") return;
    const r = w.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const fx = (e.clientX - r.left) / r.width - 0.5;
    const fy = (e.clientY - r.top) / r.height - 0.5;
    c.classList.add("is-tilting");
    c.style.setProperty("--tilt-rx", `${(-fy * giro).toFixed(2)}deg`);
    c.style.setProperty("--tilt-ry", `${(fx * giro).toFixed(2)}deg`);
    c.style.setProperty("--tilt-gx", `${((fx + 0.5) * 100).toFixed(1)}%`);
    c.style.setProperty("--tilt-gy", `${((fy + 0.5) * 100).toFixed(1)}%`);
    w.classList.add("is-hover");
  };
  const sair = () => {
    const w = fora.current, c = cartao.current;
    if (!w || !c) return;
    // Tirar `.is-tilting` devolve a volta longa (1s): a ida acompanha o dedo,
    // a volta assenta. É a única transição do sistema onde a saída é mais
    // elaborada que a entrada, e é de propósito.
    c.classList.remove("is-tilting");
    c.style.setProperty("--tilt-rx", "0deg");
    c.style.setProperty("--tilt-ry", "0deg");
    w.classList.remove("is-hover");
  };

  return (
    <div
      ref={fora}
      className={className ? `t-tilt ${className}` : "t-tilt"}
      onPointerMove={mover}
      onPointerLeave={sair}
      onPointerCancel={sair}
      style={style}
    >
      <div ref={cartao} className={cardClassName ? `t-tilt-card ${cardClassName}` : "t-tilt-card"}>
        {children}
        {brilho && <span className="t-tilt-glare" aria-hidden="true" />}
      </div>
    </div>
  );
}

// ── 3. Troca de ícone ────────────────────────────────────────────────────────

/**
 * Dois ícones do Tabler no mesmo buraco (receita `icon-swap`). Substitui o
 * `{cond ? <Icon a/> : <Icon b/>}` espalhado pelo app.
 *
 * A diferença não é só estética: trocando o NÓ, um botão de largura automática
 * pulava de tamanho no instante da troca (um "x" é mais estreito que um
 * "menu"), e a fileira inteira dava um solavanco. Aqui os dois ícones ocupam a
 * mesma célula de grade o tempo todo, então a largura nunca muda.
 */
export function TrocaIcone({
  ligado, a, b, size = 18, corA, corB, className, titulo,
}: {
  /** `false` mostra `a`, `true` mostra `b`. */
  ligado: boolean;
  a: string; b: string;
  size?: number; corA?: string; corB?: string;
  className?: string;
  /** Quando o ícone É a informação (não decoração), diga o que ele diz. */
  titulo?: string;
}) {
  return (
    <span
      className={className ? `t-icon-swap ${className}` : "t-icon-swap"}
      data-state={ligado ? "b" : "a"}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <span className="t-icon" data-icon="a"><Icon name={a} size={size} color={corA} /></span>
      <span className="t-icon" data-icon="b"><Icon name={b} size={size} color={corB} /></span>
    </span>
  );
}

/**
 * Dois textos no MESMO lugar (a troca de texto da escala: `--duration-quick`
 * nos dois sentidos). Os dois ficam na célula o tempo todo, então a largura é
 * a do maior e o botão não pula entre "Copiar" e "Copiado". O que está
 * escondido sai da árvore de acessibilidade.
 */
export function TrocaTexto({ ligado, a, b, className }: {
  ligado: boolean; a: ReactNode; b: ReactNode; className?: string;
}) {
  return (
    <span className={className ? `mt-troca-texto ${className}` : "mt-troca-texto"} data-mt={ligado ? "on" : undefined}>
      <span data-mt-face="a" aria-hidden={ligado || undefined}>{a}</span>
      <span data-mt-face="b" aria-hidden={!ligado || undefined}>{b}</span>
    </span>
  );
}

// ── 3b. Progresso ────────────────────────────────────────────────────────────

const fracaoDe = (valor: number, max: number) =>
  !Number.isFinite(valor) || !Number.isFinite(max) || max <= 0 ? 0 : Math.min(1, Math.max(0, valor / max));

/**
 * Barra de progresso (Kinetics 057): o preenchimento CRESCE até o valor
 * quando a barra entra na tela, e desliza até o valor novo quando ele muda.
 * Largura, não `scaleX` — escalar achataria as pontas arredondadas.
 * Passou do máximo? A barra satura cheia; diga o "142%" no texto ao lado.
 */
export function Progresso({ valor, max = 1, rotulo, cor, altura = 8, className, style }: {
  valor: number; max?: number;
  /** Nome pro leitor de tela ("Meta do mês"). */
  rotulo: string;
  /** Cor do preenchimento (padrão: destaque). Estado (lucro/prejuízo) = paleta semântica. */
  cor?: string;
  altura?: number;
  className?: string; style?: CSSProperties;
}) {
  const ref = useRevelar<HTMLDivElement>();
  const pct = fracaoDe(valor, max) * 100;
  return (
    <div
      ref={ref}
      className={className ? `mt-prog ${className}` : "mt-prog"}
      role="progressbar" aria-label={rotulo}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
      style={{ height: altura, ["--mt-prog-cor" as string]: cor, ...style }}
    >
      <span className="mt-prog-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Anel de progresso (Kinetics 068). `pathLength=100` faz o traço valer 100
 * unidades seja qual for o raio — o `dashoffset` é só `100 − %`, sem conta de
 * circunferência. O centro é o `children` (o "72%").
 */
export function AnelProgresso({ valor, max = 1, rotulo, cor, tamanho = 44, espessura = 5, children, className }: {
  valor: number; max?: number; rotulo: string; cor?: string;
  tamanho?: number; espessura?: number; children?: ReactNode; className?: string;
}) {
  const ref = useRevelar<HTMLDivElement>();
  const pct = fracaoDe(valor, max) * 100;
  const r = (tamanho - espessura) / 2;
  return (
    <div
      ref={ref}
      className={className ? `mt-aro ${className}` : "mt-aro"}
      role="progressbar" aria-label={rotulo}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
      style={{ width: tamanho, height: tamanho, ["--mt-prog-cor" as string]: cor }}
    >
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden>
        <circle className="mt-aro-trilho" cx={tamanho / 2} cy={tamanho / 2} r={r} strokeWidth={espessura} />
        <circle className="mt-aro-arco" cx={tamanho / 2} cy={tamanho / 2} r={r} strokeWidth={espessura}
          pathLength={100} style={{ strokeDashoffset: 100 - pct }} />
      </svg>
      {children != null && <span className="mt-aro-centro mt-num">{children}</span>}
    </div>
  );
}

// ── 4. Abrir e fechar (modal, dropdown, aviso) ───────────────────────────────

/**
 * Ciclo `.is-open` / `.is-closing` das receitas de modal e dropdown.
 *
 * Devolve `montado` (o nó ainda precisa existir enquanto a saída roda) e a
 * classe do momento. Sem o passo de `.is-closing` a peça sumiria por corte
 * seco — e sem RETIRAR `.is-closing` depois, a próxima abertura partiria da
 * escala de fechamento em vez do repouso, nascendo maior a cada vez.
 *
 * A duração é LIDA do CSS de propósito: mexer no token muda o JS junto, e não
 * existe um 150 escrito à mão aqui pra sair de sincronia depois.
 */
/**
 * Classe de abertura do `.t-modal` quando o chamador não manda a dele.
 *
 * A receita nasce em `opacity: 0; pointer-events: none` e só acende com
 * `.is-open`. Modal que confia no chamador passar `classe` vira invisível na
 * hora em que alguém esquece — véu borrado e NADA em cima. Aconteceu no
 * cadastro de ponto (dois chamadores) e na folha de foto. Acender é do modal:
 * quem anima manda a sua classe, os outros acendem no 2º quadro.
 */
export function useClasseAberta(classe: string) {
  const [aceso, setAceso] = useState(false);
  useEffect(() => {
    const q = requestAnimationFrame(() => requestAnimationFrame(() => setAceso(true)));
    return () => cancelAnimationFrame(q);
  }, []);
  return classe || (aceso ? "is-open" : "");
}

export function useAbrirFechar(aberto: boolean, variavelFechar = "--modal-close-dur") {
  const [montado, setMontado] = useState(aberto);
  const [classe, setClasse] = useState(aberto ? "is-open" : "");

  useEffect(() => {
    if (aberto) {
      setMontado(true);
      // Um quadro entre montar e acender: sem ele o navegador vê o nó já com
      // `.is-open` na primeira pintura e não há transição nenhuma.
      const q = requestAnimationFrame(() => requestAnimationFrame(() => setClasse("is-open")));
      return () => cancelAnimationFrame(q);
    }
    if (!montado) return;
    setClasse("is-closing");
    const ms = duracaoCss(variavelFechar, 150);
    const t = setTimeout(() => { setClasse(""); setMontado(false); }, ms);
    return () => clearTimeout(t);
    // `montado` fora das dependências de propósito: incluí-lo reagendaria o
    // fechamento no próprio setMontado(false) e a peça piscaria de volta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, variavelFechar]);

  return { montado, classe };
}

/** Lê uma duração declarada no `:root` (aceita `ms` e `s`). */
export function duracaoCss(nome: string, padrao: number): number {
  if (typeof window === "undefined") return padrao;
  try {
    const bruto = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    if (!bruto) return padrao;
    const n = parseFloat(bruto);
    if (!Number.isFinite(n)) return padrao;
    return /\ds$/.test(bruto) && !/ms$/.test(bruto) ? n * 1000 : n;
  } catch { return padrao; }
}

export type OrigemFolha =
  | "top-left" | "top-center" | "top-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

/**
 * De qual canto a folha deve crescer, medido a partir da âncora. Uma folha que
 * abre pra cima mas cresce do topo parece vir do lugar errado — o olho segue a
 * origem, não a posição final.
 */
export function origemDaAncora(ancora: DOMRect | null, painel: { top: number; left: number }): OrigemFolha {
  if (!ancora) return "top-left";
  const acima = painel.top < ancora.top;
  const meio = ancora.left + ancora.width / 2;
  const dx = painel.left - meio;
  const lado = dx > 40 ? "left" : dx < -40 ? "right" : "center";
  return `${acima ? "bottom" : "top"}-${lado}` as OrigemFolha;
}

// ── 5. Número vivo ───────────────────────────────────────────────────────────

/** easeOutExpo — a curva que a coleção usa em tudo que "chega". */
const expo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Conta de onde estava até o valor novo. Serve para KPI que muda sozinho (o
 * poll trouxe dado) e para o número que aparece na primeira pintura.
 *
 * Três cuidados que a versão ingênua não tem:
 *  · `tabular-nums` (via `.mt-num`), senão a linha inteira dança enquanto o
 *    dígito vai de 1 a 8;
 *  · só anima quando está VISÍVEL — contar num cartão fora da tela gasta
 *    quadro por nada e a pessoa perde justamente a parte que importa;
 *  · quem pediu menos movimento recebe o número final na hora.
 */
export function NumeroVivo({
  valor, formatar, duracao = 900, className = "", style, as: Tag = "span",
}: {
  valor: number;
  formatar?: (n: number) => string;
  duracao?: number;
  className?: string;
  style?: CSSProperties;
  as?: "span" | "div" | "strong";
}) {
  const ref = useRevelar<HTMLSpanElement>();
  // `emVoo` guarda SÓ o quadro intermediário da contagem. Quando não há
  // contagem em curso ele é `null`, e aí o texto vem do `valor` de verdade.
  //
  // Isso não é estilo: o desenho antigo guardava o número mostrado no estado e
  // só o corrigia no fim da animação. Quando a animação morria no meio — e ela
  // morre, o StrictMode do React 19 monta o efeito duas vezes e o
  // `cancelAnimationFrame` da limpeza pega o quadro em voo — a tela ficava
  // PARADA num valor intermediário. Medido: prop 9, tela "2"; prop 16, tela
  // "3". Um gráfico que não desenha é obviamente defeito; um número errado e
  // plausível é pior, porque ninguém desconfia dele. Assim, se a contagem
  // falhar por qualquer motivo, o que sobra na tela é o número CERTO.
  const [emVoo, setEmVoo] = useState<number | null>(null);
  const anterior = useRef(valor);
  const primeira = useRef(true);

  useEffect(() => {
    const de = primeira.current ? 0 : anterior.current;
    primeira.current = false;
    anterior.current = valor;

    if (menosMovimento() || de === valor) { setEmVoo(null); return; }

    let quadro = 0;
    let inicio = 0;
    const passo = (agora: number) => {
      if (!inicio) inicio = agora;
      const t = Math.min(1, (agora - inicio) / duracao);
      // No último quadro solta o controle em vez de assentar "quase lá": um
      // `expo(1)` que devolvesse 0,999 deixaria o número eternamente a um
      // centavo do certo.
      if (t >= 1) { setEmVoo(null); return; }
      setEmVoo(de + (valor - de) * expo(t));
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    // A rede de segurança: se o navegador parar de servir quadros (aba em
    // segundo plano, painel embutido do editor), a contagem para no meio e
    // `emVoo` fica segurando um número ERRADO e plausível — "1" para um alvo de
    // 3, medido na tela de Configurações. Um relógio comum não depende de
    // quadro: passado o tempo da animação, o número certo assenta de qualquer
    // jeito. Em uso normal ele nunca dispara antes do último quadro.
    const relogio = setTimeout(() => { cancelAnimationFrame(quadro); setEmVoo(null); }, duracao + 120);
    return () => { cancelAnimationFrame(quadro); clearTimeout(relogio); setEmVoo(null); };
  }, [valor, duracao]);

  const mostrado = emVoo ?? valor;
  const texto = formatar ? formatar(mostrado) : Math.round(mostrado).toLocaleString("pt-BR");
  const Comp = Tag as React.ElementType;
  return <Comp ref={ref} className={className ? `mt-num ${className}` : "mt-num"} style={style}>{texto}</Comp>;
}

/**
 * Contador curto (selo, badge, "3 pendentes") com a receita `number-pop-in`:
 * cada dígito re-entra desfocado quando o número muda. Só para números de até
 * três dígitos — num valor em reais o escalonamento por dígito viraria ruído.
 */
export function Digitos({ valor, className = "" }: { valor: number; className?: string }) {
  const [animando, setAnimando] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  const anterior = useRef(valor);

  useEffect(() => {
    if (anterior.current === valor) return;
    anterior.current = valor;
    if (menosMovimento()) return;
    const el = ref.current;
    setAnimando(false);
    // Reflow forçado entre tirar e repor a classe: sem ele o navegador junta
    // as duas mudanças no mesmo quadro e a animação não reinicia.
    if (el) void el.offsetWidth;
    setAnimando(true);
    const t = setTimeout(() => setAnimando(false), duracaoCss("--digit-dur", 500) + duracaoCss("--digit-stagger", 70) * 2);
    return () => clearTimeout(t);
  }, [valor]);

  const digitos = String(valor).split("");
  return (
    <span ref={ref} className={`t-digit-group mt-num ${animando ? "is-animating" : ""} ${className}`.trim()}>
      {digitos.map((d, i) => (
        <span key={`${i}-${d}`} className="t-digit" data-stagger={Math.min(2, digitos.length - 1 - i)}>{d}</span>
      ))}
    </span>
  );
}

// ── 6. Carrossel 3D ──────────────────────────────────────────────────────────

export type ModoCarrossel = "esteira" | "capa" | "maquina";

/**
 * A conta do palco. Vive aqui e não no CSS porque `abs()` só chegou ao Chrome
 * em 2025 e o browserslist deste repositório vai até o Chrome 51 (o WebView do
 * tablet do galpão).
 *
 * `d` é a distância com sinal até o slide ativo (`i - ativo`).
 */
export function transformarSlide(modo: ModoCarrossel, d: number, passo: number): CSSProperties {
  const ad = Math.abs(d);
  if (modo === "capa") {
    // Cover flow: os vizinhos giram pra dentro e afundam. O ativo vem à frente.
    return {
      transform:
        `translateX(${(d * passo * 0.42).toFixed(1)}px) translateZ(${d === 0 ? 60 : -ad * 62}px) ` +
        `rotateY(${d === 0 ? 0 : d < 0 ? 40 : -40}deg) scale(${(d === 0 ? 1.06 : 1 - ad * 0.07).toFixed(3)})`,
      opacity: ad > 2 ? 0 : 1 - ad * 0.24,
      zIndex: 100 - ad,
      pointerEvents: ad > 2 ? "none" : undefined,
    };
  }
  if (modo === "maquina") {
    // Máquina do tempo: o que já passou vem PARA CIMA do observador e some; o
    // que ainda vem se empilha ao fundo. É a leitura certa pra histórico.
    const passado = d < 0;
    return {
      transform: passado
        ? "translateZ(200px) translateY(300px) rotateX(-20deg) scale(1.3)"
        : `translateZ(${-d * 62}px) translateY(${-d * 13}px) rotateX(${(d * 2).toFixed(1)}deg)`,
      opacity: passado ? 0 : Math.max(0, 1 - ad * 0.2),
      zIndex: 100 - d,
      pointerEvents: passado || ad > 3 ? "none" : undefined,
    };
  }
  // Esteira: fila plana com os vizinhos menores e caindo em diagonal.
  return {
    transform:
      `translateX(${(d * passo).toFixed(1)}px) translateY(${(ad * 10).toFixed(1)}px) ` +
      `rotate(${(d * 4).toFixed(1)}deg) scale(${d === 0 ? 1 : 0.82})`,
    opacity: ad > 2 ? 0 : 1 - ad * 0.22,
    zIndex: 100 - ad,
    pointerEvents: ad > 2 ? "none" : undefined,
  };
}

export type ItemCarrossel = { chave: string; legenda?: string; conteudo: ReactNode };

/**
 * Palco 3D com setas, pontos, teclado e arrasto.
 *
 * Três decisões que não são estéticas:
 *
 * · **Passo em px, medido.** O passo entre slides sai da largura real do
 *   palco, não de um número fixo — um palco de 320px e um de 900px precisam de
 *   afastamentos diferentes, e um valor fixo faz o carrossel estourar num e
 *   sumir no outro.
 * · **`aria-hidden` no que não está ativo.** Sem isso o leitor de tela lê os
 *   cinco slides seguidos como se fossem texto corrido da página.
 * · **Arrasto some a transição.** Enquanto o dedo está na tela o slide segue o
 *   dedo; a curva só volta ao soltar. É a diferença entre "eu estou movendo
 *   isto" e "eu pedi e ele foi".
 */
export function Carrossel({
  itens, modo = "capa", inicial = 0, altura = 200, laco = false,
  aoTrocar, rotulo = "Carrossel", className = "", style,
}: {
  itens: ItemCarrossel[];
  modo?: ModoCarrossel;
  inicial?: number;
  /** Altura do palco em px. Vira `min()` com a viewport no celular. */
  altura?: number;
  /** Da última volta pra primeira. Desligado por padrão: numa lista com fim
   *  (um histórico), voltar ao começo sem aviso confunde. */
  laco?: boolean;
  aoTrocar?: (i: number) => void;
  rotulo?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const n = itens.length;
  const [ativo, setAtivo] = useState(() => Math.min(Math.max(0, inicial), Math.max(0, n - 1)));
  const palco = useRef<HTMLDivElement | null>(null);
  const [passo, setPasso] = useState(120);
  const idLegenda = useId();

  // Passo medido: 42% da largura do palco dá três slides visíveis num cartão
  // estreito e cinco num largo, sem nenhum ponto de quebra escrito à mão.
  useEffect(() => {
    const el = palco.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setPasso(Math.max(64, Math.round(el.clientWidth * 0.42)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ir = useCallback((alvo: number) => {
    setAtivo((atual) => {
      const proximo = laco ? ((alvo % n) + n) % n : Math.min(n - 1, Math.max(0, alvo));
      if (proximo !== atual) aoTrocar?.(proximo);
      return proximo;
    });
  }, [n, laco, aoTrocar]);

  // ── Arrasto ────────────────────────────────────────────────────────────────
  const gesto = useRef<{ x0: number; ativo0: number; id: number } | null>(null);
  const historico = useRef(rastro());

  const comecar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (n < 2) return;
    gesto.current = { x0: e.clientX, ativo0: ativo, id: e.pointerId };
    historico.current.zera();
    historico.current.anota(e.clientX, e.timeStamp);
    palco.current?.setAttribute("data-mt-arrastando", "1");
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const arrastar = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    historico.current.anota(e.clientX, e.timeStamp);
    const passos = Math.round((g.x0 - e.clientX) / passo);
    const alvo = laco ? g.ativo0 + passos : Math.min(n - 1, Math.max(0, g.ativo0 + passos));
    if (alvo !== ativo) ir(alvo);
  };
  const soltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    gesto.current = null;
    palco.current?.removeAttribute("data-mt-arrastando");
    // Onde o dedo PARARIA se soltasse agora — a mesma projeção de momento das
    // folhas. Sem ela um deslize rápido e curto não vira troca de slide, e o
    // carrossel parece que "não pegou" o gesto.
    const v = historico.current.velocidade();
    const extra = Math.round(projetar(-v) / passo);
    if (extra) ir(ativo + Math.max(-2, Math.min(2, extra)));
    historico.current.zera();
  };

  const teclado = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); ir(ativo - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); ir(ativo + 1); }
    else if (e.key === "Home") { e.preventDefault(); ir(0); }
    else if (e.key === "End") { e.preventDefault(); ir(n - 1); }
  };

  if (!n) return null;
  const legenda = itens[ativo]?.legenda;

  return (
    <div className={className ? `mt-carrossel ${className}` : "mt-carrossel"} style={style}
      role="group" aria-roledescription="carrossel" aria-label={rotulo}>
      <div
        ref={palco}
        className="mt-palco"
        style={{ height: `min(${altura}px, 52dvh)` }}
        tabIndex={0}
        onKeyDown={teclado}
        onPointerDown={comecar}
        onPointerMove={arrastar}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        {itens.map((it, i) => {
          const d = laco
            // Com laço a distância é a MENOR das duas voltas, senão o slide
            // atravessa o palco inteiro ao passar do último para o primeiro.
            ? ((i - ativo + n + Math.floor(n / 2)) % n) - Math.floor(n / 2)
            : i - ativo;
          return (
            <div
              key={it.chave}
              className="mt-slide"
              style={transformarSlide(modo, d, passo)}
              aria-hidden={d !== 0}
              onClick={d !== 0 ? () => ir(i) : undefined}
            >
              {it.conteudo}
            </div>
          );
        })}
      </div>

      {legenda !== undefined && (
        <div className="mt-legenda" id={idLegenda} aria-live="polite">{legenda}</div>
      )}

      {n > 1 && (
        <div className="mt-cmd">
          <button type="button" className="mt-cmd-btn" onClick={() => ir(ativo - 1)}
            disabled={!laco && ativo === 0} aria-label="Anterior">
            <Icon name="chevron-left" size={16} />
          </button>
          <div className="mt-pontos">
            {itens.map((it, i) => (
              <button
                key={it.chave}
                type="button"
                className="mt-ponto"
                data-mt={i === ativo ? "on" : undefined}
                aria-label={`Ir para ${it.legenda || `item ${i + 1}`}`}
                aria-current={i === ativo ? "true" : undefined}
                onClick={() => ir(i)}
              />
            ))}
          </div>
          <button type="button" className="mt-cmd-btn" onClick={() => ir(ativo + 1)}
            disabled={!laco && ativo === n - 1} aria-label="Próximo">
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── 7. Pilha (baralho em leque) ──────────────────────────────────────────────

export type ModoPilha = "leque" | "cascata" | "linear";

/**
 * Baralho fechado que se abre. Os DOIS transforms (fechado e aberto) são
 * calculados aqui e entregues como variável; o CSS só faz a transição entre
 * eles.
 *
 * No computador abre no ponteiro; no dedo abre no TOQUE — um leque que só
 * existe no hover simplesmente não existe no celular, que é a regra da
 * fundação.
 */
export function Pilha({
  itens, modo = "leque", angulo = 30, vao = 68, arco = 10, className = "", style, rotulo,
}: {
  itens: { chave: string; conteudo: ReactNode }[];
  modo?: ModoPilha;
  /** Abertura total em graus (só no modo leque). */
  angulo?: number;
  /** Afastamento lateral máximo em px. */
  vao?: number;
  /** Altura do arco em px. */
  arco?: number;
  className?: string;
  style?: CSSProperties;
  rotulo?: string;
}) {
  const [aberta, setAberta] = useState(false);
  const n = itens.length;
  const centro = (n - 1) / 2;

  return (
    <div
      className={className ? `mt-pilha ${className}` : "mt-pilha"}
      data-mt={aberta ? "on" : undefined}
      style={style}
      role={rotulo ? "group" : undefined}
      aria-label={rotulo}
      onPointerEnter={(e) => { if (e.pointerType !== "touch") setAberta(true); }}
      onPointerLeave={() => setAberta(false)}
      onClick={() => setAberta((v) => !v)}
    >
      {itens.map((it, i) => {
        const dist = i - centro;
        // Fração de -1 a 1. Trabalhar em fração faz o mesmo código servir a um
        // baralho de 3 e a um de 9 sem reescrever ângulo nenhum.
        const u = centro === 0 ? 0 : dist / centro;
        let t1: string;
        if (modo === "leque") {
          // A parábola põe as pontas embaixo e o meio em cima — é o que faz um
          // leque parecer segurado por uma mão em vez de recortado.
          const y = arco * (2 * u * u - 1);
          t1 = `translate(${(u * vao).toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(u * (angulo / 2)).toFixed(1)}deg) scale(${dist === 0 ? 1.04 : 1})`;
        } else if (modo === "cascata") {
          t1 = `translate(${(i * (vao / n)).toFixed(1)}px, ${(i * 9).toFixed(1)}px) scale(${(1 - i * 0.02).toFixed(3)})`;
        } else {
          t1 = `translateX(${(u * vao).toFixed(1)}px)`;
        }
        return (
          <div
            key={it.chave}
            className="mt-pilha-item"
            style={{
              zIndex: n - Math.round(Math.abs(dist)),
              // Fechado: o baralho empilhado, com um fio de desalinho pra
              // mostrar que há mais de uma carta ali embaixo.
              ["--mt-t0" as string]: `translate(${(u * 2).toFixed(1)}px, 0px) rotate(${(u * 1.4).toFixed(1)}deg)`,
              ["--mt-t1" as string]: t1,
            }}
          >
            {it.conteudo}
          </div>
        );
      })}
    </div>
  );
}

// ── 8. Faixa de encaixe ──────────────────────────────────────────────────────

/**
 * Carrossel HORIZONTAL de conteúdo real (KPI, cartão, atalho). O irmão plano
 * do palco 3D: quando o conteúdo é informação e não imagem, girar em 3D
 * atrapalha a leitura.
 *
 * Rola DENTRO do bloco, nunca na página — arrastar a página inteira de lado é
 * o defeito que a fundação chama de "rolagem horizontal acidental".
 */
export function Faixa({ larguraItem = "min(78%, 300px)", className = "", style, children, rotulo }: {
  /** Largura de cada item. `min()` porque a 320px um item de 300px estoura. */
  larguraItem?: string;
  className?: string; style?: CSSProperties; children: ReactNode; rotulo?: string;
}) {
  return (
    <div
      className={className ? `mt-faixa ${className}` : "mt-faixa"}
      style={{ ["--mt-item" as string]: larguraItem, ...style }}
      role={rotulo ? "group" : undefined}
      aria-label={rotulo}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

// ── 9. Onda no toque ─────────────────────────────────────────────────────────

/**
 * Confirmação de que o toque CHEGOU. Entre o dedo e a tela seguinte existem
 * uns 300ms em que nada acontece — sem isto a pessoa toca de novo, e no
 * "aprovar" isso é uma aprovação duplicada.
 *
 * A onda é um nó cru inserido e removido no fim da animação: como estado ela
 * causaria um render por toque em cada botão da lista.
 */
export function useOnda() {
  return useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (!el || menosMovimento()) return;
    const r = el.getBoundingClientRect();
    const onda = document.createElement("span");
    onda.className = "mt-onda";
    onda.style.left = `${e.clientX - r.left}px`;
    onda.style.top = `${e.clientY - r.top}px`;
    el.appendChild(onda);
    const sai = () => onda.remove();
    onda.addEventListener("animationend", sai, { once: true });
    // Rede de segurança: se a animação não rodar (aba escondida no meio do
    // toque), o nó ficaria pendurado pra sempre no botão.
    setTimeout(sai, 900);
  }, []);
}
