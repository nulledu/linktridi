// ── Estreia do criativo: a parte que a tela usa ─────────────────────────────
// Tipos e contas puras da data em que o criativo subiu na Meta pela primeira
// vez. Separado de `lib/meta-estreia.ts` porque aquele lê token no banco e não
// pode ir pro navegador; este vai.

export type FonteEstreia = "video" | "imagem" | "anuncio";

export interface EstreiaCriativo {
  /** Instante (ISO, UTC) em que a peça entrou na Meta pela primeira vez. */
  em: string;
  /** De onde a data saiu: upload da peça ou criação do anúncio mais antigo. */
  fonte: FonteEstreia;
}

const FONTES: readonly FonteEstreia[] = ["video", "imagem", "anuncio"];

/** `created_time` da Meta vem como `2026-03-12T14:22:10-0300`; o `Date` só garante o fuso com dois-pontos. */
export function isoDaMeta(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v.trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** A mais antiga. No empate a peça vence o anúncio: o upload é a resposta mais direta à pergunta. */
export function maisAntiga(candidatos: EstreiaCriativo[]): EstreiaCriativo | null {
  let melhor: EstreiaCriativo | null = null;
  let tMelhor = Infinity;
  for (const c of candidatos) {
    const t = Date.parse(c.em);
    if (!Number.isFinite(t)) continue;
    if (t < tMelhor || (t === tMelhor && melhor?.fonte === "anuncio" && c.fonte !== "anuncio")) {
      melhor = { em: c.em, fonte: c.fonte };
      tMelhor = t;
    }
  }
  return melhor;
}

/** O que chega da rota só vira estreia no formato certo; o resto (`{ em: null }`, erro) é "não sei". */
export function lerEstreia(j: unknown): EstreiaCriativo | null {
  if (!j || typeof j !== "object") return null;
  const { em, fonte } = j as Record<string, unknown>;
  if (typeof em !== "string" || !Number.isFinite(Date.parse(em))) return null;
  if (!FONTES.includes(fonte as FonteEstreia)) return null;
  return { em, fonte: fonte as FonteEstreia };
}

// O dia é o do calendário de São Paulo: às 22h30 de 12/03 em SP já é dia 13
// em UTC, e o time lembra do dia em que subiu o anúncio, não do dia do servidor.
const DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

function diaSP(d: Date): [number, number, number] {
  const p = Object.fromEntries(DIA_SP.formatToParts(d).map((x) => [x.type, x.value]));
  return [Number(p.year), Number(p.month), Number(p.day)];
}

/** "hoje", "ontem", "há 12 dias", "há 5 meses", "há 2 anos" — mês de calendário, não bloco de 30 dias. */
export function idadeDaEstreia(em: Date, agora: Date): string {
  const [a1, m1, d1] = diaSP(em);
  const [a2, m2, d2] = diaSP(agora);
  const dias = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  const meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (meses < 2) return `há ${dias} dias`;
  if (meses < 24) return `há ${meses} meses`;
  return `há ${Math.floor(meses / 12)} anos`;
}

const EXPLICACAO: Record<FonteEstreia, string> = {
  video: "Upload do vídeo na conta de anúncios da Meta",
  imagem: "Upload da imagem na conta de anúncios da Meta",
  anuncio: "Criação do anúncio mais antigo deste criativo entre os que rodaram no período (a Meta não informou o upload da peça)",
};

export function rotuloDaEstreia(e: EstreiaCriativo, agora: Date = new Date()): { data: string; idade: string; explicacao: string } {
  const em = new Date(e.em);
  const [a, m, d] = diaSP(em);
  const dois = (n: number) => String(n).padStart(2, "0");
  return { data: `${dois(d)}/${dois(m)}/${a}`, idade: idadeDaEstreia(em, agora), explicacao: EXPLICACAO[e.fonte] };
}
