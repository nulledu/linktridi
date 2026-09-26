"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Botao } from "./ui/controles";
import { ForcaDaSenha } from "../ForcaDaSenha";

// ── Trocar senha (Ajustes) ───────────────────────────────────────────────────
// Eram três inputs soltos e um botão. Faltava o básico de um formulário de
// senha, e cada falta era um defeito visível:
//   • sem <form>, Enter não enviava e o gerenciador de senhas não reconhecia
//     a troca (nem oferecia salvar a senha nova);
//   • sem campo de usuário, o gerenciador não sabia QUAL conta atualizar;
//   • `await r.json()` sem proteção: o 429 do freio de tentativas e qualquer
//     500 em HTML estouravam ali — sem mensagem, com o erro solto no console.
// O servidor continua mandando (a rota revalida tudo, inclusive o piso de 8);
// a validação daqui só evita a ida à rede pra erro óbvio.

const MINIMO = 8;   // mesmo piso de app/api/auth/password

type Recado = { t: string; ok: boolean } | null;

function mensagemDoServidor(status: number, d: { error?: string; detail?: string }): string {
  if (status === 429) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (status === 401) {
    return d.error === "senha_atual_incorreta"
      ? "Senha atual incorreta."
      : "Sua sessão expirou. Entre de novo pra trocar a senha.";
  }
  // 422 traz o motivo já escrito em português (curta, igual à atual…).
  if (status === 422 && d.detail) return d.detail;
  return "Não deu pra trocar a senha agora. Tente de novo.";
}

export function TrocarSenha({ username }: { username?: string | null }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recado, setRecado] = useState<Recado>(null);

  // Digitar de novo apaga o recado: ele falava da tentativa ANTERIOR.
  const digitar = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    if (recado) setRecado(null);
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!atual) { setRecado({ t: "Informe a senha atual.", ok: false }); return; }
    if (nova.length < MINIMO) { setRecado({ t: `Mínimo de ${MINIMO} caracteres.`, ok: false }); return; }
    if (nova !== confirma) { setRecado({ t: "As senhas não conferem.", ok: false }); return; }
    setBusy(true);
    setRecado(null);
    try {
      const r = await fetch("/api/auth/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nova, currentPassword: atual }),
      });
      if (r.ok) {
        setRecado({ t: "Senha alterada.", ok: true });
        setAtual(""); setNova(""); setConfirma(""); setVer(false);
        return;
      }
      const d = (await r.json().catch(() => ({}))) as { error?: string; detail?: string };
      setRecado({ t: mensagemDoServidor(r.status, d), ok: false });
    } catch {
      setRecado({ t: "Sem conexão. Confira a internet e tente de novo.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const tipo = ver ? "text" : "password";
  return (
    <form onSubmit={salvar} noValidate>
      {/* Usuário oculto: é por ele que o gerenciador de senhas sabe QUAL conta
          atualizar. Sem ele, o Chrome avisa no console e salva a senha solta. */}
      {username && <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />}
      <input type={tipo} name="current-password" value={atual} onChange={digitar(setAtual)}
        placeholder="Senha atual" aria-label="Senha atual" autoComplete="current-password" style={campo} />
      <input type={tipo} name="new-password" value={nova} onChange={digitar(setNova)}
        placeholder="Nova senha" aria-label="Nova senha" autoComplete="new-password" style={{ ...campo, marginTop: 8 }} />
      {/* Só aparece quando começa a digitar a nova: medir uma senha vazia (ou a
          atual) só faz barulho. Consultivo — o piso de 8 é revalidado no servidor. */}
      {nova.length > 0 && <ForcaDaSenha value={nova} style={{ marginTop: 10 }} />}
      <input type={tipo} name="confirm-password" value={confirma} onChange={digitar(setConfirma)}
        placeholder="Confirmar nova senha" aria-label="Confirmar nova senha" autoComplete="new-password" style={{ ...campo, marginTop: 8 }} />
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        <Botao type="submit" variante="primario" carregando={busy}>Salvar senha</Botao>
        <Botao icone={ver ? "eye-off" : "eye"} onClick={() => setVer((v) => !v)} aria-pressed={ver}>{ver ? "Ocultar senhas" : "Mostrar senhas"}</Botao>
      </div>
      {recado && (
        <p role="status" aria-live="polite"
          style={{ fontSize: 13, fontWeight: 600, marginTop: 10, color: recado.ok ? "var(--ok, var(--secondary))" : "var(--perigo)" }}>
          {recado.t}
        </p>
      )}
    </form>
  );
}

// 14px no desktop; no celular a fundação sobe todo campo pra 16px
// (globals.css), senão o Safari do iPhone dá zoom na página ao focar.
const campo: React.CSSProperties = {
  width: "100%", minHeight: "var(--tap)", background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)", padding: "10px 12px", color: "var(--text)", fontSize: 14,
};
