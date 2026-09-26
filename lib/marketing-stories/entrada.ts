// ── Marketing · Stories — o que a rota aceita ────────────────────────────────
// A mesma limpeza pro POST (criar) e pro PATCH (editar um campo). Pura, pra ser
// testada sem banco: é aqui que "cliques: -3", link `javascript:` e mídia de
// OUTRA área morrem antes de chegar ao Supabase.

import { chaveDaUrl } from "@/lib/armazenamento/referencia";
import { ehStatusStory, ehTipoStory, type PatchStory } from "./tipos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{16}$/;
const DIA_MS = 86_400_000;

/** Teto dos números digitados. Um story da casa não passa de dezenas de milhares. */
export const MAX_NUMERO = 10_000_000;

export type Limpo = { ok: true; dados: PatchStory } | { ok: false; erro: string };

/** Texto de uma linha: espaços colapsados, cortado, vazio vira `null`. */
function linha(v: unknown, max: number): string | null {
  if (v == null) return null;
  const t = String(v).replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}

/** A mídia só vale se for NOSSA e da área `stories/` — nunca a URL de outra área. */
export function ehMidiaDeStory(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const chave = chaveDaUrl(url);
  return !!chave && chave.startsWith("stories/");
}

/**
 * Só os campos conhecidos passam; o resto é ignorado em silêncio (a tela
 * manda o objeto dela inteiro às vezes). Campo presente e inválido é erro —
 * gravar "o que der" esconderia o problema.
 */
export function limparStory(b: unknown, agora: Date = new Date()): Limpo {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { ok: false, erro: "json_invalido" };
  const e = b as Record<string, unknown>;
  const d: PatchStory = {};

  if ("publicadoEm" in e) {
    const t = typeof e.publicadoEm === "string" ? Date.parse(e.publicadoEm) : NaN;
    // Antes de 2016 o Instagram nem tinha stories; mais de um ano à frente
    // não é planejamento, é data digitada errada.
    if (!Number.isFinite(t) || t < Date.UTC(2016, 0, 1) || t > agora.getTime() + 366 * DIA_MS) {
      return { ok: false, erro: "data_invalida" };
    }
    d.publicadoEm = new Date(t).toISOString();
  }

  if ("status" in e) {
    if (!ehStatusStory(e.status)) return { ok: false, erro: "status_invalido" };
    d.status = e.status;
  }

  if ("tipo" in e) {
    if (e.tipo == null || e.tipo === "") d.tipo = null;
    else if (ehTipoStory(e.tipo)) d.tipo = e.tipo;
    else return { ok: false, erro: "tipo_invalido" };
  }

  if ("produtoId" in e) {
    if (e.produtoId == null || e.produtoId === "") d.produtoId = null;
    else if (typeof e.produtoId === "string" && UUID.test(e.produtoId)) d.produtoId = e.produtoId.toLowerCase();
    else return { ok: false, erro: "produto_invalido" };
  }

  if ("campanha" in e) d.campanha = linha(e.campanha, 80);
  if ("tema" in e) d.tema = linha(e.tema, 120);
  if ("cta" in e) d.cta = linha(e.cta, 60);
  // Observação é texto livre: mantém a quebra de linha.
  if ("observacoes" in e) d.observacoes = e.observacoes == null ? null : String(e.observacoes).trim().slice(0, 2000) || null;

  if ("linkUrl" in e) {
    const t = linha(e.linkUrl, 500);
    if (t && !/^https?:\/\/[^\s]+$/i.test(t)) return { ok: false, erro: "link_invalido" };
    d.linkUrl = t;
  }

  for (const k of ["cliques", "vendas"] as const) {
    if (!(k in e)) continue;
    const n = typeof e[k] === "string" && e[k] !== "" ? Number(e[k]) : e[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_NUMERO) return { ok: false, erro: `${k}_invalido` };
    d[k] = n;
  }

  for (const k of ["midiaUrl", "capaUrl"] as const) {
    if (!(k in e)) continue;
    if (e[k] == null || e[k] === "") d[k] = null;
    else if (ehMidiaDeStory(e[k])) d[k] = e[k] as string;
    else return { ok: false, erro: "midia_invalida" };
  }
  if ("midiaTipo" in e) {
    if (e.midiaTipo == null || e.midiaTipo === "") d.midiaTipo = null;
    else if (e.midiaTipo === "imagem" || e.midiaTipo === "video") d.midiaTipo = e.midiaTipo;
    else return { ok: false, erro: "midia_invalida" };
  }
  // Mídia sem tipo é linha que a tela não sabe desenhar; tirar a mídia leva a
  // miniatura e as medidas junto, senão sobra capa de um arquivo que saiu.
  if ("midiaUrl" in d) {
    if (d.midiaUrl === null) Object.assign(d, { midiaTipo: null, capaUrl: null, largura: null, altura: null, duracao: null, hashVisual: null });
    else if (!d.midiaTipo) return { ok: false, erro: "midia_sem_tipo" };
  }

  for (const k of ["largura", "altura"] as const) {
    if (!(k in e) || "midiaUrl" in d && d.midiaUrl === null) continue;
    const n = Number(e[k]);
    d[k] = e[k] != null && Number.isInteger(n) && n > 0 && n <= 20_000 ? n : null;
  }
  if ("duracao" in e && !(d.midiaUrl === null)) {
    const n = Number(e.duracao);
    d.duracao = e.duracao != null && Number.isFinite(n) && n > 0 && n <= 600 ? Math.round(n * 10) / 10 : null;
  }
  if ("hashVisual" in e && !(d.midiaUrl === null)) {
    d.hashVisual = typeof e.hashVisual === "string" && HASH.test(e.hashVisual) ? e.hashVisual : null;
  }

  return { ok: true, dados: d };
}
