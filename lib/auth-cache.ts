// Verificação de sessão memoizada por token.
//
// `supabase.auth.getUser()` NÃO lê o JWT localmente: ele faz uma chamada HTTP ao
// `/auth/v1/user` do Supabase. Isso rodava DUAS vezes por requisição (middleware
// + getProfile) e o middleware casa TODA rota — inclusive cada `/api/*`. Uma tela
// que dispara 6 fetches pagava ~12 idas e voltas de auth antes de qualquer dado.
// Era a lentidão que aparecia "em todas as áreas".
//
// Aqui a chave do cache é o PRÓPRIO cookie de sessão: token igual → resultado da
// verificação igual. Token diferente, ausente ou adulterado = chave diferente =
// verificação real. Não afrouxa nada; só não repete a mesma pergunta 12 vezes.
//
// TTL curto (30s) porque o refresh do token continua acontecendo no `getUser()`
// real do próximo miss — o cookie renovado atrasa no máximo o TTL, e o access
// token do Supabase vive 1h.

type Cached<T> = { at: number; p: Promise<T> };

const TTL_MS = 30_000;
const MAX = 500;                                    // teto de memória por instância

const store = new Map<string, Cached<unknown>>();

// Cookies de sessão do Supabase (`sb-<ref>-auth-token`, possivelmente em partes).
// Só eles entram na chave — o resto do cookie jar não muda quem você é.
export function sessionKey(all: { name: string; value: string }[]): string {
  return all
    .filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `${c.name}=${c.value}`)
    .join("|");
}

export function cachedByToken<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();                            // sem cookie de sessão → nada a cachear
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.p as Promise<T>;
  // Rejeição não fica no cache. Por isso quem verifica deve LANÇAR em falha
  // passageira (rede, 5xx do Auth): devolver null seria memorizar "deslogado"
  // por 30s. Só "token inválido" pode virar null memorizado.
  const p = fn().catch((e) => { store.delete(key); throw e; });
  // Tirar antes de regravar: `set` em chave existente mantém a posição antiga,
  // e a sessão mais usada (renovada a cada 30s) era a primeira a ser despejada.
  store.delete(key);
  if (store.size >= MAX) {
    // Poda simples: derruba as entradas já vencidas; se ainda estiver cheio,
    // a mais antiga sai (Map preserva a ordem de inserção).
    for (const [k, v] of store) if (now - v.at >= TTL_MS) store.delete(k);
    if (store.size >= MAX) store.delete(store.keys().next().value as string);
  }
  store.set(key, { at: now, p });
  return p;
}
