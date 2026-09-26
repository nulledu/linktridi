// ── Métricas por fórmula ────────────────────────────────────────────────────
// Avaliador de expressões aritméticas pequeno e SEGURO: tokeniza, converte pra
// RPN (shunting-yard) e executa. Nada de eval/Function — a fórmula vem do
// usuário e roda no navegador dele, mas ainda assim não damos essa brecha.
//
// Suporta: + - * / ( ), menos unário, números decimais e variáveis.
// Divisão por zero devolve null (a tela mostra "—" em vez de Infinity).

export type Vars = Record<string, number>;

type Tok =
  | { t: "num"; v: number }
  | { t: "var"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "u-" }
  | { t: "("; v: "(" }
  | { t: ")"; v: ")" };

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "u-": 3 };

function tokenizar(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === "(" || c === ")") { out.push({ t: c, v: c } as Tok); i++; continue; }
    if ("+-*/".includes(c)) {
      // Menos unário: início da expressão, depois de "(" ou depois de outro operador.
      const ant = out[out.length - 1];
      const unario = c === "-" && (!ant || ant.t === "op" || ant.t === "(");
      out.push({ t: "op", v: unario ? "u-" : (c as "+" | "-" | "*" | "/") });
      i++; continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) return null;
      out.push({ t: "num", v: n });
      i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "var", v: src.slice(i, j) });
      i = j; continue;
    }
    return null;   // caractere não permitido
  }
  return out;
}

// Shunting-yard → RPN. Devolve null se os parênteses não fecham.
function paraRPN(toks: Tok[]): Tok[] | null {
  const saida: Tok[] = [];
  const pilha: Tok[] = [];
  for (const tk of toks) {
    if (tk.t === "num" || tk.t === "var") { saida.push(tk); continue; }
    if (tk.t === "op") {
      while (pilha.length) {
        const topo = pilha[pilha.length - 1];
        if (topo.t !== "op") break;
        // u- é associativo à direita: não desempilha outro u- de mesma precedência.
        const desempilha = tk.v === "u-" ? PREC[topo.v] > PREC[tk.v] : PREC[topo.v] >= PREC[tk.v];
        if (!desempilha) break;
        saida.push(pilha.pop()!);
      }
      pilha.push(tk); continue;
    }
    if (tk.t === "(") { pilha.push(tk); continue; }
    // ")"
    let achou = false;
    while (pilha.length) {
      const topo = pilha.pop()!;
      if (topo.t === "(") { achou = true; break; }
      saida.push(topo);
    }
    if (!achou) return null;
  }
  while (pilha.length) {
    const topo = pilha.pop()!;
    if (topo.t === "(") return null;
    saida.push(topo);
  }
  return saida;
}

export interface Formula {
  /** Executa a fórmula com os valores das variáveis. null = indefinido (ex.: /0). */
  calcular(vars: Vars): number | null;
  /** Nomes de variáveis usados — dá pra avisar se o usuário escreveu errado. */
  variaveis: string[];
}

/**
 * Compila uma fórmula. Devolve null se a expressão for inválida — a tela usa
 * isso pra marcar o campo em vermelho ANTES de o usuário salvar a métrica.
 */
export function compilarFormula(src: string): Formula | null {
  const toks = tokenizar(src.trim());
  if (!toks?.length) return null;
  const rpn = paraRPN(toks);
  if (!rpn?.length) return null;

  // Valida a aridade uma vez, na compilação (não a cada linha da tabela).
  let altura = 0;
  for (const tk of rpn) {
    if (tk.t === "num" || tk.t === "var") altura++;
    else if (tk.t === "op" && tk.v === "u-") { if (altura < 1) return null; }
    else { altura -= 1; if (altura < 1) return null; }
  }
  if (altura !== 1) return null;

  const variaveis = [...new Set(rpn.filter((t): t is Extract<Tok, { t: "var" }> => t.t === "var").map((t) => t.v))];

  return {
    variaveis,
    calcular(vars) {
      const st: number[] = [];
      for (const tk of rpn) {
        if (tk.t === "num") { st.push(tk.v); continue; }
        if (tk.t === "var") { st.push(Number(vars[tk.v]) || 0); continue; }
        if (tk.v === "u-") { st.push(-st.pop()!); continue; }
        const b = st.pop()!, a = st.pop()!;
        if (tk.v === "/") {
          if (b === 0) return null;       // indefinido, não Infinity
          st.push(a / b);
        } else if (tk.v === "+") st.push(a + b);
        else if (tk.v === "-") st.push(a - b);
        else st.push(a * b);
      }
      const r = st[0];
      return Number.isFinite(r) ? r : null;
    },
  };
}
