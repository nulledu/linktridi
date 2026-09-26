// ── Marketing · Criativos · constantes e tipos SEM dependência de servidor ───
// Existe separado de `lib/marketing-criativos.ts` de propósito: aquele importa
// `lib/supabase/server.ts`, que usa `next/headers` e só roda em Server
// Component. A tela (client) precisa só das listas e dos rótulos — importar o
// módulo de servidor quebrava o build com "You're importing a module that
// depends on next/headers".
//
// Regra: valor puro e tipo entram aqui; qualquer coisa que leia banco fica no
// `marketing-criativos.ts`, que RE-EXPORTA daqui — continua havendo UMA fonte.

export type CriativoStatus = "producao" | "revisao" | "pronto" | "publicado" | "arquivado";
export type CriativoTipo = "pago" | "organico";

export const STATUS: { key: CriativoStatus; label: string; cor: string }[] = [
  { key: "producao",  label: "Em produção", cor: "var(--atencao)" },
  { key: "revisao",   label: "Em revisão",  cor: "var(--azul)" },
  { key: "pronto",    label: "Pronto",      cor: "var(--ok)" },
  { key: "publicado", label: "Publicado",   cor: "var(--roxo)" },
  { key: "arquivado", label: "Arquivado",   cor: "var(--text-dim)" },
];

export const PLATAFORMAS: { key: string; label: string; icon: string }[] = [
  { key: "meta",      label: "Meta",      icon: "brand-meta" },
  { key: "tiktok",    label: "TikTok",    icon: "brand-tiktok" },
  { key: "instagram", label: "Instagram", icon: "brand-instagram" },
  { key: "youtube",   label: "YouTube",   icon: "video" },
  { key: "kwai",      label: "Kwai",      icon: "video" },
  { key: "outro",     label: "Outro",     icon: "world" },
];

export const TIPOS: { key: CriativoTipo; label: string }[] = [
  { key: "pago",     label: "Pago" },
  { key: "organico", label: "Orgânico" },
];

export function statusLabel(k: string): string { return STATUS.find((s) => s.key === k)?.label ?? k; }
export function statusCor(k: string): string { return STATUS.find((s) => s.key === k)?.cor ?? "var(--text-dim)"; }
export function plataformaLabel(k: string | null): string { return PLATAFORMAS.find((p) => p.key === k)?.label ?? (k || "—"); }

// ── Nome automático: {MÊS} {NN} - {PRODUTO} - {EDITOR} ───────────────────────
// Desde set/2026 quem sobe não escreve nome nem prefixo: escolhe o MÊS, o
// NÚMERO e o PRODUTO, e o editor sai da conta de quem sobe. A biblioteca monta
// "SET 01 - {CRB} - {L}" — o mesmo texto que vai no nome do anúncio da Meta, e
// o `codigoNoNome` desse texto dá "SET-001", que é o `codigo` gerado no banco.
// É essa coincidência que liga o anúncio ao criativo sem ninguém digitar nada.

export const MESES: { sigla: string; nome: string }[] = [
  { sigla: "JAN", nome: "Janeiro" }, { sigla: "FEV", nome: "Fevereiro" },
  { sigla: "MAR", nome: "Março" },   { sigla: "ABR", nome: "Abril" },
  { sigla: "MAI", nome: "Maio" },    { sigla: "JUN", nome: "Junho" },
  { sigla: "JUL", nome: "Julho" },   { sigla: "AGO", nome: "Agosto" },
  { sigla: "SET", nome: "Setembro" }, { sigla: "OUT", nome: "Outubro" },
  { sigla: "NOV", nome: "Novembro" }, { sigla: "DEZ", nome: "Dezembro" },
];

export const ehSiglaDeMes = (p: string) => MESES.some((m) => m.sigla === p);

/** Sigla do mês corrente em São Paulo (UTC-3): às 22h de 31/08 ainda é AGO. */
export function mesAtualSigla(agora = Date.now()): string {
  return MESES[new Date(agora - 3 * 3600 * 1000).getUTCMonth()].sigla;
}

/** Ano corrente em São Paulo. */
export function anoAtualSP(agora = Date.now()): number {
  return new Date(agora - 3 * 3600 * 1000).getUTCFullYear();
}

/** Produto do criativo: nome na tela, tag no nome ("Carimbo" → {CRB}). O `id`
 *  só existe quando a lista veio do banco (os de fábrica abaixo não têm) — é
 *  por ele que o story aponta pro produto. */
export type ProdutoCriativo = { id?: string; nome: string; tag: string };

/**
 * Produtos de fábrica. A lista de verdade mora em `marketing_criativos_produtos`
 * (a tela cria produto novo); esta é a que vale enquanto o SQL não rodou.
 */
