import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolvePeriod } from "../period";

/**
 * O livro do comercial mudou de tabela e o app não pode voltar a olhar só uma.
 *
 * Até 31/08/2026 as vendedoras lançavam em `vendas_planilha`. Em 04/09/2026 o
 * ERP publicou `comercial_planilha_mes` (uma linha por PAGAMENTO, com taxa e
 * comissão já calculadas) e parou de alimentar a antiga. Como todo o Comercial
 * da casa lia só a velha, em 1º/set o canal virou R$ 0,00 em todas as telas —
 * card "Faturamento total da empresa", parede de TV, Analytics, ranking — e
 * levou junto o F_Total da comissão do gestor. R$ 36,2 mil fora da conta.
 *
 * O erro é do tipo silencioso: nenhuma tela quebra, nenhum log aparece, e
 * "R$ 0,00" é um número plausível num dia fraco. Por isso a trava é aqui.
 */

const fetchMock = vi.fn();

// Duas linhas de 30/08 no livro ANTIGO e duas de 30/08 no NOVO (o mesmo dia,
// visto pelos dois): é o caso que decide se algo conta em dobro.
const ANTIGO = [
  { vendedora_id: "v1", valor: 110, venda: 100, frete: 0, pagto: "Pix", item: "Carimbo 10cm", cliente: "Ana", data_venda: "2026-08-30T00:00:00.000Z" },
  { vendedora_id: "v2", valor: 55, venda: 50, frete: 5, pagto: "Cartão", item: "Chancela", cliente: "Bia", data_venda: "2026-08-30T00:00:00.000Z" },
];
const NOVO = [
  { responsavel_id: "v1", valor_bruto: 999, valor_resto: 999, frete_deduzido: 0, forma_pagamento_nome: "Pix", itens_nomes: "Não deve entrar", cliente_nome: "X", data_pagamento: "2026-08-30T14:00:00.000Z" },
  { responsavel_id: "v1", valor_bruto: 210, valor_resto: 200, frete_deduzido: 0, forma_pagamento_nome: "Pix", itens_nomes: "Carimbo 12cm", cliente_nome: "Duda", data_pagamento: "2026-09-01T14:00:00.000Z" },
  { responsavel_id: "v3", valor_bruto: 33, valor_resto: 30, frete_deduzido: 3, forma_pagamento_nome: "Pix", itens_nomes: "", cliente_nome: "Edu", data_pagamento: "2026-09-02T23:30:00.000Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes("comercial_planilha_mes") ? NOVO : String(url).includes("vendas_planilha") ? ANTIGO : []),
  }));
});

const urls = () => fetchMock.mock.calls.map((c) => decodeURIComponent(String(c[0])));

describe("livroComercial", () => {
  const faixa = resolvePeriod("custom", "2026-08-30", "2026-09-02");

  it("pergunta aos DOIS livros do ERP", async () => {
    const { livroComercial } = await import("../vendedoras");
    await livroComercial(faixa);
    expect(urls().some((u) => u.includes("vendas_planilha?select="))).toBe(true);
    expect(urls().some((u) => u.includes("comercial_planilha_mes?select="))).toBe(true);
  });

  it("o livro ANTIGO manda no dia em que ele tem linha — nada conta em dobro", async () => {
    const { livroComercial } = await import("../vendedoras");
    const linhas = await livroComercial(faixa);
    // 30/08 é dia do livro antigo: as duas linhas dele entram, a do novo não.
    const trinta = linhas.filter((l) => l.dia === "2026-08-30");
    expect(trinta.map((l) => l.liquido).sort((a, b) => a - b)).toEqual([50, 100]);
    // 01 e 02/09 a planilha velha não cobre: vêm do livro novo.
    expect(linhas.filter((l) => l.dia === "2026-09-01").map((l) => l.liquido)).toEqual([200]);
    expect(linhas.filter((l) => l.dia === "2026-09-02").map((l) => l.liquido)).toEqual([30]);
    expect(linhas).toHaveLength(4);
  });

  it("traduz as colunas do livro novo pros mesmos campos do antigo", async () => {
    const { livroComercial } = await import("../vendedoras");
    const linhas = await livroComercial(faixa);
    expect(linhas.find((l) => l.dia === "2026-09-01")).toMatchObject({
      vendedoraId: "v1", bruto: 210, liquido: 200, frete: 0, pagto: "Pix", item: "Carimbo 12cm", cliente: "Duda",
    });
  });

  it("o pagamento das últimas horas do dia fica NO dia — a janela fecha em Brasília", async () => {
    const { livroComercial } = await import("../vendedoras");
    const linhas = await livroComercial(faixa);
    // 02/09 23:30 UTC = 20:30 em SP. Lido como UTC, viraria 03/09 e sumiria.
    expect(linhas.some((l) => l.dia === "2026-09-02")).toBe(true);
  });
});

