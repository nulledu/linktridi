// ── Freio de requisições em memória, por chave ───────────────────────────────
// Generaliza o "freio do webhook" (lib/tridichat/limite.ts) para qualquer rota
// que precise de um teto de requisições sem estado compartilhado.
//
// LIMITAÇÃO CONHECIDA (a mesma de lá): a contagem é POR INSTÂNCIA. Serverless
// não tem estado compartilhado e um Redis só pra isto não se paga. Na prática a
// Vercel reaproveita instância quente, então um martelo sustentado da mesma
// origem cai na mesma instância e é freado; uma rajada DISTRIBUÍDA passa — pra
// essa, a defesa continua sendo o token/uso-único da rota, nunca dispensados.
// É defesa-em-profundidade barata contra brute force e Denial of Wallet de uma
// origem só, não um WAF.

export interface ResultadoFreio {
  /** false = estourou o teto na janela; a rota deve responder 429/503. */
  permitido: boolean;
  /** quantas ainda cabem na janela (0 quando já estourou). */
  restante: number;
}

export interface Freio {
  /** Conta UMA requisição da chave e diz se ela cabe no teto. */
  consumir(chave: string, agora?: number): ResultadoFreio;
  /** Lê o estado SEM contar — pra quem só quer punir falha (ex.: ativação). */
  excedido(chave: string, agora?: number): boolean;
  /** Só para teste: volta ao estado limpo. */
  zerar(): void;
}

export function criarFreio(opts: { limite: number; janelaMs: number; maxChaves?: number }): Freio {
  const { limite, janelaMs } = opts;
  const maxChaves = opts.maxChaves ?? 5_000;
  const janela = new Map<string, { contagem: number; expiraEm: number }>();

  // Poda: apaga o que já venceu. Só se AINDA estiver cheio, derruba as mais
  // antigas (o Map preserva ordem de inserção) — nunca um flush global, que
  // acoplado a uma chave forjável zeraria o contador da origem legítima
  // (achado da revisão). Perder contagem vencida é inofensivo.
  function podar(agora: number) {
    for (const [k, v] of janela) if (v.expiraEm <= agora) janela.delete(k);
    if (janela.size >= maxChaves) {
      const excedente = janela.size - maxChaves + 1;
      let i = 0;
      for (const k of janela.keys()) { if (i++ >= excedente) break; janela.delete(k); }
    }
  }

  function vigente(chave: string, agora: number) {
    const e = janela.get(chave);
    return e && e.expiraEm > agora ? e : null;
  }

  return {
    consumir(chave: string, agora = Date.now()): ResultadoFreio {
      let e = vigente(chave, agora);
      if (!e) {
        if (janela.size >= maxChaves) podar(agora);
        e = { contagem: 0, expiraEm: agora + janelaMs };
        janela.set(chave, e);
      }
      e.contagem++;
      return { permitido: e.contagem <= limite, restante: Math.max(0, limite - e.contagem) };
    },
    excedido(chave: string, agora = Date.now()): boolean {
      const e = vigente(chave, agora);
      return !!e && e.contagem >= limite;
    },
    zerar() { janela.clear(); },
  };
}

/**
 * Origem da requisição, pra chavear o freio.
 *
 * PRIORIZA os cabeçalhos que a Vercel preenche e o cliente NÃO consegue forjar
 * (`x-vercel-forwarded-for`, `x-real-ip`) sobre o `x-forwarded-for`, cujo
 * primeiro token é fornecido pelo cliente — a Vercel ANEXA o IP real à direita
 * em vez de substituir. Confiar no 1º token do XFF deixava um atacante rotacionar
 * o valor e ganhar um balde novo por requisição, furando o freio (achado da
 * revisão). O XFF fica só como último recurso (dev/local/sem Vercel).
 */
export function origemDe(cabecalhos: Headers): string {
  const vercel = cabecalhos.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const real = cabecalhos.get("x-real-ip");
  if (real) return real.trim();
  const xff = cabecalhos.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "desconhecida";
}
