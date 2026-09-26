"use client";

// ─────────────────────────────────────────────────────────────────────────────
// KIT DE CONTROLES — a aparência dos botões, véus e painéis laterais mora aqui.
//
// O app tinha ~976 <button> escritos à mão, com 15 raios diferentes e um
// z-index inventado por modal. O resultado: duas telas vizinhas não pareciam
// do mesmo produto. Estes componentes só carregam comportamento e semântica —
// TODO o visual vem das classes `.ui-*` em `globals.css`. Se você precisar de
// uma variante nova, ela nasce lá, não num `style={{}}` da tela.
//
// Regra prática: `<button style={{...}}>` em código novo é bug de padronização.
// ─────────────────────────────────────────────────────────────────────────────
import {
  forwardRef, useCallback, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { elastico, molar, projetar, rastro } from "./gestos";
import { duracaoCss, menosMovimento, TrocaTexto, useOnda, usePonteiro } from "./micro";
import { travarRolagem } from "./travaRolagem";

export type Variante = "primario" | "secundario" | "sutil" | "perigo";
export type Tamanho = "sm" | "md" | "lg";

/** Ciclo de vida de uma ação (Kinetics 072 Submit States + 063 Status Pill).
 *  `ok` desenha um check e tinge o botão de verde; `erro` sacode e tinge de
 *  vermelho. Quem volta pro `ocioso` é o `useAcao`, sozinho. */
export type EstadoBotao = "ocioso" | "carregando" | "ok" | "erro";

/** O buraco do ícone com as QUATRO faces empilhadas na mesma célula de grade:
 *  a troca é cruzada (sai encolhendo e desfocando, entra nítida) e a largura
 *  do botão não muda entre "Salvar", "salvando" e "salvo". O `spin` fica num
 *  nó DENTRO da face — a face já tem o `transform` da troca, e girar ali
 *  cancelaria a escala. O check é DESENHADO (traço que corre), não trocado. */
function IconeDeEstado({ icone, estado, size }: { icone?: string; estado: EstadoBotao; size: number }) {
  return (
    <span className="ui-btn-ico" data-estado={estado} aria-hidden>
      {icone && <span data-face="ocioso"><Icon name={icone} size={size} /></span>}
      {/* O giro só existe enquanto carrega: uma animação infinita escondida em
          cada botão com ícone da tela custaria quadro por nada. */}
      <span data-face="carregando"><span className={estado === "carregando" ? "spin" : undefined} style={{ display: "inline-flex" }}><Icon name="loader" size={size} /></span></span>
      <span data-face="ok"><Icon name="check" size={size} stroke={2.4} /></span>
      <span data-face="erro"><Icon name="alert-triangle" size={size} /></span>
    </span>
  );
}

/** Movimento extra do botão — nenhum deles é enfeite. `seta` diz "isto leva a
 *  outro lugar" sem gastar palavra, `lustro` e `brilho` marcam qual é o caminho
 *  comum de um bloco, e `ima` encurta a mira num alvo pequeno de ponteiro. */
export type Micro = "seta" | "brilho" | "lustro" | "ima";

/** Chama os dois: o do kit e o que a tela já passava. O botão passou a escutar
 *  o ponteiro por conta própria (onda do toque, ímã, brilho) e sem isto o
 *  `onPointerDown` de quem usa o componente seria substituído em silêncio —
 *  976 chamadas, e o defeito só apareceria numa tela por vez. */
function juntar<E>(meu?: (e: E) => void, dele?: (e: E) => void) {
  if (!meu) return dele;
  if (!dele) return meu;
  return (e: E) => { meu(e); dele(e); };
}

type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamanho?: Tamanho;
  /** Ocupa a linha inteira. */
  bloco?: boolean;
  /** Troca o conteúdo por um giro e desabilita — o clique duplo não passa. */
  carregando?: boolean;
  /** Estado da ação (ver `EstadoBotao`). Normalmente vem do `useAcao`:
   *  `<Botao estado={salvar.estado} onClick={salvar.rodar}>`. `carregando`
   *  continua valendo e vence. */
  estado?: EstadoBotao;
  /** Nome de ícone do Tabler (ver `Icon.tsx`), à esquerda do texto. */
  icone?: string;
  /** Movimento extra (ver `Micro`). Sem isto o botão continua respondendo pelo
   *  `:active` da fundação — o padrão é não ter nenhum. */
  micro?: Micro;
  /** Ícone do Tabler à DIREITA do texto. Com `micro="seta"` é ele que desliza
   *  pra fora quando o botão está prestes a ser usado. */
  iconeFim?: string;
  children?: ReactNode;
};

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    variante = "secundario", tamanho = "md", bloco, carregando, estado, icone, micro, iconeFim,
    children, disabled, className,
    onPointerDown, onPointerMove, onPointerLeave, onPointerCancel, onBlur,
    ...rest
  },
  ref,
) {
  const tamIcone = tamanho === "lg" ? 17 : tamanho === "sm" ? 14 : 15.5;
  const est: EstadoBotao = carregando ? "carregando" : (estado ?? "ocioso");
  const onda = useOnda();
  // `ima` e `brilho` são os dois que dependem de ONDE o ponteiro está: quem
  // escreve `--mt-dx`/`--mt-x` no nó é o hook, não o CSS. Sem ele o ímã fica
  // parado e o halo preso no centro — a classe estaria lá mentindo. `seta` e
  // `lustro` são CSS puro e não pagam nada disso.
  const segueOPonteiro = micro === "ima" || micro === "brilho";
  const ponteiro = usePonteiro<HTMLButtonElement>(micro === "ima" ? "ima" : "brilho");
  const doPonteiro = segueOPonteiro ? ponteiro.props : null;

  // Duas mãos no mesmo nó: a de quem chamou o botão e a do hook do ponteiro.
  const prender = useCallback((n: HTMLButtonElement | null) => {
    ponteiro.ref.current = n;
    if (typeof ref === "function") ref(n);
    else if (ref) ref.current = n;
  }, [ref, ponteiro.ref]);

  return (
    <button
      ref={prender}
      type="button"
      {...rest}
      onPointerDown={juntar<React.PointerEvent<HTMLButtonElement>>(onda, onPointerDown)}
      onPointerMove={juntar<React.PointerEvent<HTMLButtonElement>>(doPonteiro?.onPointerMove, onPointerMove)}
      onPointerLeave={juntar<React.PointerEvent<HTMLButtonElement>>(doPonteiro?.onPointerLeave, onPointerLeave)}
      onPointerCancel={juntar<React.PointerEvent<HTMLButtonElement>>(doPonteiro?.onPointerCancel, onPointerCancel)}
      onBlur={juntar<React.FocusEvent<HTMLButtonElement>>(doPonteiro?.onBlur, onBlur)}
      disabled={disabled || est === "carregando"}
      aria-busy={est === "carregando" || undefined}
      data-v={variante}
      data-t={tamanho}
      data-estado={est === "ocioso" ? undefined : est}
      data-bloco={bloco ? "1" : undefined}
      className={["ui-btn", "mt-anel", micro && `mt-${micro}`, className].filter(Boolean).join(" ")}
    >
      {/* O ícone não é mais TROCADO pelo giro: os dois ocupam a mesma célula e
          um cruza com o outro. Trocando o nó, um botão de largura automática
          pulava de tamanho no instante em que "salvar" virava "salvando" e a
          fileira toda dava um solavanco.
          O `spin` fica no INVÓLUCRO, não no loader: as duas faces da troca já
          têm o `transform` da receita, e uma animação de rotação ali dentro
          cancelaria a escala da entrada. Girando por fora, quem gira é só o
          que está visível — que durante o carregamento é o loader. */}
      {(icone || est !== "ocioso") && <IconeDeEstado icone={icone} estado={est} size={tamIcone} />}
      {children}
      {iconeFim && <span data-mt-seta><Icon name={iconeFim} size={tamIcone} /></span>}
    </button>
  );
});

