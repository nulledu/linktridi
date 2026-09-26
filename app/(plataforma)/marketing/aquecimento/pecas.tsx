"use client";

// ── Aquecimento · peças pequenas ─────────────────────────────────────────────
// Pílula, barra de progresso e os dois movimentos do módulo. Ficam juntos aqui
// porque as três telas (Hoje, Ativos, Gaveta) usam as mesmas — se cada uma
// tivesse a sua cópia, uma ia divergir e o módulo passaria a ter duas pílulas
// de status com pesos diferentes.

import type { ReactNode } from "react";
import { molar } from "../../ui/gestos";
import { RITMO, corStatus, rotuloStatus, type EstadoRitmo, type Ritmo, type StatusAtivo } from "@/lib/marketing-aquecimento-const";

export const calmo = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Pill({ cor, children, titulo }: { cor: string; children: ReactNode; titulo?: string }) {
  return (
    <span title={titulo} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px",
      borderRadius: 999, fontSize: 12, fontWeight: 620, whiteSpace: "nowrap",
      background: `color-mix(in srgb, ${cor} 15%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cor} 40%, transparent)`, color: cor,
    }}>
      <i style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
      {children}
    </span>
  );
}

export const PillStatus = ({ status }: { status: StatusAtivo }) => (
  <Pill cor={corStatus(status)}>{rotuloStatus(status)}</Pill>
);

/** Ritmo com o número junto: "+4d" lê como atraso, "−4d" como adiantamento.
 *  Só o rótulo ("Atrasado") esconderia o tamanho do desvio, que é o que decide
 *  se alguém precisa agir hoje ou pode deixar pra semana que vem. */
export function PillRitmo({ ritmo }: { ritmo: Ritmo }) {
  const { label, cor } = RITMO[ritmo.estado];
  const mostraNumero: EstadoRitmo[] = ["atrasado", "apressado"];
  const sinal = ritmo.desvio > 0 ? "+" : "−";
  return (
    <Pill cor={cor} titulo={ritmo.estado === "apressado"
      ? `${ritmo.apressadas} etapa(s) cumpridas antes do previsto — é o padrão que costuma anteceder bloqueio`
      : label}>
      {mostraNumero.includes(ritmo.estado) ? `${sinal}${Math.abs(ritmo.desvio)}d` : label}
    </Pill>
  );
}

