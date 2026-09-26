// Cache em memória com TTL + dedupe de chamadas concorrentes.
// Para dados de leitura (dashboards): a 1ª chamada faz o trabalho, as próximas
// dentro do TTL reutilizam o resultado; chamadas simultâneas compartilham a
// mesma Promise (não disparam N vezes). Em erro, a entrada é descartada.
//
// "Erro" aqui é Promise REJEITADA. O supabase-js não rejeita: timeout, 5xx e
// queda de conexão voltam como `{ data: null, error }`. Quem cacheia leitura
// do banco precisa `if (error) throw error` DENTRO da fn — senão a falha fica
// guardada como "não tem linha" pelo TTL inteiro (foi assim que um timeout em
// `profiles` mandava a instância toda pro /login por 30s).
const store = new Map<string, { at: number; ttl: number; p: Promise<unknown> }>();

// Teto de entradas. Sem isto o Map só cresce: chaves derivadas de parâmetro do
// usuário (período de um dashboard, id de perfil, filtro) acumulam para sempre
// numa instância que fica horas de pé, e o que era cache vira consumo de
// memória — que na Vercel é medidor cobrado (Fluid Provisioned Memory) e ainda
// paga pedágio em GC dentro do tempo de CPU. Mesmo teto do `lib/auth-cache`.
const MAX = 500;

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = fn().catch((e) => { store.delete(key); throw e; });
  // Tirar antes de regravar: `set` numa chave que já existe mantém a posição
  // ORIGINAL no Map, e aí a entrada mais quente (profile:*, renovada a cada
  // 30s) ficava sempre na frente da fila — a primeira a ser despejada.
  store.delete(key);
  if (store.size >= MAX) {
    // Poda: derruba o que já venceu pelo TTL DA PRÓPRIA entrada (um corte fixo
    // de 5 min jogava fora cache de 10 min ainda válido); se ainda estiver
    // cheio, sai a mais antiga (o Map preserva ordem de inserção).
    for (const [k, v] of store) if (now - v.at >= v.ttl) store.delete(k);
    if (store.size >= MAX) store.delete(store.keys().next().value as string);
  }
  store.set(key, { at: now, ttl: ttlMs, p });
  return p;
}

// Invalida uma chave (ex: após gravar algo que muda o resultado).
export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