/** Botão só de ícone. `titulo` vira tooltip E rótulo acessível — sem ele o
 *  leitor de tela anuncia "botão" e nada mais. */
export const BotaoIcone = forwardRef<HTMLButtonElement, Omit<BotaoProps, "icone" | "children" | "micro" | "iconeFim"> & { icone: string; titulo: string }>(
  // `carregando` estava no tipo mas não era consumido: ia parar no `...rest` e
  // o React tentava escrever `carregando="false"` como atributo do <button>.
  // O botão ficava clicável durante a ação e o console avisava a cada render.
  function BotaoIcone({ icone, titulo, variante = "sutil", tamanho = "md", carregando, estado, disabled, className, onPointerDown, ...rest }, ref) {
    const tam = tamanho === "lg" ? 18 : tamanho === "sm" ? 15 : 16.5;
    const est: EstadoBotao = carregando ? "carregando" : (estado ?? "ocioso");
    const onda = useOnda();
    return (
      <button
        ref={ref}
        type="button"
        title={titulo}
        aria-label={titulo}
        {...rest}
        onPointerDown={juntar<React.PointerEvent<HTMLButtonElement>>(onda, onPointerDown)}
        disabled={disabled || est === "carregando"}
        aria-busy={est === "carregando" || undefined}
        data-v={variante}
        data-t={tamanho}
        data-estado={est === "ocioso" ? undefined : est}
        data-ico="1"
        className={["ui-btn", "mt-anel", className].filter(Boolean).join(" ")}
      >
        {/* Mesma troca do `Botao` — aqui ela vale ainda mais: num botão quadrado
            o ícone é o botão inteiro, e ele sumir de estalo pra virar giro é a
            diferença entre "está pensando" e "quebrou". */}
        <IconeDeEstado icone={icone} estado={est} size={tam} />
      </button>
    );
  },
);

/** Rodapé de ações. No computador é uma linha (cancelar à esquerda do
 *  confirmar, ordem de leitura). No celular vira coluna e o `column-reverse`
 *  do CSS INVERTE a pilha: o confirmar sobe e o cancelar fica por último, colado
 *  na borda de baixo — a mesma ordem das folhas do iOS. Vale a inversão porque
 *  o botão mais perto do polegar é o mais fácil de tocar sem querer, e esse não
 *  pode ser o que confirma.
 *
 *  Ou seja: a ordem no JSX é sempre a de leitura (cancelar antes, confirmar
 *  depois) e o CSS resolve o resto — não troque a ordem dos filhos pra "ajeitar"
 *  o celular, isso quebra o desktop e a ordem do leitor de tela. */
export function Acoes({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div className="ui-acoes" style={style}>{children}</div>;
}

/** Empurra o que vem depois para a direita (some no celular). */
export function Esp() { return <span className="ui-esp" />; }

/** Interruptor liga/desliga — o ÚNICO do app. Havia seis escritos à mão, cada
 *  um com tamanho, curva e cor próprios (e dois pulando de lado sem animar).
 *  Movimento: receita `t-toggle` do transitions.dev (a bolinha passa do ponto e
 *  volta) + o "aperto" do Kinetics/iOS: a bolinha estica enquanto o dedo está
 *  em cima, retorno antes de soltar. Visual todo em `.ui-chave` no globals.css.
 *
 *  `is-init` só entra no primeiro toque: sem ele cada interruptor da tela
 *  tocaria o quique de volta ao montar. `indefinido` = estado ainda não sabido
 *  (campanha sem status); `pendente` = aplicando, gira e ignora cliques. */
export function Interruptor({
  ligado, onChange, rotulo, dica, titulo, desativado, pendente, indefinido, cor, tamanho = "md", pararPropagacao,
}: {
  ligado: boolean;
  onChange: (v: boolean) => void;
  /** Texto ao lado. Sem ele a linha de 44px some e o alvo vem do halo `.ui-toque`. */
  rotulo?: ReactNode;
  dica?: ReactNode;
  /** Nome acessível quando não há `rotulo` visível. */
  titulo?: string;
  desativado?: boolean;
  pendente?: boolean;
  indefinido?: boolean;
  /** Cor do trilho ligado (padrão: `--ok`). */
  cor?: string;
  tamanho?: "sm" | "md";
  /** Interruptor dentro de linha clicável (tabela de campanhas). */
  pararPropagacao?: boolean;
}) {
  const [iniciado, setIniciado] = useState(false);
  const botao = (
    <button
      type="button" role="switch" aria-checked={!indefinido && ligado} aria-busy={pendente || undefined}
      aria-label={rotulo ? undefined : titulo} title={titulo} disabled={desativado}
      className={`t-toggle ui-chave${iniciado ? " is-init" : ""}${rotulo ? "" : " ui-toque"}`}
      data-on={String(!indefinido && ligado)} data-t={tamanho}
      data-indef={indefinido ? "1" : undefined} data-pend={pendente ? "1" : undefined}
      style={cor ? ({ "--chave-cor": cor } as React.CSSProperties) : undefined}
      onClick={(e) => {
        if (pararPropagacao) e.stopPropagation();
        if (pendente) return;
        setIniciado(true);
        onChange(!ligado);
      }}
    >
      <span className="t-toggle-thumb ui-chave-bola" aria-hidden>
        {pendente && <span className="spin ui-chave-giro" />}
      </span>
    </button>
  );
  if (!rotulo) return botao;
  return (
    <label className="ui-chave-linha" data-off={desativado ? "1" : undefined}>
      {botao}
      <span className="ui-chave-texto">
        <span>{rotulo}</span>
        {dica ? <span className="ui-chave-dica">{dica}</span> : null}
      </span>
    </label>
  );
}

/** Só o DESENHO do interruptor, pra quando o controle é o cartão inteiro (um
 *  `<button role="switch">` com título e explicação — alvo de toque generoso).
 *  Botão dentro de botão não existe, então o dono põe `className="ui-chave-dono"`
 *  e a semântica; isto aqui só pinta e anima. O quique entra na primeira
 *  MUDANÇA de valor, não ao montar. */
export function ChaveVisual({ ligado, cor }: { ligado: boolean; cor?: string }) {
  const [iniciado, setIniciado] = useState(false);
  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    setIniciado(true);
  }, [ligado]);
  return (
    <span aria-hidden className={`t-toggle ui-chave${iniciado ? " is-init" : ""}`} data-on={String(ligado)} data-t="md"
      style={cor ? ({ "--chave-cor": cor } as React.CSSProperties) : undefined}>
      <span className="t-toggle-thumb ui-chave-bola" />
    </span>
  );
}

