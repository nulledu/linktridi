"use client";

// Primitivos do editor de páginas. Espelham os controles que já existem dentro
// do EditorClient.tsx dos fluxos (Campo/LinhaToggle/LinhaCor/UploadBtn), mas
// exportados — assim os painéis do editor de página ficam idênticos ao resto do
// TridiFlow sem duplicar estilo em cada arquivo.

import { CampoCor } from "@/app/(plataforma)/ui/cores";
import { useRef, useState } from "react";
import { Icon } from "../../Icon";
import { GlassSelect } from "../../GlassPicker";
import { TrocaIcone } from "../../ui/micro";
import { Botao, Interruptor } from "../../ui/controles";

export const ACENTO = "var(--tf-accent, var(--primary-texto))";

export const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
  fontFamily: "inherit", fontSize: 13,
};

export function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10.5, color: "var(--text-dim)", opacity: 0.85, lineHeight: 1.35 }}>{hint}</span>}
    </label>
  );
}

export function Texto({ valor, onChange, placeholder, linhas }: {
  valor: string | undefined; onChange: (v: string) => void; placeholder?: string; linhas?: number;
}) {
  if (linhas && linhas > 1) {
    return <textarea value={valor ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={linhas} style={{ ...inp, resize: "vertical", lineHeight: 1.45 }} />;
  }
  return <input value={valor ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inp} />;
}

export function Numero({ valor, onChange, min = 0, max = 9999, sufixo }: {
  valor: number | undefined; onChange: (v: number) => void; min?: number; max?: number; sufixo?: string;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number" min={min} max={max}
        value={valor ?? ""}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        style={{ ...inp, width: 92 }}
      />
      {sufixo && <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{sufixo}</span>}
    </span>
  );
}

export function Selecao<T extends string>({ valor, onChange, opcoes }: {
  valor: T | undefined; onChange: (v: T) => void; opcoes: { valor: T; label: string }[];
}) {
  // Um só ponto: os três inspetores (Estilo, Tema, Conteúdo) passam por aqui,
  // então trocar o <select> nativo neste lugar alinhou os três de uma vez.
  return (
    <GlassSelect value={valor ?? ""} onChange={(v) => onChange(v as T)} style={inp}
      options={opcoes.map((o) => ({ value: o.valor, label: o.label }))} />
  );
}

/** Grupo de botões — melhor que select pra 2–4 opções curtas (alinhamento etc). */
export function Segmentado<T extends string>({ valor, onChange, opcoes }: {
  valor: T | undefined; onChange: (v: T) => void; opcoes: { valor: T; label?: string; icone?: string; titulo?: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: 9, border: "1px solid var(--border)" }}>
      {opcoes.map((o) => {
        const ativo = valor === o.valor;
        return (
          <button
            key={o.valor} type="button" title={o.titulo ?? o.label} onClick={() => onChange(o.valor)}
            style={{
              flex: 1, display: "grid", placeItems: "center", gap: 3, padding: "6px 4px", borderRadius: 7,
              border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700,
              background: ativo ? ACENTO : "transparent",
              color: ativo ? "#fff" : "var(--text-dim)",
            }}
          >
            {o.icone && <Icon name={o.icone} size={14} color={ativo ? "#fff" : "var(--text-dim)"} />}
            {o.label && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function LinhaToggle({ label, hint, ativo, onChange }: {
  label: string; hint?: string; ativo: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0" }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{label}</span>
        {hint && <span style={{ fontSize: 10.5, color: "var(--text-dim)", lineHeight: 1.35 }}>{hint}</span>}
      </span>
      <Interruptor ligado={ativo} onChange={onChange} titulo={label} cor={ACENTO} tamanho="sm" />
    </div>
  );
}

export function LinhaCor({ label, valor, onChange, padrao }: {
  label: string; valor: string | undefined; onChange: (v: string) => void; padrao?: string;
}) {
  const atual = valor || padrao || "#000000";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0" }}>
      <span style={{ fontSize: 12.5, color: "var(--text)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {valor && (
          <Botao variante="sutil" tamanho="sm" onClick={() => onChange("")} title="Limpar">limpar</Botao>
        )}
        <CampoCor rotulo={label} valor={atual} aoMudar={onChange} tamanho={20} />
      </span>
    </div>
  );
}

/** Upload que reusa a rota /api/upload já existente (bucket photos). */
export function BotaoUpload({ onPronto, rotulo = "Enviar imagem" }: { onPronto: (url: string) => void; rotulo?: string }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (f: File) => {
    setErro(null);
    if (!f.type.startsWith("image/")) { setErro("Escolha uma imagem."); return; }
    if (f.size > 8 * 1024 * 1024) { setErro("Máximo 8 MB."); return; }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("bucket", "photos");
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || "falha");
      onPronto(d.url as string);
    } catch { setErro("Não foi possível enviar."); }
    finally { setEnviando(false); }
  };

  return (
    <span style={{ display: "grid", gap: 4 }}>
      <Botao tamanho="sm" icone="upload" carregando={enviando} onClick={() => ref.current?.click()}>
        {enviando ? "Enviando…" : rotulo}
      </Botao>
      <input ref={ref} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); e.target.value = ""; }} />
      {erro && <span style={{ fontSize: 10.5, color: "var(--tf-neg, var(--perigo))" }}>{erro}</span>}
    </span>
  );
}

/** Campo de imagem: URL colada OU upload. */
export function EntradaImagem({ valor, onChange }: { valor: string | undefined; onChange: (v: string) => void }) {
  return (
    <span style={{ display: "grid", gap: 6 }}>
      <input value={valor ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Cole a URL ou envie" style={inp} />
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <BotaoUpload onPronto={onChange} />
        {valor && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={valor} alt="" style={{ width: 34, height: 34, borderRadius: 7, objectFit: "cover", border: "1px solid var(--border)" }} />
        )}
      </span>
    </span>
  );
}

export function Secao({ titulo, children, aberta = true }: { titulo: string; children: React.ReactNode; aberta?: boolean }) {
  const [open, setOpen] = useState(aberta);
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 0", background: "none", border: "none", cursor: "pointer",
          font: "inherit", color: "var(--text)", fontSize: 12.5, fontWeight: 800, letterSpacing: ".01em",
        }}
      >
        {titulo}
        <TrocaIcone ligado={open} a="chevron-right" b="chevron-down" size={14} corA="var(--text-dim)" corB="var(--text-dim)" />
      </button>
      {open && <div style={{ display: "grid", gap: 10, paddingBottom: 14 }}>{children}</div>}
    </div>
  );
}

export function Vazio({ icone, texto }: { icone: string; texto: string }) {
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 8, padding: "34px 16px", textAlign: "center" }}>
      <Icon name={icone} size={22} color="var(--text-dim)" />
      <span style={{ fontSize: 12.5, color: "var(--text-dim)", maxWidth: 210, lineHeight: 1.45 }}>{texto}</span>
    </div>
  );
}
