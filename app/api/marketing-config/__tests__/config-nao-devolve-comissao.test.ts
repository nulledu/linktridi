import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A COMISSÃO NÃO SAI POR ESTA PORTA — E SALVAR O TETO NÃO A APAGA.
 *
 * `/api/marketing-config` devolve o jsonb de configuração do Tráfego. Quando a
 * comissão de cada gestor passou a morar nesse mesmo jsonb, a rota virou dois
 * problemas de uma vez:
 *
 *   1. VAZAMENTO — ela não tinha portão nenhum e devolvia o objeto inteiro.
 *      Um gestor lia o acordo do outro por aqui, sem passar pelo recorte de
 *      `/api/trafego/comissoes`. Fechar só a porta da frente não adianta se a
 *      dos fundos está escancarada.
 *
 *   2. APAGAMENTO — o PUT remontava a config campo a campo (`{ teto, contas,
 *      tagLabels, custos, metas, regras }`), então salvar o teto de gasto
 *      derrubava em silêncio tudo que não estivesse naquela lista. Já valia
 *      para fontes, classificação e peças; com as comissões, salvar o teto
 *      zeraria o acordo de todo mundo.
 *
 * Os dois casos são invisíveis em revisão — o primeiro só aparece na aba de
 * rede, o segundo semanas depois, quando alguém pergunta cadê a configuração.
 */

const CONFIG = {
  teto: 1000,
  contas: {},
  tagLabels: { "{SM-1}": "Dia das Mães" },
  custos: { produtoPct: 0, impostoPct: 0, gatewayPct: 0, custoFixo: 0 },
  metas: { roas: 0, cpa: 0, faturamento: 0, lucro: 0, investimento: 0, vendas: 0, margem: 0 },
  regras: [],
  pecas: [{ id: "sinete", label: "Sinete", padroes: ["sinete"], ativa: true }],
  fontes: { "yampi:carimbos tridi": "trafego" },
  comissoes: [
    { id: "a", nome: "Gestor A", pessoaId: "u1", pctFaturamento: 0.77, pctEficiencia: 30, ativa: true },
  ],
};

let temModulo = true;
vi.mock("@/lib/require-auth", () => ({
  getProfileForModule: async () => (temModulo ? { id: "u2", role: "colaborador" } : null),
}));

let gravado: Record<string, unknown> | null = null;
vi.mock("@/lib/marketing-config", () => ({
  getMarketingConfig: async () => structuredClone(CONFIG),
  setMarketingConfig: async (cfg: Record<string, unknown>) => { gravado = cfg; },
}));

const { GET, PUT } = await import("../route");
const corpo = async (r: Response) => (await r.json()) as Record<string, unknown>;

beforeEach(() => { temModulo = true; gravado = null; });

describe("GET", () => {
  it("não devolve as comissões nem para quem tem o módulo", async () => {
    const j = await corpo(await GET());
    expect(j.comissoes).toBeUndefined();
    expect(JSON.stringify(j)).not.toContain("Gestor A");
    // …e continua devolvendo o resto, que é para o que a rota serve.
    expect(j.teto).toBe(1000);
    expect(j.tagLabels).toEqual({ "{SM-1}": "Dia das Mães" });
  });

  it("quem não tem o módulo Tráfego não passa", async () => {
    temModulo = false;
    expect((await GET()).status).toBe(403);
  });
});

describe("PUT", () => {
  const salvarTeto = () => PUT(new Request("http://x/api/marketing-config", {
    method: "PUT", body: JSON.stringify({ teto: 5000, contas: {} }),
  }) as never);

  it("salvar o teto preserva as comissões (e o resto da config)", async () => {
    await salvarTeto();
    expect(gravado!.teto).toBe(5000);
    expect(gravado!.comissoes).toEqual(CONFIG.comissoes);
    expect(gravado!.pecas).toEqual(CONFIG.pecas);
    expect(gravado!.fontes).toEqual(CONFIG.fontes);
  });

  it("a resposta do PUT também não carrega as comissões de volta", async () => {
    const j = await corpo(await salvarTeto());
    expect(j.comissoes).toBeUndefined();
    expect(JSON.stringify(j)).not.toContain("Gestor A");
  });
});
