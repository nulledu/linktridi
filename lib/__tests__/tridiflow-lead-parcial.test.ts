import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O lead sai ANTES de a pessoa terminar o funil: quem abandona no meio é a
// maioria, e o telefone de quem abandonou vale igual. O risco disso é o
// oposto — mandar o MESMO lead a cada resposta seguinte, enchendo a fila do
// vendedor. A trava é `tridiflow_sessoes.lead_enviado_em`, e é o que este
// arquivo protege: um envio por sessão, e nada de parcial enquanto a coluna
// não existir no banco (senão a repetição volta pela porta dos fundos).

interface Estado { leadEnviadoEm: string | null; colunaExiste: boolean }
const estado: Estado = { leadEnviadoEm: null, colunaExiste: true };
const enviados: string[] = [];   // corpos que saíram pela rede

vi.mock("../supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from(tabela: string) {
      const resolvido = (valor: unknown) => ({
        eq: () => resolvido(valor),
        maybeSingle: async () => valor,
        order: () => resolvido(valor),
        limit: async () => valor,
      });
      return {
        select: (cols: string) => {
          if (cols === "lead_enviado_em") {
            return resolvido(estado.colunaExiste
              ? { data: { lead_enviado_em: estado.leadEnviadoEm }, error: null }
              : { data: null, error: { message: 'column "lead_enviado_em" does not exist' } });
          }
          if (tabela === "tridiflow_sessoes") {
            return resolvido({ data: { bot_id: "b1", respostas: { nome: "Ana", telefone: "11987654321" }, utm: {}, iniciada_em: "2026-08-10T12:00:00Z" }, error: null });
          }
          return resolvido({ data: { nome: "Chancela Vega", settings: null, published: null }, error: null });
        },
        update: (v: Record<string, unknown>) => {
          if (typeof v.lead_enviado_em === "string") estado.leadEnviadoEm = v.lead_enviado_em;
          return { eq: async () => ({ error: null }) };
        },
        insert: async () => ({ error: null }),
      };
    },
  }),
}));

const { enviarLeadWebhook } = await import("../tridiflow-db");

beforeEach(() => {
  estado.leadEnviadoEm = null;
  estado.colunaExiste = true;
  enviados.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    enviados.push(init.body);
    return new Response(JSON.stringify({ sucesso: true }), { status: 201 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("lead parcial (pessoa não terminou o funil)", () => {
  it("manda o telefone sem esperar a conclusão", async () => {
    await enviarLeadWebhook("s1", { parcial: true });
    expect(enviados.length).toBeGreaterThan(0);
    expect(enviados.some((b) => b.includes("11987654321"))).toBe(true);
  });

  it("uma sessão manda UM lead — a resposta seguinte não repete", async () => {
    await enviarLeadWebhook("s1", { parcial: true });
    const primeiro = enviados.length;
    await enviarLeadWebhook("s1", { parcial: true });
    await enviarLeadWebhook("s1");                       // e concluir depois também não
    expect(enviados.length).toBe(primeiro);
  });

  it("sem a coluna no banco, parcial não roda — repetição seria pior", async () => {
    estado.colunaExiste = false;
    await enviarLeadWebhook("s1", { parcial: true });
    expect(enviados.length).toBe(0);
    // Conclusão continua funcionando como sempre, SQL ou não.
    await enviarLeadWebhook("s1");
    expect(enviados.length).toBeGreaterThan(0);
  });

  it("marca parcial:true no payload plano, sem mexer no resto", async () => {
    await enviarLeadWebhook("s1", { parcial: true });
    const plano = enviados.map((b) => JSON.parse(b)).find((p) => "evento" in p);
    if (plano) { expect(plano.parcial).toBe(true); expect(plano.evento).toBe("lead"); }
  });
});
