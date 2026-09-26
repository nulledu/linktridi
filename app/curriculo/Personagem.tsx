"use client";

// O personagem 3D da candidatura, com a frase manuscrita e os traços de
// "animação" em SVG ao lado da cabeça (os mesmos das referências). Serve ao
// formulário público e ao painel do RH (estado vazio, visão geral) — é a
// mesma arte nos dois lados, escolhida pelo USO em `lib/rh/curriculos/personagens.ts`.

import { useState } from "react";
import { DIMENSOES, srcDaPose, type Pose } from "@/lib/rh/curriculos/personagens";

/** Três traços curtos, como nas ilustrações — vetor, escala sem serrilhar. */
export function Tracos({ lado = "dir", className }: { lado?: "dir" | "esq"; className?: string }) {
  return (
    <svg className={className} width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden
      style={{ transform: lado === "esq" ? "scaleX(-1)" : undefined }}>
      <path d="M6 18 L2 21" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M12 10 L10 3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 12 L26 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** O sublinhado à mão embaixo da frase manuscrita. */
export function Sublinhado({ className }: { className?: string }) {
  return (
    <svg className={className} width="64" height="12" viewBox="0 0 64 12" fill="none" aria-hidden>
      <path d="M2 9 C 18 3, 40 2, 62 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10 11 C 24 8, 38 8, 50 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

/** Confete da tela final — SVG, na cor da marca. Nada de emoji na interface. */
export function Confete({ className }: { className?: string }) {
  const pecas: [number, number, number, string][] = [
    [8, 30, -20, "a"], [22, 8, 35, "b"], [44, 20, 10, "a"], [70, 6, -30, "c"], [86, 26, 25, "b"],
    [100, 10, -10, "a"], [120, 28, 40, "c"], [138, 8, -35, "b"], [152, 24, 15, "a"],
  ];
  const cor = { a: "var(--cd-roxo, #6D1192)", b: "var(--cd-roxo-2, #8b3ac6)", c: "#c9a7ec" };
  return (
    <svg className={className} width="160" height="40" viewBox="0 0 160 40" fill="none" aria-hidden>
      {pecas.map(([x, y, r, c], i) => (
        i % 3 === 0
          ? <circle key={i} cx={x} cy={y} r="3" fill={cor[c as "a"]} />
          : <rect key={i} x={x} y={y} width="8" height="3.2" rx="1.6" fill={cor[c as "a"]} transform={`rotate(${r} ${x + 4} ${y + 1.6})`} />
      ))}
    </svg>
  );
}

export type PosicaoPersonagem = "esq" | "dir" | "centro";

/**
 * O personagem no pé do cartão, colado nos botões — do lado da referência.
 *
 * Duas colunas, nunca sobrepostas: a figura de um lado e a frase manuscrita
 * do outro (em "centro", a figura fica no meio e a frase ao lado dela). A
 * figura aparece INTEIRA (`object-fit: contain`, presa embaixo): nada de
 * recorte, que no celular parecia imagem quebrada. `width`/`height` reais no
 * `<img>` reservam o espaço antes de a imagem chegar.
 */
export function Personagem({ pose, nota, lado, posicao, altura, className, animado, prioridade }: {
  pose: Pose;
  nota?: string;
  /** Lado da frase manuscrita. Sem ele: oposto ao personagem. */
  lado?: "dir" | "esq";
  /** Onde o personagem fica. Padrão: oposto à frase (ou centro). */
  posicao?: PosicaoPersonagem;
  /** Altura fixa da caixa, em px. Sem ela, a caixa ocupa o espaço que sobra no cartão. */
  altura?: number;
  /** Aceito por compatibilidade; a figura não é mais recortada. */
  corte?: number;
  className?: string;
  /** Balanço suave — só no "carregando". Respeita reduced-motion no CSS. */
  animado?: boolean;
  /** A imagem da tela ATUAL: baixa antes de tudo. */
  prioridade?: boolean;
}) {
  const [falhou, setFalhou] = useState(false);
  const pos: PosicaoPersonagem = posicao ?? (lado === "dir" ? "esq" : lado === "esq" ? "dir" : "centro");
  const ladoNota: "dir" | "esq" = lado ?? (pos === "esq" ? "dir" : "esq");
  const [w, h] = DIMENSOES[pose];
  return (
    <div className={`cd-ilustra${className ? ` ${className}` : ""}`} data-pos={pos} data-lado={ladoNota} data-sem-imagem={falhou ? "1" : undefined}
      data-fixa={altura ? "1" : undefined} style={altura ? { ["--cd-alt" as string]: `${altura}px` } : undefined}>
      {!falhou && (
        <span className="cd-figura" data-animado={animado ? "1" : undefined}>
          <Tracos className="cd-tracos" lado={ladoNota === "dir" ? "dir" : "esq"} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={srcDaPose(pose)} alt="" width={w} height={h} onError={() => setFalhou(true)} draggable={false}
            style={{ ["--ar" as string]: String(h / w) }}
            decoding="async" loading="eager" fetchPriority={prioridade ? "high" : "auto"} />
        </span>
      )}
      {nota && (
        <span className="cd-nota" aria-hidden>
          {nota}
          <Sublinhado className="cd-nota-traco" />
        </span>
      )}
    </div>
  );
}
