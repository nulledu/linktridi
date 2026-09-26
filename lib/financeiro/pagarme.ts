// ── Pagar.me · saldo do recebedor ────────────────────────────────────────────
// O saldo que o Financeiro mostra é o do LIVRO (saldo inicial + movimentos). O
// da Pagar.me é o que o gateway diz que existe lá — os dois lado a lado é o que
// deixa alguém conferir se o livro bate.
//
// API v5: GET /core/v5/recipients/{id}/balance, Basic com a chave secreta
// (`sk_…:` sem senha). Valores voltam em CENTAVOS.
//
// Uma conta Pagar.me por conta do cadastro: cada chave secreta mora numa
// variável PAGARME_SK_<NOME> (PAGARME_SK_TRIDI, PAGARME_SK_GEDUX…), e o
// recebedor (`re_…`) de cada chave é DESCOBERTO pela API — ninguém copia ID.
// A conta do cadastro guarda o `re_…` no campo NÚMERO; a chave nunca vai pro
// banco.

import { cached } from "@/lib/cache";

export interface SaldoPagarme {
  disponivel: number;
  aReceber: number;
  transferido: number;
  lidoEm: string;
}

const autorizacao = (sk: string) => `Basic ${Buffer.from(`${sk}:`).toString("base64")}`;

/** As chaves secretas das variáveis PAGARME_SK_*. */
export function chavesSecretas(env: Record<string, string | undefined> = process.env): string[] {
  return Object.entries(env)
    .filter(([k, v]) => k.startsWith("PAGARME_SK_") && !!v?.trim())
    .map(([, v]) => v!.trim());
}

/**
 * Recebedor → chave, descoberto listando os recebedores de cada chave. Cache
 * de 1h: recebedor não muda, e sem isso cada leitura de saldo seria duas idas.
 * Chave recusada fica de fora (a conta dela cai no "recebedor não configurado").
 */
export function chavesPagarme(): Promise<Map<string, string>> {
  const chaves = chavesSecretas();
  return cached(`pagarme:recebedores:${chaves.length}`, 3_600_000, async () => {
    const m = new Map<string, string>();
    await Promise.all(chaves.map(async (sk) => {
      const r = await fetch("https://api.pagar.me/core/v5/recipients?size=20", {
        headers: { Authorization: autorizacao(sk), Accept: "application/json" },
        cache: "no-store", signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (!r?.ok) return;
      const j = (await r.json().catch(() => null)) as { data?: { id?: string }[] } | null;
      for (const x of j?.data ?? []) if (x.id) m.set(x.id, sk);
    }));
    return m;
  });
}

/**
 * Qual recebedor esta conta lê: o `re_…` do campo número; sem ele, e havendo
 * UMA Pagar.me configurada só, é essa. Com duas e sem número, não adivinha.
 */
export function recebedorDaConta(numero: string | null, chaves: Map<string, string>): string | null {
  const rp = (numero ?? "").trim();
  if (rp) return chaves.has(rp) ? rp : null;
  return chaves.size === 1 ? [...chaves.keys()][0] : null;
}

const reais = (v: unknown) => Math.round(Number(v) || 0) / 100;

/** Converte a resposta da API (centavos) no formato da tela. */
export function lerSaldo(corpo: Record<string, unknown>, agora = new Date()): SaldoPagarme {
  return {
    disponivel: reais(corpo.available_amount),
    aReceber: reais(corpo.waiting_funds_amount),
    transferido: reais(corpo.transferred_amount),
    lidoEm: agora.toISOString(),
  };
}

/**
 * Lê o saldo de um recebedor. Cache de 60s por recebedor: abrir a tela várias
 * vezes vira uma ida só ao gateway. `fresco` pula o cache (botão Atualizar).
 * Falha REJEITA — o `cached` não guarda erro.
 */
export function saldoPagarme(rp: string, sk: string, fresco = false): Promise<SaldoPagarme> {
  const buscar = async () => {
    const r = await fetch(`https://api.pagar.me/core/v5/recipients/${encodeURIComponent(rp)}/balance`, {
      headers: { Authorization: autorizacao(sk), Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401) throw new Error("Chave da Pagar.me recusada — confira a chave secreta (sk_) deste recebedor.");
    if (r.status === 404) throw new Error("Recebedor não encontrado na Pagar.me — confira o re_ no campo Número.");
    if (!r.ok) throw new Error(`Pagar.me respondeu ${r.status}.`);
    return lerSaldo((await r.json()) as Record<string, unknown>);
  };
  return cached(`pagarme:saldo:${rp}`, fresco ? 0 : 60_000, buscar);
}