/** Caixa de marcar do kit (Kinetics 060 Checkbox Draw, sobre a receita
 *  `t-check` já instalada): a caixa preenche e o traço do check se DESENHA;
 *  desmarcar desfaz rápido e sem cerimônia. `<button role="checkbox">` pelo
 *  mesmo motivo do `Interruptor`: o `<input>` nativo não anima o traço.
 *  Com `rotulo` a linha inteira (44px) é o alvo; sem ele o halo `.ui-toque`
 *  dá os 44px no dedo. */
export function Caixa({
  marcado, onChange, rotulo, dica, titulo, desativado, pararPropagacao, riscar, parcial,
}: {
  marcado: boolean;
  /** "Alguns, não todos" (marcar tudo de uma lista meio marcada): a caixa
   *  preenche e o traço vira um travessão, em vez de mentir um check. */
  parcial?: boolean;
  onChange: (v: boolean) => void;
  rotulo?: ReactNode;
  dica?: ReactNode;
  /** Marcado risca o rótulo — só onde marcar significa CONCLUÍDO (tarefa,
   *  item de lista). Num filtro ou numa preferência, riscar mentiria. */
  riscar?: boolean;
  /** Nome acessível quando não há `rotulo` visível. */
  titulo?: string;
  desativado?: boolean;
  pararPropagacao?: boolean;
}) {
  const caixa = (
    <button
      type="button" role="checkbox" aria-checked={parcial && !marcado ? "mixed" : marcado}
      aria-label={rotulo ? undefined : titulo} title={titulo} disabled={desativado}
      className={`t-check ui-caixa${rotulo ? "" : " ui-toque"}`}
      data-parcial={parcial && !marcado ? "1" : undefined}
      onClick={(e) => { if (pararPropagacao) e.stopPropagation(); onChange(!marcado); }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={parcial && !marcado ? "M6 12h12" : "M5 12l5 5l10 -10"} />
      </svg>
    </button>
  );
  if (!rotulo) return caixa;
  return (
    <label className="ui-chave-linha" data-off={desativado ? "1" : undefined}
      data-risca={riscar ? (marcado ? "1" : "0") : undefined}>
      {caixa}
      <span className="ui-chave-texto">
        <span>{rotulo}</span>
        {dica ? <span className="ui-chave-dica">{dica}</span> : null}
      </span>
    </label>
  );
}

/** Chip de filtro (Kinetics 018 Choice Chips + 027 Toggle Pills). Ligado,
 *  preenche na cor de destaque, ganha um check (sinal que não depende de cor)
 *  e dá um pop curto de mola — só na PRIMEIRA mudança em diante, nunca ao
 *  montar. Desligar não pula: sair não é cerimônia. */
export function Chip({
  ativo, onClick, icone, conta, children, titulo, desativado,
}: {
  ativo: boolean;
  onClick: () => void;
  /** Ícone do Tabler à esquerda (some quando o check entra). */
  icone?: string;
  /** Contagem à direita — satura em "99+". */
  conta?: number;
  children: ReactNode;
  titulo?: string;
  desativado?: boolean;
}) {
  const [tocado, setTocado] = useState(false);
  return (
    <button
      type="button" className="ui-chip" aria-pressed={ativo} title={titulo} disabled={desativado}
      data-tocado={tocado ? "1" : undefined} data-marca={icone ? "1" : undefined}
      onClick={() => { setTocado(true); onClick(); }}
    >
      <span className="ui-chip-marca" aria-hidden>
        <span>{icone && !ativo ? <Icon name={icone} size={14} /> : <Icon name="check" size={14} stroke={2.6} />}</span>
      </span>
      <span>{children}</span>
      {conta != null && <span className="ui-chip-conta mt-num">{conta > 99 ? "99+" : conta}</span>}
    </button>
  );
}

/** Fileira de chips de seleção MÚLTIPLA. Não cabe? Rola de lado (`.tab-strip`).
 *  Seleção ÚNICA não é chip: é `Abas` (a pílula que viaja). */
export function Chips<T extends string>({
  opcoes, valor, onMuda, rotulo, className,
}: {
  opcoes: { valor: T; rotulo: ReactNode; icone?: string; conta?: number }[];
  valor: T[];
  onMuda: (v: T[]) => void;
  /** Nome do grupo pro leitor de tela ("Filtrar por canal"). */
  rotulo: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className={"ui-chips tab-strip" + (className ? " " + className : "")}>
      {opcoes.map((o) => {
        const ativo = valor.includes(o.valor);
        return (
          <Chip key={o.valor} ativo={ativo} icone={o.icone} conta={o.conta}
            onClick={() => onMuda(ativo ? valor.filter((v) => v !== o.valor) : [...valor, o.valor])}>
            {o.rotulo}
          </Chip>
        );
      })}
    </div>
  );
}

/**
 * Amarra uma ação assíncrona ao `estado` do botão (Kinetics 072/063):
 * `ocioso → carregando → ok|erro → ocioso`. O clique duplo não passa (a
 * segunda chamada durante `carregando` é ignorada), e o retorno ao ocioso é
 * por relógio próprio, desmontagem-segura.
 *
 *   const salvar = useAcao(async () => { ...; return ok; });
 *   <Botao variante="primario" estado={salvar.estado} onClick={() => salvar.rodar()}>Salvar</Botao>
 *
 * `fn` que devolve `false` ou lança vira `erro` (o botão sacode — Kinetics
 * 103). O erro lançado vai pro `aoErrar` (ex.: `toast.erro`) e NÃO é
 * relançado: um `onClick` que rejeita vira "unhandled rejection" no console.
 */
export function useAcao<A extends unknown[], R>(
  fn: (...args: A) => R | Promise<R>,
  { okMs = 1400, erroMs = 1600, aoErrar }: { okMs?: number; erroMs?: number; aoErrar?: (e: unknown) => void } = {},
) {
  const [estado, setEstado] = useState<EstadoBotao>("ocioso");
  const fnRef = useRef(fn);
  const aoErrarRef = useRef(aoErrar);
  useEffect(() => { fnRef.current = fn; aoErrarRef.current = aoErrar; });
  const vivo = useRef(true);
  const ocupado = useRef(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; clearTimeout(relogio.current); };
  }, []);

  const rodar = useCallback(async (...args: A): Promise<R | undefined> => {
    if (ocupado.current) return undefined;
    ocupado.current = true;
    clearTimeout(relogio.current);
    setEstado("carregando");
    let fim: EstadoBotao = "ok";
    let r: R | undefined;
    try {
      r = await fnRef.current(...args);
      if ((r as unknown) === false) fim = "erro";
    } catch (e) {
      fim = "erro";
      if (aoErrarRef.current) aoErrarRef.current(e); else console.error(e);
    } finally {
      ocupado.current = false;
    }
    if (!vivo.current) return r;
    setEstado(fim);
    relogio.current = setTimeout(() => { if (vivo.current) setEstado("ocioso"); }, fim === "ok" ? okMs : erroMs);
    return r;
  }, [okMs, erroMs]);

  return { estado, rodar, ocupado: estado === "carregando" };
}

