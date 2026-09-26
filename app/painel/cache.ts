// Estado local do APARELHO (TV/kiosk): qual painel exibir + cache offline das
// últimas informações sincronizadas. Tudo em localStorage do próprio aparelho.

export type PainelTipo = "vendas" | "producao" | "logistica" | "maquinas";

const TIPO_KEY = "painel.tipo";
const DATA_PREFIX = "painel.cache.";

const ehTipo = (v: string | null | undefined): v is PainelTipo =>
  v === "vendas" || v === "producao" || v === "logistica" || v === "maquinas";

/**
 * Qual painel esta tela mostra. A URL manda; depois, a escolha do aparelho.
 *
 * O `?tipo=` existe pela mesma razão que o `?perfil=`, e faltava: quem abre a
 * página de fora — o aplicativo da TV, um atalho, um link colado no chat — não
 * tem como mexer no `localStorage` do navegador que vai abri-la. Sem isto, a
 * primeira visita SEMPRE parava na pergunta "qual painel exibir nesta TV?", e
 * numa parede não há ninguém para responder.
 *
 * Ler da URL não grava nada: a escolha continua sendo do aparelho, e quem
 * passou o endereço manda só naquela visita.
 */
export function getDeviceTipo(): PainelTipo | null {
  if (typeof window === "undefined") return null;
  const daUrl = new URLSearchParams(window.location.search).get("tipo")?.trim().toLowerCase();
  if (ehTipo(daUrl)) return daUrl;
  const v = localStorage.getItem(TIPO_KEY);
  return ehTipo(v) ? v : null;
}
export function setDeviceTipo(t: PainelTipo) {
  if (typeof window !== "undefined") localStorage.setItem(TIPO_KEY, t);
}
export function clearDeviceTipo() {
  if (typeof window !== "undefined") localStorage.removeItem(TIPO_KEY);
}

/**
 * Qual PERFIL de tela esta TV mostra.
 *
 * Mesma ideia do tipo de painel: a escolha é do APARELHO, não da conta. Sem
 * isto só existia o `?perfil=` na URL — quem pendura a TV na doca teria que
 * editar endereço no navegador da televisão, com controle remoto, toda vez que
 * o cache ou uma atualização levasse a aba de volta para `/painel`. O app de TV
 * já guarda a escolha assim (`DeviceStore.selectedPerfil`); aqui é o mesmo
 * comportamento no navegador.
 */
const PERFIL_KEY = "painel.perfil";

export function getDevicePerfil(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PERFIL_KEY) || null;
}
export function setDevicePerfil(id: string) {
  if (typeof window !== "undefined") localStorage.setItem(PERFIL_KEY, id);
}

/**
 * A TV está DEITADA? O painel de logística é retrato (720×1280); numa TV
 * pendurada de lado cujo sistema não gira a imagem, o palco precisa girar por
 * conta própria. Escolha do APARELHO, como o tipo — `?girar=90` na URL força
 * (e `?girar=0` desliga) sem tocar no que está salvo.
 */
const GIRO_KEY = "painel.giro";

export function getDeviceGiro(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URLSearchParams(window.location.search).get("girar");
  if (url === "90") return true;
  if (url === "0") return false;
  return localStorage.getItem(GIRO_KEY) === "90";
}
export function setDeviceGiro(girado: boolean) {
  if (typeof window === "undefined") return;
  if (girado) localStorage.setItem(GIRO_KEY, "90");
  else localStorage.removeItem(GIRO_KEY);
}

export interface CacheResult<T> {
  data: T | null;
  fromCache: boolean; // true = veio do cache local (falha de sincronização)
  cachedAt: string | null; // quando esse dado foi sincronizado pela última vez
}

// Busca JSON e, em sucesso, guarda no cache local do aparelho. Em falha (rede/
// servidor), devolve a última cópia bem-sucedida que estiver salva localmente.
export async function cachedJson<T>(url: string, key: string): Promise<CacheResult<T>> {
  const storeKey = DATA_PREFIX + key;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const data = (await r.json()) as T & { error?: unknown };
    if (data && (data as { error?: unknown }).error) throw new Error("payload_error");
    const cachedAt = new Date().toISOString();
    try { localStorage.setItem(storeKey, JSON.stringify({ cachedAt, data })); } catch { /* quota */ }
    return { data, fromCache: false, cachedAt };
  } catch {
    return readCache<T>(storeKey);
  }
}

function readCache<T>(storeKey: string): CacheResult<T> {
  if (typeof window === "undefined") return { data: null, fromCache: true, cachedAt: null };
  try {
    const raw = localStorage.getItem(storeKey);
    if (!raw) return { data: null, fromCache: true, cachedAt: null };
    const parsed = JSON.parse(raw) as { cachedAt: string; data: T };
    return { data: parsed.data, fromCache: true, cachedAt: parsed.cachedAt };
  } catch {
    return { data: null, fromCache: true, cachedAt: null };
  }
}
