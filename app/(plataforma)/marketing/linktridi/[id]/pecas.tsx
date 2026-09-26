"use client";

// ── Peças do editor do LinkTridi ─────────────────────────────────────────────
// A lista agrupada dos ajustes (grupo → linhas, como os Ajustes do iPhone), a
// chave, o controle segmentado, a linha de cor e as entradas de mídia.
//
// Uma linha é uma decisão: o que ela muda à esquerda, o controle à direita,
// e a explicação embaixo do nome — nunca num balão de hover, que no celular
// não existe. Grupo agrupa o que muda junto; a nota do grupo diz o efeito.
import { CampoCor } from "@/app/(plataforma)/ui/cores";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../../../Icon";
import { toast } from "../../../Toast";
import { Botao, BotaoIcone } from "../../../ui/controles";
import { classificarMidiaLT } from "@/lib/tridiflow-midia";
import { hexValido } from "@/lib/tridiflow-linktridi";

// ── Grupo e linhas ───────────────────────────────────────────────────────────
export function Grupo({ titulo, nota, acao, id, children }: {
  titulo?: ReactNode; nota?: ReactNode; acao?: ReactNode; id?: string; children: ReactNode;
}) {
  const idTitulo = useId();
  return (
    <section className="lte-grupo" aria-labelledby={titulo ? idTitulo : undefined} id={id}>
      {(titulo || acao) && (
        <div className="lte-grupo-cab">
          {titulo && <h3 id={idTitulo}>{titulo}</h3>}
          {acao}
        </div>
      )}
      <div className="lte-grupo-corpo">{children}</div>
      {nota && <p className="lte-grupo-nota">{nota}</p>}
    </section>
  );
}

/** Linha com chave. O texto inteiro é alvo: tocar no nome também liga e
 *  desliga (o `<label>` encaminha o toque pro botão). */
export function LinhaChave({ rotulo, dica, ligado, onChange, desativado, icone }: {
  rotulo: ReactNode; dica?: ReactNode; ligado: boolean; onChange: (v: boolean) => void;
  desativado?: boolean; icone?: string;
}) {
  const id = useId();
  return (
    <div className="lte-linha" data-desativada={desativado ? "1" : undefined}>
      {icone && <span className="lte-linha-ico" aria-hidden><Icon name={icone} size={17} /></span>}
      <label htmlFor={id} className="lte-linha-txt">
        <span className="lte-linha-rot" id={`${id}-r`}>{rotulo}</span>
        {dica && <span className="lte-linha-dica" id={`${id}-d`}>{dica}</span>}
      </label>
      <Chave id={id} ligado={ligado} onChange={onChange} desativado={desativado}
        rotuladoPor={`${id}-r`} descritoPor={dica ? `${id}-d` : undefined} />
    </div>
  );
}

/** Linha que abre outra tela (folha). O valor atual fica à vista — é o que
 *  poupa abrir só pra conferir. */
export function LinhaNav({ rotulo, valor, dica, icone, onClick, desativado }: {
  rotulo: ReactNode; valor?: ReactNode; dica?: ReactNode; icone?: string; onClick: () => void; desativado?: boolean;
}) {
  return (
    <button type="button" className="lte-linha lte-linha-nav" onClick={onClick} disabled={desativado} data-com-valor={valor ? "1" : undefined}>
      {icone && <span className="lte-linha-ico" aria-hidden><Icon name={icone} size={17} /></span>}
      <span className="lte-linha-txt">
        <span className="lte-linha-rot">{rotulo}</span>
        {dica && <span className="lte-linha-dica">{dica}</span>}
      </span>
      {valor && <span className="lte-linha-valor">{valor}</span>}
      <span className="lte-linha-seta" aria-hidden><Icon name="chevron-right" size={16} /></span>
    </button>
  );
}

