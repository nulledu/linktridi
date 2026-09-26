"use client";

// Peças de micro-interação do TridiFlow (Configurações, Integrações, Dashboard).
// Moram no módulo porque a fundação (`ui/*`, `globals.css`) está sendo mexida
// em paralelo — o CSS é o `config-micro.css` ao lado, prefixo `tfm-`.
// Tempo e curva vêm da escala do `:root`; os ícones são os do Tabler.
import "./config-micro.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../Icon";
import { Botao, BotaoIcone, useCopiar } from "../../ui/controles";

// ── Copiar (Kinetics 016 + 055) ─────────────────────────────────────────────
// O ícone MORFA de "copiar" pra "visto" e o rótulo troca pra "Copiado" no mesmo
// lugar — a confirmação aparece onde o dedo está, não num toast no canto.
export function BotaoCopiar({ texto, rotulo = "Copiar", soIcone, tom, className, style }: {
  texto: string;
  rotulo?: string;
  /** Só o ícone (linha apertada no celular). O nome acessível continua dizendo o que houve. */
  soIcone?: boolean;
  /** Em cima de bloco de código escuro: vira o `secundario` do kit, que tem fundo próprio. */
  tom?: "escuro";
  className?: string;
  style?: React.CSSProperties;
}) {
  // Sem permissão de área de transferência o `useCopiar` não finge que copiou.
  const { copiado, copiar } = useCopiar(1600);
  const variante = tom === "escuro" ? "secundario" : "sutil";
  const estado = copiado ? "ok" : "ocioso";
  if (soIcone) {
    return <BotaoIcone icone="copy" titulo={copiado ? "Copiado" : rotulo} tamanho="sm" variante={variante}
      estado={estado} className={className} style={style} onClick={() => void copiar(texto)} />;
  }
  return (
    <Botao icone="copy" tamanho="sm" variante={variante} estado={estado} className={className} style={style}
      onClick={() => void copiar(texto)}>
      {copiado ? "Copiado" : rotulo}
    </Botao>
  );
}

// ── Pílula de estado (063) com pulso "ao vivo" (064/077) ────────────────────
export type EstadoPilula = "ok" | "pendente" | "erro" | "carregando" | "neutro";

/** Pulso que para quando sai da tela — anel girando fora da vista é quadro jogado fora. */
function Pulso() {
  const ref = useRef<HTMLSpanElement>(null);
  const [parado, setParado] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setParado(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <span ref={ref} className="tfm-pulso" data-parado={parado ? "1" : undefined} aria-hidden />;
}

export function PilulaStatus({ estado, icone, vivo, tam, cor, children }: {
  estado: EstadoPilula;
  icone?: string;
  /** Estado que ainda pode mudar sozinho (aguardando DNS, envio pendente). */
  vivo?: boolean;
  tam?: "md";
  /** Tinta própria quando a pílula é categoria (papel), não estado. */
  cor?: string;
  children: ReactNode;
}) {
  return (
    <span className="tfm-pilula" data-estado={estado} data-tam={tam} style={cor ? ({ "--pc": cor } as React.CSSProperties) : undefined}>
      {estado === "carregando"
        ? <span className="spin" style={{ display: "inline-flex" }}><Icon name="loader" size={11} color="currentColor" /></span>
        : vivo ? <Pulso /> : icone ? <Icon name={icone} size={11} color="currentColor" /> : null}
      {children}
    </span>
  );
}

// ── Visto que se desenha (065) ──────────────────────────────────────────────
// O path é o `check` do Tabler (viewBox 24, traço 2); só o traço é revelado.
export function Visto({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  const [desenhado, setDesenhado] = useState(false);
  useEffect(() => {
    const q = requestAnimationFrame(() => requestAnimationFrame(() => setDesenhado(true)));
    return () => cancelAnimationFrame(q);
  }, []);
  return (
    <svg className="tfm-visto" data-desenhado={desenhado ? "1" : undefined} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: "none" }}>
      <path d="M5 12l5 5l10 -10" />
    </svg>
  );
}

// ── Botão com fases: ocioso → enviando → feito/erro (072 + 065 + 103) ──────
export type Fase = "ocioso" | "enviando" | "feito" | "erro";

/** Roda a ação e conduz as fases do botão. `fn` devolve `true` quando deu certo.
 *  O "feito" e o "erro" voltam sozinhos pro repouso — o botão fica pronto pra
 *  próxima tentativa sem a pessoa precisar entender que precisa esperar. */
export function useFases() {
  const [fase, setFase] = useState<Fase>("ocioso");
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current); }, []);
  const rodar = useCallback(async (fn: () => Promise<boolean>) => {
    if (relogio.current) clearTimeout(relogio.current);
    setFase("enviando");
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    setFase(ok ? "feito" : "erro");
    relogio.current = setTimeout(() => setFase("ocioso"), ok ? 1600 : 900);
    return ok;
  }, []);
  return { fase, rodar, ocupado: fase === "enviando" };
}

export function BotaoFases({ fase, onClick, icone, children, enviando = "Enviando", feito = "Pronto", erro = "Tente de novo", variante = "primario", style }: {
  fase: Fase;
  onClick: () => void;
  icone?: string;
  children: ReactNode;
  enviando?: string;
  feito?: string;
  erro?: string;
  variante?: "primario" | "secundario";
  style?: React.CSSProperties;
}) {
  // As fases viram o `estado` do botão do kit (giro, visto, alerta); o rótulo
  // acompanha pra quem não vê o ícone.
  const estado = fase === "enviando" ? "carregando" : fase === "feito" ? "ok" : fase === "erro" ? "erro" : "ocioso";
  return (
    <Botao variante={variante} icone={icone} estado={estado} onClick={onClick} style={style}>
      {fase === "enviando" ? enviando : fase === "feito" ? feito : fase === "erro" ? erro : children}
    </Botao>
  );
}

// ── Sanfona (006) — cabeçalho com toque de 44px + painel `.t-acc` da fundação ─
export function Sanfona({ titulo, abertaInicial = false, children }: {
  titulo: ReactNode;
  abertaInicial?: boolean;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(abertaInicial);
  return (
    <div className="t-acc" data-open={aberta ? "true" : "false"}>
      <button type="button" className="tfm-sanfona-cab" aria-expanded={aberta} onClick={() => setAberta((v) => !v)}>
        {titulo}
        <span className="t-acc-chevron"><Icon name="chevron-down" size={17} color="currentColor" /></span>
      </button>
      <div className="t-acc-panel">
        <div className="t-acc-panel-inner" inert={!aberta}>
          <div className="tfm-sanfona-miolo">{children}</div>
        </div>
      </div>
    </div>
  );
}
