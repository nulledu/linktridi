/**
 * Regras da comemoração de META DO MÊS na parede (25/09/2026).
 *
 * • Só a parede do COMERCIAL comemora: o galpão não tem o que festejar com a
 *   meta de vendas, e três TVs tocando o mesmo som ao mesmo tempo é ruído.
 * • Uma vez por mês e por time: a chave `meta-comemorada:<aaaa-mm>:<time>` fica
 *   no aparelho. Recarregar a página, o poll trazer o mesmo número ou a TV
 *   reiniciar não repete a festa.
 * • `localStorage` pode não existir (modo privado, WebView travado): sem ele a
 *   festa ainda acontece, só não fica lembrada — nunca derruba a parede.
 *
 * Espelho: `Comemoracao.kt` + `AdminViewModel` (SharedPreferences) na TV.
 */

export const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Mês corrente em São Paulo, `aaaa-mm` (UTC viraria o mês às 21h do último dia). */
export function mesAtualSP(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .formatToParts(agora);
  const ano = partes.find((p) => p.type === "year")?.value ?? String(agora.getFullYear());
  const mes = partes.find((p) => p.type === "month")?.value ?? String(agora.getMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

export function nomeDoMes(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return MESES_LONGOS[m - 1] ?? "";
}

export function chaveComemoracao(ym: string, time: string): string {
  return `meta-comemorada:${ym}:${time}`;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A parede em uso é a do comercial? Sem perfil (carrossel clássico) é a parede
 * de vendas de sempre, então sim. Com perfil, pelo nome: "Comercial", "Vendas".
 */
export function ehParedeComercial(perfil: { nome: string } | null | undefined): boolean {
  if (!perfil) return true;
  const n = semAcento(perfil.nome);
  return n.includes("comercial") || n.includes("vendas");
}

export function jaComemorou(chave: string): boolean {
  try { return window.localStorage.getItem(chave) === "1"; } catch { return false; }
}

export function marcarComemorado(chave: string): void {
  try { window.localStorage.setItem(chave, "1"); } catch { /* sem armazenamento: segue */ }
}

/**
 * Deve comemorar agora? Time com meta, na meta, e a chave do mês ainda livre.
 * Pura (o `lembrado` entra por parâmetro) para o teste não precisar de DOM.
 */
export function deveComemorar(time: { goal: number; current: number } | undefined, lembrado: boolean): boolean {
  if (!time || !(time.goal > 0)) return false;
  return time.current >= time.goal && !lembrado;
}

/**
 * Carrilhão curto (três notas subindo, ~0,9 s) quando não há som configurado.
 * WebAudio puro: nada a baixar. Autoplay bloqueado só silencia.
 */
export function tocarCarrilhao(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notas = [659.25, 830.61, 987.77]; // mi5, sol#5, si5 — acorde maior
    notas.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.14;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    });
    setTimeout(() => { void ctx.close().catch(() => {}); }, 1400);
  } catch { /* sem áudio: a festa é visual */ }
}