/** Copiar pra área de transferência com confirmação que se desfaz sozinha
 *  (Kinetics 016). Tem reserva por `execCommand` — `navigator.clipboard` só
 *  existe em contexto seguro, e o WebView do tablet nem sempre é um. */
export function useCopiar(ms = 1400) {
  const [copiado, setCopiado] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(relogio.current), []);
  const copiar = useCallback(async (texto: string) => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texto); ok = true; }
    } catch { /* cai na reserva */ }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = texto;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch { ok = false; }
    }
    if (ok) {
      setCopiado(true);
      clearTimeout(relogio.current);
      relogio.current = setTimeout(() => setCopiado(false), ms);
    }
    return ok;
  }, [ms]);
  return { copiado, copiar };
}

/** Botão de copiar (Kinetics 016 Copy Button): o ícone cruza pra um check
 *  desenhado, o rótulo troca no mesmo lugar (largura estável) e o botão tinge
 *  de verde; tudo volta sozinho em 1,4s. `soIcone` vira `BotaoIcone`. */
export function BotaoCopiar({
  texto, rotulo = "Copiar", rotuloOk = "Copiado", soIcone, tamanho = "sm", variante = "sutil", pararPropagacao,
}: {
  texto: string;
  rotulo?: string;
  rotuloOk?: string;
  soIcone?: boolean;
  tamanho?: Tamanho;
  variante?: Variante;
  pararPropagacao?: boolean;
}) {
  const { copiado, copiar } = useCopiar();
  const aoClicar = (e: React.MouseEvent) => { if (pararPropagacao) e.stopPropagation(); void copiar(texto); };
  if (soIcone) {
    return <BotaoIcone icone="copy" titulo={copiado ? rotuloOk : rotulo} tamanho={tamanho} variante={variante}
      estado={copiado ? "ok" : "ocioso"} onClick={aoClicar} />;
  }
  return (
    <Botao icone="copy" tamanho={tamanho} variante={variante} estado={copiado ? "ok" : "ocioso"} onClick={aoClicar}>
      <TrocaTexto ligado={copiado} a={rotulo} b={rotuloOk} />
    </Botao>
  );
}

/** Campo de formulário: rótulo, controle e dica com o MESMO espaçamento em
 *  toda tela. Antes cada formulário repetia um `<div><label style=…>` próprio e
 *  o rótulo saía com 11, 12 ou 12.5px dependendo de quem escreveu.
 *
 *  O rótulo é um `<label>` de verdade amarrado pelo `htmlFor` — clicar nele
 *  foca o campo, e o leitor de tela anuncia o nome junto com o valor. Só
 *  funciona se o controle receber o `id`, então o `Campo` entrega o id via
 *  render-prop quando o filho não é um input simples (`GlassSelect`, por ex.). */
export function Campo({ label, dica, erro, sinal, largo, children }: {
  label: string;
  dica?: string;
  /** Mensagem de validação. Aparece no lugar da dica e tinge a borda. */
  erro?: string;
  /** Contador de TENTATIVA. Incremente a cada submit para o campo tremer de
   *  novo mesmo quando a mensagem de erro é idêntica à anterior — sem isto, a
   *  segunda tentativa com o mesmo campo inválido não muda nada na tela. */
  sinal?: number;
  /** Ocupa a linha inteira da grade. */
  largo?: boolean;
  children: ReactNode | ((id: string) => ReactNode);
}) {
  const id = useId();
  const comId = typeof children === "function";

  // ── Tremor de recusa (receita `error-state-shake`) ────────────────────────
  // Dispara quando o erro APARECE e quando ele MUDA de texto.
  //
  // Só isso NÃO cobre o caso mais comum de formulário: a pessoa clica em
  // "Salvar", erra, clica de novo sem corrigir — a mensagem é a MESMA string, o
  // React não vê mudança nenhuma e a tela fica idêntica. Sem sinal novo, não há
  // como saber se o clique chegou, e o passo seguinte é clicar mais uma vez.
  //
  // Para esse caso existe o `sinal`: um contador que o formulário incrementa a
  // cada tentativa. Ele entra nas dependências, então o mesmo texto de erro
  // volta a tremer. Fica opcional porque a maioria dos campos valida enquanto se
  // digita — ali a mensagem muda sozinha e o `erro` já basta.
  const campo = useRef<HTMLDivElement | null>(null);
  const erroAnterior = useRef<string | undefined>(undefined);
  const sinalAnterior = useRef<number | undefined>(sinal);
  useEffect(() => {
    const anterior = erroAnterior.current;
    const sinalAntes = sinalAnterior.current;
    erroAnterior.current = erro;
    sinalAnterior.current = sinal;
    const el = campo.current;
    if (!el || !erro) return;
    // Nada mudou de verdade (um re-render por outro motivo) → não sacode.
    if (erro === anterior && sinal === sinalAntes) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Tirar → refluxo → repor. Sem o `offsetWidth` no meio, o navegador junta as
    // duas mudanças no mesmo quadro e a animação não reinicia — é o que faz a
    // SEGUNDA tentativa parecer que não aconteceu.
    el.classList.remove("is-shaking");
    void el.offsetWidth;
    el.classList.add("is-shaking");
    const t = setTimeout(() => el.classList.remove("is-shaking"), 400);
    return () => clearTimeout(t);
  }, [erro, sinal]);

  return (
    <div ref={campo} className="ui-campo" data-largo={largo ? "1" : undefined} data-erro={erro ? "1" : undefined}>
      {/* `htmlFor` SÓ quando o controle de fato recebe o id (render-prop). Um
          `for` apontando pra um id que não existe é pior que rótulo nenhum: o
          leitor de tela anuncia o texto e não acha o campo, e o clique no
          rótulo não foca nada. Sem o id, vira texto simples e honesto. */}
      {comId
        ? <label className="ui-campo-rot" htmlFor={id}>{label}</label>
        : <div className="ui-campo-rot">{label}</div>}
      {comId ? (children as (id: string) => ReactNode)(id) : children}
      {erro
        ? <p className="ui-campo-dica" data-erro="1" role="alert">{erro}</p>
        : dica ? <p className="ui-campo-dica">{dica}</p> : null}
    </div>
  );
}

/** Grade de campos: uma coluna no celular, quantas couberem no computador. */
export function Campos({ children, min = 220 }: { children: ReactNode; min?: number }) {
  return (
    <div className="ui-campos" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }}>
      {children}
    </div>
  );
}

// ── Painel lateral ───────────────────────────────────────────────────────────
// A física do arrasto mora em `ui/gestos.ts`, compartilhada com a gaveta de
// navegação do Shell — dois "arrastar pra fechar" com pesos diferentes seriam
// sentidos na hora.

// Pilha das camadas abertas (a última é a de cima). Serve pro Esc fechar SÓ a de
// cima: cada painel escuta o `keydown` no `document`, e `stopPropagation` não
// segura listener irmão do mesmo nó. Sem a pilha, um Esc com o painel de pagar
// horas aberto dentro da gaveta da pessoa fechava os dois de uma vez.
const PILHA: object[] = [];

