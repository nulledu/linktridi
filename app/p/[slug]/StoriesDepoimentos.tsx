"use client";

// Depoimentos em formato de STORIES: a fileira de bolinhas no topo da central,
// acima das categorias e dos tutoriais. Tocar abre em tela cheia com as
// barrinhas de progresso; toque na direita avança, na esquerda volta, e ao fim
// de um depoimento passa sozinho pro próximo. Bolinha já vista fica cinza
// (lembrado no aparelho — só conveniência, nada se perde sem ele).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/app/(plataforma)/Icon";
import type { DepoimentoCentral } from "@/lib/tridiflow-tutoriais";

const CHAVE_VISTOS = "tut-depoimentos-vistos";
/** Foto parada fica 6s — o tempo de ler uma frase de duas linhas. */
const TEMPO_FOTO = 6000;

function lerVistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_VISTOS) || "[]") as string[]); } catch { return new Set(); }
}
function gravarVistos(v: Set<string>) {
  try { localStorage.setItem(CHAVE_VISTOS, JSON.stringify([...v].slice(-200))); } catch { /* aba anônima */ }
}

export function StoriesDepoimentos({ depoimentos }: { depoimentos: DepoimentoCentral[] }) {
  const [aberto, setAberto] = useState<number | null>(null);
  const [vistos, setVistos] = useState<Set<string>>(() => new Set());
  useEffect(() => { setVistos(lerVistos()); }, []);
  const marcar = useCallback((id: string) => {
    setVistos((v) => { if (v.has(id)) return v; const n = new Set(v); n.add(id); gravarVistos(n); return n; });
  }, []);
  if (!depoimentos.length) return null;
  return <>
    <nav className="tut-stories" aria-label="Depoimentos de clientes">
      {depoimentos.map((d, i) => {
        const foto = d.avatarUrl || (d.tipoMidia === "imagem" ? d.midiaUrl : "");
        return <button key={d.id} type="button" className="tut-story" data-visto={vistos.has(d.id) ? "1" : undefined} onClick={() => setAberto(i)}>
          <span className="tut-story-anel">
            <span className="tut-story-foto">{foto ? <img src={foto} alt="" loading="lazy" decoding="async" /> : <Icon name="quote" size={22} />}</span>
          </span>
          <small>{d.nome}</small>
        </button>;
      })}
    </nav>
    {aberto !== null && <VisorStories depoimentos={depoimentos} inicio={aberto} onVisto={marcar} onFechar={() => setAberto(null)} />}
  </>;
}

function VisorStories({ depoimentos, inicio, onVisto, onFechar }: {
  depoimentos: DepoimentoCentral[]; inicio: number; onVisto: (id: string) => void; onFechar: () => void;
}) {
  const [i, setI] = useState(inicio);
  const [progresso, setProgresso] = useState(0);
  const [parado, setParado] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const d = depoimentos[i];
  const toqueY = useRef<number | null>(null);

  const proximo = useCallback(() => { if (i + 1 < depoimentos.length) setI(i + 1); else onFechar(); }, [i, depoimentos.length, onFechar]);
  const anterior = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  useEffect(() => { setProgresso(0); onVisto(d.id); }, [d.id, onVisto]);

  useEffect(() => {
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
      else if (e.key === "ArrowRight") proximo();
      else if (e.key === "ArrowLeft") anterior();
    };
    window.addEventListener("keydown", tecla);
    return () => { document.documentElement.style.overflow = antes; window.removeEventListener("keydown", tecla); };
  }, [onFechar, proximo, anterior]);

  // Foto (ou só frase): relógio próprio. Vídeo: o progresso é o do vídeo.
  const ehVideo = d.tipoMidia === "video" && !!d.midiaUrl;
  useEffect(() => {
    if (ehVideo || parado) return;
    const passo = 50;
    const t = setInterval(() => setProgresso((p) => p + passo / TEMPO_FOTO), passo);
    return () => clearInterval(t);
  }, [ehVideo, parado, d.id]);
  useEffect(() => { if (progresso >= 1) proximo(); }, [progresso, proximo]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (parado) el.pause(); else el.play().catch(() => {});
  }, [parado, d.id]);

  return createPortal(
    <div className="tut-visor" role="dialog" aria-modal="true" aria-label={`Depoimento de ${d.nome}`}
      onPointerDown={(e) => { toqueY.current = e.clientY; setParado(true); }}
      onPointerUp={(e) => { setParado(false); if (toqueY.current !== null && e.clientY - toqueY.current > 90) onFechar(); toqueY.current = null; }}
      onPointerCancel={() => { setParado(false); toqueY.current = null; }}>
      <div className="tut-visor-palco">
        {d.midiaUrl ? (ehVideo
          ? <video key={d.id} ref={video} className="tut-visor-midia" src={d.midiaUrl} playsInline autoPlay
              onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgresso(v.currentTime / v.duration); }}
              onEnded={proximo} />
          : <img key={d.id} className="tut-visor-midia" src={d.midiaUrl} alt="" />) : null}
        <div className="tut-visor-barras" aria-hidden="true">
          {depoimentos.map((x, n) => <span key={x.id}><i style={{ transform: `scaleX(${n < i ? 1 : n > i ? 0 : Math.min(progresso, 1)})` }} /></span>)}
        </div>
        <div className="tut-visor-topo">
          <strong>{d.nome}</strong>
          <button type="button" className="tut-feed-btn" onPointerDown={(e) => e.stopPropagation()} onClick={onFechar} aria-label="Fechar depoimentos"><Icon name="x" size={22} /></button>
        </div>
        {d.texto && <blockquote className="tut-visor-texto" data-so-texto={d.midiaUrl ? undefined : "1"}>
          <Icon name="quote" size={22} /><p>{d.texto}</p>
        </blockquote>}
        <button type="button" className="tut-visor-lado" data-lado="esq" onClick={anterior} aria-label="Depoimento anterior" />
        <button type="button" className="tut-visor-lado" data-lado="dir" onClick={proximo} aria-label="Próximo depoimento" />
      </div>
    </div>,
    document.body,
  );
}
