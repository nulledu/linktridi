"use client";

// TridiFlow — runtime do chat (compartilhado: preview do editor + player público).
// ISOLADO do editor de propósito: nada de React Flow/zustand aqui — o player
// precisa ser leve. Simula conversa humana: "digitando…", delays, balões em
// sequência, resposta do usuário à direita, auto-scroll.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent, type InputHTMLAttributes } from "react";
import { Caixa } from "../(plataforma)/ui/controles";
import {
  avaliarCondicao, destinoDe, grupoInicial, interpolar, linkWhatsApp, uid,
  type Block, type BotSettings, type Fluxo, type Story, type StoryCTA, type Theme, type Vars,
} from "@/lib/tridiflow";

interface Msg {
  id: string; de: "bot" | "user";
  tipo: "texto" | "imagem" | "video" | "audio" | "embed" | "acao" | "social" | "contador" | "cupom";
  altura?: number;            // embed
  texto?: string; url?: string; label?: string;
  itens?: string[];           // prova social
  segundos?: number;          // contador
  codigo?: string;            // cupom
  mudo?: boolean;             // video
  blocoId?: string; grupoId?: string;   // origem (p/ clicar-e-editar no preview)
}

// "Chrome" do chat por app — cabeçalho + balões no estilo de cada mensageiro.
// Usa só cores de marca (fatos) e o formato da UI (layout/balões); nada de
// logos ou papel de parede proprietário.
const IG_GRAD = "linear-gradient(120deg,#F58529,#DD2A7B,#8134AF,#515BD4)";
// Grão sutil (feTurbulence) — textura estilo Apple, quase imperceptível.
const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
interface ChromeChat {
  tail: boolean;            // balão com "rabinho" (WhatsApp/iMessage) vs pílula
  gradUser?: string;        // fundo do balão do usuário (degradê IG)
  ticks: boolean; ticksCor: string;   // ✓✓ (WhatsApp)
  hora?: boolean;           // mostra horário dentro do balão (só WhatsApp)
  sub: string;              // status/subtítulo no cabeçalho
  ring?: string;            // anel degradê no avatar (IG)
  verified?: boolean;       // selo verificado ao lado do nome (IG)
  callVideo?: boolean;      // ícones telefone + vídeo à direita
  actions?: boolean;        // ícones bandeira + reticências (TikTok)
  botAvatar?: boolean;      // avatarzinho ao lado do balão do bot (Messenger/TikTok)
}
function chromeDoPreset(preset: string): ChromeChat {
  switch (preset) {
    case "whatsapp": return { tail: true, ticks: true, ticksCor: "#53BDEB", hora: true, sub: "online", callVideo: true };
    case "imessage": return { tail: true, ticks: false, ticksCor: "", sub: "" , callVideo: true };
    case "instagram": return { tail: false, gradUser: IG_GRAD, ticks: false, ticksCor: "", sub: "", ring: IG_GRAD, verified: true, callVideo: true };
    case "messenger": return { tail: false, ticks: false, ticksCor: "", sub: "Ativo(a) agora", callVideo: true, botAvatar: true };
    case "tiktok": return { tail: false, ticks: false, ticksCor: "", sub: "", actions: true, botAvatar: true };
    default: return { tail: true, ticks: false, ticksCor: "", sub: "online" };
  }
}

