import { criarFreio, origemDe } from "@/lib/rate-limit";

// Tetos por origem das rotas do leitor do galpão — sem sessão de usuário, então
// nada além do token/uso-único as protege. O freio roda ANTES do authorizeDevice,
// pra o custo do próprio (uma consulta ao Supabase) também entrar na conta — é
// esse tempo parado que a Vercel cobra como Fluid CPU.
//
// Chave = origemDe(req.headers), NÃO o Bearer. O token é fornecido pelo cliente
// e não é validado antes do freio: chavear por ele deixava um atacante rotacionar
// o Bearer e ganhar um balde novo por requisição (furando o teto). origemDe usa
// os cabeçalhos que a Vercel preenche e o cliente não forja. O galpão fica atrás
// de um NAT (um IP pra todos os tablets), mas isso agora só divide o throughput,
// nunca perde dado: rota de dreno responde 503 (transitório), o app segura a
// operação na fila e reenvia. Por isso o teto é folgado.
export const freioDevice = criarFreio({ limite: 600, janelaMs: 60_000 });

// Ativação é ANÔNIMA e o código é curto (digitado à mão): alvo de brute force.
// Só FALHAS contam (ver activate/route.ts): 20 tentativas erradas por IP a cada
// 10 min tornam inviável varrer o código, sem punir provisionamento legítimo.
export const freioAtivacao = criarFreio({ limite: 20, janelaMs: 10 * 60_000 });

export { origemDe };

// 429 (Too Many Requests) — onde um retry imediato do cliente é inofensivo:
// ativação, pings e leituras. Retry-After orienta o cliente educado.
export function resposta429() {
  return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "30" } });
}

// 503 (Service Unavailable) — nas rotas de DRENO DA FILA (baixa/recebimento/
// conferência). O app trata 5xx como TRANSITÓRIO e mantém a operação na fila;
// um 429 ali era classificado como falha DEFINITIVA e a operação SUMIA (perda
// de movimento de estoque). 503 diz "tente mais tarde" sem descartar nada — e
// continua freando. Ver estoque-app/.../sync/FilaReducer.kt.
export function resposta503() {
  return Response.json({ error: "rate_limited" }, { status: 503, headers: { "Retry-After": "30" } });
}
