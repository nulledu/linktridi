"use client";

// Renderiza um texto comum trocando só os blocos de ```código``` pelo
// BlocoDeCodigo. NÃO é um markdown inteiro de propósito: o pedido era "code
// block em tarefa/solicitação", e ligar negrito/itálico/lista mudaria como todo
// texto JÁ EXISTENTE aparece (um `*` viraria itálico sem ninguém pedir). Sem
// fence, o texto sai idêntico ao `pre-wrap` de antes — a mudança é aditiva.
//
// Fence: uma linha ```<lang opcional>, o corpo, e uma linha ```. Fence sem
// fechamento não casa e o texto todo continua texto. Usado nos comentários de
// tarefa e na descrição de solicitação.

import { BlocoDeCodigo } from "./BlocoDeCodigo";

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;

export function TextoComCodigo({
  texto, style, className,
}: { texto: string; style?: React.CSSProperties; className?: string }) {
  const partes: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  FENCE.lastIndex = 0;
  while ((m = FENCE.exec(texto))) {
    if (m.index > i) empurrarTexto(partes, texto.slice(i, m.index), k++);
    const lang = m[1].trim();
    partes.push(
      <BlocoDeCodigo key={k++} codigo={m[2]} linguagem={lang || "texto"} titulo={lang || undefined} />,
    );
    i = m.index + m[0].length;
  }
  if (i < texto.length) empurrarTexto(partes, texto.slice(i), k++);

  return (
    <div className={["ui-texto-cod", className].filter(Boolean).join(" ")} style={style}>
      {partes}
    </div>
  );
}

// Cor e tamanho vêm por herança do container (o chamador estiliza como já
// estilizava o `<p>`), então o BlocoDeCodigo — que tem cor própria — não é
// arrastado pelo estilo do texto ao redor.
function empurrarTexto(dest: React.ReactNode[], v: string, key: number) {
  const t = v.replace(/^\n+|\n+$/g, "");
  if (!t) return;
  dest.push(
    <p key={key} className="ui-texto-cod-p" style={{ margin: dest.length ? "8px 0 0" : 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "inherit", fontSize: "inherit", lineHeight: "inherit" }}>
      {t}
    </p>,
  );
}

export default TextoComCodigo;
