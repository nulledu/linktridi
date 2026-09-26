"use client";

// Porte do `code-block` do rare-ui (github.com/swamimalode07/rare-ui) para o
// idioma do Gaius. O original é Tailwind + `motion` + hex de tema cravado; aqui
// o realce sai de tokens `--cod-*` do `globals.css` (muda sozinho com o tema,
// sem ler `data-theme` no JS), o botão de copiar é o do kit (`BotaoCopiar`,
// receita 016) e o bloco ROLA DENTRO de si — nunca empurra a página de lado.
//
// O único peso novo é o realçador `prism-react-renderer` (só client, só onde
// este componente entra). Trava: bloco-de-codigo.dom.test.tsx.

import { Highlight, type PrismTheme } from "prism-react-renderer";
import { BotaoCopiar } from "./controles";

// A cor de cada token é uma variável do tema, não um valor. Assim o mesmo bloco
// serve claro e escuro sem um segundo tema em JS, e um dia entra no repertório
// de destaque da pessoa se a gente quiser. `plain` NÃO fixa fundo: o fundo é da
// classe `.ui-cod`, senão o tema do Prism venceria o do app.
const TEMA_COD: PrismTheme = {
  plain: { color: "var(--cod-fg)" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "var(--cod-comment)", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "var(--cod-punc)" } },
    { types: ["property", "tag", "boolean", "number", "constant", "symbol", "deleted"], style: { color: "var(--cod-num)" } },
    { types: ["selector", "attr-name", "string", "char", "builtin", "inserted"], style: { color: "var(--cod-string)" } },
    { types: ["operator", "entity", "url", "variable"], style: { color: "var(--cod-fg)" } },
    { types: ["atrule", "attr-value", "keyword"], style: { color: "var(--cod-keyword)" } },
    { types: ["function", "class-name"], style: { color: "var(--cod-fn)" } },
    { types: ["regex", "important"], style: { color: "var(--cod-attr)" } },
  ],
};

export type BlocoDeCodigoProps = {
  /** O código, como texto cru. */
  codigo: string;
  /** Linguagem do Prism (`tsx`, `ts`, `js`, `json`, `bash`, `css`, `sql`…). */
  linguagem?: string;
  /** Rótulo do cabeçalho — nome do arquivo, por padrão a própria linguagem. */
  titulo?: string;
  /** Numera as linhas na canaleta. */
  numeros?: boolean;
  /** Esconde o botão de copiar (ex.: trecho ilustrativo que não se cola). */
  semCopiar?: boolean;
  className?: string;
};

export function BlocoDeCodigo({
  codigo,
  linguagem = "tsx",
  titulo,
  numeros = false,
  semCopiar = false,
  className,
}: BlocoDeCodigoProps) {
  // `Highlight` engole um `\n` final e ainda desenha a linha vazia — apara antes.
  const texto = codigo.replace(/\n$/, "");
  return (
    <div className={["ui-cod", className].filter(Boolean).join(" ")} data-numeros={numeros ? "1" : undefined}>
      <div className="ui-cod-cab">
        <span className="ui-cod-lang">{titulo ?? linguagem}</span>
        {!semCopiar && <BotaoCopiar texto={texto} soIcone tamanho="sm" variante="sutil" />}
      </div>
      <Highlight code={texto} language={linguagem} theme={TEMA_COD}>
        {({ className: pcn, style, tokens, getLineProps, getTokenProps }) => (
          // O rolador horizontal é ESTE `<pre>`: `overflow-x:auto` do `.ui-cod-pre`
          // mantém a sobra dentro do bloco. A página nunca rola de lado por causa
          // de código largo — é o defeito que o `npm run rolagem` caça.
          <pre className={["ui-cod-pre", pcn].filter(Boolean).join(" ")} style={style} tabIndex={0}>
            <code>
              {tokens.map((linha, i) => {
                const props = getLineProps({ line: linha });
                return (
                  <span key={i} {...props} className={["ui-cod-linha", props.className].filter(Boolean).join(" ")}>
                    {numeros && <span className="ui-cod-num" aria-hidden>{i + 1}</span>}
                    <span className="ui-cod-cont">
                      {linha.map((token, k) => {
                        const tp = getTokenProps({ token });
                        return <span key={k} {...tp} />;
                      })}
                    </span>
                  </span>
                );
              })}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  );
}

export default BlocoDeCodigo;
