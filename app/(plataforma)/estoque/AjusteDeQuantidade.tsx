"use client";
import { menosMovimento, useClasseAberta } from "../ui/micro";

import { useEffect, useRef, useState } from "react";
import "./estoque-micro.css";
import { createPortal } from "react-dom";
import { Botao, BotaoIcone, Contador } from "../ui/controles";
import { UnidadesDoItem } from "./UnidadesDoItem";
import type { Item } from "./tipos";

/**
 * Ajustar a quantidade de UM item, e só isso.
 *
 * Quem tem `estoque:ajustar` sem `estoque:cadastrar` não abre o `ItemEditor`:
 * lá dentro estão nome, SKU, hierarquia, ficha técnica e o botão de apagar —
 * a ficha inteira desabilitada só pra chegar num campo de número seria uma
 * tela que promete o que a permissão nega. Este painel é o caminho dessa
 * pessoa: quanto tem agora, quanto passa a ter, salvar.
 *
 * Item ETIQUETADO não tem campo digitado: a quantidade dele é a contagem das
 * etiquetas (a trigger `estoque_recontar_unidades` manda no número, e o banco
 * ignora quantidade digitada). Nesse caso o painel mostra as unidades e o
 * gerar etiquetas — que é como se "adiciona" num item serializado.
 */
export function AjusteDeQuantidade({ item, onClose, onSalvo, classe = "" }: {
  item: Item;
  onClose: () => void;
  onSalvo: () => void;
  /** `is-open`/`is-closing` de quem segura o booleano lá fora (`useAbrirFechar`). */
  classe?: string;
}) {
  const cls = useClasseAberta(classe);
  const [mounted, setMounted] = useState(false);
  const atual = Math.max(0, Math.trunc(item.quantidade ?? 0));
  const [valor, setValor] = useState(String(atual));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Contador de TENTATIVA: o mesmo erro duas vezes seguidas precisa tremer de
  // novo, senão o segundo clique parece não ter chegado (Kinetics 103).
  const [tentativa, setTentativa] = useState(0);
  const [salvo, setSalvo] = useState(false);
  const erroRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => { setMounted(true); }, []);

  /** Tira → refluxo → repõe: sem o `offsetWidth` no meio o navegador junta as
   *  duas mudanças no mesmo quadro e a animação não reinicia. */
  function reanimar(el: HTMLElement | null, classe: string) {
    if (!el || menosMovimento()) return;
    el.classList.remove(classe);
    void el.offsetWidth;
    el.classList.add(classe);
  }

  useEffect(() => {
    if (!erro) return;
    const el = erroRef.current;
    reanimar(el, "mt-tremor");
    const t = setTimeout(() => el?.classList.remove("mt-tremor"), 500);
    return () => clearTimeout(t);
  }, [erro, tentativa]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** O que está digitado, lido como inteiro não-negativo. Campo vazio ou "abc"
   *  valem 0 — o passo continua funcionando em cima de lixo. */
  const passo = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));
  const novo = passo(valor);
  const delta = novo - atual;

  async function salvar() {
    setBusy(true); setErro(null);
    try {
      const r = await fetch("/api/estoque-itens", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        // A trava: grava só se o banco ainda estiver no número que este painel
        // mostrou. Sem ela, uma saída bipada enquanto o painel estava aberto
        // era apagada pelo número digitado aqui.
        body: JSON.stringify({ id: item.id, quantidade: novo, quantidade_antes: item.quantidade ?? 0 }),
      });
      // Sem `r.ok`, um 403 (permissão retirada no meio do expediente) ou um 401
      // de sessão expirada fechavam o painel como se tivesse gravado — e o
      // número voltava ao antigo no próximo carregamento, sem explicação.
      if (!r.ok) {
        const d = await r.json().catch(() => ({} as Record<string, string>));
        setErro(d.error === "forbidden"
          ? "Você não tem mais permissão pra ajustar quantidade."
          : d.error === "estoque_mudou"
            ? String(d.detalhe)
            : "Não deu pra salvar agora. Tente de novo.");
        setTentativa((n) => n + 1);
        return;
      }
      // Estado "Salvo" com check (Kinetics 072) por um instante antes de
      // fechar. Quem pediu menos movimento fecha na hora.
      if (menosMovimento()) { onSalvo(); return; }
      setSalvo(true);
      setTimeout(onSalvo, 450);
    } catch {
      setErro("Não deu pra salvar agora. Tente de novo.");
      setTentativa((n) => n + 1);
    } finally { setBusy(false); }
  }

  if (!mounted) return null;
  // Portal p/ document.body: o mesmo motivo do ItemEditor — ancestral com
  // transform/blur prende o position:fixed do backdrop e o painel some.
  return createPortal(
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose}>
      <div className={`apple-modal glass glass-spec sheet t-modal ${cls}`.trim()} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(540px,100%)", maxHeight: "90dvh", overflowY: "auto", borderRadius: "var(--r-lg)", padding: "clamp(14px, 3.5vw, 22px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Ajustar quantidade</h2>
            <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.nome}{item.sku ? ` · ${item.sku}` : ""}
            </p>
          </div>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onClose} style={{ marginLeft: "auto", flex: "none" }} />
        </div>

        {item.serializado ? (
          <>
            <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 10px", lineHeight: 1.45 }}>
              Este item é contado por <strong>etiqueta</strong>: a quantidade não se digita, ela é a soma
              do que existe na prateleira. Pra somar, gere etiquetas; pra tirar, bipe na aba Bipar.
            </p>
            <UnidadesDoItem itemId={item.id} pecasEmEstoque={atual} />
            <div style={{ display: "flex", marginTop: 14 }}>
              <Botao onClick={onClose} style={{ flex: 1, minHeight: "var(--tap)" }}>Fechar</Botao>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface)", border: "1px solid var(--border)", marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Tem agora</span>
              <strong style={{ marginLeft: "auto", fontSize: 16 }}>{atual} {item.unidade}</strong>
            </div>

            {/* Passa a ter: campo com −/+ de 44px. O número é o VALOR FINAL e
                não um delta — é assim que a contagem da prateleira chega
                (a pessoa conta 37 e digita 37), e a diferença aparece sozinha
                logo abaixo pra confirmar o que vai acontecer. */}
            <label htmlFor="est-passa-a-ter" style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Passa a ter</label>
            <Contador id="est-passa-a-ter" rotulo="Passa a ter" min={0} valor={novo}
              onValor={(n) => setValor(String(n))} />

            <p style={{ fontSize: 12.5, margin: "10px 0 0", color: delta === 0 ? "var(--text-dim)" : "var(--text)" }}>
              {delta === 0
                ? "Nada muda."
                : <>{delta > 0 ? "Entram" : "Saem"} <strong>{Math.abs(delta)} {item.unidade}</strong>.</>}
            </p>

            {erro && (
              <p ref={erroRef} role="alert" style={{ fontSize: 12.5, color: "var(--perigo, var(--danger))", margin: "8px 0 0" }}>{erro}</p>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Botao onClick={onClose} disabled={salvo} style={{ flex: 1, minHeight: "var(--tap)" }}>Cancelar</Botao>
              <Botao variante="primario" onClick={salvar} carregando={busy} disabled={busy || salvo || delta === 0}
                icone={salvo ? "check" : undefined} className={salvo ? "est-salvo" : undefined}
                style={{ flex: 1, minHeight: "var(--tap)", ...(salvo ? { opacity: 1 } : null) }}>{salvo ? "Salvo" : "Salvar"}</Botao>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
