// Markdown mínimo pro DEVKIT.md — só o que o manual usa: títulos, parágrafo,
// listas (com aninhamento raso), tabela, bloco de código, régua, e no texto
// `código`, **negrito**, *itálico* e [link](url). Não puxa biblioteca porque
// a página é uma só e o arquivo é nosso; se o manual ganhar sintaxe nova e ela
// sair crua aqui, é aqui que se ensina.
import type { ReactNode } from "react";

function linkDoRepo(href: string): string {
  // Links relativos do manual apontam pro código (../app/…). Na página eles
  // não levam a lugar nenhum útil, então viram o link do GitHub.
  if (/^https?:/.test(href)) return href;
  const limpo = href.replace(/^(\.\.\/)+/, "").replace(/^\.\//, "").replace(/:(\d+)$/, "#L$1");
  return `https://github.com/sistemaempreendedores/dashvendas/blob/main/${limpo}`;
}

export function inline(texto: string, chave = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(\*[^*\s][^*]*\*)/g;
  let ult = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ult) out.push(texto.slice(ult, m.index));
    const t = m[0];
    const k = `${chave}-${n++}`;
    if (m[1]) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (m[3]) {
      const [, rot, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!;
      out.push(<a key={k} href={linkDoRepo(href)} target="_blank" rel="noreferrer">{inline(rot, k)}</a>);
    } else out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    ult = m.index + t.length;
  }
  if (ult < texto.length) out.push(texto.slice(ult));
  return out;
}

export function slug(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[`*]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const celulas = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ fonte }: { fonte: string }) {
  const linhas = fonte.replace(/\r/g, "").split("\n");
  const blocos: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith("```")) {
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !linhas[i].startsWith("```")) corpo.push(linhas[i++]);
      i++;
      blocos.push(<pre key={k++}><code>{corpo.join("\n")}</code></pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const nivel = h[1].length;
      const Tag = (`h${nivel}`) as "h1" | "h2" | "h3" | "h4";
      blocos.push(<Tag key={k++} id={slug(h[2])}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (/^---+$/.test(l.trim())) { blocos.push(<hr key={k++} />); i++; continue; }
    if (l.trim().startsWith("|")) {
      const cab = celulas(l);
      i += 2; // cabeçalho + separador
      const corpo: string[][] = [];
      while (i < linhas.length && linhas[i].trim().startsWith("|")) corpo.push(celulas(linhas[i++]));
      blocos.push(
        <div key={k++} className="kit-tabela">
          <table>
            <thead><tr>{cab.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
            <tbody>{corpo.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j} data-l={cab[j]}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const ordenada = /^\s*\d+\./.test(l);
      const itens: { texto: string; filhos: string[] }[] = [];
      while (i < linhas.length && (linhas[i].trim() === "" ? /^\s+([-*]|\d+\.)\s|^\s{2,}\S/.test(linhas[i + 1] ?? "") : /^\s*([-*]|\d+\.)\s|^\s{2,}\S/.test(linhas[i]))) {
        const x = linhas[i];
        if (!x.trim()) { i++; continue; }
        const top = /^([-*]|\d+\.)\s+(.*)$/.exec(x);
        if (top) itens.push({ texto: top[2], filhos: [] });
        else {
          const sub = /^\s+([-*]|\d+\.)\s+(.*)$/.exec(x);
          const alvo = itens[itens.length - 1];
          if (!alvo) break;
          if (sub) alvo.filhos.push(sub[2]);
          else if (alvo.filhos.length) alvo.filhos[alvo.filhos.length - 1] += " " + x.trim();
          else alvo.texto += " " + x.trim();
        }
        i++;
      }
      const L = ordenada ? "ol" : "ul";
      blocos.push(
        <L key={k++}>
          {itens.map((it, a) => (
            <li key={a}>
              {inline(it.texto)}
              {it.filhos.length > 0 && <ul>{it.filhos.map((f, b) => <li key={b}>{inline(f)}</li>)}</ul>}
            </li>
          ))}
        </L>,
      );
      continue;
    }
    const par: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,4}\s|```|\||---+$|\s*([-*]|\d+\.)\s)/.test(linhas[i])) par.push(linhas[i++].trim());
    blocos.push(<p key={k++}>{inline(par.join(" "))}</p>);
  }
  return <>{blocos}</>;
}
