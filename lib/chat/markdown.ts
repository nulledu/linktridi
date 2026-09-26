// Markdown do chat → árvore de tokens. Puro: nada de React aqui, para poder
// ser testado e reaproveitado (prévia, notificação, busca).
//
// Suporta o subconjunto que faz sentido numa conversa:
//   ```lang … ```   bloco de código        `code`   código na linha
//   **negrito**  *itálico*  ~~riscado~~
//   > citação       - lista / 1. lista     ---     divisória
//   [texto](url)    url solta              @Menção
//
// NUNCA interpreta HTML — o texto entra como dado e sai como texto.

export type Bloco =
  | { t: "p"; filhos: Inline[] }
  | { t: "codigo"; lang: string | null; codigo: string }
  | { t: "citacao"; filhos: Inline[] }
  | { t: "lista"; ordenada: boolean; itens: Inline[][] }
  | { t: "hr" };

export type Inline =
  | { t: "texto"; v: string }
  | { t: "forte"; filhos: Inline[] }
  | { t: "enfase"; filhos: Inline[] }
  | { t: "risco"; filhos: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; v: string }
  | { t: "mencao"; nome: string; todos: boolean };

const RE_FENCE = /^```([a-zA-Z0-9+#-]*)\s*$/;

export function parseMarkdown(texto: string): Bloco[] {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];

  const fecharParagrafo = () => {
    if (!paragrafo.length) return;
    const conteudo = paragrafo.join("\n").trim();
    if (conteudo) blocos.push({ t: "p", filhos: parseInline(conteudo) });
    paragrafo = [];
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const fence = linha.match(RE_FENCE);

    if (fence) {
      fecharParagrafo();
      const lang = fence[1] || null;
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !RE_FENCE.test(linhas[i])) corpo.push(linhas[i++]);
      blocos.push({ t: "codigo", lang, codigo: corpo.join("\n") });
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(linha)) { fecharParagrafo(); blocos.push({ t: "hr" }); continue; }

    if (/^\s*>\s?/.test(linha)) {
      fecharParagrafo();
      const corpo: string[] = [];
      while (i < linhas.length && /^\s*>\s?/.test(linhas[i])) corpo.push(linhas[i++].replace(/^\s*>\s?/, ""));
      i--;
      blocos.push({ t: "citacao", filhos: parseInline(corpo.join("\n")) });
      continue;
    }

    const item = linha.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/);
    if (item) {
      fecharParagrafo();
      const ordenada = !item[1];
      const itens: Inline[][] = [];
      while (i < linhas.length) {
        const m = linhas[i].match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/);
        if (!m || !m[1] !== ordenada) break;
        itens.push(parseInline(m[3]));
        i++;
      }
      i--;
      blocos.push({ t: "lista", ordenada, itens });
      continue;
    }

    if (!linha.trim()) { fecharParagrafo(); continue; }
    paragrafo.push(linha);
  }
  fecharParagrafo();
  return blocos;
}

// Ordem importa: `code` primeiro (o que está dentro de crase é literal), depois
// link (o texto do link pode conter asteriscos), depois ênfases, depois menção.
const REGRAS: { re: RegExp; faz: (m: RegExpExecArray) => Inline }[] = [
  { re: /`([^`\n]+)`/, faz: (m) => ({ t: "code", v: m[1] }) },
  { re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/, faz: (m) => ({ t: "link", href: m[2], v: m[1] }) },
  { re: /(https?:\/\/[^\s<>"')\]]+)/, faz: (m) => ({ t: "link", href: m[1], v: m[1] }) },
  { re: /\*\*([^\n]+?)\*\*/, faz: (m) => ({ t: "forte", filhos: parseInline(m[1]) }) },
  { re: /(?<![*\w])\*([^*\n]+?)\*(?!\*)/, faz: (m) => ({ t: "enfase", filhos: parseInline(m[1]) }) },
  { re: /(?<!_)_([^_\n]+?)_(?!_)/, faz: (m) => ({ t: "enfase", filhos: parseInline(m[1]) }) },
  { re: /~~([^\n]+?)~~/, faz: (m) => ({ t: "risco", filhos: parseInline(m[1]) }) },
  { re: /@(todos|equipe|canal|here)\b/i, faz: (m) => ({ t: "mencao", nome: m[1], todos: true }) },
  { re: /@([\p{L}][\p{L}'’-]*(?:\s[\p{L}][\p{L}'’-]*){0,2})/u, faz: (m) => ({ t: "mencao", nome: m[1], todos: false }) },
];

export function parseInline(texto: string): Inline[] {
  if (!texto) return [];
  // Acha a regra que casa MAIS À ESQUERDA — assim a ordem do array só desempata.
  let melhor: { idx: number; m: RegExpExecArray; faz: (m: RegExpExecArray) => Inline } | null = null;
  for (const r of REGRAS) {
    const m = r.re.exec(texto);
    if (m && (melhor === null || m.index < melhor.idx)) melhor = { idx: m.index, m, faz: r.faz };
  }
  if (!melhor) return [{ t: "texto", v: texto }];

  const antes = texto.slice(0, melhor.idx);
  const depois = texto.slice(melhor.idx + melhor.m[0].length);
  return [
    ...(antes ? [{ t: "texto" as const, v: antes }] : []),
    melhor.faz(melhor.m),
    ...parseInline(depois),
  ];
}

// ── Emoji gigante ───────────────────────────────────────────────────────────
// Mensagem que é SÓ emoji (até 3) aparece grande, estilo iMessage.
const SO_EMOJI = /^(?:\p{Extended_Pictographic}|️|‍|\s)+$/u;
export function soEmoji(texto: string): number {
  const t = texto.trim();
  if (!t || t.length > 24 || !SO_EMOJI.test(t)) return 0;
  const n = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t)]
    .filter((s) => s.segment.trim()).length;
  return n > 0 && n <= 3 ? n : 0;
}

/** Texto puro de volta — para prévia e busca, sem os símbolos do markdown. */
export function textoSimples(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " código ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
