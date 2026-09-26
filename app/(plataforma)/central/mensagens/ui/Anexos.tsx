"use client";

import { memo } from "react";
import { Icon } from "../../../Icon";
import { familiaArquivo, tamanhoLegivel } from "@/lib/chat/regras";
import type { Anexo } from "@/lib/chat/tipos";

const ICONE: Record<string, string> = {
  imagem: "photo", video: "video", audio: "headphones", pdf: "file-text",
  codigo: "code", planilha: "table", documento: "file-text", arquivo: "file",
};

export const Anexos = memo(function Anexos({
  anexos, aoAbrir,
}: { anexos: Anexo[]; aoAbrir: (a: Anexo) => void }) {
  if (!anexos.length) return null;
  return (
    <div className="ch-anexos">
      {anexos.map((a, i) => {
        const familia = familiaArquivo(a.mime ?? "", a.nome ?? "");

        if (familia === "imagem") {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={a.url + i} src={a.url} alt={a.nome || ""} className="ch-anexo-img"
              data-nozoom loading="lazy" decoding="async"
              // Reservar a proporção evita o "pulo" da lista quando a imagem carrega.
              width={a.largura ?? undefined} height={a.altura ?? undefined}
              onClick={() => aoAbrir(a)}
            />
          );
        }
        if (familia === "video") {
          return (
            <video key={a.url + i} src={a.url} controls preload="metadata"
              className="ch-anexo-img" style={{ cursor: "default" }} />
          );
        }
        if (familia === "audio") {
          return (
            <div key={a.url + i} className="ch-anexo" style={{ width: "100%", maxWidth: 340 }}>
              <Icon name="headphones" size={18} color="var(--text-dim)" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ch-anexo__nome">{a.nome}</div>
                <audio src={a.url} controls preload="none" style={{ width: "100%", marginTop: 4 }} />
              </div>
            </div>
          );
        }
        return (
          <button key={a.url + i} type="button" className="ch-anexo" onClick={() => aoAbrir(a)}>
            <Icon name={ICONE[familia] ?? "file"} size={20} color="var(--primary-texto)" />
            <span style={{ minWidth: 0 }}>
              <span className="ch-anexo__nome" style={{ display: "block" }}>{a.nome}</span>
              <span className="ch-anexo__meta">
                {[familia === "arquivo" ? "" : familia, tamanhoLegivel(a.tamanho)].filter(Boolean).join(" · ")}
              </span>
            </span>
            <Icon name="download" size={16} color="var(--text-dim)" />
          </button>
        );
      })}
    </div>
  );
});
