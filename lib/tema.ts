// ── Tema: a escolha da pessoa, do banco até o primeiro quadro ────────────────
// Sem "use client" de propósito: o layout da plataforma (Server Component)
// valida o que veio do banco e monta o script daqui, e o cliente
// (lib/aparencia.ts) usa os mesmos tipos e validadores.
//
// Três valores, não dois. "system" é uma escolha de verdade — "siga o meu
// aparelho" — e não a falta de escolha: é o padrão, e quem está nele continua
// acompanhando o SO quando ele troca sozinho ao anoitecer.
//
// Onde mora cada coisa:
//   • user_prefs["ui.aparencia"] → a escolha. Fonte da verdade, vale em
//     qualquer aparelho em que a pessoa entrar.
//   • localStorage theme/accent  → cópia no aparelho, só pra pintar certo no
//     primeiro milissegundo: o banco não chega antes do paint.
//   • localStorage aparencia-em  → a VERSÃO da conta que essa cópia reflete
//     (updated_at em ms), ou "pendente" se a troca foi feita aqui e ainda
//     não subiu.
// A conta vence quando é mais nova; a cópia vence quando é mais nova ou ainda
// não subiu. Sem essa ordem, o cache do layout (um por instância da Vercel)
// devolveria a versão de antes da troca e desfaria a escolha no recarregar.

export type PrefTema = "system" | "light" | "dark";

export const TEMA_PADRAO: PrefTema = "system";
export const PREF_APARENCIA = "ui.aparencia";

export function prefTema(v: unknown): PrefTema | null {
  return v === "system" || v === "light" || v === "dark" ? v : null;
}

export function corValida(c: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim());
}

/** #abc → #aabbcc; sempre minúsculo, pra comparar swatch selecionado. */
export function normCor(c: string): string {
  const v = c.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) return "#" + v.slice(1).split("").map((x) => x + x).join("");
  return v;
}

/** O que a conta tem salvo, já validado. `em` = updated_at em ms (0 = sem data). */
export type AparenciaDaConta = { tema: PrefTema | null; accent: string | null; em: number };

/**
 * Valida o jsonb do banco. O resultado vira script inline no HTML, então nada
 * passa sem ser enum ou hexadecimal — o que não se reconhece é descartado.
 */
export function lerAparenciaDaConta(valor: unknown, atualizadoEm: string | null | undefined): AparenciaDaConta | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  const tema = prefTema(v.tema);
  const accent = typeof v.accent === "string" && corValida(v.accent) ? normCor(v.accent) : null;
  if (!tema && !accent) return null;
  const em = atualizadoEm ? Date.parse(atualizadoEm) : 0;
  return { tema, accent, em: Number.isFinite(em) ? em : 0 };
}

/**
 * Script que o layout da plataforma põe ANTES do Shell: entrega a escolha da
 * conta à porta que o pre-paint abriu (`window.__gaiusAparencia`, em
 * lib/preload.ts), que aplica e atualiza a cópia do aparelho.
 *
 * Os valores já passaram por `lerAparenciaDaConta` (enum + hex); o escape de
 * "<" é a segunda linha, pra um "</script>" nunca fechar a tag mesmo que
 * alguém afrouxe a validação.
 */
export function scriptAparenciaDaConta(a: AparenciaDaConta | null): string {
  const json = JSON.stringify(a ?? null).replace(/</g, "\\u003c");
  return `window.__gaiusAparencia&&window.__gaiusAparencia.conta(${json})`;
}
