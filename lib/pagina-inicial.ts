// Página inicial de cada pessoa — pra onde `/inicio` manda depois do login.
//
// O padrão (`homeFor`) é a Central, que serve pra quem circula pelo ERP inteiro.
// Quem trabalha numa área só precisa cair NELA: o TridiMarket é módulo discreto
// (fora da sidebar, ver MODULOS_DISCRETOS), então cair na Central deixava a
// pessoa sem caminho visível pro único lugar onde ela tem o que fazer.
//
// Guardamos a CHAVE do módulo, nunca a URL: a rota pode mudar de endereço, a
// chave é a mesma do gate de permissão — e é isso que permite conferir o acesso
// antes de redirecionar.
import { MODULES, homeFor, type Role } from "@/lib/rbac";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";

/** Chaves que podem ser página inicial: qualquer módulo pronto do sistema. */
export const PAGINAS_INICIAIS = MODULES.filter((m) => m.ready);

export function ehPaginaInicialValida(v: unknown): v is string {
  return typeof v === "string" && PAGINAS_INICIAIS.some((m) => m.key === v);
}

/**
 * Resolve o destino final. A preferência só vale se a pessoa AINDA tem a área:
 * tirar o acesso e deixar o atalho de pé mandaria direto pro 403 — sem chance
 * de nem ver a Central pra entender o que aconteceu.
 */
export function resolverPaginaInicial(escolhida: string | null | undefined, keys: string[], role: Role): string {
  if (ehPaginaInicialValida(escolhida) && keys.includes(escolhida)) {
    const m = MODULES.find((x) => x.key === escolhida);
    if (m) return m.href;
  }
  return homeFor(role);
}

/**
 * Lê a preferência gravada. Tolerante à coluna ausente (SQL pendente): sem ela,
 * devolve null e todo mundo continua entrando pela Central, como sempre.
 * Cacheado por 60s — roda uma vez por login, mas `/inicio` é rota de raiz e
 * qualquer aba aberta em "/" passa por aqui.
 */
const COLUNA_AUSENTE = new Set(["42703", "PGRST204"]);

export async function paginaInicialDe(userId: string): Promise<string | null> {
  return cached(`pagina-inicial:${userId}`, 60_000, async () => {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("employees").select("pagina_inicial").eq("id", userId).maybeSingle();
    if (error) {
      // Coluna ausente é resposta estável (SQL pendente): pode ficar no cache.
      // Qualquer outro erro é soluço — lançar tira do cache, senão a pessoa
      // perdia a página inicial dela por um minuto inteiro.
      if (COLUNA_AUSENTE.has(error.code)) return null;
      throw error;
    }
    const v = (data as { pagina_inicial?: string | null } | null)?.pagina_inicial ?? null;
    return ehPaginaInicialValida(v) ? v : null;
  }).catch(() => null);   // esta chamada cai no padrão, como antes; a próxima lê de novo
}
