"use client";

import { useEffect, useState } from "react";
import { GaiusMark } from "../GaiusMark";
import { ForcaDaSenha } from "../ForcaDaSenha";

// Tela do LINK de primeiro acesso: a pessoa abre o link que o admin mandou e
// escolhe a senha dela. Reusa a fundação visual do /login (classes gaius-auth,
// gaius-card, gaius-field) — nada de CSS novo, e o celular já vem resolvido de lá.

function Ico({ p, size = 18, w = 1.9 }: { p: React.ReactNode; size?: number; w?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {p}
    </svg>
  );
}
const IC = {
  user: (<><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></>),
  mail: (<><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" /><path d="M3 7l9 6l9 -6" /></>),
  lock: (<><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></>),
  eye: (<><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6s-6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6s6.6 2 9 6" /></>),
  eyeOff: (<><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></>),
  alert: (<><path d="M12 9v4" /><path d="M12 16h.01" /><path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18" /></>),
  arrow: (<><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></>),
  check: (<><path d="M5 12l5 5l10 -10" /></>),
};

const MINIMO = 8;

// Cada motivo tem sua própria frase e seu próprio conselho. Dizer "link
// inválido" pra um link que só venceu manda a pessoa procurar erro de digitação
// em vez de pedir outro — e ela fica tentando, sem saída.
const RECADO: Record<string, { titulo: string; texto: string }> = {
  invalido: { titulo: "Link inválido", texto: "Confira se você copiou o endereço inteiro. Se veio por mensagem, abra pelo próprio link em vez de digitar." },
  nao_encontrado: { titulo: "Link inválido", texto: "Este link não corresponde a nenhum acesso. Peça um novo ao administrador." },
  ja_usado: { titulo: "Link já usado", texto: "Sua senha já foi criada com este link. Entre normalmente pela tela de acesso — se esqueceu a senha, peça um link novo." },
  expirado: { titulo: "Link vencido", texto: "Por segurança, o link vale por tempo limitado. Peça um novo ao administrador." },
  muitas_tentativas: { titulo: "Muitas tentativas", texto: "Aguarde alguns minutos e abra o link de novo." },
  indisponivel: { titulo: "Instabilidade no sistema", texto: "Não foi possível concluir agora. Tente de novo em instantes — seu link continua valendo." },
};

type Estado = { fase: "verificando" } | { fase: "formulario" } | { fase: "recusado"; motivo: string } | { fase: "pronto"; entrou: boolean };

export default function PrimeiroAcessoPage() {
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" });
  const [token, setToken] = useState("");
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Confere o link ANTES de pedir a senha: sem isso a pessoa digita duas vezes
  // pra só então descobrir que o link venceu.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") || "";
    setToken(t);
    if (!t) { setEstado({ fase: "recusado", motivo: "invalido" }); return; }
    (async () => {
      try {
        const r = await fetch("/api/auth/primeiro-acesso", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "verificar", token: t }),
        });
        const d = await r.json().catch(() => null);
        if (r.ok && d?.ok) {
          setUsuario(d.usuario || "");
          setEmail(d.email || "");
          setEstado({ fase: "formulario" });
        } else setEstado({ fase: "recusado", motivo: d?.motivo || "invalido" });
      } catch {
        setEstado({ fase: "recusado", motivo: "indisponivel" });
      }
    })();
  }, []);

  async function definir(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (senha.length < MINIMO) { setErr(`A senha precisa ter pelo menos ${MINIMO} caracteres.`); return; }
    if (senha !== senha2) { setErr("As senhas não conferem."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/auth/primeiro-acesso", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "definir", token, password: senha, usuario, email }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) {
        setEstado({ fase: "pronto", entrou: !!d.entrou });
        // Entrou junto: navegação dura pro cookie valer inclusive no WebView antigo.
        if (d.entrou) setTimeout(() => window.location.assign("/inicio"), 900);
        return;
      }
      setSalvando(false);
      // Erros do que a PESSOA digitou ficam no formulário — tirá-la da tela por
      // um usuário repetido a faria perder o link achando que ele quebrou.
      const noFormulario: Record<string, string> = {
        senha_fraca: `A senha precisa ter pelo menos ${MINIMO} caracteres.`,
        usuario_curto: "O usuário precisa ter ao menos 3 letras ou números.",
        usuario_em_uso: "Esse usuário já é de outra pessoa. Escolha outro.",
        usuario_reservado: "Esse usuário não está disponível. Escolha outro.",
        email_invalido: "Confira o e-mail digitado.",
        email_em_uso: "Esse e-mail já está em outra conta.",
      };
      if (d?.motivo && noFormulario[d.motivo]) { setErr(noFormulario[d.motivo]); return; }
      // Link que morreu no meio (venceu, ou alguém usou): sai do formulário,
      // senão a pessoa fica tentando salvar uma senha que nunca vai gravar.
      setEstado({ fase: "recusado", motivo: d?.motivo || "invalido" });
    } catch {
      setSalvando(false);
      setErr("Sem conexão. Verifique sua internet e tente de novo.");
    }
  }

  const capLabel: React.CSSProperties = {
    display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.09em",
    textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 7,
  };

  return (
    <main id="gaius-auth" className="gaius-auth">
      <GaiusMark size={72} className="gaius-symbol" />
      <h1 className="gaius-brand">GAIUS</h1>

      <div className="glass gaius-card">
        {estado.fase === "verificando" && (
          <div style={{ textAlign: "center", padding: "18px 0" }}>
            <svg className="spin" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, margin: "10px 0 0" }}>Conferindo seu link…</p>
          </div>
        )}

        {estado.fase === "recusado" && (
          <div style={{ textAlign: "center" }}>
            <span style={{ color: "var(--tf-neg)" }}><Ico p={IC.alert} size={26} /></span>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "10px 0 0" }}>
              {(RECADO[estado.motivo] ?? RECADO.invalido).titulo}
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.55, margin: "8px 0 18px" }}>
              {(RECADO[estado.motivo] ?? RECADO.invalido).texto}
            </p>
            <a href="/login" className="gaius-submit" style={{ textDecoration: "none" }}>
              Ir para a tela de acesso <Ico p={IC.arrow} size={18} w={2} />
            </a>
          </div>
        )}

        {estado.fase === "pronto" && (
          <div style={{ textAlign: "center" }}>
            <span style={{ color: "var(--ok)" }}><Ico p={IC.check} size={26} w={2.4} /></span>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "10px 0 0" }}>Senha criada</h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.55, margin: "8px 0 18px" }}>
              {estado.entrou
                ? "Tudo certo. Estamos abrindo o sistema para você…"
                : "Tudo certo. Entre com seu usuário e a senha que você acabou de criar."}
            </p>
            {!estado.entrou && (
              <a href="/login" className="gaius-submit" style={{ textDecoration: "none" }}>
                Entrar <Ico p={IC.arrow} size={18} w={2} />
              </a>
            )}
          </div>
        )}

        {estado.fase === "formulario" && (
          <form onSubmit={definir} noValidate>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Crie sua senha</h2>
              <p style={{ color: "var(--text-dim)", fontSize: 13.5, margin: "6px 0 0" }}>
                É só desta vez. Depois você entra com ela sempre.
              </p>
            </div>

            <div style={{ marginBottom: 15 }}>
              <label htmlFor="pa-usuario" style={capLabel}>Seu usuário</label>
              <div className="gaius-field">
                <span className="gaius-ico"><Ico p={IC.user} size={17} /></span>
                <input id="pa-usuario" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  autoComplete="username" placeholder="como você vai entrar"
                  value={usuario} onChange={(e) => setUsuario(e.target.value)} />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "6px 0 0" }}>
                Pode deixar como está ou trocar por um mais curto.
              </p>
            </div>

            <div style={{ marginBottom: 15 }}>
              <label htmlFor="pa-email" style={capLabel}>Seu e-mail (opcional)</label>
              <div className="gaius-field">
                <span className="gaius-ico"><Ico p={IC.mail} size={17} /></span>
                <input id="pa-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                  spellCheck={false} autoComplete="email" placeholder="seu@email.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "6px 0 0" }}>
                Serve para entrar pelo e-mail e para recuperar o acesso depois.
              </p>
            </div>

            <div style={{ marginBottom: 15 }}>
              <label htmlFor="pa-senha" style={capLabel}>Nova senha</label>
              <div className="gaius-field">
                <span className="gaius-ico"><Ico p={IC.lock} size={17} /></span>
                <input id="pa-senha" type={mostrar ? "text" : "password"} autoComplete="new-password"
                  placeholder={`Pelo menos ${MINIMO} caracteres`} value={senha} onChange={(e) => setSenha(e.target.value)}
                  required style={{ paddingRight: 46 }} aria-invalid={!!err} />
                <button type="button" className="gaius-eye" onClick={() => setMostrar((m) => !m)}
                  aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"} aria-pressed={mostrar}>
                  <Ico p={mostrar ? IC.eyeOff : IC.eye} size={18} />
                </button>
              </div>
              <ForcaDaSenha value={senha} style={{ marginTop: 12 }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="pa-senha2" style={capLabel}>Repita a senha</label>
              <div className="gaius-field">
                <span className="gaius-ico"><Ico p={IC.lock} size={17} /></span>
                <input id="pa-senha2" type={mostrar ? "text" : "password"} autoComplete="new-password"
                  placeholder="••••••••" value={senha2} onChange={(e) => setSenha2(e.target.value)}
                  required aria-invalid={!!err} />
              </div>
            </div>

            {err && (
              <p role="alert" style={{ color: "var(--tf-neg)", fontSize: 13, margin: "8px 0 0", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ flex: "none" }}><Ico p={IC.alert} size={15} /></span>
                {err}
              </p>
            )}

            <button type="submit" className="gaius-submit" disabled={salvando} style={{ marginTop: 16 }}>
              {salvando
                ? (<><svg className="spin" width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden><path d="M12 3a9 9 0 1 0 9 9" /></svg> Salvando…</>)
                : (<>Criar senha e entrar <Ico p={IC.arrow} size={18} w={2} /></>)}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
