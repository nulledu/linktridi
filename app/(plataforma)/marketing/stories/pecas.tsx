"use client";

// Peças pequenas que o quadro, o calendário, o histórico e os painéis de
// story dividem. Visual em `stories.css` (prefixo `.sto-`).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../Icon";
import { ImagemQueChega } from "../pecasVisuais";
import type { ProdutoCriativo } from "@/lib/marketing-criativos-const";
import { iconeDoTipo, rotuloDoTipo, type Story } from "@/lib/marketing-stories/tipos";

type ComMidia = Pick<Story, "capaUrl" | "midiaUrl" | "midiaTipo" | "tipo" | "tema">;

/**
 * A miniatura do story: a capa (WebP pequeno) → a própria imagem → o quadro
 * de 0,1 s do vídeo → um cartão com o ícone do tipo. Cada degrau só entra se
 * o anterior não existir OU falhar ao carregar — link quebrado não vira
 * buraco branco no meio do quadro.
 */
export function CapaStory({ s, className, carregar = "lazy" }: {
  s: ComMidia; className?: string; carregar?: "lazy" | "eager";
}) {
  const [falhaImg, setFalhaImg] = useState(false);
  const [falhaVid, setFalhaVid] = useState(false);
  const img = s.capaUrl ?? (s.midiaTipo === "imagem" ? s.midiaUrl : null);
  const video = s.midiaTipo === "video" ? s.midiaUrl : null;
  return (
    <span className={`sto-capa ${className ?? ""}`}>
      {img && !falhaImg ? (
        // Kinetics 074 · a espera vira a capa com desfoque cruzado — num quadro
        // de 40 prints, o corte seco fazia a grade inteira "piscar" ao chegar.
        <ImagemQueChega src={img} carregar={carregar} arrastavel={false} onFalha={() => setFalhaImg(true)} />
      ) : video && !falhaVid ? (
        <video src={`${video}#t=0.1`} preload="metadata" muted playsInline onError={() => setFalhaVid(true)} />
      ) : (
        <span className="sto-capa-vazia">
          <Icon name={iconeDoTipo(s.tipo)} size={22} />
          {s.tema ? <span>{s.tema}</span> : null}
        </span>
      )}
      {s.midiaTipo === "video" && (
        <span className="sto-capa-video" aria-hidden><Icon name="player-play" size={11} /></span>
      )}
    </span>
  );
}

/**
 * Número que dá um "pulo" quando MUDA (Kinetics · Badge Counter, com o tempo
 * e a curva da escala do app) — nunca ao montar: 87 cartões pulando juntos na
 * primeira carga seriam barulho, e o pulo existe pra dizer "isto acabou de
 * mudar". A chave nova remonta o `<span>` e a animação toca de novo.
 */
export function NumeroPop({ valor, formatar }: { valor: number; formatar?: (n: number) => string }) {
  const [versao, setVersao] = useState(0);
  const anterior = useRef(valor);
  useEffect(() => {
    if (anterior.current === valor) return;
    anterior.current = valor;
    setVersao((v) => v + 1);
  }, [valor]);
  return (
    <span key={versao} className={versao ? "sto-pop" : undefined}>
      {formatar ? formatar(valor) : valor.toLocaleString("pt-BR")}
    </span>
  );
}

export type TipoSelo = "melhor" | "repete" | "planejado";

export function Selo({ tipo, icone, children }: { tipo: TipoSelo; icone?: string; children: ReactNode }) {
  return (
    <span className="sto-selo" data-tipo={tipo}>
      {icone ? <Icon name={icone} size={11} /> : null}
      {children}
    </span>
  );
}

/** id → nome, dos produtos que vieram do banco (os de fábrica não têm id). */
export function mapaDeProdutos(produtos: readonly ProdutoCriativo[]): Map<string, string> {
  return new Map(produtos.filter((p) => p.id).map((p) => [p.id as string, p.nome]));
}

/** "Carimbo · Oferta" — o que o story vendia, em uma linha. */
export function linhaDoConteudo(s: Pick<Story, "produtoId" | "tipo">, nomes: Map<string, string>): string {
  return [s.produtoId ? nomes.get(s.produtoId) : null, rotuloDoTipo(s.tipo)].filter(Boolean).join(" · ") || "Sem produto";
}

export function Vazio({ icone, titulo, texto, acao }: {
  icone: string; titulo: string; texto?: ReactNode; acao?: ReactNode;
}) {
  return (
    <div className="sto-vazio">
      <span className="sto-vazio-ico"><Icon name={icone} size={22} /></span>
      <strong>{titulo}</strong>
      {texto ? <p>{texto}</p> : null}
      {acao}
    </div>
  );
}

/** Um story em miniatura com um número ao lado — pódio, parecidos, calendário. */
export function MiniStory({ s, titulo, valor, detalhe, onAbrir }: {
  s: ComMidia & { id: string }; titulo: string; valor: ReactNode; detalhe?: ReactNode; onAbrir?: () => void;
}) {
  const dentro = (
    <>
      <CapaStory s={s} className="sto-mini-capa" />
      <span className="sto-mini-txt">
        <span className="sto-mini-rot">{titulo}</span>
        <span className="sto-mini-val">{valor}</span>
        {detalhe ? <span className="sto-mini-det">{detalhe}</span> : null}
      </span>
    </>
  );
  return onAbrir
    ? <button type="button" className="sto-mini ui-card-alvo" onClick={onAbrir}>{dentro}</button>
    : <div className="sto-mini">{dentro}</div>;
}