// Markdown leve dentro do balão: **negrito**, __negrito__ e *itálico*.
// Quebras de linha (\n) já saem pelo white-space: pre-wrap do container.
function fmtTexto(texto: string): ReactNode {
  // link [rótulo](url) · **negrito**/__negrito__ · ++sublinhado++ · *itálico*
  const re = /\[([^\]\n]+)\]\(([^)\s]+)\)|(\*\*|__)([\s\S]+?)\3|\+\+([\s\S]+?)\+\+|\*([\s\S]+?)\*/g;
  const out: ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > last) out.push(texto.slice(last, m.index));
    if (m[2] != null) out.push(<a key={k++} href={m[2]} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{m[1]}</a>);
    else if (m[4] != null) out.push(<strong key={k++}>{m[4]}</strong>);
    else if (m[5] != null) out.push(<u key={k++}>{m[5]}</u>);
    else out.push(<em key={k++}>{m[6]}</em>);
    last = re.lastIndex;
  }
  if (last < texto.length) out.push(texto.slice(last));
  return out;
}
// Limpa o texto do balão SEM tirar o controle do autor: colapsa espaços/tabs,
// remove espaços colados às quebras (mata o " palavra" solto) e limita a no
// máximo uma linha em branco. As quebras que VOCÊ digita são respeitadas
// (renderizadas com white-space: pre-line) — você controla onde quebra.
function limparTexto(t: string): string {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Entrada de dados: máscara + validação amigável (telefone/e-mail/número) ──
const soDigitos = (v: string) => v.replace(/\D/g, "");
// Telefone BR: (XX) XXXXX-XXXX (celular) ou (XX) XXXX-XXXX (fixo), formatando
// enquanto digita — sem exigir que o usuário digite parênteses/traço.
function formatarTelefoneBR(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2), num = d.slice(2);
  const corte = num.length > 8 || num.charAt(0) === "9" ? 5 : 4;   // celular (9 díg.) vs fixo (8)
  return num.length <= corte ? `(${ddd}) ${num}` : `(${ddd}) ${num.slice(0, corte)}-${num.slice(corte)}`;
}
const telefoneValido = (v: string) => { const n = soDigitos(v).length; return n === 10 || n === 11; };
const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const numeroValido = (v: string) => { const t = v.trim().replace(/\./g, "").replace(",", "."); return t !== "" && Number.isFinite(Number(t)); };
// Correção de typo no domínio do e-mail (gmial.com → gmail.com): sugere o
// domínio conhecido mais próximo (distância de edição ≤ 2).
const DOMINIOS_COMUNS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "icloud.com", "live.com", "hotmail.com.br", "bol.com.br", "uol.com.br", "terra.com.br", "globo.com"];
function distanciaEdicao(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
function sugerirEmail(v: string): string | null {
  const email = v.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const dom = email.slice(at + 1);
  if (dom.length < 4 || DOMINIOS_COMUNS.includes(dom)) return null;
  let melhor: string | null = null, menor = 3;
  for (const d of DOMINIOS_COMUNS) { const dist = distanciaEdicao(dom, d); if (dist < menor) { menor = dist; melhor = d; } }
  return melhor && menor > 0 && menor <= 2 ? email.slice(0, at + 1) + melhor : null;
}
// Glifos do cabeçalho (ícones de UI genéricos: voltar/ligar/vídeo/bandeira/…).
const GL: Record<string, string> = {
  back: '<path d="M15 6l-6 6l6 6" />',
  "arrow-left": '<path d="M5 12l14 0" /><path d="M5 12l6 6" /><path d="M5 12l6 -6" />',
  phone: '<path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />',
  video: '<path d="M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4z" /><path d="M3 6m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" />',
  flag: '<path d="M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9z" /><path d="M5 21v-7" />',
  dots: '<path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />',
  search: '<path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" />',
  info: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 8h.01" /><path d="M11 12h1v4h1" />',
  menu: '<path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" />',
  cart: '<path d="M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M17 17h-11v-14h-2" /><path d="M6 5l14 1l-1 7h-13" />',
  heart: '<path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.572a5 5 0 1 1 7.5 6.572" />',
  bell: '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" />',
  user: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />',
  share: '<path d="M6 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M18 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M8.7 10.7l6.6 -3.4" /><path d="M8.7 13.3l6.6 3.4" />',
  x: '<path d="M18 6l-12 12" /><path d="M6 6l12 12" />',
};
function Gl({ p, size = 21, color = "currentColor" }: { p: string; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} dangerouslySetInnerHTML={{ __html: p }} />;
}

// Botão de escolha estilo CTA: elevação (sombra colorida), seta de progresso,
// entrada com slide+scale, brilho passando uma vez e ripple ao tocar.
function BotaoCTA({ label, onClick, bg, fg, idx = 0 }: { label: string; onClick: () => void; bg: string; fg: string; idx?: number }) {
  const ripple = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    const s = document.createElement("span");
    s.style.cssText = `position:absolute;border-radius:50%;pointer-events:none;transform:scale(0);width:${d}px;height:${d}px;left:${e.clientX - rect.left - d / 2}px;top:${e.clientY - rect.top - d / 2}px;background:rgba(255,255,255,.4);animation:tfRipple .6s ease-out`;
    btn.appendChild(s);
    setTimeout(() => s.remove(), 600);
  };
  return (
    <button className="tf-choice" onClick={(e) => { ripple(e); if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8); onClick(); }}
      style={{
        position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        background: bg, color: fg, border: "none", borderRadius: 18, padding: "17px 22px", fontSize: 17.5, fontWeight: 800, cursor: "pointer", textAlign: "left",
        boxShadow: `0 10px 24px -8px color-mix(in srgb, ${bg} 78%, transparent), 0 2px 6px rgba(0,0,0,.18)`,
        animation: `tfCta .34s cubic-bezier(.2,.75,.3,1.15) ${idx * 0.06}s both, tfBreath 3.6s ease-in-out ${0.8 + idx * 0.06}s infinite`,
      }}>
      <span style={{ minWidth: 0, overflowWrap: "break-word" }}>{label}</span>
      <Gl p='<path d="M9 6l6 6l-6 6" />' size={19} color={fg} />
      <span aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "45%", pointerEvents: "none", background: "linear-gradient(100deg, transparent, rgba(255,255,255,.35), transparent)", transform: "translateX(-130%) skewX(-18deg)", animation: `tfShineLoop 4.4s ease-out ${0.35 + idx * 0.06}s infinite` }} />
    </button>
  );
}
// Avatar do cabeçalho (foto do bot ou inicial do nome). Anel degradê opcional.
function AvatarHeader({ nome, foto, ring }: { nome: string; foto?: string; ring?: string }) {
  const inner = foto
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={foto} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", display: "block" }} />
    : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--neutro)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 17, color: "#fff" }}>{(nome || "B").charAt(0).toUpperCase()}</div>;
  if (!ring) return <div style={{ flex: "none" }}>{inner}</div>;
  return <div style={{ flex: "none", padding: 2, borderRadius: "50%", background: ring }}><div style={{ padding: 2, borderRadius: "50%", background: "#fff" }}>{inner}</div></div>;
}
// Avatar pequeno ao lado do balão (Messenger/TikTok).
function AvatarMini({ nome, foto }: { nome: string; foto?: string }) {
  if (foto) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={foto} alt="" style={{ width: 33, height: 33, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
  );
  return <div style={{ width: 33, height: 33, borderRadius: "50%", background: "var(--neutro)", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, color: "#fff", flex: "none" }}>{(nome || "B").charAt(0).toUpperCase()}</div>;
}
// Bolha de vídeo: embed do YouTube/Vimeo ou <video> direto.
function VideoBolha({ url, mudo }: { url: string; mudo?: boolean }) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  const embed = yt ? `https://www.youtube.com/embed/${yt[1]}${mudo ? "?mute=1" : ""}` : vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
  return (
    <div style={{ width: 260, maxWidth: "100%", borderRadius: 14, overflow: "hidden", aspectRatio: "16/9", background: "#000", border: "1px solid rgba(130,130,150,.35)", boxShadow: "0 1px 3px rgba(0,0,0,.14)", animation: "tfIn .22s ease both" }}>
      {embed
        ? <iframe src={embed} style={{ width: "100%", height: "100%", border: "none" }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        : <video src={url} controls muted={mudo} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    </div>
  );
}
function SeloVerificado({ cor = "#3897F0" }: { cor?: string }) {
  return (
    <span style={{ width: 14, height: 14, borderRadius: "50%", background: cor, display: "grid", placeItems: "center", flex: "none" }}>
      <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5l9 -9" /></svg>
    </span>
  );
}

// ── Visualizador de Stories (tela cheia sobre o chat) ───────────────────────
function StoriesViewer({ stories, nome, foto, corBotao, corTextoBotao, modoPreview, onClose, onCta }: {
  stories: Story[]; nome: string; foto?: string; corBotao: string; corTextoBotao: string; modoPreview?: boolean;
  onClose: () => void; onCta: (cta: StoryCTA) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [prog, setProg] = useState(0);
  const story = stories[idx];
  const dur = Math.max(1500, story?.duracaoMs ?? 5000);
  const pausadoRef = useRef(false); pausadoRef.current = pausado;
  const downAt = useRef(0);

  const avancar = useCallback(() => { setIdx((i) => { if (i < stories.length - 1) return i + 1; onClose(); return i; }); }, [stories.length, onClose]);
  const voltar = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const avancarRef = useRef(avancar); avancarRef.current = avancar;

  // Progresso por tempo (imagem/texto). Vídeo avança no onEnded/onTimeUpdate.
  useEffect(() => {
    setProg(0);
    if (!story || story.tipo === "video") return;
    let raf = 0, acc = 0, last = performance.now();
    const tick = (t: number) => {
      const dt = t - last; last = t;
      if (!pausadoRef.current) {
        acc += dt; const p = Math.min(1, acc / dur); setProg(p);
        if (p >= 1) { avancarRef.current(); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idx, story, dur]);

  // Teclado (desktop): ← → Esc Espaço Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") avancar();
      else if (e.key === "ArrowLeft") voltar();
      else if (e.key === "Escape") onClose();
      else if (e.key === " ") { e.preventDefault(); setPausado((p) => !p); }
      else if (e.key === "Enter" && story?.cta) onCta(story.cta);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [avancar, voltar, onClose, onCta, story]);

  if (!story) return null;
  const bg = story.cor || corBotao;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "#000", display: "flex", flexDirection: "column", animation: "tfIn .2s ease both", overflow: "hidden" }}>
      {/* barras de progresso */}
      <div style={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 3, display: "flex", gap: 4 }}>
        {stories.map((s, i) => (
          <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,.35)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${i < idx ? 100 : i === idx ? prog * 100 : 0}%`, background: "#fff", borderRadius: 2 }} />
          </div>
        ))}
      </div>
      {/* cabeçalho */}
      <div style={{ position: "absolute", top: 18, left: 10, right: 10, zIndex: 3, display: "flex", alignItems: "center", gap: 9 }}>
        <AvatarMini nome={nome} foto={foto} />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>{nome || "Atendimento"}</span>
        <button onClick={onClose} aria-label="Fechar" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
          <Gl p={GL.x} size={26} color="#fff" />
        </button>
      </div>

      {/* conteúdo */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: story.tipo === "texto" ? bg : "#000" }}>
        {story.tipo === "imagem" && story.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {story.tipo === "video" && story.url && (
          <video src={story.url} autoPlay muted playsInline onEnded={avancar}
            onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProg(v.currentTime / v.duration); }}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {story.tipo === "texto" && (
          <div style={{ padding: 28, textAlign: "center" }}>
            {story.titulo && <div style={{ color: corTextoBotao, fontSize: 26, fontWeight: 800, lineHeight: 1.25, textShadow: "0 1px 4px rgba(0,0,0,.25)" }}>{fmtTexto(story.titulo)}</div>}
          </div>
        )}
      </div>

      {/* legendas (imagem/vídeo) */}
      {story.tipo !== "texto" && (story.titulo || story.descricao) && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: story.cta ? 92 : 24, zIndex: 3, padding: "40px 18px 8px", background: "linear-gradient(transparent, rgba(0,0,0,.55))", pointerEvents: "none" }}>
          {story.titulo && <div style={{ color: "#fff", fontSize: 19, fontWeight: 800, lineHeight: 1.25 }}>{fmtTexto(story.titulo)}</div>}
          {story.descricao && <div style={{ color: "#fff", fontSize: 14.5, opacity: 0.92, marginTop: 4, lineHeight: 1.4 }}>{fmtTexto(story.descricao)}</div>}
        </div>
      )}
      {story.tipo === "texto" && story.descricao && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: story.cta ? 96 : 34, zIndex: 3, padding: "0 28px", textAlign: "center", color: corTextoBotao, opacity: 0.92, fontSize: 16, lineHeight: 1.45, pointerEvents: "none" }}>{fmtTexto(story.descricao)}</div>
      )}

      {/* CTA */}
      {story.cta && story.cta.label && (
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 20, zIndex: 4 }}>
          <button onClick={() => onCta(story.cta!)}
            style={{ width: "100%", background: "#fff", color: "#111", border: "none", borderRadius: 14, padding: "14px 18px", fontSize: 16, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 18px -6px rgba(0,0,0,.5)" }}>
            {story.cta.label} <Gl p='<path d="M9 6l6 6l-6 6" />' size={18} color="#111" />
          </button>
        </div>
      )}

      {/* zonas de toque (voltar / avançar) — abaixo do CTA/fechar no z-index */}
      <div
        onPointerDown={() => { downAt.current = Date.now(); setPausado(true); }}
        onPointerUp={(e) => {
          setPausado(false);
          if (Date.now() - downAt.current > 250) return;   // segurar = só pausa
          const x = e.clientX; const r = e.currentTarget.getBoundingClientRect();
          if (x - r.left < r.width * 0.32) voltar(); else avancar();
        }}
        onPointerLeave={() => setPausado(false)}
        style={{ position: "absolute", inset: 0, zIndex: 2 }}
      />
      {modoPreview && <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "rgba(255,255,255,.5)", zIndex: 3 }}>preview</div>}
    </div>
  );
}

interface Props {
  fluxo: Fluxo; theme: Theme; settings: BotSettings;
  customCss?: string;                    // CSS do usuário (alvos: classes .tf-*)
  modoPreview?: boolean;                 // preview: não navega/abre links de verdade
  altura?: number | string;
  varsIniciais?: Vars;                   // UTMs do anúncio viram {{utm_source}} etc.
  aoResponder?: (vars: Vars, grupoId: string) => void;
  aoConcluir?: (vars: Vars) => void;
  aoEvento?: (evento: string, plataformas: string[], valor?: string) => void;   // marcador de pixel
  reinicioKey?: number;
  resumeKey?: string;                    // id do bot p/ salvar progresso (só player); ausente = não persiste
  onSelecionarBloco?: (grupoId: string, blocoId: string) => void;   // clicar-e-editar (só preview do editor)
  onEditarTexto?: (grupoId: string, blocoId: string, texto: string) => void;   // editar a bolha inline (só preview do editor)
  // Editor inline injetado pelo editor (mantém o player público leve, sem importar Icon/RichText).
  renderEditorInline?: (a: { value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void }) => ReactNode;
}

export function ChatRuntime({ fluxo, theme, settings, customCss, modoPreview = false, altura = "100dvh", varsIniciais, aoResponder, aoConcluir, aoEvento, reinicioKey = 0, resumeKey, onSelecionarBloco, onEditarTexto, renderEditorInline }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);   // bolha em edição inline (preview)
  const [typing, setTyping] = useState(false);
  const [inputBlock, setInputBlock] = useState<Block | null>(null);
  const [texto, setTexto] = useState("");
  const [tocado, setTocado] = useState(false);   // usuário já saiu do campo? (mostra erro só depois)
  const [aceiteLgpd, setAceiteLgpd] = useState(false);
  const [fim, setFim] = useState(false);
  const [resume, setResume] = useState<{ grupoId: string; vars: Vars } | null>(null);
  const [storiesAberto, setStoriesAberto] = useState(false);
  const [storiesVistos, setStoriesVistos] = useState(false);
  const vars = useRef<Vars>({});
  const rodando = useRef(0);
  const grupoVisitados = useRef<Set<string>>(new Set());   // anti-loop: grupos auto-entrados desde a última resposta
  const scrollRef = useRef<HTMLDivElement>(null);
  const est = chromeDoPreset(theme.preset);
  // Localiza o bloco de origem de uma bolha (pra editar o texto CRU, não o interpolado).
  const acharBloco = useCallback((gid?: string, bid?: string): Block | null => {
    if (!bid) return null;
    for (const g of fluxo.groups) { if (gid && g.id !== gid) continue; const b = g.blocks.find((x) => x.id === bid); if (b) return b; }
    for (const g of fluxo.groups) { const b = g.blocks.find((x) => x.id === bid); if (b) return b; }
    return null;
  }, [fluxo]);
  // Clicar-e-editar (só preview do editor): bolha de texto edita INLINE; mídia/
  // inputs abrem o painel lateral (precisam de URL/opções).
  const podeEditar = modoPreview && !!onSelecionarBloco;
  const podeInline = modoPreview && !!renderEditorInline && !!onEditarTexto;
  const iniciarEdicao = (m: Msg) => { const b = acharBloco(m.grupoId, m.blocoId); setEditando({ id: m.id, texto: b?.text ?? m.texto ?? "" }); };
  const clickProps = (m: Msg) => {
    if (!podeEditar || !m.blocoId || !m.grupoId) return {};
    if (podeInline && m.tipo === "texto") { if (editando?.id === m.id) return {}; return { className: "tf-editavel", title: "Clique para editar", onClick: (e: ReactMouseEvent) => { e.stopPropagation(); iniciarEdicao(m); } }; }
    return { className: "tf-editavel", title: "Editar este bloco", onClick: (e: ReactMouseEvent) => { e.stopPropagation(); onSelecionarBloco!(m.grupoId!, m.blocoId!); } };
  };

  // Retomar de onde parou (checkpoint): salva {grupo, vars} no localStorage a
  // cada grupo; expira em 7 dias. Só no player (não no preview).
  const storeKey = resumeKey ? `tf-resume-${resumeKey}` : "";
  const persistir = !modoPreview && !!settings.retomar && !!storeKey;
  const persistRef = useRef({ on: false, key: "" });
  persistRef.current = { on: persistir, key: storeKey };
  const limparResume = () => { if (storeKey) { try { localStorage.removeItem(storeKey); } catch { /* ignora */ } } };
  const lerResume = (): { grupoId: string; vars: Vars } | null => {
    if (!persistir) return null;
    try {
      const raw = localStorage.getItem(storeKey); if (!raw) return null;
      const d = JSON.parse(raw) as { grupoId: string; vars?: Vars; ts?: number };
      if (!d?.grupoId || Date.now() - (d.ts ?? 0) > 7 * 864e5) return null;
      const g0 = grupoInicial(fluxo);
      if (!fluxo.groups.some((x) => x.id === d.grupoId) || d.grupoId === g0?.id) return null;
      return { grupoId: d.grupoId, vars: d.vars ?? {} };
    } catch { return null; }
  };
  const hora = useRef(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })).current;

  // Rolagem "gruda no fim" tipo WhatsApp. Problemas do jeito antigo (1 rAF +
  // smooth): a bolha nova ainda não tinha sido medida (scrollHeight velho) e a
  // mídia (imagem/vídeo/iframe) carregava DEPOIS, crescia e o scroll ficava pra
  // trás. Agora: rola pro fim numa bolha nova (double rAF pra medir certo) E um
  // observador segue o conteúdo enquanto ele cresce — mas só se a pessoa está
  // por baixo (se ela rolou pra cima pra reler, não puxa).
  const nearBottomRef = useRef(true);
  // O FURO que travava o chat na imagem: durante o scroll SUAVE, os eventos de
  // scroll da própria animação passavam pelo aoRolar, que media "longe do fim"
  // e concluía que a PESSOA tinha subido — desarmava o seguidor. A imagem
  // carregava logo depois, o conteúdo crescia e ninguém puxava mais pro fim.
  // `autoRolando` marca rolagem NOSSA em voo: os eventos dela não mudam a
  // intenção da pessoa; só gesto real (wheel/touch) desarma.
  const autoRolando = useRef(false);
  const scrollFim = () => {
    nearBottomRef.current = true; autoRolando.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }));
  };
  const aoRolar = () => {
    const el = scrollRef.current; if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (autoRolando.current) { if (dist < 4) autoRolando.current = false; return; }   // em voo: só espera chegar
    nearBottomRef.current = dist < 140;
  };
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    // Segue o fim quando o conteúdo cresce (bolha revela, mídia carrega, teclado
    // abre). Instantâneo p/ não brigar com o smooth do scrollFim.
    const seguir = () => {
      if ((nearBottomRef.current || autoRolando.current) && scrollRef.current)
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
    };
    // Gesto REAL da pessoa cancela a rolagem automática na hora — rolar pra
    // cima pra reler nunca fica brigando com o robô puxando pra baixo.
    const gesto = () => { autoRolando.current = false; };
    const mo = new MutationObserver(seguir);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(seguir); ro.observe(el); }
    el.addEventListener("load", seguir, true);   // img/vídeo/iframe terminou de carregar → cresceu
    el.addEventListener("wheel", gesto, { passive: true });
    el.addEventListener("touchstart", gesto, { passive: true });
    return () => {
      mo.disconnect(); ro?.disconnect();
      el.removeEventListener("load", seguir, true);
      el.removeEventListener("wheel", gesto); el.removeEventListener("touchstart", gesto);
    };
  }, []);
  const origemAtual = useRef<{ blocoId?: string; grupoId?: string }>({});   // bloco/grupo sendo processado (p/ clicar-e-editar)
  const add = (m: Omit<Msg, "id">) => { setMsgs((p) => [...p, { ...m, id: uid(), ...(m.de === "bot" ? origemAtual.current : {}) }]); scrollFim(); };
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const rodarGrupo = useCallback(async (grupoId: string, desde: number, run: number) => {
    const g = fluxo.groups.find((x) => x.id === grupoId);
    if (!g) { setFim(true); return; }
    if (desde === 0) {
      // Anti-loop: auto-rotear de volta a um grupo já visitado SEM resposta do
      // usuário no meio = loop (ex.: aresta do fim voltando pro início — "chega
      // no final e reinicia"). ENCERRA em vez de reiniciar pra sempre. O set zera
      // a cada resposta, então menus (que pedem input) continuam funcionando.
      if (grupoVisitados.current.has(grupoId)) { setFim(true); aoConcluir?.(vars.current); return; }
      grupoVisitados.current.add(grupoId);
      // Checkpoint: ao entrar num grupo (do começo), guarda o progresso.
      if (persistRef.current.on) {
        try { localStorage.setItem(persistRef.current.key, JSON.stringify({ grupoId, vars: vars.current, ts: Date.now() })); } catch { /* ignora */ }
      }
    }
    for (let i = desde; i < g.blocks.length; i++) {
      if (run !== rodando.current) return;
      const b = g.blocks[i];
      origemAtual.current = { blocoId: b.id, grupoId: g.id };
      const espera_input = b.type === "botoes" || b.type === "imagens" || b.type === "lgpd" || b.type === "data" || b.type === "avaliacao" || b.type === "localizacao" || b.type.startsWith("input_");
      const bolhaComTyping = b.type === "texto" || b.type === "imagem" || b.type === "video" || b.type === "audio" || b.type === "embed" || b.type === "prova_social" || b.type === "contador" || b.type === "cupom" || espera_input;

      if (bolhaComTyping) {
        const t = interpolar(b.text || "", vars.current);
        const dur = Math.min(settings.typingMsMax, Math.max(350, t.length * settings.typingMsPorChar));
        setTyping(true); scrollFim();
        await espera(dur);
        if (run !== rodando.current) return;
        setTyping(false);
        if (b.type === "imagem") { if (b.url) add({ de: "bot", tipo: "imagem", url: interpolar(b.url, vars.current) }); }
        else if (b.type === "video") { if (b.url) add({ de: "bot", tipo: "video", url: interpolar(b.url, vars.current), mudo: b.mudo }); }
        else if (b.type === "audio") { if (b.url) add({ de: "bot", tipo: "audio", url: interpolar(b.url, vars.current) }); }
        else if (b.type === "embed") { if (b.url) add({ de: "bot", tipo: "embed", url: interpolar(b.url, vars.current), altura: b.escala ?? 320 }); }
        else if (b.type === "prova_social") add({ de: "bot", tipo: "social", itens: (b.opcoes ?? []).map((o) => interpolar(o.label, vars.current)) });
        else if (b.type === "contador") { if (t) add({ de: "bot", tipo: "texto", texto: t }); add({ de: "bot", tipo: "contador", segundos: Math.max(5, b.segundos ?? 600) }); }
        else if (b.type === "cupom") { if (t) add({ de: "bot", tipo: "texto", texto: t }); add({ de: "bot", tipo: "cupom", codigo: interpolar(b.valor || "", vars.current) }); }
        else if (t) add({ de: "bot", tipo: "texto", texto: t });
        if (espera_input) { setAceiteLgpd(false); setInputBlock({ ...b }); return; }
        await espera(settings.delayEntreBolhas);
        continue;
      }

      if (b.type === "delay") { setTyping(true); scrollFim(); await espera(Math.max(0, b.delayMs ?? 0)); setTyping(false); continue; }
      if (b.type === "set_var") { if (b.variavel) vars.current[b.variavel] = interpolar(b.valor || "", vars.current); continue; }
      if (b.type === "evento") { aoEvento?.(b.evento || "Lead", b.plataformas ?? ["meta", "ga4", "tiktok", "pinterest"], b.valor); continue; }
      if (b.type === "webhook") {
        const url = interpolar(b.url || "", vars.current);
        if (url && !modoPreview) fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...vars.current }) }).catch(() => {});
        continue;
      }
      if (b.type === "ab") {
        const opts = b.opcoes ?? [];
        if (opts.length) {
          // Multivariante: sorteio ponderado pelos pesos (sem peso → uniforme).
          const pesos = opts.map((o) => Math.max(0, Number(o.peso) || 0));
          let total = pesos.reduce((a, c) => a + c, 0);
          if (total <= 0) { for (let i = 0; i < pesos.length; i++) pesos[i] = 1; total = pesos.length; }
          const alvo = Math.random() * total;
          let acc = 0, idx = opts.length - 1;
          for (let i = 0; i < opts.length; i++) { acc += pesos[i]; if (alvo < acc) { idx = i; break; } }
          const esc = opts[idx];
          vars.current["ab"] = esc.label || String.fromCharCode(65 + idx);
          // Fallback pro "out" do grupo se a variante sorteada não tem aresta
          // ligada — sem isso o A/B "bugava às vezes" (metade caía no vazio).
          const destino = destinoDe(fluxo, g.id, `opt:${esc.id}`) ?? destinoDe(fluxo, g.id, "out");
          if (destino) { void rodarGrupo(destino, 0, run); } else { setFim(true); aoConcluir?.(vars.current); }
          return;
        }
        // Legado (bots publicados antes da migração): A/B por b.valor.
        const pctA = Math.min(100, Math.max(0, Number(b.valor) || 50));
        const lado = Math.random() * 100 < pctA ? "a" : "b";
        vars.current["ab"] = lado.toUpperCase();
        const destino = destinoDe(fluxo, g.id, lado) ?? destinoDe(fluxo, g.id, lado === "a" ? "b" : "a") ?? destinoDe(fluxo, g.id, "out");
        if (destino) { void rodarGrupo(destino, 0, run); } else { setFim(true); aoConcluir?.(vars.current); }
        return;
      }
      if (b.type === "condicao") {
        const hit = (b.condicoes ?? []).find((c) => avaliarCondicao(c, vars.current));
        const destino = (hit ? destinoDe(fluxo, g.id, `cond:${hit.id}`) : destinoDe(fluxo, g.id, "else")) ?? destinoDe(fluxo, g.id, "out");
        if (destino) { void rodarGrupo(destino, 0, run); } else { setFim(true); aoConcluir?.(vars.current); }
        return;
      }
      if (b.type === "redirect") {
        const url = interpolar(b.url || "", vars.current);
        add({ de: "bot", tipo: "acao", url, label: modoPreview ? `→ redirecionaria para ${url}` : "Continuar →" });
        if (!modoPreview && url) { await espera(600); window.location.href = url; }
        setFim(true); aoConcluir?.(vars.current); return;
      }
      if (b.type === "whatsapp") {
        const url = linkWhatsApp(b.telefone || "", b.mensagem || "", vars.current);
        add({ de: "bot", tipo: "acao", url, label: "Chamar no WhatsApp" });
        setFim(true); aoConcluir?.(vars.current); return;
      }
    }
    const destino = destinoDe(fluxo, g.id, "out");
    if (destino) { void rodarGrupo(destino, 0, run); } else { setFim(true); aoConcluir?.(vars.current); }
  }, [fluxo, settings, modoPreview, aoConcluir, aoEvento]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Assinatura da ESTRUTURA do fluxo (ids/tipos/ordem de blocos + saídas + arestas).
  // O preview só reinicia quando a ESTRUTURA muda — editar texto/url/rótulo é
  // "conteúdo" e reflete ao vivo (ver efeito abaixo), sem replay da conversa.
  const estruturaSig = useMemo(() => JSON.stringify({
    g: fluxo.groups.map((g) => [g.id, g.blocks.map((b) => [b.id, b.type, (b.opcoes ?? []).map((o) => o.id).join(","), (b.condicoes ?? []).map((c) => c.id).join(",")])]),
    e: fluxo.edges.map((e) => `${e.from}|${e.fromHandle}>${e.to}`),
  }), [fluxo]);

  useEffect(() => {
    const run = ++rodando.current;
    vars.current = { ...(varsIniciais ?? {}) };
    grupoVisitados.current.clear();
    setMsgs([]); setInputBlock(null); setFim(false); setTexto(""); setAceiteLgpd(false); setResume(null); setEditando(null);
    const saved = lerResume();
    if (saved) { setResume(saved); return; }   // oferece continuar; só inicia após a escolha
    const g0 = grupoInicial(fluxo);
    if (g0) void rodarGrupo(g0.id, 0, run);
    else setFim(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reinicioKey, estruturaSig]);

  // Conteúdo (texto/url) editado reflete AO VIVO nas bolhas já mostradas e no
  // input atual — sem reiniciar a conversa. Só roda no preview do editor.
  useEffect(() => {
    if (!modoPreview) return;
    setMsgs((prev) => {
      let mudou = false;
      const next = prev.map((m) => {
        const b = acharBloco(m.grupoId, m.blocoId); if (!b) return m;
        if (m.tipo === "texto") { const t = interpolar(b.text || "", vars.current); if (t !== m.texto) { mudou = true; return { ...m, texto: t }; } }
        else if (m.tipo === "imagem" || m.tipo === "video" || m.tipo === "audio" || m.tipo === "embed") { const u = interpolar(b.url || "", vars.current); if (u !== m.url) { mudou = true; return { ...m, url: u }; } }
        return m;
      });
      return mudou ? next : prev;
    });
    setInputBlock((ib) => { if (!ib) return ib; const b = acharBloco(undefined, ib.id); return b ? { ...b } : ib; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluxo, modoPreview]);

  // Concluiu → não faz sentido "retomar" depois; limpa o checkpoint.
  useEffect(() => { if (fim) limparResume(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fim]);

  const continuarResume = () => {
    if (!resume) return;
    const run = ++rodando.current;
    vars.current = { ...resume.vars };
    grupoVisitados.current.clear();
    setResume(null);
    void rodarGrupo(resume.grupoId, 0, run);
  };
  const recomecarResume = () => {
    limparResume();
    const run = ++rodando.current;
    vars.current = { ...(varsIniciais ?? {}) };
    grupoVisitados.current.clear();
    setMsgs([]); setInputBlock(null); setFim(false); setResume(null);
    const g0 = grupoInicial(fluxo);
    if (g0) void rodarGrupo(g0.id, 0, run); else setFim(true);
  };

  // ── Stories (clicar no avatar) ──
  const stories = (settings.stories ?? []).filter((s) => (s.tipo === "texto" ? (s.titulo || s.descricao) : s.url));
  const temStories = stories.length > 0;
  const storiesKey = resumeKey ? `tf-stories-${resumeKey}` : "";
  const storiesSig = stories.map((s) => s.id).join(",");
  useEffect(() => {
    if (!temStories || !storiesKey || modoPreview) { setStoriesVistos(false); return; }
    try { setStoriesVistos(localStorage.getItem(storiesKey) === storiesSig); } catch { setStoriesVistos(false); }
  }, [storiesKey, storiesSig, temStories, modoPreview]);
  const fecharStories = () => {
    setStoriesAberto(false);
    if (storiesKey && !modoPreview) { try { localStorage.setItem(storiesKey, storiesSig); } catch { /* ignora */ } setStoriesVistos(true); }
  };
  const onStoryCta = (cta: StoryCTA) => {
    if (cta.acao === "abrir_link") { if (!modoPreview && cta.alvo) window.open(cta.alvo, "_blank", "noopener"); fecharStories(); return; }
    if (cta.acao === "ir_para_fluxo") {
      fecharStories();
      const alvo = cta.alvo && fluxo.groups.some((g) => g.id === cta.alvo) ? cta.alvo : null;
      if (alvo) { setResume(null); const run = ++rodando.current; setInputBlock(null); setFim(false); void rodarGrupo(alvo, 0, run); }
      return;
    }
    fecharStories();
  };

  function responder(valor: string, label?: string) {
    const b = inputBlock;
    if (!b) return;
    const g = fluxo.groups.find((x) => x.blocks.some((bl) => bl.id === b.id));
    if (!g) return;
    add({ de: "user", tipo: "texto", texto: label ?? valor });
    if (b.variavel) vars.current[b.variavel] = valor;
    aoResponder?.(vars.current, g.id);
    setInputBlock(null); setTexto("");
    grupoVisitados.current.clear();   // resposta do usuário → menus podem revisitar grupos
    const run = rodando.current;
    const idx = g.blocks.findIndex((bl) => bl.id === b.id);
    if (b.type === "botoes") {
      const opt = (b.opcoes ?? []).find((o) => o.label === label || o.id === valor);
      const destino = opt ? destinoDe(fluxo, g.id, `opt:${opt.id}`) : null;
      if (destino) { void rodarGrupo(destino, 0, run); return; }
    }
    void rodarGrupo(g.id, idx + 1, run);
  }

  function validoAgora(): string | null {
    const b = inputBlock; const v = texto.trim();
    if (!b || !v) return null;
    if (b.type === "input_email") return emailValido(v) ? v.toLowerCase() : null;
    if (b.type === "input_telefone") return telefoneValido(v) ? v : null;
    if (b.type === "input_numero") return numeroValido(v) ? v : null;
    return v;
  }

  const T = theme;
  const inputLivre = inputBlock && (inputBlock.type.startsWith("input_") || inputBlock.type === "data");
  // Cada novo campo começa "não tocado" (erro só aparece depois que sai do campo).
  useEffect(() => { setTocado(false); }, [inputBlock?.id]);

  // Config efetiva do cabeçalho: começa do preset (est) e aplica overrides do tema.
  const h = T.header ?? {};
  const corIco = h.corIcones || T.corTextoHeader;
  const mostrarVoltar = h.voltar !== false;
  const glyphVoltar = GL[h.iconeVoltar || "back"] || GL.back;
  const statusTxt = h.status !== undefined ? h.status : est.sub;
  const temVerificado = h.verificado !== undefined ? h.verificado : !!est.verified;
  const corVerificado = h.corVerificado || "#3897F0";
  const temHalo = h.halo !== undefined ? h.halo : !!est.ring;
  const corHalo = temHalo ? (h.corHalo === "ig" ? IG_GRAD : (h.corHalo || est.ring || IG_GRAD)) : undefined;
  const [dBtn1, dBtn2] = est.callVideo ? ["phone", "video"] : est.actions ? ["flag", "dots"] : ["", ""];
  const btn1 = h.btn1 !== undefined ? h.btn1 : dBtn1;
  const btn2 = h.btn2 !== undefined ? h.btn2 : dBtn2;
  const avatarBolha = h.avatarBolha !== undefined ? h.avatarBolha : !!est.botAvatar;
  // Teto do balão à la WhatsApp: % no mobile, mas com limite em px no desktop
  // (mantém a linha curta e legível em telas grandes). Com avatar ao lado sobra
  // mais um pouco pra compensar os ~41px do avatar.
  const MAXW_BOLHA = "min(84%, 560px)";
  const MAXW_BOLHA_AV = "min(90%, 600px)";
  // Coluna de conversa centralizada em telas grandes (o WhatsApp Web também
  // limita a largura do painel). No mobile o padding cai pro mínimo.
  const padColuna = (v: number) => `${v}px max(${v}px, calc((100% - 760px) / 2))`;
  // Envolve mídia/CTA do BOT no MESMO layout dos balões (recuo do avatar quando
  // ativo), pra imagens/vídeos ficarem ALINHADOS com as bolhas de texto.
  const envolverBot = (node: ReactNode, m: Msg, i: number) => {
    if (avatarBolha && m.de === "bot") {
      const ultimoDoBot = (i === msgs.length - 1 && !typing) || msgs[i + 1]?.de === "user";
      return (
        <div key={m.id} style={{ display: "flex", alignItems: "flex-end", gap: 8, alignSelf: "flex-start", maxWidth: MAXW_BOLHA_AV }}>
          {ultimoDoBot ? <AvatarMini nome={T.nomeBot} foto={T.fotoUrl} /> : <div style={{ width: 33, flex: "none" }} />}
          <div {...clickProps(m)} style={{ minWidth: 0, display: "flex" }}>{node}</div>
        </div>
      );
    }
    return <div key={m.id} {...clickProps(m)} style={{ alignSelf: "flex-start", maxWidth: MAXW_BOLHA, display: "flex" }}>{node}</div>;
  };
  // Moldura sutil das mídias (cor neutra: aparece em fundo claro e escuro).
  const molduraMidia = { border: "1px solid rgba(130,130,150,.35)", boxShadow: "0 1px 3px rgba(0,0,0,.14)" };
  const iconeHeader = (ico: string, link?: string) => {
    if (!ico || !GL[ico]) return null;
    const g = <Gl p={GL[ico]} size={23} color={corIco} />;
    if (link && !modoPreview) return <a href={link} target="_blank" rel="noreferrer" style={{ display: "flex" }}>{g}</a>;
    return <span style={{ display: "flex", cursor: link ? "pointer" : "default" }}>{g}</span>;
  };
  return (
    <div className="tf-container" style={{
      position: "relative", display: "flex", flexDirection: "column", height: altura, background: T.corFundo, fontFamily: "system-ui, -apple-system, sans-serif", overflow: "hidden",
      // Círculos gigantes quase invisíveis (tom da marca) — profundidade estilo Apple.
      backgroundImage: `radial-gradient(60% 55% at 18% 8%, color-mix(in srgb, ${T.corBotao} 7%, transparent), transparent 70%), radial-gradient(55% 50% at 92% 88%, color-mix(in srgb, ${T.corBotao} 6%, transparent), transparent 70%)`,
    }}>
      {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
      {/* Grão sutil por cima do fundo, atrás das mensagens */}
      <div aria-hidden className="tf-noise" style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", backgroundImage: NOISE, backgroundSize: "140px 140px", opacity: 0.05, mixBlendMode: "overlay" }} />
      {/* Cabeçalho no estilo do app */}
      <div className="tf-header" style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: padColuna(13), background: T.corHeader, color: T.corTextoHeader, flex: "none", borderBottom: (btn1 || btn2) && (T.corHeader.toUpperCase() === "#FFFFFF") ? "1px solid rgba(0,0,0,.08)" : "none" }}>
        {mostrarVoltar && <span style={{ display: "flex", opacity: 0.9, marginRight: -2 }}><Gl p={glyphVoltar} size={27} color={corIco} /></span>}
        {temStories ? (
          <button onClick={() => setStoriesAberto(true)} title="Ver novidades"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", animation: storiesVistos ? undefined : "tfPulse 2.4s ease-in-out 3" }}>
            <AvatarHeader nome={T.nomeBot} foto={T.fotoUrl} ring={storiesVistos ? "var(--neutro)" : (corHalo || IG_GRAD)} />
          </button>
        ) : <AvatarHeader nome={T.nomeBot} foto={T.fotoUrl} ring={corHalo} />}
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 17.5 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{T.nomeBot || "Atendimento"}</span>
            {temVerificado && <SeloVerificado cor={corVerificado} />}
          </div>
          {(typing || statusTxt) && <div style={{ fontSize: 13, opacity: 0.65 }}>{typing ? "digitando…" : statusTxt}</div>}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, opacity: 0.9 }}>
          {iconeHeader(btn1, h.btn1Link)}
          {iconeHeader(btn2, h.btn2Link)}
        </div>
      </div>

      {/* Balões */}
      <div ref={scrollRef} onScroll={aoRolar} className="tf-chat" style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: padColuna(18), display: "flex", flexDirection: "column", gap: 10 }}>
        {resume && (
          <div style={{ margin: "auto", width: "100%", maxWidth: 320, background: T.corBolhaBot, color: T.corTextoBot, borderRadius: 18, padding: 18, boxShadow: "0 8px 24px -10px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 12, animation: "tfIn .25s ease both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <AvatarHeader nome={T.nomeBot} foto={T.fotoUrl} ring={corHalo} />
              <div style={{ fontSize: 16, fontWeight: 800 }}>Bem-vindo de volta! 😊</div>
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.9 }}>Você já tinha começado por aqui. Quer continuar de onde parou?</div>
            <BotaoCTA label="Continuar de onde parei" onClick={continuarResume} bg={T.corBotao} fg={T.corTextoBotao} idx={0} />
            <button onClick={recomecarResume} style={{ background: "transparent", color: T.corTextoBot, border: "1px solid color-mix(in srgb, currentColor 25%, transparent)", borderRadius: 14, padding: "12px 16px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", opacity: 0.85 }}>
              Começar de novo
            </button>
          </div>
        )}
        {!resume && msgs.map((m, i) => {
          if (m.tipo === "acao") return (
            <a key={m.id} href={modoPreview ? undefined : m.url} target={modoPreview ? undefined : "_blank"} rel="noreferrer"
              style={{ alignSelf: "flex-start", maxWidth: "85%", background: T.corBotao, color: T.corTextoBotao, borderRadius: 16, padding: "12px 18px", fontSize: 15, fontWeight: 700, textDecoration: "none", cursor: modoPreview ? "default" : "pointer", animation: "tfIn .22s ease both" }}>
              {m.label}
            </a>
          );
          if (m.tipo === "imagem") return envolverBot(
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.url} alt="" style={{ display: "block", maxWidth: "100%", borderRadius: 14, ...molduraMidia, animation: "tfIn .22s ease both" }} />,
            m, i);
          if (m.tipo === "video") return envolverBot(<VideoBolha url={m.url ?? ""} mudo={m.mudo} />, m, i);
          if (m.tipo === "audio") return envolverBot(
            <audio src={m.url} controls style={{ maxWidth: "100%", animation: "tfIn .22s ease both" }} />,
            m, i);
          if (m.tipo === "embed") return envolverBot(
            <div style={{ width: 300, maxWidth: "100%", height: m.altura ?? 320, borderRadius: 14, overflow: "hidden", ...molduraMidia, background: "#fff", animation: "tfIn .22s ease both" }}>
              <iframe src={m.url} style={{ width: "100%", height: "100%", border: "none" }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" loading="lazy" />
            </div>,
            m, i);
          if (m.tipo === "social") return <ProvaSocial key={m.id} itens={m.itens ?? []} corCard={T.corBolhaBot} corTexto={T.corTextoBot} />;
          if (m.tipo === "contador") return <Contador key={m.id} segundos={m.segundos ?? 600} corCard={T.corBolhaBot} corTexto={T.corTextoBot} />;
          if (m.tipo === "cupom") return <Cupom key={m.id} codigo={m.codigo ?? ""} corBotao={T.corBotao} corTextoBotao={T.corTextoBotao} corCard={T.corBolhaBot} corTexto={T.corTextoBot} />;
          const user = m.de === "user";
          const emEdicao = editando && editando.id === m.id ? editando.texto : null;
          const raio = est.tail
            ? { borderRadius: 18, borderBottomLeftRadius: user ? 18 : 5, borderBottomRightRadius: user ? 5 : 18 }
            : { borderRadius: 22 };
          const bolha = (
            <div className={user ? "tf-bubble tf-bubble-user" : "tf-bubble tf-bubble-bot"} style={{
              display: "inline-block", minWidth: 0, maxWidth: "100%", width: emEdicao !== null ? "100%" : undefined,
              background: user ? (est.gradUser ?? T.corBolhaUser) : T.corBolhaBot, color: user ? T.corTextoUser : T.corTextoBot,
              ...raio, padding: est.hora ? "10px 14px 7px" : "12px 16px", fontSize: 17.5, lineHeight: 1.5, boxShadow: "0 1px 2px rgba(0,0,0,.07)", animation: "tfIn .22s ease both",
            }}>
              <div style={{ whiteSpace: "pre-line", overflowWrap: "break-word", wordBreak: "normal", hyphens: "auto" }}>
                {emEdicao !== null && renderEditorInline
                  ? renderEditorInline({
                      value: emEdicao,
                      onChange: (v) => { setEditando({ id: m.id, texto: v }); if (m.grupoId && m.blocoId) onEditarTexto?.(m.grupoId, m.blocoId, v); },
                      onCommit: () => setEditando(null),
                      onCancel: () => setEditando(null),
                    })
                  : fmtTexto(limparTexto(m.texto ?? ""))}
              </div>
              {est.hora && emEdicao === null && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 2, fontSize: 10.5, opacity: 0.62, lineHeight: 1 }}>
                  <span>{hora}</span>
                  {user && est.ticks && <span style={{ fontSize: 11, letterSpacing: "-3px", marginRight: 2, color: est.ticksCor || "inherit" }}>✓✓</span>}
                </div>
              )}
            </div>
          );
          // Foto do perfil ao lado do balão do bot — só na ÚLTIMA mensagem de
          // cada rajada (a próxima é do usuário ou é o fim); as outras alinham
          // com um espaço reservado.
          if (avatarBolha && !user) {
            const ultimoDoBot = (i === msgs.length - 1 && !typing) || msgs[i + 1]?.de === "user";
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "flex-end", gap: 8, alignSelf: "flex-start", maxWidth: MAXW_BOLHA_AV }}>
                {ultimoDoBot ? <AvatarMini nome={T.nomeBot} foto={T.fotoUrl} /> : <div style={{ width: 33, flex: "none" }} />}
                <div {...clickProps(m)} style={{ minWidth: 0, display: "flex" }}>{bolha}</div>
              </div>
            );
          }
          return <div key={m.id} {...clickProps(m)} style={{ alignSelf: user ? "flex-end" : "flex-start", maxWidth: MAXW_BOLHA, display: "flex", justifyContent: user ? "flex-end" : "flex-start" }}>{bolha}</div>;
        })}
        {typing && (() => {
          const bolhaTyping = (
            <div style={{ background: T.corBolhaBot, ...(est.tail ? { borderRadius: 18, borderBottomLeftRadius: 5 } : { borderRadius: 22 }), padding: "13px 16px", display: "flex", gap: 4, boxShadow: "0 1px 2px rgba(0,0,0,.07)" }}>
              {[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: T.corTextoBot, opacity: 0.4, animation: `tfDot 1s ${i * 0.16}s infinite` }} />)}
            </div>
          );
          // Alinha com as bolhas do bot: se a foto aparece ao lado, indenta igual.
          return avatarBolha
            ? <div style={{ display: "flex", alignItems: "flex-end", gap: 8, alignSelf: "flex-start" }}><AvatarMini nome={T.nomeBot} foto={T.fotoUrl} />{bolhaTyping}</div>
            : <div style={{ alignSelf: "flex-start" }}>{bolhaTyping}</div>;
        })()}
        {/* Botões de escolha */}
        {inputBlock?.type === "botoes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 6 }}>
            {(inputBlock.opcoes ?? []).map((o, i) => (
              <BotaoCTA key={o.id} label={interpolar(o.label, vars.current)} onClick={() => responder(o.id, o.label)} bg={T.corBotao} fg={T.corTextoBotao} idx={i} />
            ))}
          </div>
        )}
        {/* Consentimento LGPD */}
        {inputBlock?.type === "lgpd" && (
          <div style={{ background: T.corBolhaBot, color: T.corTextoBot, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10, animation: "tfIn .22s ease both" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, cursor: "pointer", lineHeight: 1.4 }}>
              <Caixa marcado={aceiteLgpd} onChange={(marc) => setAceiteLgpd(marc)} />
              <span>{interpolar(inputBlock.text || "", vars.current)}</span>
            </label>
            <button onClick={() => aceiteLgpd && responder("sim", "Aceito ✓")} disabled={!aceiteLgpd}
              style={{ background: T.corBotao, color: T.corTextoBotao, border: "none", borderRadius: 12, padding: "12px 16px", fontSize: 15, fontWeight: 800, cursor: "pointer", opacity: aceiteLgpd ? 1 : 0.45 }}>
              Continuar
            </button>
          </div>
        )}
        {/* Escolha por imagem (picture choice) */}
        {inputBlock?.type === "imagens" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
            {(inputBlock.opcoes ?? []).map((o) => (
              <button key={o.id} onClick={() => responder(o.id, o.label)}
                style={{ background: T.corBolhaBot, color: T.corTextoBot, border: "none", borderRadius: 14, padding: 0, cursor: "pointer", overflow: "hidden", textAlign: "left", boxShadow: "0 1px 2px rgba(0,0,0,.08)", animation: "tfIn .22s ease both" }}>
                {o.imagem
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={interpolar(o.imagem, vars.current)} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                  : <div style={{ width: "100%", aspectRatio: "1/1", background: "rgba(127,127,127,.15)", display: "grid", placeItems: "center", color: "var(--text-dim)", fontSize: 24 }}>🖼️</div>}
                {o.label && <div style={{ padding: "8px 10px", fontSize: 13.5, fontWeight: 700 }}>{interpolar(o.label, vars.current)}</div>}
              </button>
            ))}
          </div>
        )}
        {/* Localização (geolocalização do navegador) */}
        {inputBlock?.type === "localizacao" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <button onClick={() => {
              const salvar = (la: string, lo: string) => { const v = inputBlock.variavel || "local"; vars.current.lat = la; vars.current.lng = lo; responder(`${la},${lo}`, "📍 Localização enviada"); void v; };
              if (modoPreview) { salvar("-23.5505", "-46.6333"); return; }
              if (!navigator.geolocation) { responder("", "📍 Indisponível"); return; }
              navigator.geolocation.getCurrentPosition(
                (pos) => salvar(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6)),
                () => responder("", "📍 Não autorizado"),
                { enableHighAccuracy: false, timeout: 8000 },
              );
            }} style={{ background: T.corBotao, color: T.corTextoBotao, border: "none", borderRadius: 14, padding: "13px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", animation: "tfIn .22s ease both" }}>
              📍 Compartilhar minha localização
            </button>
            <button onClick={() => responder("", "Prefiro não agora")}
              style={{ background: "transparent", color: T.corTextoBot, border: `1px solid ${T.corBotao}`, borderRadius: 14, padding: "11px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: 0.75 }}>
              Agora não
            </button>
          </div>
        )}
        {/* Avaliação (nota / estrelas) */}
        {inputBlock?.type === "avaliacao" && (() => {
          const max = Math.max(2, inputBlock.escala ?? 10);
          const estrelas = max <= 5;
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4, justifyContent: estrelas ? "center" : "flex-start" }}>
              {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => responder(String(n), estrelas ? "★".repeat(n) : String(n))}
                  style={{ width: estrelas ? 42 : 38, height: 42, borderRadius: estrelas ? 10 : 999, border: `1px solid ${T.corBotao}`, background: T.corBolhaBot, color: estrelas ? "#FFB300" : T.corBotao, fontSize: estrelas ? 22 : 15, fontWeight: 800, cursor: "pointer" }}>
                  {estrelas ? "★" : n}
                </button>
              ))}
            </div>
          );
        })()}
        {fim && msgs.length === 0 && <div style={{ color: "var(--neutro)", fontSize: 13, textAlign: "center", marginTop: 30 }}>Este bot ainda não tem conteúdo.</div>}
      </div>

      {/* Barra de input livre — teclado certo por tipo, máscara ao vivo, erro
          amigável (só depois de sair do campo) e correção de e-mail. */}
      {inputLivre && (() => {
        const tipo = inputBlock.type;
        const vTrim = texto.trim();
        const valido = validoAgora();
        const erro = !vTrim ? null
          : tipo === "input_email" && !emailValido(vTrim) ? "E-mail inválido — ex.: nome@email.com"
          : tipo === "input_telefone" && !telefoneValido(vTrim) ? "Número incompleto — ex.: (11) 91234-5678"
          : tipo === "input_numero" && !numeroValido(vTrim) ? "Digite apenas números."
          : null;
        const sugestao = tipo === "input_email" ? sugerirEmail(vTrim) : null;
        const mostrarErro = tocado && !!erro;
        const attrs: InputHTMLAttributes<HTMLInputElement> =
          tipo === "input_email" ? { type: "email", inputMode: "email", autoComplete: "email", autoCapitalize: "off", spellCheck: false }
          : tipo === "input_telefone" ? { type: "tel", inputMode: "tel", autoComplete: "tel", spellCheck: false }
          : tipo === "input_numero" ? { type: "text", inputMode: "decimal", autoComplete: "off", spellCheck: false }
          : tipo === "data" ? { type: "date" }
          : { type: "text", autoComplete: /nome|name/i.test(inputBlock.variavel || "") ? "name" : "on", autoCapitalize: "sentences" };
        const ph = inputBlock.placeholder || (tipo === "input_telefone" ? "(11) 91234-5678" : tipo === "input_email" ? "nome@email.com" : tipo === "input_numero" ? "Digite um número" : "Digite aqui…");
        return (
          <form className="tf-input" onSubmit={(e) => { e.preventDefault(); const v = validoAgora(); if (v) responder(v); else setTocado(true); }}
            style={{ display: "flex", flexDirection: "column", gap: 7, padding: padColuna(11), background: T.corBolhaBot, flex: "none" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input {...attrs} className="tf-input-field" value={texto} autoFocus placeholder={ph}
                onChange={(e) => {
                  let v = e.target.value;
                  if (tipo === "input_telefone") v = formatarTelefoneBR(v);
                  else if (tipo === "input_email") v = v.replace(/\s/g, "").toLowerCase();
                  setTexto(v);
                }}
                onBlur={() => setTocado(true)}
                style={{ flex: 1, minWidth: 0, border: `1.5px solid ${mostrarErro ? "var(--perigo)" : "rgba(0,0,0,.12)"}`, borderRadius: 13, padding: "13px 15px", fontSize: 16.5, outline: "none", background: T.corFundo, color: T.corTextoBot }} />
              <button type="submit" className="tf-send" disabled={!valido}
                style={{ background: T.corBotao, color: T.corTextoBotao, border: "none", borderRadius: 13, padding: "0 20px", fontSize: 16, fontWeight: 800, cursor: valido ? "pointer" : "not-allowed", opacity: valido ? 1 : 0.45 }}>
                Enviar
              </button>
            </div>
            {mostrarErro && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--perigo)", padding: "0 4px" }}>
                <Gl p={GL.info} size={15} color="var(--perigo)" /> {erro}
              </div>
            )}
            {sugestao && (
              <button type="button" onClick={() => { setTexto(sugestao); setTocado(false); }}
                style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, background: `color-mix(in srgb, ${T.corBotao} 14%, transparent)`, border: "1px solid color-mix(in srgb, currentColor 18%, transparent)", borderRadius: 999, padding: "5px 11px", fontSize: 12.5, color: T.corTextoBot, cursor: "pointer" }}>
                Você quis dizer&nbsp;<b>{sugestao}</b>?
              </button>
            )}
          </form>
        );
      })()}

      {storiesAberto && temStories && (
        <StoriesViewer stories={stories} nome={T.nomeBot} foto={T.fotoUrl} corBotao={T.corBotao} corTextoBotao={T.corTextoBotao} modoPreview={modoPreview} onClose={fecharStories} onCta={onStoryCta} />
      )}

      <style>{`@keyframes tfIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes tfDot{0%,60%,100%{transform:none;opacity:.35}30%{transform:translateY(-4px);opacity:.9}}@keyframes tfCta{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}@keyframes tfRipple{to{transform:scale(2.4);opacity:0}}@keyframes tfShine{from{transform:translateX(-130%) skewX(-18deg)}to{transform:translateX(320%) skewX(-18deg)}}@keyframes tfShineLoop{0%{transform:translateX(-130%) skewX(-18deg)}22%{transform:translateX(320%) skewX(-18deg)}100%{transform:translateX(320%) skewX(-18deg)}}@keyframes tfBreath{0%,100%{transform:scale(1)}50%{transform:scale(.988)}}@keyframes tfPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}.tf-choice{transition:box-shadow .15s ease, filter .15s ease}.tf-choice:hover{filter:brightness(1.05)}.tf-choice:active{filter:brightness(.96)}.tf-editavel{cursor:pointer;transition:outline .12s ease}.tf-editavel:hover{outline:2px dashed color-mix(in srgb, var(--primary) 85%, transparent);outline-offset:3px;border-radius:10px}`}</style>
    </div>
  );
}

// ── Bolhas especiais de conversão ────────────────────────────────────────────
function ProvaSocial({ itens, corCard, corTexto }: { itens: string[]; corCard: string; corTexto: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (itens.length <= 1) return;
    const t = setInterval(() => setI((x) => (x + 1) % itens.length), 3500);
    return () => clearInterval(t);
  }, [itens.length]);
  if (itens.length === 0) return null;
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "85%", background: corCard, color: corTexto, borderRadius: 14, padding: "12px 15px", fontSize: 13.5, lineHeight: 1.45, fontStyle: "italic", boxShadow: "0 1px 1px rgba(0,0,0,.06)", animation: "tfIn .22s ease both" }}>
      {itens[i]}
      {itens.length > 1 && (
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {itens.map((_, j) => <span key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: corTexto, opacity: j === i ? 0.8 : 0.25 }} />)}
        </div>
      )}
    </div>
  );
}

function Contador({ segundos, corCard, corTexto }: { segundos: number; corCard: string; corTexto: string }) {
  const [resta, setResta] = useState(segundos);
  useEffect(() => {
    const t = setInterval(() => setResta((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(resta / 60)).padStart(2, "0");
  const ss = String(resta % 60).padStart(2, "0");
  return (
    <div style={{ alignSelf: "flex-start", background: corCard, borderRadius: 14, padding: "10px 18px", boxShadow: "0 1px 1px rgba(0,0,0,.06)", animation: "tfIn .22s ease both" }}>
      <span style={{ fontSize: 26, fontWeight: 800, color: resta <= 60 ? "#E24B4A" : corTexto, fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</span>
    </div>
  );
}

function Cupom({ codigo, corBotao, corTextoBotao, corCard, corTexto }: { codigo: string; corBotao: string; corTextoBotao: string; corCard: string; corTexto: string }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  return (
    <div style={{ alignSelf: "flex-start", animation: "tfIn .22s ease both" }}>
      {!aberto ? (
        <button onClick={() => setAberto(true)}
          style={{ background: corBotao, color: corTextoBotao, border: "none", borderRadius: 14, padding: "13px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
          🎁 Revelar meu cupom
        </button>
      ) : (
        <button onClick={() => { navigator.clipboard?.writeText(codigo).catch(() => {}); setCopiado(true); }}
          style={{ background: corCard, color: corTexto, border: `2px dashed ${corBotao}`, borderRadius: 14, padding: "12px 20px", fontSize: 18, fontWeight: 800, letterSpacing: "0.06em", cursor: "pointer", animation: "tfIn .25s ease both" }}>
          {codigo} <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, letterSpacing: 0 }}>{copiado ? "copiado ✓" : "tocar pra copiar"}</span>
        </button>
      )}
    </div>
  );
}
