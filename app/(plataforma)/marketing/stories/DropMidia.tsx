"use client";

// A área de mídia do cadastro: vazia → preparando → prévia (com o envio
// correndo por baixo). Arrastar um arquivo por cima acende a área (Kinetics ·
// drop zone: a borda ganha a cor, o ícone sobe um pouco); soltar, escolher ou
// colar (Ctrl+V, tratado pelo cadastro) dão no mesmo lugar.
//
// O envio COMEÇA quando o arquivo é escolhido, não no "Salvar": enquanto a
// pessoa preenche data, produto e números, o arquivo já está subindo. É o que
// faz o cadastro caber em segundos.
//
// A área vazia é um <button>, não um <label> de um input escondido: o input
// com `display: none` não recebe foco, e aí quem usa teclado nunca chegava ao
// upload.

import { useRef, useState, type DragEvent } from "react";
import { Icon } from "../../Icon";
import { Botao, BotaoIcone } from "../../ui/controles";
import { CheckDesenhado } from "../pecasVisuais";
import { ACEITA, textoDosLimitesStory, type MidiaPreparada } from "./midiaStory";

export type EstadoMidia =
  | { fase: "vazio"; erro?: string }
  | { fase: "preparando"; nome: string }
  | { fase: "pronta"; m: MidiaPreparada; progresso: number; enviada: boolean; erroEnvio?: string };

/** O arrasto traz arquivo? (Arrastar texto ou um link não acende nada.) */
export function temArquivo(e: DragEvent): boolean {
  return [...(e.dataTransfer?.types ?? [])].includes("Files");
}

export function DropMidia({ estado, onArquivo, onRemover, onTentarDeNovo }: {
  estado: EstadoMidia;
  onArquivo: (f: File) => void;
  onRemover: () => void;
  onTentarDeNovo?: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  // dragenter/dragleave disparam também ao passar pelos FILHOS da área: sem a
  // contagem, a borda piscaria a cada ícone e texto atravessado.
  const profundidade = useRef(0);

  const eventos = {
    onDragEnter: (e: DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault(); e.stopPropagation();
      profundidade.current++;
      setArrastando(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!temArquivo(e)) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      e.stopPropagation();
      profundidade.current = Math.max(0, profundidade.current - 1);
      if (!profundidade.current) setArrastando(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      profundidade.current = 0;
      setArrastando(false);
      const f = [...(e.dataTransfer?.files ?? [])][0];
      if (f) onArquivo(f);
    },
  };

  const input = (
    <input ref={entrada} type="file" accept={ACEITA} hidden tabIndex={-1} aria-hidden
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onArquivo(f); }} />
  );
  const escolher = () => entrada.current?.click();

  if (estado.fase === "pronta") {
    const { m } = estado;
    return (
      <div className="sto-previa-wrap">
        {input}
        <div className="sto-previa" data-arrastando={arrastando ? "1" : undefined} {...eventos}>
          {m.tipo === "video"
            ? <video src={m.previa} poster={m.previaCapa ?? undefined} controls muted playsInline preload="metadata" />
            : <img src={m.previa} alt="Prévia do story" />}
          <span className="sto-previa-estado" role="status" aria-live="polite"
            data-ok={estado.enviada ? "1" : undefined} data-erro={estado.erroEnvio ? "1" : undefined}>
            {estado.erroEnvio
              ? <><Icon name="alert-triangle" size={13} /> Falhou</>
              : estado.enviada
                // Kinetics 065 · o anel e o visto se desenham quando o envio fecha.
                ? <><CheckDesenhado size={15} /> Enviado</>
                : <><Anel fracao={estado.progresso} /> {Math.round(estado.progresso * 100)}%</>}
          </span>
        </div>
        <div className="sto-previa-acoes">
          <Botao tamanho="sm" icone="refresh" onClick={escolher}>Trocar</Botao>
          <BotaoIcone icone="trash" titulo="Tirar a mídia" tamanho="sm" onClick={onRemover} />
        </div>
        {estado.erroEnvio && (
          <p className="sto-previa-erro" role="alert">
            {estado.erroEnvio}
            {onTentarDeNovo && <Botao tamanho="sm" onClick={onTentarDeNovo}>Tentar de novo</Botao>}
          </p>
        )}
      </div>
    );
  }

  if (estado.fase === "preparando") {
    return (
      <div className="sto-drop" data-preparando="1" aria-busy="true">
        <span className="sto-drop-ico"><Icon name="loader" size={22} className="spin" /></span>
        <strong>Preparando a prévia…</strong>
        <span className="sto-drop-dica">{estado.nome}</span>
      </div>
    );
  }

  return (
    <>
      {input}
      <button type="button" className="sto-drop" data-arrastando={arrastando ? "1" : undefined} onClick={escolher} {...eventos}>
        <span className="sto-drop-ico"><Icon name="upload" size={22} /></span>
        <strong>{arrastando ? "Pode soltar" : "Arraste o print ou o vídeo"}</strong>
        <span className="sto-drop-dica">
          ou toque para escolher<span className="desk-only"> · Ctrl+V cola um print</span>
        </span>
        <span className="sto-drop-lim">{textoDosLimitesStory()}</span>
        {estado.erro && <span className="sto-drop-erro" role="alert">{estado.erro}</span>}
      </button>
    </>
  );
}

/** Anel de progresso do envio — o número sozinho pula; o anel mostra que anda. */
function Anel({ fracao }: { fracao: number }) {
  const r = 6.5;
  const c = 2 * Math.PI * r;
  return (
    <svg className="sto-anel" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2.4" />
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fracao)))} transform="rotate(-90 8 8)" />
    </svg>
  );
}