export const PRODUTOS: ProdutoCriativo[] = [
  { nome: "Carimbo",  tag: "CRB" },
  { nome: "Chancela", tag: "CH" },
];

export function tagDoProduto(produto: string | null | undefined, lista: ProdutoCriativo[] = PRODUTOS): string | null {
  const p = (produto || "").trim().toLowerCase();
  return lista.find((x) => x.nome.toLowerCase() === p)?.tag ?? null;
}

/** Tag comparável: MAIÚSCULA, só letras/números, até 6 ("{crb}" → "CRB"). */
export function normalizarTag(t: string): string {
  return (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

/** Sugestão de tag a partir do nome: 1ª letra + consoantes ("Carimbo" → "CRB"). */
export function sugestaoDeTag(nome: string): string {
  const l = normalizarTag(nome);
  if (!l) return "";
  let out = l[0];
  for (const ch of l.slice(1)) {
    if (out.length >= 3) break;
    if (!"AEIOU".includes(ch) && ch !== out[out.length - 1]) out += ch;
  }
  return out;
}

/** Variação ("v2", "  Depoimento  ") → texto limpo, até 30. Vazio = sem variação. */
export function normalizarVariacao(v: string | null | undefined): string {
  const t = (v || "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim().slice(0, 30);
  return /^v\d+$/i.test(t) ? t.toUpperCase() : t;
}

/** "Letícia Souza" → "L". Primeira letra do primeiro nome, sem acento. */
export function siglaDoEditor(nome: string | null | undefined): string {
  const n = (nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
  return n.slice(0, 1).toUpperCase();
}

/**
 * "SET", 1, "V2", "CRB", "Letícia" → "SET 01 - V2 - {CRB} - {L}".
 * Parte ausente não entra (sem variação: "SET 01 - {CRB} - {L}").
 */
export function nomeDoCriativo(prefixo: string, numero: number, variacao: string | null | undefined, tag: string | null | undefined, editor?: string | null): string {
  const partes = [`${prefixo} ${String(numero).padStart(2, "0")}`];
  const v = normalizarVariacao(variacao);
  if (v) partes.push(v);
  const t = normalizarTag(tag || "");
  if (t) partes.push(`{${t}}`);
  const sig = siglaDoEditor(editor);
  if (sig) partes.push(`{${sig}}`);
  return partes.join(" - ");
}

/** O nome já é o montado pela regra (criativo do fluxo por mês)? */
export function nomeAutomatico(c: { nome: string; prefixo: string; numero: number }): boolean {
  return ehSiglaDeMes(c.prefixo) && c.nome.startsWith(`${c.prefixo} ${String(c.numero).padStart(2, "0")}`);
}

/** Prefixo comparável: MAIÚSCULO, só letras/números, no máximo 6. */
export function normalizarPrefixo(p: string): string {
  return (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

/**
 * "JL-001", "jl 001", "JL001" dentro do nome do anúncio → { prefixo, numero }.
 * É a ÚNICA regra de ligação entre o nome na Meta e o criativo cadastrado;
 * vale no servidor (desempenho) e no navegador (Tridify liga na hora da lista).
 */
const RE_CODIGO = /\b([A-Za-z]{2,6})[\s\-_.]?(\d{1,4})\b/;

export function codigoNoNome(nome: string): { prefixo: string; numero: number } | null {
  const m = RE_CODIGO.exec(nome || "");
  if (!m) return null;
  const numero = Number(m[2]);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return { prefixo: m[1].toUpperCase(), numero };
}

export const formatarCodigo = (prefixo: string, numero: number) => `${prefixo}-${String(numero).padStart(3, "0")}`;

/** O código formatado que aparece no nome ("JL-041"), ou null. */
export function codigoDoNome(nome: string): string | null {
  const c = codigoNoNome(nome);
  return c ? formatarCodigo(c.prefixo, c.numero) : null;
}

export interface Criativo {
  id: string;
  prefixo: string;
  numero: number;
  /** Ano do criativo (o número é por ano+mês). */
  ano: number;
  /** "V2", "Depoimento"… ou "" quando não é variação. */
  variacao: string;
  codigo: string;
  nome: string;
  editorId: string | null;
  editorNome: string | null;
  produto: string | null;
  plataforma: string | null;
  tipo: CriativoTipo;
  campanha: string | null;
  status: CriativoStatus;
  observacoes: string | null;
  // Vídeo por REFERÊNCIA (nunca arquivo no banco): id do anúncio na Meta pra
  // prévia oficial, e/ou link externo do arquivo.
  metaAdId: string | null;
  videoUrl: string | null;
  dataCriacao: string;          // YYYY-MM-DD
  criadorNome: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CriativoEvento {
  id: string; acao: string; campo: string | null; detalhe: string | null;
  autorNome: string | null; createdAt: string;
}