/**
 * Tem painel aberto agora?
 *
 * Existe para a troca de empresa do Financeiro (§2 da especificação): trocar
 * com um formulário aberto recarrega a árvore no servidor e o que estava
 * digitado some sem aviso. Quem troca pergunta antes — e só quando há mesmo
 * um painel, senão a pergunta vira ruído em todo clique.
 */
export function painelAberto(): boolean {
  return PILHA.length > 0;
}

/** Tamanhos do Modal do HeroUI (max-w xs/sm/md/lg), `cover` (tela com margem)
 *  e `full` (tela inteira, sem raio). Só valem no modo centrado. */
export type TamanhoModal = "xs" | "sm" | "md" | "lg" | "cover" | "full";
export type TomModal = "neutro" | "info" | "destaque" | "ok" | "atencao" | "perigo";

export function PainelLateral({
  titulo, subtitulo, acoes, rodape, aberto = true, onFechar, largura, soFechaNoX = false,
  centrado = false, icone, tom = "neutro", tamanho, posicao = "centro", veu = "padrao", children,
}: {
  /** Ícone Tabler acima do título (o `Modal.Icon` do HeroUI). Só no centrado. */
  icone?: string;
  /** Cor do ícone — mesma paleta semântica do `<Alerta>`. */
  tom?: TomModal;
  /** Tamanho do HeroUI. `largura` (px) continua valendo e vence. */
  tamanho?: TamanhoModal;
  /** `topo` encosta perto do topo no computador; no celular é sempre a folha. */
  posicao?: "centro" | "topo";
  /** Véu: o da casa, `desfocado` (blur do HeroUI) ou `transparente`. */
  veu?: "padrao" | "desfocado" | "transparente";
  /**
   * Fecha SÓ no X (e no que você puser no rodapé): nem Esc, nem clique no véu,
   * nem arrasto. Para FORMULÁRIO — onde um gesto involuntário custa vinte
   * campos digitados. Painel de leitura continua com os três atalhos, porque
   * ali não há nada a perder. Pedido explícito do dono do Financeiro.
   */
  soFechaNoX?: boolean;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Botões no cabeçalho, à direita do título (antes do X). */
  acoes?: ReactNode;
  /** Barra fixa embaixo — normalmente um `<Acoes>`. Não rola com o conteúdo. */
  rodape?: ReactNode;
  aberto?: boolean;
  onFechar: () => void;
  /** Largura no computador. No celular é sempre a tela inteira. */
  largura?: number;
  /**
   * Abre no MEIO da tela em vez de encostado na direita.
   *
   * Formulário longo lido numa faixa de 460px na borda joga o olho para um
   * canto e deixa o resto da tela escuro e inútil. No celular não muda nada: a
   * folha presa embaixo continua sendo a resposta certa, porque numa tela de
   * 390px não há para onde centrar e o polegar precisa alcançar o rodapé.
   */
  centrado?: boolean;
  children: ReactNode;
}) {
  const idTitulo = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [saindo, setSaindo] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  // Fecha animando pro MESMO lado de onde entrou (o `data-saindo` roda o
  // keyframe ao contrário) e só então desmonta.
  //
  // A espera é LIDA do mesmo token que o CSS usa pra sair. Escrita à mão ela
  // ficou em 340ms e a saída em 350: o painel era arrancado da tela a 3% do
  // fim, e o que a pessoa via era um estalo no último quadro.
  const fechar = useCallback(() => {
    if (saindo) return;
    setSaindo(true);
    const ms = matchMedia("(prefers-reduced-motion: reduce)").matches ? 10 : duracaoCss("--duration-medium", 350);
    setTimeout(onFechar, ms);
  }, [saindo, onFechar]);

  // O `fechar` mais recente, guardado fora da lista de dependências.
  //
  // `onFechar` chega quase sempre como função inline (`onFechar={() =>
  // setRascunho(null)}`), então é uma função NOVA a cada render do pai — e
  // `fechar` muda junto. Um efeito que o liste nas dependências roda de novo a
  // cada tecla digitada dentro do painel. Ver o efeito de foco abaixo, onde
  // isso custou caro.
  const fecharRef = useRef(fechar);
  const soFechaNoXRef = useRef(soFechaNoX);
  useEffect(() => { soFechaNoXRef.current = soFechaNoX; }, [soFechaNoX]);
  useEffect(() => { fecharRef.current = fechar; }, [fechar]);

  // Trava da rolagem + lugar na pilha de camadas. Efeito PRÓPRIO, dependendo só
  // de `aberto`: junto com o resto (que depende de `fechar`, e `fechar` muda a
  // cada render do pai) a trava era solta e pedida de novo sem parar, e a camada
  // pularia pro topo da pilha a cada poll do painel de trás.
  const camada = useRef<object>({});
  useEffect(() => {
    if (!aberto) return;
    const eu = camada.current;
    PILHA.push(eu);
    const soltar = travarRolagem();
    return () => {
      const i = PILHA.lastIndexOf(eu);
      if (i >= 0) PILHA.splice(i, 1);
      soltar();
    };
  }, [aberto]);

  // Esc fecha, o foco volta pra quem abriu — e o Tab NÃO sai do painel. Sem essa
  // última parte o `aria-modal="true"` é mentira: o leitor de tela promete que só
  // existe o diálogo, mas o Tab caminha pra sidebar atrás do véu, onde a pessoa
  // não enxerga o cursor.
  useEffect(() => {
    if (!aberto) return;
    const antes = document.activeElement as HTMLElement | null;

    const focaveis = () => {
      const el = ref.current;
      if (!el) return [] as HTMLElement[];
      const todos = [...el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      // Pular o que está escondido (aba fechada, bloco recolhido) evita mandar o
      // foco pra um campo invisível. Mas `offsetParent` depende de LAYOUT: num
      // ambiente sem motor de layout ele é sempre `null` e o filtro zeraria a
      // lista — a armadilha viraria "Tab não faz nada", que é pior que não ter
      // armadilha. Se o filtro não sobrou ninguém, ele não é confiável aqui:
      // usa a lista crua.
      const visiveis = todos.filter((n) => n.offsetParent !== null || n === document.activeElement);
      return visiveis.length ? visiveis : todos;
    };

    const onTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Só a camada de cima responde. A de baixo continua aberta — é o que a
        // pessoa espera de "voltar um passo", e é o que evita desmontar dois
        // painéis no mesmo commit.
        if (PILHA[PILHA.length - 1] !== camada.current) return;
        // Formulário: o Esc é engolido, não repassado — senão fecharia a
        // camada de BAIXO, que seria pior ainda.
        if (soFechaNoXRef.current) { e.stopPropagation(); return; }
        e.stopPropagation(); fecharRef.current(); return;
      }
      if (e.key !== "Tab") return;
      const lista = focaveis();
      if (!lista.length) { e.preventDefault(); return; }
      const primeiro = lista[0], ultimo = lista[lista.length - 1];
      const atual = document.activeElement as HTMLElement | null;
      // Foco FORA do painel (ainda no <body> porque o foco inicial é agendado
      // num quadro, ou perdido porque o elemento focado sumiu): traz pra dentro
      // em vez de deixar seguir. Sem este ramo o primeiro Tab de quem é rápido
      // no teclado escapava pra página atrás do véu — e `aria-modal="true"`
      // vira mentira. Foi o teste de componente que pegou.
      if (!atual || !ref.current?.contains(atual)) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primeiro).focus();
        return;
      }
      // O foco no próprio <aside> (tabIndex -1) conta como "antes do primeiro".
      if (e.shiftKey && (atual === primeiro || atual === ref.current)) {
        e.preventDefault(); ultimo.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault(); primeiro.focus();
      }
    };
    document.addEventListener("keydown", onTecla);
    // O foco entra no diálogo um quadro depois de montar, para o leitor de tela
    // anunciar o painel — mas esse atraso é uma CORRIDA contra a pessoa. Quem
    // abre o painel e já clica no primeiro campo termina de digitar no
    // `<aside>`: o quadro chega atrasado e puxa o foco de volta pro invólucro.
    //
    // Duas guardas, e as duas são necessárias. A de dentro cobre o caso comum
    // (o foco já está no painel, então não há o que roubar); o `cancel` cobre o
    // painel que fecha antes de o quadro chegar, e é o que impede o foco de
    // saltar dentro da tela SEGUINTE.
    const quadro = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement)) return;
      el.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(quadro);
      document.removeEventListener("keydown", onTecla);
      antes?.focus?.({ preventScroll: true });
    };
    // SÓ `aberto`. Este efeito rouba o foco de propósito quando monta
    // (`requestAnimationFrame(… ref.current.focus())`, para o leitor de tela
    // entrar no diálogo) e o devolve na limpeza. Enquanto ele também dependia
    // de `fechar`, isso acontecia A CADA RENDER DO PAI — e como todo formulário
    // aqui é controlado, cada TECLA digitada re-renderizava o pai. O resultado
    // era o campo aceitar uma letra e perder o foco: a segunda tecla ia para o
    // <aside>, não para o input. `fechar` entra pelo ref acima, que é sempre o
    // mais recente sem entrar na lista de dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // ── Arrastar pra baixo fecha (celular) ──
  // O painel gruda no dedo 1:1 durante todo o gesto; no fim, para onde ele vai
  // é decidido pela projeção do momento, não pela posição em que soltou.
  const arrasto = useRef<{ y0: number; hist: ReturnType<typeof rastro>; alt: number } | null>(null);
  const cancelaMola = useRef<(() => void) | null>(null);

  const refVeu = useRef<HTMLDivElement>(null);

  // O véu clareia junto com o arrasto. Sem isto ele fica 100% opaco enquanto a
  // folha desce e some de estalo no fim — o fundo "pisca". Feedback contínuo
  // durante o gesto, não só no fim dele.
  const desenhar = (dy: number, alt?: number) => {
    const el = ref.current;
    if (el) el.style.transform = dy ? `translateY(${dy}px)` : "";
    const veu = refVeu.current;
    if (!veu) return;
    // `--veu` só é lido pela COR do véu; a `opacity` continua pertencendo à
    // animação de entrada/saída. Sem essa separação os dois disputam a mesma
    // propriedade — e animação vence inline, então o arrasto não movia nada.
    if (dy > 0) {
      const h = alt ?? arrasto.current?.alt ?? el?.offsetHeight ?? 1;
      veu.style.setProperty("--veu", String(Math.max(0, 1 - (dy / h) * 0.85)));
    } else {
      veu.style.removeProperty("--veu");
    }
  };

  function aoPegar(e: React.PointerEvent) {
    if (!ref.current) return;
    cancelaMola.current?.();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ref.current.dataset.arrastando = "1";
    const h = rastro();
    h.anota(e.clientY, e.timeStamp);
    arrasto.current = { y0: e.clientY, hist: h, alt: ref.current.offsetHeight };
  }

  function aoMover(e: React.PointerEvent) {
    const a = arrasto.current;
    if (!a) return;
    a.hist.anota(e.clientY, e.timeStamp);
    const bruto = e.clientY - a.y0;
    // Pra baixo segue o dedo; pra cima só resiste (não há pra onde ir).
    desenhar(bruto >= 0 ? bruto : -elastico(-bruto, a.alt), a.alt);
  }

  function aoSoltar(e: React.PointerEvent) {
    const a = arrasto.current;
    if (!a || !ref.current) return;
    arrasto.current = null;
    delete ref.current.dataset.arrastando;
    const atual = Math.max(0, e.clientY - a.y0);
    const vel = a.hist.velocidade(); // px/s, com teto e janela mínima
    // Onde o dedo pousaria. Passou de um terço da folha → fecha.
    const destino = atual + projetar(vel);
    // Formulário: o arrasto resiste e VOLTA, nunca fecha. A mola de retorno é a
    // mesma — é o que diz "responde, mas não há mais nada por aqui".
    if (destino > a.alt * 0.34 && !soFechaNoXRef.current) {
      // Continua na velocidade do dedo: sem costura entre arrastar e animar.
      cancelaMola.current = molar(atual, a.alt, vel, (y) => desenhar(y, a.alt));
      // O desmonte NÃO pende da mola terminar. `requestAnimationFrame` não roda
      // em aba de fundo (nem em alguns navegadores embutidos): pendurar o
      // `onFechar` no fim da mola deixaria o painel preso na tela com o
      // `overflow: hidden` do body — a página inteira travada. A mola é só o
      // visual; o relógio decide.
      setTimeout(() => { desenhar(0); onFechar(); }, 260);
    } else {
      cancelaMola.current = molar(atual, 0, vel, (y) => desenhar(y, a.alt));
      // Mesmo motivo: sem quadros, o painel ficaria parado onde o dedo largou.
      setTimeout(() => { if (!arrasto.current) desenhar(0, a.alt); }, 600);
    }
  }

  useEffect(() => () => cancelaMola.current?.(), []);

  if (!aberto || !montado) return null;

  return createPortal(
    <>
      <div ref={refVeu} className="ui-scrim" data-veu={veu === "padrao" ? undefined : veu} data-saindo={saindo ? "1" : undefined} onClick={soFechaNoX ? undefined : fechar} />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="ui-side"
        data-centrado={centrado ? "1" : undefined}
        data-tamanho={centrado && tamanho && !largura ? tamanho : undefined}
        data-posicao={centrado && posicao === "topo" ? "topo" : undefined}
        data-tom={centrado && icone ? tom : undefined}
        data-saindo={saindo ? "1" : undefined}
        // Centrado recebe a largura por VARIÁVEL, não por `width` inline: inline
        // venceria a media query e o pop-up não viraria folha no celular.
        style={largura ? (centrado ? ({ "--ui-side-larg": `${largura}px` } as React.CSSProperties) : { width: `min(${largura}px, 100vw)` }) : undefined}
      >
        <div className="ui-side-alca" onPointerDown={aoPegar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar} />
        <header className="ui-side-cab">
          <div className="ui-side-titulos">
            {centrado && icone && <span className="ui-side-icone" aria-hidden="true"><Icon name={icone} size={20} /></span>}
            <h2 id={idTitulo} className="ui-side-tit">{titulo}</h2>
            {subtitulo && <div className="ui-side-sub">{subtitulo}</div>}
          </div>
          {acoes}
          <BotaoIcone icone="x" titulo="Fechar" onClick={fechar} />
        </header>
        <div
          className="ui-side-corpo"
          onScroll={(e) => {
            const el = ref.current;
            if (el) el.dataset.rolado = e.currentTarget.scrollTop > 2 ? "1" : "0";
          }}
        >
          {children}
        </div>
        {rodape && <footer className="ui-side-pe">{rodape}</footer>}
      </aside>
    </>,
    document.body,
  );
}

