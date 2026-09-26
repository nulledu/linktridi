"use client";

// Editor de texto inline com barra de formatação (negrito/itálico/sublinhado/
// link/variável). Usado no card do bloco (canvas) e na bolha do preview.
// O texto é markdown leve compatível com fmtTexto: **negrito**, *itálico*,
// ++sublinhado++, [rótulo](url) e {{variavel}}.
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

export function RichTextInline({
  value, onChange, variables = [], autoFocus = false, placeholder = "Escreva a mensagem…",
  commitOnEnter = false, onCommit, onCancel, minRows = 2, textStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  variables?: string[];
  autoFocus?: boolean;
  placeholder?: string;
  commitOnEnter?: boolean;
  onCommit?: () => void;
  onCancel?: () => void;
  minRows?: number;
  textStyle?: React.CSSProperties;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const selRef = useRef<[number, number] | null>(null);   // seleção a restaurar após update controlado
  const [varsAberto, setVarsAberto] = useState(false);

  useEffect(() => { if (autoFocus) { const ta = taRef.current; if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } } }, [autoFocus]);
  useEffect(() => {
    if (selRef.current && taRef.current) {
      const [s, e] = selRef.current; taRef.current.focus(); taRef.current.setSelectionRange(s, e); selRef.current = null;
    }
  });

  const envolver = (marca: string) => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, sel = value.slice(s, e);
    const novo = value.slice(0, s) + marca + sel + marca + value.slice(e);
    selRef.current = sel ? [s + marca.length, e + marca.length] : [s + marca.length, s + marca.length];
    onChange(novo);
  };
  const inserir = (txt: string) => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const novo = value.slice(0, s) + txt + value.slice(e);
    selRef.current = [s + txt.length, s + txt.length];
    onChange(novo);
  };
  const inserirLink = () => {
    const url = typeof window !== "undefined" ? window.prompt("URL do link:", "https://") : null;
    if (!url) return;
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, sel = value.slice(s, e) || "link";
    const ins = `[${sel}](${url})`;
    const novo = value.slice(0, s) + ins + value.slice(e);
    selRef.current = [s + ins.length, s + ins.length];
    onChange(novo);
  };

  const rows = Math.max(minRows, value.split("\n").length);
  const naoRoubarFoco = (e: React.MouseEvent) => e.preventDefault();   // mantém seleção do textarea

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
      <div className="tf-fmtbar" style={{ marginBottom: 4 }}>
        <div style={{ position: "relative" }}>
          <button type="button" className="tf-fmtbtn" title="Inserir variável" onMouseDown={naoRoubarFoco} onClick={() => setVarsAberto((o) => !o)}>
            <Icon name="variable" size={15} />
          </button>
          {varsAberto && (
            <div onMouseDown={naoRoubarFoco} style={{ position: "absolute", top: "100%", left: 0, zIndex: 60, marginTop: 4, minWidth: 150, maxHeight: 180, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,.28)", padding: 5 }}>
              {variables.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-dim)", padding: "6px 8px" }}>Nenhuma variável ainda.</div>}
              {variables.map((v) => (
                <button key={v} type="button" onMouseDown={naoRoubarFoco} onClick={() => { inserir(`{{${v}}}`); setVarsAberto(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", color: "var(--text)", fontSize: 12.5 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  {"{{"}{v}{"}}"}
                </button>
              ))}
              <button type="button" onMouseDown={naoRoubarFoco} onClick={() => { inserir("{{}}"); setVarsAberto(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", color: "var(--primary-texto, var(--primary))", fontSize: 12, fontWeight: 700 }}>
                + variável manual
              </button>
            </div>
          )}
        </div>
        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 3px" }} />
        <button type="button" className="tf-fmtbtn" title="Negrito" onMouseDown={naoRoubarFoco} onClick={() => envolver("**")}><Icon name="bold" size={15} /></button>
        <button type="button" className="tf-fmtbtn" title="Itálico" onMouseDown={naoRoubarFoco} onClick={() => envolver("*")}><Icon name="italic" size={15} /></button>
        <button type="button" className="tf-fmtbtn" title="Sublinhado" onMouseDown={naoRoubarFoco} onClick={() => envolver("++")}><Icon name="underline" size={15} /></button>
        <button type="button" className="tf-fmtbtn" title="Link" onMouseDown={naoRoubarFoco} onClick={inserirLink}><Icon name="link" size={15} /></button>
      </div>
      <textarea
        ref={taRef} className="tf-inline-ta nodrag nowheel" value={value} placeholder={placeholder} rows={rows}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onCancel?.(); }
          else if (e.key === "Enter" && commitOnEnter && !e.shiftKey) { e.preventDefault(); onCommit?.(); }
        }}
        onBlur={() => { if (!varsAberto) onCommit?.(); }}
        style={textStyle}
      />
    </div>
  );
}