/** Linha livre (campo, controle próprio). Só dá o respiro e a divisória. */
export function Linha({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={"lte-linha lte-linha-livre" + (className ? " " + className : "")}>{children}</div>;
}

// ── Chave ────────────────────────────────────────────────────────────────────
// A bolinha estica enquanto o dedo está em cima (a chave do iOS faz isso): é o
// retorno no APERTO, antes de soltar. Sem mola que passa do ponto — um toque
// não carrega impulso, então nada quica.
export function Chave({ id, ligado, onChange, desativado, rotulo, rotuladoPor, descritoPor }: {
  id?: string; ligado: boolean; onChange: (v: boolean) => void; desativado?: boolean;
  rotulo?: string; rotuladoPor?: string; descritoPor?: string;
}) {
  return (
    <button id={id} type="button" role="switch" aria-checked={ligado} disabled={desativado}
      aria-label={rotulo} aria-labelledby={rotuladoPor} aria-describedby={descritoPor}
      className="lte-chave" onClick={() => onChange(!ligado)}>
      <span className="lte-chave-bola" aria-hidden />
    </button>
  );
}

// ── Segmentado ───────────────────────────────────────────────────────────────
// Grupo de rádio de verdade: setas trocam, e só a opção marcada entra no Tab.
export function Segmentado<T extends string>({ valor, onChange, opcoes, rotulo }: {
  valor: T; onChange: (v: T) => void; opcoes: { v: T; l: string }[]; rotulo: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const aoTeclar = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = Math.max(0, opcoes.findIndex((o) => o.v === valor));
    const j = (i + d + opcoes.length) % opcoes.length;
    onChange(opcoes[j].v);
    ref.current?.querySelectorAll<HTMLButtonElement>("button")[j]?.focus();
  };
  return (
    <div ref={ref} className="lte-seg" role="radiogroup" aria-label={rotulo} onKeyDown={aoTeclar}>
      {opcoes.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={o.v === valor} tabIndex={o.v === valor ? 0 : -1}
          className="lte-seg-op" onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}
export const TAMANHOS: { v: "sm" | "md" | "lg"; l: string }[] = [{ v: "sm", l: "Pequeno" }, { v: "md", l: "Médio" }, { v: "lg", l: "Grande" }];

// ── Cor ──────────────────────────────────────────────────────────────────────
// Hex digitável ao lado da amostra: a cor da marca chega como "#7C3AED" no
// manual, e o seletor nativo não aceita colar. Enquanto se digita, só um hex
// COMPLETO de 6 dígitos vale — aceitar "#abc" no meio de "#abcdef" trocaria o
// texto debaixo do dedo. A forma curta vale ao sair do campo.
export function LinhaCor({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  const id = useId();
  const [texto, setTexto] = useState(valor);
  useEffect(() => {
    setTexto((t) => (hexValido(t) === (hexValido(valor) ?? valor) ? t : valor));
  }, [valor]);
  return (
    <div className="lte-linha lte-linha-cor">
      <label htmlFor={id} className="lte-linha-txt"><span className="lte-linha-rot">{rotulo}</span></label>
      <input id={id} className="lte-hex" value={texto} spellCheck={false} maxLength={7} autoComplete="off"
        aria-label={`${rotulo}, cor em hexadecimal`}
        onChange={(e) => {
          setTexto(e.target.value);
          if (/^#?[0-9a-f]{6}$/i.test(e.target.value.trim())) onChange(hexValido(e.target.value)!);
        }}
        onBlur={() => { const h = hexValido(texto); if (h) { setTexto(h); if (h !== valor.toLowerCase()) onChange(h); } else setTexto(valor); }} />
      <CampoCor rotulo={`Escolher ${rotulo.toLowerCase()} na paleta`} valor={hexValido(valor) ?? "#000000"} aoMudar={(v) => { setTexto(v); onChange(v); }} />
    </div>
  );
}

// ── Sanfona e aviso ──────────────────────────────────────────────────────────
// O degrau de baixo: o que quase ninguém mexe mora fechado, com o título à
// vista dizendo o que tem dentro. Receita `t-acc` da fundação.
export function Sanfona({ titulo, resumo, icone, inicialAberta = false, children }: {
  titulo: string; resumo?: string; icone?: string; inicialAberta?: boolean; children: ReactNode;
}) {
  const [aberta, setAberta] = useState(inicialAberta);
  return (
    <div className="lte-sanfona t-acc" data-open={aberta ? "true" : "false"}>
      <button type="button" className="lte-linha lte-linha-nav t-acc-head" aria-expanded={aberta} onClick={() => setAberta((v) => !v)}>
        {icone && <span className="lte-linha-ico" aria-hidden><Icon name={icone} size={17} /></span>}
        <span className="lte-linha-txt">
          <span className="lte-linha-rot">{titulo}</span>
          {resumo && <span className="lte-linha-dica">{resumo}</span>}
        </span>
        <span className="t-acc-chevron lte-linha-seta" aria-hidden><Icon name="chevron-down" size={16} /></span>
      </button>
      <div className="t-acc-panel" inert={!aberta}><div className="t-acc-panel-inner"><div className="lte-sanfona-corpo">{children}</div></div></div>
    </div>
  );
}

export function Aviso({ tom = "info", icone, children }: { tom?: "info" | "atencao" | "perigo" | "ok"; icone?: string; children: ReactNode }) {
  const ic = icone ?? (tom === "ok" ? "circle-check" : tom === "info" ? "info-circle" : "alert-triangle");
  return (
    <div className="lte-aviso" data-tom={tom} role={tom === "perigo" ? "alert" : undefined}>
      <Icon name={ic} size={16} />
      <div>{children}</div>
    </div>
  );
}

// ── Mídia ────────────────────────────────────────────────────────────────────
// A página pública tem que abrir RÁPIDO, e foto de celular vem com 4–8 MB.
// Comprime AQUI, antes de subir: 1200 px no lado maior (o cartão mais largo
// mede ~560 px, 1120 numa tela 2x), WebP q0.82 — vira ~100–300 KB sem perda
// visível. Se o navegador não souber (ou sair maior), sobe o original.
async function comprimirImagem(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.type === "image/gif" || f.type === "image/svg+xml") return f;
  try {
    const bmp = await createImageBitmap(f);
    const escala = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * escala));
    c.height = Math.max(1, Math.round(bmp.height * escala));
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.82));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch { return f; }
}

// Foto (já comprimida) é pequena e vai pela /api/upload. GIF e vídeo vão
// DIRETO pro Storage por URL assinada: pela função da Vercel o corpo é cortado
// em ~4,5 MB. A regra de formato/tamanho é a mesma do servidor
// (`classificarMidiaLT`): recusar aqui poupa a espera, recusar lá é o que vale.
async function enviarMidia(f: File): Promise<string> {
  const c = classificarMidiaLT(f.type, f.size);
  if (!c.ok) throw new Error(c.erro);
  if (c.tipo === "imagem") {
    const fd = new FormData(); fd.append("file", f); fd.append("bucket", "photos");
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || "Falha no envio da foto.");
    return d.url as string;
  }
  const r = await fetch("/api/tridiflow/upload-url", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime: f.type, tamanho: f.size }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.signedUrl) throw new Error(d.error || "Não deu pra preparar o envio.");
  const up = await fetch(d.signedUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
  if (!up.ok) throw new Error(`O envio parou no meio (${up.status}). Tente de novo.`);
  return d.publicUrl as string;
}

