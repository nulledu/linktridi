"use client";

// ── A personalização da Tridify segue a CONTA, não o navegador ───────────────
// Painel (widgets, tamanhos, ordem), métricas da Campanhas Pro, funil, fontes,
// favoritos, visualizações salvas, "com imposto"… nasceram no localStorage, cada
// um com a sua chave. Trocar de navegador ou abrir no celular perdia tudo.
//
// Em vez de reescrever cada tela, as chaves continuam no localStorage (leitura
// síncrona, sem flash) e este módulo espelha o CONJUNTO delas numa preferência
// só da conta (`tridify.ajustes` em user_prefs):
//   • toda gravação passa por `tfSet` → sobe pra conta 1,5 s depois (debounce);
//   • ao abrir a Tridify, `sincronizarComConta` compara as versões: conta mais
//     nova substitui a cópia do aparelho; troca local pendente sobe; conta vazia
//     recebe o que o aparelho já tinha (ninguém perde o layout de hoje).
import { gravarPrefDaConta, lerPrefsDaConta } from "@/lib/prefs-da-conta";

export const PREF_AJUSTES_TRIDIFY = "tridify.ajustes";
const EM = "tridify.ajustes-em"; // versão da cópia local (ms) ou "pendente"
const PREFIXOS = ["trafego.", "tridify:"];
const DE_FORA = new Set(["trafego.tab"]); // aba aberta é do momento, não do gosto

type Ajustes = { em: number; itens: Record<string, string> };

// Navegador compartilhado guarda chaves de outras pessoas (`trafego.painel.<id>`):
// só entram as sem id ou com o id de quem está logado.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
let dono: string | null = null;

export function ehAjusteTridify(k: string, id: string | null = dono): boolean {
  if (DE_FORA.has(k) || !PREFIXOS.some((p) => k.startsWith(p))) return false;
  const ids = k.match(UUID);
  return !ids || !id || ids.every((x) => x.toLowerCase() === (id || "").toLowerCase());
}

function lerLocal(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function gravarLocal(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* modo privado / cota */ }
}

function fotografar(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && ehAjusteTridify(k)) { const v = localStorage.getItem(k); if (v !== null) out[k] = v; }
    }
  } catch { /* sem storage */ }
  return out;
}

let timer: ReturnType<typeof setTimeout> | null = null;

async function subir() {
  timer = null;
  const valor: Ajustes = { em: Date.now(), itens: fotografar() };
  const { ok } = await gravarPrefDaConta(PREF_AJUSTES_TRIDIFY, valor);
  // Outra troca no meio do caminho deixou pendente de novo: ela sobe depois.
  if (ok && !timer) gravarLocal(EM, String(valor.em));
}

function agendarSubida() {
  gravarLocal(EM, "pendente");
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void subir(); }, 1500);
}

/** `localStorage.setItem` da Tridify: grava no aparelho e leva pra conta. */
export function tfSet(k: string, v: string) {
  gravarLocal(k, v);
  if (ehAjusteTridify(k)) agendarSubida();
}

// Fechar a aba no meio do debounce não pode perder a troca (keepalive no PUT).
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { if (timer) { clearTimeout(timer); void subir(); } });
}

function lerDaConta(v: unknown): Ajustes | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { em?: unknown; itens?: unknown };
  if (typeof o.em !== "number" || !o.itens || typeof o.itens !== "object") return null;
  const itens: Record<string, string> = {};
  for (const [k, val] of Object.entries(o.itens as Record<string, unknown>)) {
    if (typeof val === "string" && ehAjusteTridify(k)) itens[k] = val;
  }
  return { em: o.em, itens };
}

/** Decide quem vale. Pura, pra teste. */
export function decidir(local: { em: string | null; temAlgo: boolean }, conta: Ajustes | null | undefined):
  "nada" | "adotar" | "subir" {
  if (conta === undefined) return "nada"; // sem sessão / fora do ar
  if (local.em === "pendente") return "subir";
  if (conta === null) return local.temAlgo ? "subir" : "nada";
  const emLocal = Number(local.em);
  if (!local.em || !Number.isFinite(emLocal) || conta.em > emLocal) return "adotar";
  return "nada";
}

/** Acerta o aparelho com a conta. `true` = a cópia local mudou (remontar). */
export async function sincronizarComConta(userId: string): Promise<boolean> {
  dono = userId;
  const prefs = await lerPrefsDaConta();
  const conta = prefs === null ? undefined : lerDaConta(prefs[PREF_AJUSTES_TRIDIFY]);
  const atual = fotografar();
  const acao = decidir({ em: lerLocal(EM), temAlgo: Object.keys(atual).length > 0 }, conta);
  if (acao === "subir") { await subir(); return false; }
  if (acao !== "adotar" || !conta) return false;
  try {
    for (const k of Object.keys(atual)) if (!(k in conta.itens)) localStorage.removeItem(k);
  } catch { /* sem storage */ }
  for (const [k, v] of Object.entries(conta.itens)) gravarLocal(k, v);
  gravarLocal(EM, String(conta.em));
  return true;
}