// ── BotãoApagar (porte do `delete-button` do rare-ui) ────────────────────────
// Confirmar-no-lugar: o gatilho de lixeira abre DUAS ações (confirmar/cancelar)
// ali mesmo, sem modal e sem colar o destrutivo na lixeira. O original é
// Tailwind + `motion` + accent laranja cravado; aqui o visual é `.ui-apagar` no
// globals.css, o ícone é Tabler (`trash`→`check` pela receita t-icon-swap), a
// cor destrutiva é `var(--tf-neg)` e a folga da abertura sai da escala
// (`--duration-fast` pra abrir, `--duration-quick` pra fechar). `Escape`
// cancela, e um `aria-live` anuncia que foi feito. Trava: controles-apagar-otp.
export function BotaoApagar({
  aoConfirmar, aoCancelar, titulo = "Apagar",
  rotuloConfirmar = "Confirmar", rotuloCancelar = "Cancelar", tamanho = "md", className,
}: {
  aoConfirmar: () => void;
  aoCancelar?: () => void;
  titulo?: string;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  tamanho?: Tamanho;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [feito, setFeito] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(relogio.current), []);

  const fechar = (chamar?: () => void) => { setAberto(false); gatilho.current?.focus(); chamar?.(); };
  const confirmar = () => {
    setFeito(true);
    clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setFeito(false), 1400);
    fechar(aoConfirmar);
  };
  const cancelar = () => fechar(aoCancelar);

  return (
    <div
      className={["ui-apagar", className].filter(Boolean).join(" ")}
      data-t={tamanho}
      data-aberto={aberto ? "1" : undefined}
      onKeyDown={(e) => { if (e.key === "Escape" && aberto) { e.stopPropagation(); cancelar(); } }}
    >
      <button
        ref={gatilho}
        type="button"
        className="ui-apagar-gatilho"
        aria-label={titulo}
        aria-expanded={aberto}
        onClick={() => { if (aberto) { cancelar(); } else { setFeito(false); setAberto(true); } }}
      >
        <span className="t-icon-swap" data-state={feito ? "b" : "a"}>
          <span className="t-icon" data-icon="a"><Icon name="trash" size={18} /></span>
          <span className="t-icon" data-icon="b"><Icon name="check" size={18} color="var(--ok)" /></span>
        </span>
      </button>
      <div className="ui-apagar-acoes">
        <button type="button" className="ui-apagar-sim" aria-label={rotuloConfirmar} tabIndex={aberto ? 0 : -1} onClick={confirmar}>
          <Icon name="check" size={16} />
        </button>
        <button type="button" className="ui-apagar-nao" aria-label={rotuloCancelar} tabIndex={aberto ? 0 : -1} onClick={cancelar}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <span role="status" aria-live="polite" className="so-leitor">{feito ? `${titulo}: feito` : ""}</span>
    </div>
  );
}

