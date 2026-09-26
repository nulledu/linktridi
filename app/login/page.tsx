"use client";

import { useEffect, useRef, useState } from "react";
import { GaiusMark } from "../GaiusMark";
import { Sussurro } from "../Sussurro";
import { EGG_SVALBARD, SVALBARD, eggDoMomento, type Egg } from "@/lib/gaius-eggs";
import { Caixa } from "../(plataforma)/ui/controles";

// Ícone (paths oficiais do Tabler — viewBox 24, stroke, sem fill). Sem emojis. */
function Ico({ p, size = 18, w = 1.9 }: { p: React.ReactNode; size?: number; w?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {p}
    </svg>
  );
}
const IC = {
  mail: (<><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" /><path d="M3 7l9 6l9 -6" /></>),
  lock: (<><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></>),
  eye: (<><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6s-6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6s6.6 2 9 6" /></>),
  eyeOff: (<><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></>),
  alert: (<><path d="M12 9v4" /><path d="M12 16h.01" /><path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" /></>),
  arrow: (<><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></>),
  info: (<><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></>),
};

export default function LoginPage() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [ajuda, setAjuda] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  // Detalhes silenciosos (ver lib/gaius-eggs.ts): as coordenadas do canto e a
  // frase do momento. Nada disso toca no formulário nem no fluxo de entrada.
  const [cofre, setCofre] = useState(false);
  const [momento, setMomento] = useState<Egg | null>(null);

  // Só no client: no servidor a hora seria a do datacenter, e o HTML não bate.
  useEffect(() => { setMomento(eggDoMomento()); }, []);

  // "Lembrar de mim" guarda só o IDENTIFICADOR (não mexe em sessão/cookies).
  // Prefill: se já tem um id lembrado, foca a senha; senão foca o id.
  useEffect(() => {
    try {
      const on = localStorage.getItem("gaius.remember");
      const remember = on === null ? true : on === "1";
      setLembrar(remember);
      const last = remember ? localStorage.getItem("gaius.lastId") : null;
      if (last) { setId(last); passRef.current?.focus(); return; }
    } catch { /* localStorage indisponível */ }
    idRef.current?.focus();
  }, []);

  // Parallax quase imperceptível do horizonte (desligado em reduced-motion / touch).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.getElementById("gaius-auth");
    if (!root) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        root.style.setProperty("--mx", (-x).toFixed(3));
        root.style.setProperty("--my", (-y).toFixed(3));
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: id.trim(), password }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "erro" }));
        setLoading(false);
        setErr(error === "invalid_credentials"
          ? "E-mail/usuário ou senha inválidos."
          : "Não foi possível entrar. Tente novamente.");
        return;
      }
      try {
        localStorage.setItem("gaius.remember", lembrar ? "1" : "0");
        if (lembrar) localStorage.setItem("gaius.lastId", id.trim());
        else localStorage.removeItem("gaius.lastId");
      } catch { /* ok */ }
      // Honra ?next=… (só caminhos internos, por segurança).
      let next = "/inicio";
      try {
        const p = new URLSearchParams(window.location.search).get("next");
        if (p && p.startsWith("/")) next = p;
      } catch { /* ignore */ }
      window.location.assign(next);   // navegação dura garante o cookie no WebView
    } catch {
      setLoading(false);
      setErr("Sem conexão. Verifique sua internet e tente de novo.");
    }
  }

  const capLabel: React.CSSProperties = {
    display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.09em",
    textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 7,
  };

  return (
    <main id="gaius-auth" className="gaius-auth">
      {/* ── Horizonte de eventos (decorativo) ─────────────────────────────── */}
      <div className="gaius-horizon" aria-hidden>
        {/* Longe: núcleo luminoso + grande arco + anéis concêntricos. */}
        <div className="layer far" style={{ "--d": "7px" } as React.CSSProperties}>
          <svg viewBox="0 0 1000 1000">
            <defs>
              <radialGradient id="ga-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--primary-texto)" stopOpacity="0.85" />
                <stop offset="34%" stopColor="var(--primary-texto)" stopOpacity="0.26" />
                <stop offset="100%" stopColor="var(--primary-texto)" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="ga-arc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary-texto)" stopOpacity="0.6" />
                <stop offset="52%" stopColor="var(--primary-texto)" stopOpacity="0.10" />
                <stop offset="100%" stopColor="var(--primary-texto)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Singularidade: brilho suave no topo-centro. */}
            <circle cx="500" cy="118" r="250" fill="url(#ga-core)" opacity="0.55" />
            <circle cx="500" cy="118" r="4" fill="var(--primary)" opacity="0.9" />
            {/* Grande arco do horizonte. */}
            <circle cx="500" cy="545" r="445" fill="none" stroke="url(#ga-arc)" strokeWidth="1.4" />
            {/* Anéis concêntricos finíssimos. */}
            <g fill="none" stroke="var(--primary)">
              <circle cx="500" cy="545" r="336" strokeWidth="1" opacity="0.15" />
              <circle cx="500" cy="545" r="238" strokeWidth="1" opacity="0.11" />
              <circle cx="500" cy="545" r="150" strokeWidth="1" opacity="0.08" />
            </g>
          </svg>
        </div>

        {/* Perto: linha orbital que gira devagar + pontos esparsos. */}
        <div className="layer near" style={{ "--d": "20px" } as React.CSSProperties}>
          <svg viewBox="0 0 1000 1000">
            <g className="gaius-orbit">
              <ellipse cx="500" cy="545" rx="418" ry="150" fill="none" stroke="var(--primary)" strokeWidth="1" opacity="0.14" />
              <circle className="gaius-twinkle" cx="918" cy="545" r="3.2" fill="var(--primary)" />
              <circle className="gaius-twinkle" style={{ animationDelay: "1.4s" }} cx="500" cy="395" r="2.4" fill="var(--primary)" opacity="0.8" />
              <circle className="gaius-twinkle" style={{ animationDelay: "2.6s" }} cx="82" cy="545" r="2.6" fill="var(--primary)" />
            </g>
            {/* Estrelas paradas (twinkle dessincronizado). */}
            <g fill="var(--text)">
              <circle className="gaius-twinkle" style={{ animationDelay: "0.2s" }} cx="196" cy="228" r="1.8" opacity="0.5" />
              <circle className="gaius-twinkle" style={{ animationDelay: "1.1s" }} cx="812" cy="286" r="1.5" opacity="0.45" />
              <circle className="gaius-twinkle" style={{ animationDelay: "3.1s" }} cx="742" cy="742" r="2" opacity="0.4" />
              <circle className="gaius-twinkle" style={{ animationDelay: "0.7s" }} cx="286" cy="812" r="1.6" opacity="0.4" />
              <circle className="gaius-twinkle" style={{ animationDelay: "2.2s" }} cx="118" cy="640" r="1.4" opacity="0.35" />
              <circle className="gaius-twinkle" style={{ animationDelay: "1.8s" }} cx="906" cy="700" r="1.5" opacity="0.35" />
            </g>
          </svg>
        </div>
      </div>

      {/* ── Textos decorativos (só desktop, baixa opacidade) ──────────────── */}
      <span className="gaius-corner" style={{ top: 26, left: 30 }}>
        GAIUS
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--primary)", boxShadow: "0 0 10px 1px color-mix(in srgb, var(--primary) 65%, transparent)" }} />
      </span>
      <span className="gaius-corner" style={{ top: 26, right: 30 }}>SIC PARVIS MAGNA</span>
      <span className="gaius-corner" style={{ bottom: 24, left: 30 }}>UBI TU GAIUS, EGO GAIA.</span>
      {/* As coordenadas são só mais um detalhe do canto — e apontam pro cofre de
          sementes de Svalbard. Quem clicar descobre; quem não clicar não perde nada. */}
      <span className="gaius-corner" style={{ bottom: 24, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
        <button type="button" className="gaius-coord" onClick={() => setCofre(true)}>{SVALBARD.rotulo}</button>
        {cofre && (
          <Sussurro egg={EGG_SVALBARD} onFim={() => setCofre(false)}
            bottom="calc(100% + 16px)" left="50%" transform="translateX(-50%)" />
        )}
      </span>
      <span className="gaius-corner" style={{ bottom: 24, right: 30 }}>CADA AÇÃO HOJE MOLDA O AMANHÃ.</span>

      {/* ── Marca ─────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1, width: "min(430px, 100%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <GaiusMark size={72} className="gaius-symbol" />
        <h1 className="gaius-brand">GAIUS</h1>

        {/* ── Card de login ───────────────────────────────────────────────── */}
        <form onSubmit={submit} className="glass gaius-card" noValidate>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Bem-vindo de volta</h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, margin: "6px 0 0" }}>Acesse sua central para continuar.</p>
          </div>

          <div style={{ marginBottom: 15 }}>
            <label htmlFor="login-id" style={capLabel}>E-mail ou usuário</label>
            <div className="gaius-field">
              <span className="gaius-ico"><Ico p={IC.mail} size={17} /></span>
              <input id="login-id" ref={idRef} type="text" inputMode="email" autoCapitalize="none" autoCorrect="off"
                spellCheck={false} autoComplete="username" placeholder="seu@email.com"
                value={id} onChange={(e) => setId(e.target.value)} required
                aria-invalid={!!err} aria-describedby={err ? "login-err" : undefined} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="login-pass" style={capLabel}>Senha</label>
            <div className="gaius-field">
              <span className="gaius-ico"><Ico p={IC.lock} size={17} /></span>
              <input id="login-pass" ref={passRef} type={mostrar ? "text" : "password"} autoComplete="current-password"
                placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required
                style={{ paddingRight: 46 }} aria-invalid={!!err} aria-describedby={err ? "login-err" : undefined} />
              <button type="button" className="gaius-eye" onClick={() => setMostrar((m) => !m)}
                aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"} aria-pressed={mostrar}>
                <Ico p={mostrar ? IC.eyeOff : IC.eye} size={18} />
              </button>
            </div>
          </div>

          {/* Lembrar + Esqueceu */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "2px 0 4px" }}>
            <label htmlFor="login-remember" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--text)", fontWeight: 500, cursor: "pointer", margin: 0 }}>
              <Caixa marcado={lembrar} onChange={(marc) => setLembrar(marc)} />
              Lembrar de mim
            </label>
            <button type="button" onClick={() => setAjuda((v) => !v)} aria-expanded={ajuda} aria-controls="login-ajuda"
              style={{ background: "none", border: "none", padding: "4px 2px", color: "var(--primary-texto, var(--primary))", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
              Esqueceu sua senha?
            </button>
          </div>

          {ajuda && (
            <div id="login-ajuda" role="region" aria-label="Recuperar acesso"
              style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-dim)",
                background: "color-mix(in srgb, var(--primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 22%, transparent)",
                borderRadius: 12, padding: "11px 13px", margin: "2px 0 2px" }}>
              <span style={{ color: "var(--primary-texto, var(--primary))", flex: "none", marginTop: 1 }}><Ico p={IC.info} size={16} /></span>
              <span>A recuperação é feita pelo administrador. Peça para redefinir seu acesso — no próximo login, a senha que você digitar será cadastrada.</span>
            </div>
          )}

          {err && (
            <p id="login-err" role="alert" style={{ color: "var(--tf-neg)", fontSize: 13, margin: "8px 0 0", display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ flex: "none" }}><Ico p={IC.alert} size={15} /></span>
              {err}
            </p>
          )}

          <button type="submit" className="gaius-submit" disabled={loading} style={{ marginTop: 16 }}>
            {loading
              ? (<><svg className="spin" width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden><path d="M12 3a9 9 0 1 0 9 9" /></svg> Entrando…</>)
              : (<>Entrar <Ico p={IC.arrow} size={18} w={2} /></>)}
          </button>

          <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "16px 0 0", lineHeight: 1.45, textAlign: "center" }}>
            No primeiro acesso, a senha que você digitar será cadastrada.
          </p>
        </form>

        {/* Frase do momento: aniversário do sistema ou a virada do dia. Fora
            dessas janelas não existe nada aqui. Puramente visual. */}
        {momento && (
          <p className="gaius-momento">
            <span>{momento.titulo}</span>
            <em>{momento.frase}</em>
            <span>{momento.nota}</span>
          </p>
        )}
      </div>
    </main>
  );
}