/** Capa tirada do próprio vídeo. O cartão só baixa o vídeo quando aparece na
 *  tela, então até lá o que se vê É a capa — sem ela, um retângulo preto. */
async function capaDoVideo(f: File): Promise<File | null> {
  const url = URL.createObjectURL(f);
  const v = document.createElement("video");
  const prazo = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, n) => setTimeout(() => n(new Error("prazo")), 8000))]);
  try {
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    await prazo(new Promise<void>((ok, erro) => { v.onloadeddata = () => ok(); v.onerror = () => erro(new Error("video")); }));
    v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
    await prazo(new Promise<void>((ok) => { v.onseeked = () => ok(); }));
    const escala = Math.min(1, 1200 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(v.videoWidth * escala));
    c.height = Math.max(1, Math.round(v.videoHeight * escala));
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.8));
    return blob ? new File([blob], "capa.webp", { type: "image/webp" }) : null;
  } catch { return null; } finally { v.removeAttribute("src"); URL.revokeObjectURL(url); }
}

function Miniatura({ url, redonda, icone }: { url?: string; redonda?: boolean; icone: string }) {
  return url
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de URL enviada/colada pelo usuário
    ? <img src={url} alt="" className="lte-mini" data-redonda={redonda ? "1" : undefined} />
    : <span className="lte-mini lte-mini-vazia" data-redonda={redonda ? "1" : undefined}><Icon name={icone} size={20} /></span>;
}