// ── CampoOTP (porte do `otp-input` do rare-ui) ───────────────────────────────
// A lógica boa do original fica INTEIRA: colar/SMS-autofill (`one-time-code`),
// apagar no meio sem fechar o buraco, e clique que não pula o vão pra frente. O
// que sai é o Tailwind/`motion`/hex: as casas são `.ui-otp*` com tokens, o
// tremor de recusa reusa o `t-input-shake` (com `sinal` pra repetir a mesma
// recusa), e o acerto/erro vêm de `var(--ok)`/`var(--tf-neg)`. Sem overlay de
// caractere: `type="password"` já mascara e o texto visível dispensa a dança de
// alinhar dois nós. Trava: controles-apagar-otp.
const PADROES_OTP = {
  numeros: /^[0-9]$/,
  letras: /^[a-zA-Z]$/,
  ambos: /^[a-zA-Z0-9]$/,
} as const;
const paraSlotsOTP = (codigo: string, n: number) => Array.from({ length: n }, (_, i) => codigo[i] ?? "");

export type EstadoOTP = "ocioso" | "ok" | "erro";

export function CampoOTP({
  length = 6, valor, valorInicial = "", aoMudar, aoCompletar,
  tipo = "numeros", tamanho = "md", estado = "ocioso", mascara = false,
  desativado, autoFoco, sinal, className,
}: {
  length?: number;
  valor?: string;
  valorInicial?: string;
  aoMudar?: (v: string) => void;
  aoCompletar?: (v: string) => void;
  tipo?: keyof typeof PADROES_OTP;
  tamanho?: Tamanho;
  estado?: EstadoOTP;
  mascara?: boolean;
  desativado?: boolean;
  autoFoco?: boolean;
  /** Contador de TENTATIVA: incremente pra fazer a MESMA recusa tremer de novo. */
  sinal?: number;
  className?: string;
}) {
  const [interno, setInterno] = useState(() => paraSlotsOTP(valorInicial, length));
  const [foco, setFoco] = useState<number | null>(null);
  const entradas = useRef<(HTMLInputElement | null)[]>([]);
  // A casa que a pessoa escolheu de propósito, pra um código cheio só mudar por vontade.
  const editandoEm = useRef<number | null>(null);
  const fila = useRef<HTMLDivElement>(null);

  // Preenchida, não juntada: juntar fecharia o buraco de um apagar no meio.
  const slots = valor === undefined
    ? Array.from({ length }, (_, i) => interno[i] ?? "")
    : paraSlotsOTP(valor, length);
  const numerico = tipo === "numeros";

  const enviar = (prox: string[]) => {
    if (valor === undefined) setInterno(prox);
    const codigo = prox.join("");
    aoMudar?.(codigo);
    if (prox.every(Boolean)) aoCompletar?.(codigo);
  };
  const definir = (i: number, ch: string) => enviar(slots.map((s, k) => (k === i ? ch : s)));
  const focar = (i: number) => {
    const e = entradas.current[Math.min(Math.max(i, 0), length - 1)];
    e?.focus(); e?.select();
  };
  const preencher = (i: number, chars: string[]) => {
    const cabe = Math.min(chars.length, length - i);
    const prox = [...slots];
    chars.slice(0, cabe).forEach((c, k) => { prox[i + k] = c; });
    enviar(prox);
    editandoEm.current = null;
    focar(i + cabe);
  };
  const aoDigitar = (i: number, cru: string) => {
    const chars = cru.split("").filter((c) => PADROES_OTP[tipo].test(c));
    if (!chars.length) return;
    // Digitar numa casa cheia acrescenta — fica só o caractere novo.
    const um = chars.length === 1 ? chars[0]
      : chars.length === 2 && chars[0] === slots[i] ? chars[1] : null;
    if (um === null) { preencher(i, chars); return; } // colar ou autofill de SMS
    if (slots.every(Boolean) && editandoEm.current !== i) return;
    definir(i, um);
    editandoEm.current = null;
    focar(i + 1);
  };
  const aoTecla = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const acoes: Record<string, () => void> = {
      ArrowLeft: () => { editandoEm.current = Math.max(i - 1, 0); focar(i - 1); },
      ArrowRight: () => { editandoEm.current = Math.min(i + 1, length - 1); focar(i + 1); },
      Backspace: () => {
        if (slots[i]) definir(i, "");
        else if (i > 0) { definir(i - 1, ""); focar(i - 1); }
      },
    };
    const a = acoes[e.key];
    if (!a) return;
    e.preventDefault(); a();
  };
  const aoColar = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const colado = e.clipboardData.getData("text").split("").filter((c) => PADROES_OTP[tipo].test(c));
    if (colado.length) preencher(i, colado);
  };
  // Clicar depois do primeiro vão cai NO vão, pra o código ficar contíguo.
  const aoApontar = (i: number, e: React.PointerEvent<HTMLInputElement>) => {
    const primeiroVazio = slots.findIndex((s) => !s);
    const alvo = primeiroVazio === -1 ? i : Math.min(i, primeiroVazio);
    editandoEm.current = alvo;
    if (alvo === i) return;
    e.preventDefault(); focar(alvo);
  };

  // Tremor de recusa — mesmo padrão do `Campo` (remove → refluxo → repõe), e o
  // `sinal` deixa a MESMA recusa tremer de novo na tentativa seguinte.
  const estadoAntes = useRef<EstadoOTP>(estado);
  const sinalAntes = useRef<number | undefined>(sinal);
  useEffect(() => {
    const eraErro = estadoAntes.current === "erro";
    const sinalAnterior = sinalAntes.current;
    estadoAntes.current = estado;
    sinalAntes.current = sinal;
    const el = fila.current;
    if (!el || estado !== "erro") return;
    if (eraErro && sinal === sinalAnterior) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.remove("is-shaking");
    void el.offsetWidth;
    el.classList.add("is-shaking");
    const t = setTimeout(() => el.classList.remove("is-shaking"), 400);
    return () => clearTimeout(t);
  }, [estado, sinal]);

  return (
    <div className={["ui-otp", className].filter(Boolean).join(" ")} data-t={tamanho} data-estado={estado}>
      <div
        ref={fila}
        className="ui-otp-fila"
        onFocus={(e) => setFoco(entradas.current.indexOf(e.target as HTMLInputElement))}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFoco(null); }}
      >
        {slots.map((slot, i) => (
          <input
            key={i}
            ref={(el) => { entradas.current[i] = el; }}
            className="ui-otp-slot"
            data-cheio={slot ? "1" : undefined}
            data-foco={foco === i ? "1" : undefined}
            value={slot}
            onChange={(e) => aoDigitar(i, e.target.value)}
            onKeyDown={(e) => aoTecla(i, e)}
            onPaste={(e) => aoColar(i, e)}
            onPointerDown={(e) => aoApontar(i, e)}
            onFocus={(e) => e.target.select()}
            type={mascara ? "password" : "text"}
            inputMode={numerico ? "numeric" : "text"}
            autoCapitalize={numerico ? undefined : "characters"}
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={autoFoco && i === 0}
            disabled={desativado}
            aria-label={`${numerico ? "Dígito" : "Caractere"} ${i + 1} de ${length}`}
            aria-invalid={estado === "erro" || undefined}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Contador −/+ em volta de um número — o ÚNICO do app.
 *
 * Kinetics 017 na escala do `transitions.dev`: a cada mudança o número dá um
 * pulo curto de `scale(1.3)` que assenta na mola (`--ease-spring-up`), e o
 * botão pressionado afunda `scale(0.9)` no `:active` — o toque tem resposta
 * antes do valor chegar. Os dígitos são `tabular-nums`, senão o número dança
 * de largura a cada passo e o "+" muda de lugar debaixo do dedo.
 *
 * O valor é o VALOR FINAL, nunca um delta. `min` prende o piso (o "−" fica
 * desabilitado, não silencioso) e `max` o teto. O campo aceita texto vazio
 * enquanto a pessoa digita — só o que sai pelo `onValor` vem preso na faixa.
 */
export function Contador({
  valor, onValor, min = 0, max = Number.MAX_SAFE_INTEGER, passo = 1,
  rotulo, id, disabled, largura, className, style,
}: {
  valor: number;
  onValor: (n: number) => void;
  min?: number;
  max?: number;
  passo?: number;
  /** Rótulo acessível do campo (o `<label>` visível fica com quem chama). */
  rotulo: string;
  id?: string;
  disabled?: boolean;
  /** Largura do campo. Por padrão ele ocupa a sobra da linha. */
  largura?: number | string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const preso = useCallback((n: number) => Math.min(max, Math.max(min, Math.trunc(n) || 0)), [max, min]);
  const [texto, setTexto] = useState(String(valor));
  const campoRef = useRef<HTMLInputElement>(null);
  // O valor pode mudar por fora (reset do formulário, outro botão): o texto
  // acompanha, menos enquanto a pessoa está com o campo em foco digitando.
  useEffect(() => {
    if (document.activeElement === campoRef.current) return;
    setTexto(String(valor));
  }, [valor]);

  /** Tira → refluxo → repõe: sem o `offsetWidth` no meio o navegador junta as
   *  duas mudanças no mesmo quadro e o pulo não reinicia no passo seguinte. */
  function pular() {
    const el = campoRef.current;
    if (!el || menosMovimento()) return;
    el.classList.remove("ui-cont-pop");
    void el.offsetWidth;
    el.classList.add("ui-cont-pop");
  }

  function andar(d: number) {
    const n = preso(Number(texto) || 0) + d;
    const final = preso(n);
    setTexto(String(final));
    onValor(final);
    pular();
  }

  return (
    <div className={["ui-cont", className].filter(Boolean).join(" ")} style={style}>
      <BotaoIcone icone="minus" titulo={`Menos ${passo}`} disabled={disabled || preso(Number(texto) || 0) <= min}
        onClick={() => andar(-passo)} style={{ flex: "none" }} />
      <input
        ref={campoRef}
        id={id}
        className="ui-cont-campo"
        type="number"
        inputMode="numeric"
        min={min}
        max={max === Number.MAX_SAFE_INTEGER ? undefined : max}
        step={passo}
        disabled={disabled}
        aria-label={rotulo}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          // Campo vazio não vira 0 no ato: a pessoa está no meio de apagar pra
          // digitar outro número, e um 0 piscando no lugar assusta.
          if (e.target.value.trim() === "") return;
          onValor(preso(Number(e.target.value) || 0));
        }}
        onBlur={() => { const n = preso(Number(texto) || 0); setTexto(String(n)); onValor(n); }}
        style={largura === undefined ? undefined : { flex: "none", width: largura }}
      />
      <BotaoIcone icone="plus" titulo={`Mais ${passo}`} disabled={disabled || preso(Number(texto) || 0) >= max}
        onClick={() => andar(passo)} style={{ flex: "none" }} />
    </div>
  );
}
