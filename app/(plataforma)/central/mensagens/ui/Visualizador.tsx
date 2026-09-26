"use client";

// Visualizador de arquivo em tela cheia: imagem, vídeo, áudio e PDF.
// Documento que o navegador não abre nativamente cai no download, em vez de
// mostrar uma tela preta.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../Icon";
import { familiaArquivo, tamanhoLegivel } from "@/lib/chat/regras";
import type { Anexo } from "@/lib/chat/tipos";
import { travarRolagem } from "../../../ui/travaRolagem";

export function Visualizador({ anexo, aoFechar }: { anexo: Anexo; aoFechar: () => void }) {
  const familia = familiaArquivo(anexo.mime ?? "", anexo.nome ?? "");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", esc);
    // Trava a rolagem de fundo enquanto o visor está aberto (contada: o visor
    // abre de dentro da conversa, que já pode estar num painel).
    const soltar = travarRolagem();
    return () => {
      window.removeEventListener("keydown", esc);
      soltar();
    };
  }, [aoFechar]);

  return createPortal(
    <div className="ch-visor" onClick={aoFechar} role="dialog" aria-modal aria-label={anexo.nome}>
      <div className="ch-visor__barra" onClick={(e) => e.stopPropagation()}>
        <span className="ch-visor__nome">
          {anexo.nome}
          {anexo.tamanho ? ` · ${tamanhoLegivel(anexo.tamanho)}` : ""}
        </span>
        <a className="ch-visor__botao" href={anexo.url} download={anexo.nome} target="_blank" rel="noopener noreferrer"
           aria-label="Baixar">
          <Icon name="download" size={18} color="#fff" />
        </a>
        <button type="button" className="ch-visor__botao" onClick={aoFechar} aria-label="Fechar">
          <Icon name="x" size={18} color="#fff" />
        </button>
      </div>

      {familia === "imagem" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={anexo.url} alt={anexo.nome} data-nozoom onClick={(e) => e.stopPropagation()} />
      )}
      {familia === "video" && <video src={anexo.url} controls autoPlay onClick={(e) => e.stopPropagation()} />}
      {familia === "audio" && (
        <audio src={anexo.url} controls autoPlay onClick={(e) => e.stopPropagation()} style={{ width: "min(90vw, 480px)" }} />
      )}
      {familia === "pdf" && <iframe src={anexo.url} title={anexo.nome} onClick={(e) => e.stopPropagation()} />}
      {!["imagem", "video", "audio", "pdf"].includes(familia) && (
        <div className="ch-vazio" onClick={(e) => e.stopPropagation()}
             style={{ background: "var(--ch-elevado, #1f222b)", borderRadius: "var(--r-md)", padding: 32, maxWidth: 380 }}>
          <span className="ch-vazio__icone"><Icon name="file" size={26} color="var(--text-dim)" /></span>
          <h3>{anexo.nome}</h3>
          <p>Este tipo de arquivo não abre aqui dentro. Baixe para ver no aplicativo certo.</p>
          <a className="ch-btn ch-btn--primario" href={anexo.url} download={anexo.nome}
             target="_blank" rel="noopener noreferrer" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
            Baixar
          </a>
        </div>
      )}
    </div>,
    document.body,
  );
}
