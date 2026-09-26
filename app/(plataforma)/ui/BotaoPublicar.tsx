"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BOTÃO PUBLICAR — um botão só, que se transforma em três estados:
//
//   ocioso     → "Publicar"     (tinta da marca)
//   publicando → "Publicando…"  (anel girando; o botão não aceita clique)
//   publicado  → "Publicado"    (verde, com o check DESENHADO)
//
// Clicar de novo no estado `publicado` devolve o botão pro começo — é a mesma
// ação de sempre (republicar), então a pessoa não fica com um botão morto na
// tela depois que deu certo.
//
// A largura NÃO muda entre os três rótulos: as três faces do texto ocupam a
// mesma célula de grade e só trocam de opacidade. Sem isso a barra de ações
// dava um solavanco no instante do clique.
//
// Todo o visual mora em `.ui-publicar` no `globals.css` — aqui só o ciclo.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

export type EstadoPublicar = "ocioso" | "publicando" | "publicado";

type Props = {
  /** A publicação de verdade. Se devolver `false` (ou estourar), o botão volta
   *  pro estado ocioso em vez de mentir um "Publicado". */
  onPublicar: () => void | boolean | Promise<void | boolean>;
  /** Rótulo do estado ocioso — "Publicar", "Publicar loja", "Republicar"… */
  children?: string;
  /** Rótulo do estado final. */
  rotuloPronto?: string;
  /** Rótulo enquanto roda. */
  rotuloRodando?: string;
  /** Ícone do estado ocioso (Tabler, ver `Icon.tsx`). */
  icone?: string;
  tamanho?: "sm" | "md" | "lg";
  bloco?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
};

export function BotaoPublicar({
  onPublicar, children = "Publicar", rotuloPronto = "Publicado",
  rotuloRodando = "Publicando…", icone = "rocket",
  tamanho = "md", bloco, disabled, title, className,
}: Props) {
  const [estado, setEstado] = useState<EstadoPublicar>("ocioso");
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const clicar = useCallback(async () => {
    // Clique no estado final: volta pro começo. É o "reset" do ciclo.
    if (estado === "publicado") { setEstado("ocioso"); return; }
    if (estado === "publicando") return;
    setEstado("publicando");
    try {
      const r = await onPublicar();
      if (!vivo.current) return;
      setEstado(r === false ? "ocioso" : "publicado");
    } catch {
      if (vivo.current) setEstado("ocioso");
    }
  }, [estado, onPublicar]);

  const tamIcone = tamanho === "lg" ? 17 : tamanho === "sm" ? 14 : 15.5;

  return (
    <button
      type="button"
      onClick={clicar}
      disabled={disabled || estado === "publicando"}
      aria-busy={estado === "publicando" || undefined}
      aria-live="polite"
      title={title}
      data-estado={estado}
      data-t={tamanho}
      data-bloco={bloco ? "1" : undefined}
      className={["ui-publicar", className].filter(Boolean).join(" ")}
    >
      <span className="ui-publicar-ico" aria-hidden>
        <span data-face="ocioso"><Icon name={icone} size={tamIcone} /></span>
        {/* O anel é CSS puro: um círculo com um quarto de borda transparente
            girando. Só existe enquanto publica — animação infinita parada em
            toda tela custaria quadro por nada. */}
        <span data-face="publicando"><i className="ui-publicar-anel" style={{ width: tamIcone, height: tamIcone }} /></span>
        <span data-face="publicado"><Icon name="check" size={tamIcone} stroke={2.4} /></span>
      </span>
      {/* As três faces do texto na MESMA célula: a largura do botão é a do
          rótulo mais longo e não pula na troca. */}
      {/* As três faces existem SEMPRE no DOM (é assim que a largura não pula),
          então as que estão apagadas saem da árvore de acessibilidade: sem
          isto o nome do botão seria "PublicarPublicando…Publicado". */}
      <span className="ui-publicar-txt">
        <span data-face="ocioso" aria-hidden={estado !== "ocioso" || undefined}>{children}</span>
        <span data-face="publicando" aria-hidden={estado !== "publicando" || undefined}>{rotuloRodando}</span>
        <span data-face="publicado" aria-hidden={estado !== "publicado" || undefined}>{rotuloPronto}</span>
        <span className="ui-publicar-medida" aria-hidden>{[children, rotuloRodando, rotuloPronto].sort((a, b) => b.length - a.length)[0]}</span>
      </span>
    </button>
  );
}
