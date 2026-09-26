"use client";

// ── Marketing · Geral · Vídeo do criativo ────────────────────────────────────
// NENHUM arquivo passa pelo Gaius. Duas formas de ver o vídeo, as duas por
// referência:
//
//   1) Prévia da Meta — `/{ad_id}/previews` devolve um iframe assinado com o
//      anúncio rodando (é o método suportado; pegar o .mp4 a Meta bloqueia).
//      O id vem do cadastro (campo "ID do anúncio") ou é descoberto pelo CÓDIGO
//      no nome do anúncio.
//   2) Link do vídeo — endereço externo (Drive, YouTube, storage). É o gancho
//      pro dia em que o upload nascer dentro do Gaius: o que muda é de onde vem
//      a URL, não a tela.
//
// O iframe SÓ é montado quando a pessoa pede pra ver. Enquanto isso é um pôster
// com botão — nada de N iframes da Meta carregando junto com a lista.
import { useEffect, useState } from "react";
import { Icon } from "../Icon";

interface Preview { src: string | null; width?: number | null; height?: number | null; motivo?: string }

export function VideoCriativo({ codigo, metaAdId, videoUrl, altura = 560, aberto: abertoInicial = false }: {
  codigo: string;
  metaAdId?: string | null;
  videoUrl?: string | null;
  altura?: number;
  aberto?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    // Só busca depois de aberto — e só quando não há link externo, que dispensa
    // a Meta por completo.
    if (!aberto || videoUrl || preview || carregando) return;
    setCarregando(true);
    const q = metaAdId ? `adId=${encodeURIComponent(metaAdId)}` : `codigo=${encodeURIComponent(codigo)}`;
    void fetch(`/api/marketing/preview?${q}`)
      .then((r) => r.json())
      .then((r) => setPreview(r?.ok ? r : { src: null }))
      .catch(() => setPreview({ src: null }))
      .finally(() => setCarregando(false));
  }, [aberto, videoUrl, metaAdId, codigo, preview, carregando]);

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        style={{
          width: "100%", minHeight: 120, borderRadius: 14, cursor: "pointer",
          border: "1px dashed var(--border)", background: "var(--surface-2)", color: "var(--text)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 18,
        }}>
        <span style={{ width: 44, height: 44, borderRadius: 999, background: "var(--primary)", display: "grid", placeItems: "center" }}>
          <Icon name="player-play" size={20} color="#fff" />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>Ver o vídeo</span>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)", textAlign: "center" }}>
          {videoUrl ? "Arquivo do criativo" : "Prévia do anúncio na Meta"}
        </span>
      </button>
    );
  }

  // Link externo ganha do iframe da Meta: é o arquivo do criativo em si.
  if (videoUrl) return <PlayerExterno url={videoUrl} altura={altura} />;

  if (carregando || !preview) {
    return <div className="skeleton" style={{ width: "100%", height: altura, borderRadius: 14 }} />;
  }

  if (!preview.src) {
    return (
      <div style={{ borderRadius: 14, border: "1px solid var(--border)", padding: 18, textAlign: "center" }}>
        <Icon name="photo-question" size={26} color="var(--text-dim)" />
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.55 }}>
          {preview.motivo === "sem_anuncio"
            ? <>Nenhum anúncio com <strong>{codigo}</strong> no nome nos últimos 180 dias. Comece o nome do anúncio na Meta pelo código, ou preencha o “ID do anúncio” no cadastro.</>
            : <>A Meta não devolveu a prévia deste anúncio. Isso costuma ser permissão da conta ou anúncio já removido.</>}
        </p>
      </div>
    );
  }

  // `sandbox` sem `allow-same-origin`: a página da Meta roda isolada e não
  // alcança cookie nem storage do Gaius.
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "#000" }}>
      <iframe
        src={preview.src}
        title={`Prévia do criativo ${codigo}`}
        style={{ width: "100%", height: altura, border: "none", display: "block" }}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        allow="encrypted-media"
        loading="lazy"
      />
    </div>
  );
}

function PlayerExterno({ url, altura }: { url: string; altura: number }) {
  const yt = idYoutube(url);
  if (yt) {
    return (
      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "#000" }}>
        <iframe src={`https://www.youtube-nocookie.com/embed/${yt}`} title="Vídeo do criativo"
          style={{ width: "100%", height: altura, border: "none", display: "block" }}
          allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
      </div>
    );
  }
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video src={url} controls preload="none"
        style={{ width: "100%", maxHeight: altura, borderRadius: 14, background: "#000", display: "block" }} />
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", color: "var(--primary-texto, var(--primary))", fontWeight: 700, fontSize: 13.5, textDecoration: "none" }}>
      <Icon name="external-link" size={16} color="var(--primary-texto)" /> Abrir o vídeo
    </a>
  );
}

function idYoutube(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  return m ? m[1] : null;
}