describe("janela de data_pagamento", () => {
  const hoje = resolvePeriod("hoje", null, null, new Date("2026-09-08T19:00:00Z"));

  it("é meio-aberta e escreve o fuso de Brasília", async () => {
    const { janelaDataPagamento } = await import("../vendedoras");
    const q = decodeURIComponent(janelaDataPagamento(hoje));
    expect(q).toContain("data_pagamento=gte.2026-09-08T00:00:00-03:00");
    expect(q).toContain("data_pagamento=lt.2026-09-09T00:00:00-03:00");
  });

  it("nunca usa `lte` nem data nua — é o que derrubava o último dia", async () => {
    const { janelaDataPagamento } = await import("../vendedoras");
    const q = janelaDataPagamento(hoje);
    expect(q).not.toContain("lte.");
    expect(q).not.toMatch(/(gte|lt)\.\d{4}-\d{2}-\d{2}(&|$)/);
  });

  it("vira o mês e o ano sem inventar dia 32", async () => {
    const { janelaDataPagamento } = await import("../vendedoras");
    const fim = (ate: string) =>
      decodeURIComponent(janelaDataPagamento(resolvePeriod("custom", "2026-01-01", ate))).match(/lt\.([\d-]+)T/)?.[1];
    expect(fim("2026-08-31")).toBe("2026-09-01");
    expect(fim("2026-12-31")).toBe("2027-01-01");
    expect(fim("2026-02-28")).toBe("2026-03-01");
  });
});

describe("comercialTodasVendedoras", () => {
  it("soma o líquido do livro e devolve o por-dia na MESMA base", async () => {
    const { comercialTodasVendedoras } = await import("../vendedoras");
    const r = await comercialTodasVendedoras(resolvePeriod("custom", "2026-08-30", "2026-09-02"));
    expect(r.valor).toBe(380);          // 100 + 50 (antigo) + 200 + 30 (novo)
    expect(r.pedidos).toBe(4);
    expect(r.porDia).toEqual({ "2026-08-30": 150, "2026-09-01": 200, "2026-09-02": 30 });
    // O total do período é a soma do por-dia: é o que faz o card do mês e o da
    // TV (dia/semana) contarem a mesma coisa.
    expect(Object.values(r.porDia).reduce((s, v) => s + v, 0)).toBe(r.valor);
  });
});

describe("trava de código", () => {
  const raiz = path.resolve(__dirname, "../..");
  const semComentario = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

  it("quem lê o comercial passa pelo livroComercial, nunca direto na tabela velha", () => {
    for (const rel of ["lib/vendedoras.ts", "lib/erp.ts"]) {
      const src = semComentario(fs.readFileSync(path.join(raiz, rel), "utf8"));
      const lePlanilhaVelha = /"vendas_planilha"/.test(src);
      const ehOProprioLivro = /export async function livroComercial/.test(src);
      expect(lePlanilhaVelha && !ehOProprioLivro, `${rel} lê vendas_planilha direto — use livroComercial()`).toBe(false);
    }
  });
});