export function Barra({ fracao, cor }: { fracao: number; cor: string }) {
  return (
    <div style={{ height: 5, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
      <i style={{
        display: "block", height: "100%", borderRadius: 3, background: cor,
        width: `${Math.round(Math.max(0, Math.min(1, fracao)) * 100)}%`,
        transition: calmo() ? "none" : "width .5s cubic-bezier(.32,.72,0,1)",
      }} />
    </div>
  );
}

// ── Travessia (FLIP) ─────────────────────────────────────────────────────────
// Quando uma etapa é marcada, ela sai do futuro e entra no passado — o que na
// lista significa mudar de lugar, atravessando a marca do HOJE. Deixar o React
// só re-renderizar teletransportaria o item: ele some de um lugar e aparece em
// outro, e ninguém entende que é o MESMO item que se moveu.
//
// FLIP resolve: mede antes, deixa o React mudar, mede depois, e anima o delta a
// partir da posição ANTIGA. A mola de `ui/gestos` anima do valor atual na tela,
// então uma segunda marcação no meio da primeira não dá salto.

/** Guarda a posição atual do elemento. Chame ANTES de mudar o estado. */
export function medir(el: HTMLElement | null): number | null {
  return el ? el.getBoundingClientRect().top : null;
}

/** Anima do lugar antigo até o novo. Chame DEPOIS do re-render. */
export function travessia(el: HTMLElement | null, antes: number | null) {
  if (!el || antes === null || calmo()) return;
  const delta = antes - el.getBoundingClientRect().top;
  if (!delta) return;
  el.style.willChange = "transform";
  molar(delta, 0, 0,
    (v) => { el.style.transform = `translateY(${v}px)`; },
    () => { el.style.transform = ""; el.style.willChange = ""; });
}

/** Recolhe um bloco da altura MEDIDA até zero e avisa quando acabou.
 *  Medir importa: recolher de um valor fixo faz o bloco pular pra essa altura
 *  antes de começar, e o pulo é justamente o que a mola existe pra evitar. */
export function recolher(el: HTMLElement | null, fim: () => void) {
  if (!el || calmo()) { fim(); return; }
  const h = el.offsetHeight;
  el.style.overflow = "hidden";
  molar(h, 0, 0, (v) => {
    el.style.height = `${Math.max(0, v)}px`;
    el.style.opacity = String(Math.max(0, Math.min(1, v / h)));
  }, fim);
}

// (Havia aqui um `useTravessia` que media a posição DURANTE o render — efeito
// colateral em corpo de componente, que no modo concorrente roda mais de uma vez
// e mede lixo. Ninguém o usava: a gaveta chama `medir`/`travessia` na mão, nos
// dois momentos certos (antes de mudar o estado, depois do re-render). Removido
// em vez de consertado — código morto que "parece útil" volta a ser chamado.)

// ── Rosto de quem responde ───────────────────────────────────────────────────
// Foto de verdade quando existe, iniciais quando não. As iniciais NÃO são um
// estado degradado: ativo cujo responsável foi digitado à mão (sem `id`) nunca
// vai ter foto, e é o caso comum de quem cadastra rápido. As duas formas
// precisam ter o mesmo tamanho e o mesmo peso na linha, senão a coluna dança
// conforme quem responde tem conta no ERP.

export const iniciais = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

export function Avatar({ nome, foto, tam = 24, anel }: {
  nome: string; foto?: string | null; tam?: number;
  /** Aro da cor da superfície, pra empilhar rosto sobre rosto sem virar borrão. */
  anel?: boolean;
}) {
  const base: React.CSSProperties = {
    width: tam, height: tam, flex: "0 0 auto", borderRadius: "50%",
    ...(anel ? { boxShadow: "0 0 0 2px var(--surface)" } : null),
  };
  if (foto) {
    return (
      // `alt` vazio de propósito: o nome já está escrito ao lado em toda
      // chamada, e o leitor de tela lendo "Ana Paula Ana Paula" é ruído.
      <img src={foto} alt="" title={nome} style={{ ...base, objectFit: "cover", background: "var(--surface-3)" }} />
    );
  }
  return (
    <span title={nome} aria-hidden style={{
      ...base, background: "var(--surface-3)", display: "grid", placeItems: "center",
      fontSize: Math.max(9, Math.round(tam * 0.42)), fontWeight: 700,
      color: "var(--text)", letterSpacing: "-.02em",
    }}>{iniciais(nome)}</span>
  );
}

/** Pilha de rostos com "+N" quando não cabe. Usada no cabeçalho do bloco: um
 *  aparelho costuma ter mais de um dono ao longo do tempo, e a pergunta ali é
 *  "quem mexe nisto", não "quem é o dono do chip 3". */
export function Rostos({ pessoas, max = 3, tam = 24 }: {
  pessoas: { nome: string; foto: string | null }[]; max?: number; tam?: number;
}) {
  if (!pessoas.length) return null;
  const mostra = pessoas.slice(0, max);
  const resto = pessoas.length - mostra.length;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {mostra.map((p, i) => (
        <span key={p.nome} style={{ marginLeft: i ? -7 : 0, display: "inline-flex" }}>
          <Avatar nome={p.nome} foto={p.foto} tam={tam} anel />
        </span>
      ))}
      {resto > 0 && (
        <span style={{
          marginLeft: -7, width: tam, height: tam, borderRadius: "50%",
          background: "var(--surface-2)", boxShadow: "0 0 0 2px var(--surface)",
          display: "grid", placeItems: "center", fontSize: Math.max(9, Math.round(tam * 0.38)),
          fontWeight: 700, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums",
        }}>+{resto}</span>
      )}
    </span>
  );
}

// ── Foto do aparelho ─────────────────────────────────────────────────────────
// A foto real é o ponto: o bloco existe pra você achar ESTE celular na mesa. Mas
// ela chega depois — alguém precisa ir lá e fotografar. Até lá o quadro não pode
// ser um buraco cinza, que lê como "quebrado", nem um ícone solto, que lê como
// "vazio".
//
// A reserva é um desenho do aparelho com a TELA acesa na cor do pior status dos
// chips que moram nele. Não é enfeite: de longe, na grade de blocos, o quadro
// vermelho é o celular que tem chip banido. Quando a foto chega, ela toma o
// lugar e a mesma leitura passa a vir da tarja de status embaixo.

export function FotoAparelho({ foto, cor, altura = 96, largura = 74, rotulo }: {
  foto?: string | null;
  /** Cor semântica do pior status de dentro do bloco (ver `corStatus`). */
  cor: string;
  altura?: number; largura?: number;
  rotulo: string;
}) {
  const moldura: React.CSSProperties = {
    width: largura, height: altura, flex: "0 0 auto", borderRadius: 13,
    overflow: "hidden", background: "var(--surface-2)",
    border: "1px solid var(--border)",
  };
  if (foto) {
    return <img src={foto} alt={`Foto de ${rotulo}`} style={{ ...moldura, objectFit: "cover", display: "block" }} />;
  }
  return (
    <span role="img" aria-label={`${rotulo} — sem foto`} style={{
      ...moldura, display: "grid", placeItems: "center",
    }}>
      <svg width={largura * 0.52} height={altura * 0.62} viewBox="0 0 34 58" fill="none" aria-hidden>
        {/* corpo */}
        <rect x="1" y="1" width="32" height="56" rx="6.5"
          fill="var(--surface-3)" stroke="var(--border)" strokeWidth="1.4" />
        {/* tela, acesa na cor do pior status */}
        <rect x="4.5" y="6" width="25" height="42" rx="3.2"
          fill={`color-mix(in srgb, ${cor} 26%, transparent)`}
          stroke={`color-mix(in srgb, ${cor} 55%, transparent)`} strokeWidth="1.2" />
        {/* alto-falante e botão */}
        <rect x="12.5" y="3" width="9" height="1.6" rx=".8" fill="var(--border)" />
        <circle cx="17" cy="52.5" r="2.1" stroke="var(--border)" strokeWidth="1.3" fill="none" />
      </svg>
    </span>
  );
}
