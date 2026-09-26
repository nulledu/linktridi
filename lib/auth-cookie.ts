// ── Duração do "permanecer logado" ───────────────────────────────────────────
//
// O @supabase/ssr grava o cookie de sessão com a validade máxima que o navegador
// aceita (~400 dias). Na prática isso é "logado pra sempre": um notebook
// esquecido, roubado ou repassado continua entrando no ERP mais de um ano
// depois, sem ninguém perceber.
//
// 30 dias é o meio-termo: ninguém que usa o sistema toda semana é incomodado —
// cada acesso renova a validade —, mas um aparelho abandonado deixa de valer em
// um mês.
//
// ATENÇÃO — isto é METADE da configuração. O cookie é o limite do NAVEGADOR; o
// limite do SERVIDOR é o refresh token, que se configura no painel do Supabase
// (Authentication › Sessions). Sem mexer lá, um cookie copiado à mão continuaria
// valendo além dos 30 dias. Ver docs/plano-auth-protecoes.md.
export const SESSAO_MAX_DIAS = 30;
export const SESSAO_MAX_SEGUNDOS = SESSAO_MAX_DIAS * 24 * 3600;

/**
 * Aplica o teto de validade às opções de cookie do Supabase.
 *
 * Só MEXE PRA BAIXO: se o Supabase pedir um prazo menor que o teto (ou nenhum
 * prazo, que é o cookie de sessão do navegador), respeita o que veio. Aumentar
 * a validade de um cookie que o Supabase quis curto seria estender sessão sem
 * ninguém ter pedido.
 */
export function limitarValidade(options?: Record<string, unknown>): Record<string, unknown> {
  const opts = { ...(options || {}) };
  const atual = typeof opts.maxAge === "number" ? (opts.maxAge as number) : null;
  if (atual === null) return opts;                        // cookie de sessão — não estende
  opts.maxAge = Math.min(atual, SESSAO_MAX_SEGUNDOS);
  return opts;
}
