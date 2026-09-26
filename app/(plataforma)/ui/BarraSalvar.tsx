"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { Botao } from "./controles";
import { duracaoCss, useAbrirFechar } from "./micro";

// ── Barra flutuante de "alterações não salvas" ──────────────────────────────
// Porte do `toast-save` (21st.dev) pro kit do Gaius: sem Tailwind, sem
// framer-motion, ícones do Tabler, tempo e curva da escala do `globals.css`.
//
// Aparece quando a tela tem algo pendente e some quando não tem mais. Três
// estados, na ordem em que a pessoa os vê:
//
//   pendente  → "Alterações não salvas" + [Desfazer] [Salvar]
//   salvando  → giro + "Salvando…"        (os botões encolhem até sumir)
//   salvo     → check verde + "Salvo"     (fica 2 s e a barra sai)
//
// Vai pro <body> por portal — a fundação manda: popover não mora dentro da
// coluna de conteúdo (transform/overflow do ancestral engoliriam o `fixed`).
// No celular fica presa embaixo, ACIMA da barra de abas e da área segura.

export type EstadoBarraSalvar = "pendente" | "salvando" | "salvo";

export interface BarraSalvarProps {
  /** `null` = não há nada a mostrar (a barra sai com a transição de fechar). */
  estado: EstadoBarraSalvar | null;
  onDesfazer?: () => void;
  onSalvar?: () => void;
  textoPendente?: string;
  textoSalvando?: string;
  textoSalvo?: string;
  textoDesfazer?: string;
  textoSalvar?: string;
}

export function BarraSalvar({
  estado,
  onDesfazer,
  onSalvar,
  textoPendente = "Alterações não salvas",
  textoSalvando = "Salvando…",
  textoSalvo = "Alterações salvas",
  textoDesfazer = "Desfazer",
  textoSalvar = "Salvar",
}: BarraSalvarProps) {
  // Só monta no cliente: o portal precisa de `document`, e no servidor não há.
  const [cliente, setCliente] = useState(false);
  useEffect(() => setCliente(true), []);

  const { montado, classe } = useAbrirFechar(estado !== null, "--toast-close");
  // Durante a saída a barra ainda precisa de um estado pra desenhar: o último.
  const ultimo = useRef<EstadoBarraSalvar>("pendente");
  if (estado) ultimo.current = estado;
  const mostrado = estado ?? ultimo.current;

  if (!cliente || !montado) return null;

  return createPortal(
    <div className="ui-barra-salvar-host" role="status" aria-live="polite">
      <div className={`ui-barra-salvar t-toast ${classe}`} data-estado={mostrado}>
        <span className="ui-barra-salvar-texto">
          <span className="ui-barra-salvar-face" data-face="pendente" aria-hidden={mostrado !== "pendente"}>
            <Icon name="info-circle" size={17} />
          </span>
          <span className="ui-barra-salvar-face" data-face="salvando" aria-hidden={mostrado !== "salvando"}>
            <span className="spin" style={{ display: "inline-flex" }}><Icon name="loader" size={16} /></span>
          </span>
          <span className="ui-barra-salvar-face" data-face="salvo" aria-hidden={mostrado !== "salvo"}>
            <span className="ui-barra-salvar-check"><Icon name="check" size={12} /></span>
          </span>
          <span className="ui-barra-salvar-rotulo">
            {mostrado === "pendente" ? textoPendente : mostrado === "salvando" ? textoSalvando : textoSalvo}
          </span>
        </span>
        {/* Grade 0fr→1fr: é como largura "auto" anima sem JS medir nada. */}
        <span className="ui-barra-salvar-acoes" aria-hidden={mostrado !== "pendente"}>
          <span className="ui-barra-salvar-acoes-in">
            <Botao variante="sutil" tamanho="sm" onClick={onDesfazer} tabIndex={mostrado === "pendente" ? 0 : -1}>
              {textoDesfazer}
            </Botao>
            <Botao variante="primario" tamanho="sm" onClick={onSalvar} tabIndex={mostrado === "pendente" ? 0 : -1}>
              {textoSalvar}
            </Botao>
          </span>
        </span>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Máquina de estado da barra, pra tela que já sabe o que está "sujo":
 *
 *   const barra = useBarraSalvar({ sujo, salvar, desfazer });
 *   <BarraSalvar {...barra} />
 *
 * `sujo` verdadeiro → `pendente`. Clicar em Salvar → `salvando` até `salvar()`
 * resolver; se resolveu (e não devolveu `false`) → `salvo` por `salvoMs` e a
 * barra some; se falhou, volta a `pendente` (a tela mostra o erro do jeito
 * dela — toast, campo vermelho). Se `sujo` volta a ser falso por fora (a tela
 * salvou por outro botão), a barra só sai.
 */
export function useBarraSalvar({ sujo, salvar, desfazer, salvoMs }: {
  sujo: boolean;
  salvar: () => unknown | Promise<unknown>;
  desfazer?: () => void;
  salvoMs?: number;
}) {
  const [fase, setFase] = useState<"salvando" | "salvo" | null>(null);
  const salvarRef = useRef(salvar);
  const desfazerRef = useRef(desfazer);
  useEffect(() => { salvarRef.current = salvar; desfazerRef.current = desfazer; });
  const vivo = useRef(true);
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; clearTimeout(relogio.current); };
  }, []);

  const onSalvar = useCallback(async () => {
    if (fase === "salvando") return;
    clearTimeout(relogio.current);
    setFase("salvando");
    let ok = true;
    try {
      const r = await salvarRef.current();
      if (r === false) ok = false;
    } catch {
      ok = false;
    }
    if (!vivo.current) return;
    if (!ok) { setFase(null); return; }
    setFase("salvo");
    relogio.current = setTimeout(() => { if (vivo.current) setFase(null); }, salvoMs ?? duracaoCss("--barra-salvar-salvo", 2000));
  }, [fase, salvoMs]);

  const onDesfazer = useCallback(() => { desfazerRef.current?.(); }, []);

  const estado: EstadoBarraSalvar | null = fase ?? (sujo ? "pendente" : null);
  return { estado, onSalvar, onDesfazer, salvando: fase === "salvando" };
}
