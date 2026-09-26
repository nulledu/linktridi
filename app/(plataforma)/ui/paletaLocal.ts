// ── Quem responde ao ⌘K ──────────────────────────────────────────────────────
// Algumas páginas têm a PRÓPRIA paleta de comandos (ex.: a Busca rápida do
// Tridify, que filtra campanha e métrica — coisa que a paleta global do app não
// sabe fazer). As duas escutavam ⌘K no window, então o mesmo atalho abria as
// duas janelas empilhadas.
//
// Regra: enquanto uma paleta LOCAL estiver montada, ela assume o atalho e a
// global fica quieta. Contador (e não booleano) porque em troca de página as
// duas chegam a coexistir por um instante durante a montagem/desmontagem.
let ativas = 0;

/** Chame no mount da paleta local; o retorno desregistra no unmount. */
export function registrarPaletaLocal(): () => void {
  ativas++;
  let liberado = false;
  return () => { if (!liberado) { liberado = true; ativas = Math.max(0, ativas - 1); } };
}

/** A paleta global usa isto pra saber se deve ignorar o ⌘K. */
export const temPaletaLocal = (): boolean => ativas > 0;