/** Imagem: enviar do aparelho OU colar o link — as duas formas, lado a lado. */
export function EntradaImagem({ url, onChange, redonda, rotulo = "Enviar imagem", idCampo }: {
  url?: string; onChange: (u: string) => void; redonda?: boolean; rotulo?: string; idCampo?: string;
}) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  async function pick(cru: File | null) {
    if (!cru) return;
    setBusy(true);
    try { onChange(await enviarMidia(await comprimirImagem(cru))); }
    catch (e) { toast.erro((e as Error).message || "Sem conexão."); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  return (
    <div className="lte-midia">
      <Miniatura url={url} redonda={redonda} icone="photo" />
      <div className="lte-midia-col">
        <div className="lte-midia-acoes">
          {/* Sem SVG de propósito: SVG é documento, carrega script. */}
          <input ref={ref} type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif,image/gif" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <Botao tamanho="sm" icone="upload" carregando={busy} onClick={() => ref.current?.click()}>{busy ? "Enviando…" : rotulo}</Botao>
          {url && <BotaoIcone tamanho="sm" icone="x" titulo="Tirar a imagem" onClick={() => onChange("")} />}
        </div>
        <input id={idCampo} className="lte-input" value={url ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="ou cole o link da imagem" inputMode="url" />
      </div>
    </div>
  );
}

/** Vídeo do cartão: sobe o MP4 e, junto, a capa tirada do primeiro quadro. */
export function EntradaVideo({ url, capa, onChange }: {
  url: string; capa?: string; onChange: (p: { mediaUrl?: string; thumbUrl?: string }) => void;
}) {
  const [busy, setBusy] = useState<"" | "video" | "capa">("");
  const ref = useRef<HTMLInputElement>(null);
  async function pick(f: File | null) {
    if (!f) return;
    const c = classificarMidiaLT(f.type, f.size);
    if (!c.ok) { toast.erro(c.erro); if (ref.current) ref.current.value = ""; return; }
    setBusy("video");
    try {
      const [mediaUrl, quadro] = await Promise.all([enviarMidia(f), capaDoVideo(f)]);
      onChange({ mediaUrl });
      if (quadro) {
        setBusy("capa");
        try { onChange({ mediaUrl, thumbUrl: await enviarMidia(quadro) }); } catch { /* sem capa: o vídeo continua valendo */ }
      }
      toast.ok("Vídeo enviado.");
    } catch (e) { toast.erro((e as Error).message || "Sem conexão."); }
    finally { setBusy(""); if (ref.current) ref.current.value = ""; }
  }
  return (
    <div className="lte-midia">
      <Miniatura url={capa} icone="video" />
      <div className="lte-midia-col">
        <div className="lte-midia-acoes">
          <input ref={ref} type="file" hidden accept="video/mp4,video/webm" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <Botao tamanho="sm" icone="upload" carregando={!!busy} onClick={() => ref.current?.click()}>
            {busy === "video" ? "Enviando vídeo…" : busy === "capa" ? "Gerando capa…" : "Enviar vídeo (MP4)"}
          </Botao>
        </div>
        <input className="lte-input" value={url} onChange={(e) => onChange({ mediaUrl: e.target.value })} placeholder="ou cole o link do MP4" inputMode="url" />
      </div>
    </div>
  );
}
