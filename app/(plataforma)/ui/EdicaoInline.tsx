"use client";

// ── Edição no lugar ──────────────────────────────────────────────────────────
// Tocar no valor e trocar ali mesmo, sem abrir tela nem formulário. Nasceu pro
// detalhe do story ("Cliques: 120 → toca → 147 → Enter"), mas não sabe nada de
// story: é um valor, um rótulo e um `onSalvar`.
//
// Regras que valem pra qualquer uso:
//  • Enter ou sair do campo salva; Esc desiste — e o Esc NÃO fecha o painel
//    de fora. O `PainelLateral` escuta o `keydown` no `document`, onde o React
//    também escuta (e registrou antes): `stopImmediatePropagation` segura o
//    do painel, `stopPropagation` sozinho não seguraria.
//  • Valor igual não chama `onSalvar` — nada de pedido à toa na fila.
//  • Texto inválido volta pro valor de antes; nunca grava "doze".
//  • O lápis fica sempre visível (mais claro): no toque não existe hover, e
//    um valor editável que não parece editável não existe no celular.
//  • Visual todo em `.ui-inline*` no globals.css.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../Icon";

function segurarEsc(e: KeyboardEvent) {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
}

/** Abre/fecha o campo e garante que o fechamento rode UMA vez: Enter fecha, o
 *  campo some, e o `blur` que o navegador ainda dispara não pode salvar de
 *  novo (nem salvar depois de um Esc). */
function useEdicao() {
  const [editando, setEditando] = useState(false);
  const feito = useRef(false);
  const campo = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editando) return;
    campo.current?.focus();
    campo.current?.select();
  }, [editando]);
  const abrir = () => { feito.current = false; setEditando(true); };
  const fechar = (fn?: () => void) => {
    if (feito.current) return;
    feito.current = true;
    setEditando(false);
    fn?.();
  };
  return { editando, abrir, fechar, campo };
}

export function NumeroInline({ valor, onSalvar, rotulo, desativado, children, max = 10_000_000, className }: {
  valor: number;
  onSalvar: (n: number) => void;
  /** Nome do campo — vai no rótulo acessível ("Cliques"). */
  rotulo: string;
  desativado?: boolean;
  /** Como o valor aparece fora da edição (padrão: número com ponto de milhar). */
  children?: ReactNode;
  max?: number;
  className?: string;
}) {
  const { editando, abrir, fechar, campo } = useEdicao();
  const [texto, setTexto] = useState("");
  const mostra = children ?? valor.toLocaleString("pt-BR");

  if (desativado) return <span className={className}>{mostra}</span>;

  const salvar = () => {
    const limpo = texto.replace(/[.\s]/g, "").replace(",", ".");
    const n = Number(limpo);
    if (!limpo || !Number.isInteger(n) || n < 0 || n > max || n === valor) return;
    onSalvar(n);
  };

  if (editando) {
    return (
      <input
        ref={campo} className={`ui-inline-campo ${className ?? ""}`} inputMode="numeric" enterKeyHint="done"
        aria-label={rotulo} value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => fechar(salvar)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); fechar(salvar); }
          else if (e.key === "Escape") { segurarEsc(e); fechar(); }
        }}
      />
    );
  }
  return (
    <button type="button" className={`ui-inline ${className ?? ""}`} title="Toque para editar"
      aria-label={`${rotulo}: ${valor.toLocaleString("pt-BR")}. Editar`}
      onClick={() => { setTexto(String(valor)); abrir(); }}>
      <span className="ui-inline-valor">{mostra}</span>
      <Icon name="pencil" size={13} className="ui-inline-lapis" />
    </button>
  );
}

export function TextoInline({
  valor, onSalvar, rotulo, placeholder = "Adicionar", multilinha, max = 120, desativado, sugestoes, className,
}: {
  valor: string | null;
  /** `null` quando a pessoa apagou o texto. */
  onSalvar: (t: string | null) => void;
  rotulo: string;
  placeholder?: string;
  /** Observação: Enter quebra a linha; Ctrl/⌘+Enter (ou sair do campo) salva. */
  multilinha?: boolean;
  max?: number;
  desativado?: boolean;
  /** Vira um `<datalist>`: sugestão, nunca obrigação. */
  sugestoes?: string[];
  className?: string;
}) {
  const { editando, abrir, fechar, campo } = useEdicao();
  const [texto, setTexto] = useState("");
  const idLista = useId();

  if (desativado) {
    return <span className={className}>{valor || <span className="ui-inline-vazio">—</span>}</span>;
  }

  const salvar = () => {
    const t = multilinha ? texto.trim() : texto.replace(/\s+/g, " ").trim();
    if (t === (valor ?? "")) return;
    onSalvar(t ? t.slice(0, max) : null);
  };
  const teclas = (e: KeyboardEvent) => {
    if (e.key === "Escape") { segurarEsc(e); fechar(); return; }
    if (e.key === "Enter" && (!multilinha || e.metaKey || e.ctrlKey)) { e.preventDefault(); fechar(salvar); }
  };

  if (editando) {
    return multilinha ? (
      <textarea ref={campo} className={`ui-inline-campo ${className ?? ""}`} aria-label={rotulo} rows={3}
        maxLength={max} value={texto} placeholder={placeholder}
        onChange={(e) => setTexto(e.target.value)} onBlur={() => fechar(salvar)} onKeyDown={teclas} />
    ) : (
      <>
        <input ref={campo} className={`ui-inline-campo ${className ?? ""}`} aria-label={rotulo} maxLength={max}
          value={texto} placeholder={placeholder} enterKeyHint="done" list={sugestoes?.length ? idLista : undefined}
          onChange={(e) => setTexto(e.target.value)} onBlur={() => fechar(salvar)} onKeyDown={teclas} />
        {sugestoes?.length ? <datalist id={idLista}>{sugestoes.map((s) => <option key={s} value={s} />)}</datalist> : null}
      </>
    );
  }
  return (
    <button type="button" className={`ui-inline ${className ?? ""}`} data-multi={multilinha ? "1" : undefined}
      title="Toque para editar" aria-label={`${rotulo}: ${valor || "vazio"}. Editar`}
      onClick={() => { setTexto(valor ?? ""); abrir(); }}>
      {valor ? <span className="ui-inline-texto">{valor}</span> : <span className="ui-inline-vazio">{placeholder}</span>}
      <Icon name="pencil" size={13} className="ui-inline-lapis" />
    </button>
  );
}
