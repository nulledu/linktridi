"use client";

// Renderiza o markdown já em forma de árvore. O parse é puro e memoizável;
// aqui só se transforma token em elemento — nada de `dangerouslySetInnerHTML`,
// então texto do usuário jamais vira HTML.

import { memo, useMemo, useState } from "react";
import { parseMarkdown, soEmoji, type Bloco, type Inline } from "@/lib/chat/markdown";
import { COR_TOKEN, realcar } from "@/lib/chat/realce";

interface Ctx {
  meuNome: string;
  aoClicarMencao?: (nome: string) => void;
}

export const Conteudo = memo(function Conteudo({
  texto, meuNome, aoClicarMencao,
}: { texto: string } & Ctx) {
  const blocos = useMemo(() => parseMarkdown(texto), [texto]);
  const grande = useMemo(() => soEmoji(texto), [texto]);

  if (grande) {
    return <div className={`ch-msg__corpo--emoji-${grande}`}>{texto.trim()}</div>;
  }
  return (
    <div className="ch-md">
      {blocos.map((b, i) => (
        <BlocoView key={i} bloco={b} meuNome={meuNome} aoClicarMencao={aoClicarMencao} />
      ))}
    </div>
  );
});

function BlocoView({ bloco, meuNome, aoClicarMencao }: { bloco: Bloco } & Ctx) {
  switch (bloco.t) {
    case "p":
      return <p><Linha filhos={bloco.filhos} meuNome={meuNome} aoClicarMencao={aoClicarMencao} /></p>;
    case "citacao":
      return <blockquote><Linha filhos={bloco.filhos} meuNome={meuNome} aoClicarMencao={aoClicarMencao} /></blockquote>;
    case "hr":
      return <hr />;
    case "lista": {
      const itens = bloco.itens.map((it, i) => (
        <li key={i}><Linha filhos={it} meuNome={meuNome} aoClicarMencao={aoClicarMencao} /></li>
      ));
      return bloco.ordenada ? <ol>{itens}</ol> : <ul>{itens}</ul>;
    }
    case "codigo":
      return <BlocoCodigo lang={bloco.lang} codigo={bloco.codigo} />;
  }
}

function Linha({ filhos, meuNome, aoClicarMencao }: { filhos: Inline[] } & Ctx) {
  return (
    <>
      {filhos.map((n, i) => {
        switch (n.t) {
          case "texto": return <span key={i}>{n.v}</span>;
          case "forte": return <strong key={i}><Linha filhos={n.filhos} meuNome={meuNome} aoClicarMencao={aoClicarMencao} /></strong>;
          case "enfase": return <em key={i}><Linha filhos={n.filhos} meuNome={meuNome} aoClicarMencao={aoClicarMencao} /></em>;
          case "risco": return <s key={i}><Linha filhos={n.filhos} meuNome={meuNome} aoClicarMencao={aoClicarMencao} /></s>;
          case "code": return <code key={i}>{n.v}</code>;
          case "link":
            return (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer"
                 onClick={(e) => e.stopPropagation()}>{n.v}</a>
            );
          case "mencao": {
            // "@todos" e o seu próprio nome ficam em destaque quente.
            const paraMim = n.todos || n.nome.toLowerCase() === meuNome.toLowerCase()
              || meuNome.toLowerCase().startsWith(n.nome.toLowerCase() + " ");
            return (
              <span key={i}
                className={"ch-mencao" + (paraMim ? " ch-mencao--eu" : "")}
                onClick={(e) => { e.stopPropagation(); aoClicarMencao?.(n.nome); }}>
                @{n.nome}
              </span>
            );
          }
        }
      })}
    </>
  );
}

function BlocoCodigo({ lang, codigo }: { lang: string | null; codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  const tokens = useMemo(() => realcar(codigo, lang), [codigo, lang]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1400);
    } catch { /* sem permissão de área de transferência */ }
  }

  return (
    <div className="ch-cod">
      <div className="ch-cod__topo">
        {lang || "código"}
        <button type="button" className="ch-cod__copiar" onClick={copiar}>
          {copiado ? "copiado" : "copiar"}
        </button>
      </div>
      <pre><code>
        {tokens.map((t, i) =>
          t.t === "puro"
            ? <span key={i}>{t.v}</span>
            : <span key={i} style={{ color: COR_TOKEN[t.t] }}>{t.v}</span>,
        )}
      </code></pre>
    </div>
  );
}
