// ── Preferências da conta, vistas do navegador ──────────────────────────────
// Toda preferência que acompanha a PESSOA (e não o aparelho) mora em
// user_prefs, lida e gravada por /api/user-prefs. Este módulo é a porta do
// navegador pra ela, por três defeitos que custaram caro:
//   • LEITURA COMPARTILHADA: cada tela que montava fazia o próprio GET — e a
//     rota devolve TODAS as chaves (layouts do Tridify têm até 20 KB). Agora é
//     uma ida por carregamento (promessa única, 60 s) dividida entre as telas.
//   • GRAVAR ATUALIZA A LEITURA: remontar antes de o PUT voltar lia o valor
//     velho e desfazia a troca que a pessoa tinha acabado de fazer.
//   • ESCREVER UMA VEZ: "já vi o tour" era gravado a cada carga de página, pra
//     sempre — uma invocação e um upsert por carga. `marcarUmaVez` grava e lembra.
// A regra de versão (conta × cópia do aparelho) é a mesma do tema, em
// lib/tema.ts: a conta vence quando é mais nova; a cópia vence quando é mais
// nova ou ainda não subiu. Sem ela, o cache do servidor (60 s por instância)
// desfaria no recarregar uma troca recém-feita.
//
// Sem "use client" de propósito: o servidor importa a chave e o validador da
// barra recolhida daqui. Nada toca em `window` fora das funções.

/** Barra lateral recolhida em Mensagens/TridiChat — segue a conta. */
export const PREF_RAIL = "ui.rail";

type Prefs = Record<string, unknown>;
const TTL = 60_000;
let leitura: { em: number; p: Promise<Prefs | null> } | null = null;

function ler(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function guardar(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* modo privado / cota */ }
}

/** Todas as preferências da conta — uma ida por carregamento, dividida entre
 *  as telas. `null` = sem sessão, sem tabela ou fora do ar (e isso não fica
 *  guardado: a próxima tela tenta de novo). */
export function lerPrefsDaConta(agora: number = Date.now()): Promise<Prefs | null> {
  if (leitura && agora - leitura.em < TTL) return leitura.p;
  const p: Promise<Prefs | null> = fetch("/api/user-prefs", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && j.prefs && typeof j.prefs === "object" ? (j.prefs as Prefs) : null))
    .catch(() => null);
  const esta = { em: agora, p };
  leitura = esta;
  void p.then((v) => { if (v === null && leitura === esta) leitura = null; });
  return p;
}

/** Anota na leitura compartilhada, sem ir ao servidor — quem monta depois já
 *  enxerga o valor novo mesmo que o PUT ainda esteja no debounce. */
export function anotarPrefDaConta(key: string, value: unknown) {
  if (!leitura) return;
  const antes = leitura.p;
  leitura.p = antes.then((v) => (v ? { ...v, [key]: value } : v));
}

/** Grava na conta. `keepalive` deixa o pedido terminar mesmo se a página
 *  recarregar logo em seguida. `em` = versão gravada (updated_at em ms). */
export async function gravarPrefDaConta(key: string, value: unknown): Promise<{ ok: boolean; em?: number }> {
  anotarPrefDaConta(key, value);
  try {
    const r = await fetch("/api/user-prefs", {
      method: "PUT", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ key, value }),
    });
    if (!r.ok) return { ok: false };
    const j = (await r.json().catch(() => null)) as { em?: unknown } | null;
    return typeof j?.em === "number" ? { ok: true, em: j.em } : { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Grava na conta UMA vez por aparelho — marca do tipo "já vi". Falhou: a
 *  próxima carga tenta de novo. */
export async function marcarUmaVez(chaveLocal: string, key: string, value: unknown): Promise<void> {
  if (ler(chaveLocal)) return;
  const { ok } = await gravarPrefDaConta(key, value);
  if (ok) guardar(chaveLocal, "1");
}

// ── Preferência versionada (conta × cópia do aparelho) ───────────────────────
export type Versionado<T> = { valor: T; em: number };
export type CopiaLocal<T> = { valor: T | null; em: string | null };
export type Decisao<T> = { valor: T | null; adotarConta: boolean; reenviar: boolean };

/**
 * Quem vale na montagem. `conta`: o que o servidor leu (`null` = conta sem
 * nada salvo; `undefined` = sem conta aqui, bancada /dev-*, ou leitura falhou).
 *  • troca pendente deste aparelho vence e é reenviada;
 *  • conta mais nova que a cópia (ou cópia sem versão) vence;
 *  • cópia mais nova vence — é o cache velho do servidor, não uma troca;
 *  • conta vazia recebe a cópia antiga (migração, pra ninguém perder a escolha).
 */
export function escolherVersao<T>(local: CopiaLocal<T>, conta: Versionado<T> | null | undefined): Decisao<T> {
  if (conta === undefined) return { valor: local.valor, adotarConta: false, reenviar: false };
  if (local.em === "pendente" && local.valor !== null) return { valor: local.valor, adotarConta: false, reenviar: true };
  if (conta === null) return { valor: local.valor, adotarConta: false, reenviar: local.valor !== null && !local.em };
  const emLocal = Number(local.em);
  if (!local.em || !Number.isFinite(emLocal) || conta.em > emLocal) {
    return { valor: conta.valor, adotarConta: true, reenviar: false };
  }
  return { valor: local.valor ?? conta.valor, adotarConta: false, reenviar: false };
}

/** A cópia do aparelho de uma preferência versionada (`<chave>` + `<chave>-em`). */
export function copiaLocal(chaveLocal: string): CopiaLocal<unknown> {
  const bruto = ler(chaveLocal);
  let valor: unknown = null;
  if (bruto !== null) { try { valor = JSON.parse(bruto); } catch { valor = null; } }
  return { valor, em: ler(chaveLocal + "-em") };
}

/** Guarda no aparelho o que veio da conta, com a versão dela. */
export function adotarDaConta<T>(chaveLocal: string, conta: Versionado<T>) {
  guardar(chaveLocal, JSON.stringify(conta.valor));
  guardar(chaveLocal + "-em", String(conta.em));
}

/** Troca feita AQUI: a cópia muda na hora (pendente) e a conta em seguida. */
export async function salvarVersionado<T>(key: string, chaveLocal: string, valor: T): Promise<void> {
  const serial = JSON.stringify(valor);
  guardar(chaveLocal, serial);
  guardar(chaveLocal + "-em", "pendente");
  const { ok, em } = await gravarPrefDaConta(key, valor);
  // Outra troca no meio do caminho continua pendente e sobe no envio dela.
  if (ok && em && ler(chaveLocal) === serial) guardar(chaveLocal + "-em", String(em));
}

/** A barra recolhida como veio do banco: só boolean passa. */
export function lerRailDaConta(valor: unknown, atualizadoEm: string | null | undefined): Versionado<boolean> | null {
  if (typeof valor !== "boolean") return null;
  const em = atualizadoEm ? Date.parse(atualizadoEm) : 0;
  return { valor, em: Number.isFinite(em) ? em : 0 };
}

/** Testes: esquece a leitura compartilhada. */
export function _zerarPrefsDaConta() {
  leitura = null;
}
