// Realce de sintaxe minúsculo, sem dependência externa.
// Uma biblioteca de highlight (Prism/Shiki) custaria 40–200 KB no bundle de uma
// tela que precisa ser rápida; aqui um tokenizador genérico cobre o que de fato
// aparece num chat de trabalho: comentário, texto, número, palavra-chave.

export type TipoToken = "comentario" | "texto" | "numero" | "chave" | "funcao" | "puro";
export interface Token { t: TipoToken; v: string }

const CHAVES: Record<string, string> = {
  js: "const let var function return if else for while do break continue new class extends import export from default async await try catch finally throw typeof instanceof null undefined true false this super yield delete in of void",
  ts: "const let var function return if else for while do break continue new class extends implements interface type enum import export from default async await try catch finally throw typeof instanceof null undefined true false this super readonly public private protected as satisfies keyof infer never unknown any string number boolean void",
  sql: "select insert update delete from where join left right inner outer on group by order having limit offset create table alter add column drop index unique primary key foreign references default not null and or as distinct values into set case when then else end with returning",
  py: "def class return if elif else for while import from as try except finally raise with lambda None True False and or not in is pass break continue yield async await global nonlocal",
  sh: "if then else fi for while do done case esac function return export local echo cd exit set unset source",
  kt: "fun val var class object interface return if else for while when import package data suspend override private public internal null true false is as in out companion",
  json: "true false null",
  css: "important media supports keyframes import font-face root",
};

const ALIAS: Record<string, string> = {
  javascript: "js", jsx: "js", mjs: "js", node: "js",
  typescript: "ts", tsx: "ts",
  python: "py", python3: "py",
  bash: "sh", shell: "sh", zsh: "sh", console: "sh",
  kotlin: "kt", java: "kt",
  postgres: "sql", postgresql: "sql", psql: "sql", mysql: "sql",
  scss: "css", less: "css",
  yml: "json", yaml: "json",
};

const LINHA_COMENTARIO: Record<string, string[]> = {
  js: ["//"], ts: ["//"], kt: ["//"], css: [], json: [],
  sql: ["--"], py: ["#"], sh: ["#"],
};

/** Divide o código em tokens coloríveis. Nunca lança: no pior caso devolve texto puro. */
export function realcar(codigo: string, lang: string | null): Token[] {
  const key = ALIAS[(lang || "").toLowerCase()] ?? (lang || "").toLowerCase();
  const chaves = new Set((CHAVES[key] ?? "").split(" ").filter(Boolean));
  if (!chaves.size && key !== "css") return [{ t: "puro", v: codigo }];
  const inicios = LINHA_COMENTARIO[key] ?? ["//"];

  const out: Token[] = [];
  let buf = "";
  const solta = () => { if (buf) { out.push({ t: "puro", v: buf }); buf = ""; } };

  let i = 0;
  while (i < codigo.length) {
    const resto = codigo.slice(i);

    // comentário de bloco
    if (resto.startsWith("/*")) {
      const fim = codigo.indexOf("*/", i + 2);
      const ate = fim === -1 ? codigo.length : fim + 2;
      solta(); out.push({ t: "comentario", v: codigo.slice(i, ate) }); i = ate; continue;
    }
    // comentário de linha
    const ini = inicios.find((s) => resto.startsWith(s));
    if (ini) {
      const nl = codigo.indexOf("\n", i);
      const ate = nl === -1 ? codigo.length : nl;
      solta(); out.push({ t: "comentario", v: codigo.slice(i, ate) }); i = ate; continue;
    }
    // texto entre aspas (com escape)
    const aspa = codigo[i];
    if (aspa === '"' || aspa === "'" || aspa === "`") {
      let j = i + 1;
      while (j < codigo.length && codigo[j] !== aspa) j += codigo[j] === "\\" ? 2 : 1;
      solta(); out.push({ t: "texto", v: codigo.slice(i, Math.min(j + 1, codigo.length)) }); i = j + 1; continue;
    }
    // número
    const num = /^\d+(\.\d+)?/.exec(resto);
    if (num && !/[\w$]/.test(codigo[i - 1] ?? "")) {
      solta(); out.push({ t: "numero", v: num[0] }); i += num[0].length; continue;
    }
    // identificador → palavra-chave, chamada de função ou nada
    const id = /^[A-Za-z_$][\w$-]*/.exec(resto);
    if (id) {
      const p = id[0];
      const ehChave = chaves.has(p) || chaves.has(p.toLowerCase());
      const ehFuncao = /^\s*\(/.test(resto.slice(p.length));
      solta();
      out.push({ t: ehChave ? "chave" : ehFuncao ? "funcao" : "puro", v: p });
      i += p.length; continue;
    }
    buf += codigo[i]; i++;
  }
  solta();
  return out;
}

/** Paleta do realce — casa com os dois temas via `color-mix` no consumidor. */
export const COR_TOKEN: Record<TipoToken, string> = {
  comentario: "var(--cod-comentario)",
  texto: "var(--cod-texto)",
  numero: "var(--cod-numero)",
  chave: "var(--cod-chave)",
  funcao: "var(--cod-funcao)",
  puro: "inherit",
};
