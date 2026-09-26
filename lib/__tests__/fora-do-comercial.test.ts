import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolvePeriod } from "../period";
import type { PedidoComercial } from "../comercial-pedidos";

/**
 * Samuel Jr. e Gabriel Suzuki são administradores, não vendedores.
 *
 * Quando um deles fecha uma venda por dentro, o ERP grava o nome dele no livro
 * do comercial — e cada linha virava um "vendedor" no ranking e somava no
 * faturamento do Comercial (Tridify, Analytics, Geral do Comercial). A parede
 * de TV já os tirava, por uma lista própria; as outras telas não. Pedido do
 * dono em 12/09/2026: fora de toda lista de vendedores e de todo total.
 */

const fetchMock = vi.fn();

const USUARIOS = [
  { user_id: "sam", nome: "Samuel Jr.", apelido: null },
  { user_id: "suz", nome: "Gabriel Suzuki", apelido: null },
  { user_id: "v1", nome: "Paola", apelido: null },
];
// 30/08: no livro ANTIGO só há linha do Samuel; no NOVO, uma da Paola no
// mesmo dia. O dia continua sendo do antigo — tirar o Samuel não pode abrir a
// porta pro livro novo contar aquele dia.
const ANTIGO = [
  { vendedora_id: "sam", valor: 700, venda: 686, frete: 0, pagto: "Pix", item: "Carimbo", cliente: "A", data_venda: "2026-08-30T00:00:00.000Z" },
];
const NOVO = [
  { responsavel_id: "v1", valor_bruto: 999, valor_resto: 999, frete_deduzido: 0, forma_pagamento_nome: "Pix", itens_nomes: "x", cliente_nome: "X", data_pagamento: "2026-08-30T14:00:00.000Z" },
  { responsavel_id: "v1", valor_bruto: 210, valor_resto: 200, frete_deduzido: 0, forma_pagamento_nome: "Pix", itens_nomes: "Carimbo 12cm", cliente_nome: "Duda", data_pagamento: "2026-09-01T14:00:00.000Z" },
  { responsavel_id: "suz", valor_bruto: 190, valor_resto: 184, frete_deduzido: 0, forma_pagamento_nome: "Pix", itens_nomes: "Chancela", cliente_nome: "Edu", data_pagamento: "2026-09-01T15:00:00.000Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    return {
      ok: true,
      json: async () => (u.includes("comercial_planilha_mes") ? NOVO : u.includes("vendas_planilha") ? ANTIGO : u.includes("usuarios") ? USUARIOS : []),
    };
  });
});

describe("foraDoComercial", () => {
  it("reconhece os dois administradores, sem acento nem caixa", async () => {
    const { foraDoComercial } = await import("../vendedoras");
    expect(foraDoComercial("Samuel Jr.")).toBe(true);
    expect(foraDoComercial("Gabriel Suzuki")).toBe(true);
    expect(foraDoComercial("GABRIEL SUZUKI")).toBe(true);
    // Outro Gabriel é outra pessoa.
    expect(foraDoComercial("Gabriel Augusto")).toBe(false);
    expect(foraDoComercial("Paola")).toBe(false);
    expect(foraDoComercial(null)).toBe(false);
    expect(foraDoComercial("")).toBe(false);
  });
});

describe("o livro do comercial chega sem eles", () => {
  const faixa = resolvePeriod("custom", "2026-08-30", "2026-09-01");

  it("as linhas deles saem, as das vendedoras ficam", async () => {
    const { livroComercial } = await import("../vendedoras");
    const linhas = await livroComercial(faixa);
    expect(linhas.map((l) => l.vendedoraId)).toEqual(["v1"]);
    expect(linhas[0]).toMatchObject({ dia: "2026-09-01", liquido: 200 });
  });

  it("tirar alguém não muda de quem é o dia — nada do livro novo entra em dia do antigo", async () => {
    const { livroComercial } = await import("../vendedoras");
    const linhas = await livroComercial(faixa);
    expect(linhas.some((l) => l.dia === "2026-08-30")).toBe(false);
  });

  it("o total do Comercial da Tridify não soma o que eles lançaram", async () => {
    const { comercialTodasVendedoras } = await import("../vendedoras");
    const r = await comercialTodasVendedoras(faixa);
    expect(r.valor).toBe(200);
    expect(r.pedidos).toBe(1);
  });

  it("o ranking das vendedoras não os lista", async () => {
    const { buildVendedorasSnapshot } = await import("../vendedoras");
    const s = await buildVendedorasSnapshot(faixa);
    expect(s.vendedoras.map((v) => v.id)).toEqual(["v1"]);
    expect(s.total.liquido).toBe(200);
  });
});

describe("Geral do Comercial", () => {
  it("tira quem não é vendedor da lista de pedidos e de responsáveis", async () => {
    const { semForaDoComercial } = await import("../comercial-geral");
    const base = { user_id: "", nome: "", ativo: true };
    const d = semForaDoComercial({
      responsaveis: [{ ...base, user_id: "sam", nome: "Samuel Jr." }, { ...base, user_id: "v1", nome: "Paola" }],
      pedidos: [{ responsavel_id: "sam" }, { responsavel_id: "v1" }] as unknown as PedidoComercial[],
    });
    expect(d.responsaveis.map((r) => r.user_id)).toEqual(["v1"]);
    expect(d.pedidos.map((p) => p.responsavel_id)).toEqual(["v1"]);
  });
});

describe("fora da parede de TV (pedido de 14/09/2026)", () => {
  it("Letícia, Emanuelly e Ana Julia não entram no ranking, com ou sem acento", async () => {
    const { foraDaParede } = await import("../erp");
    for (const n of ["Letícia Valentim", "LETICIA", "Emanuelly", "Ana Júlia", "ana julia souza"]) {
      expect(foraDaParede(n), n).toBe(true);
    }
    expect(foraDaParede("Paola")).toBe(false);
    expect(foraDaParede("Ana Paula")).toBe(false);
    expect(foraDaParede(null)).toBe(false);
  });
});

describe("trava de código", () => {
  const raiz = path.resolve(__dirname, "../..");
  const ler = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

  it("a TV usa a definição compartilhada, não uma lista própria com os dois", () => {
    const erp = ler("lib/erp.ts");
    expect(erp.includes("foraDoComercial"), "lib/erp.ts precisa perguntar `foraDoComercial` de lib/vendedoras.ts").toBe(true);
    const lista = /const EXCLUDE_NAMES[^=]*=\s*\[([^\]]*)\]/.exec(erp)?.[1] ?? "";
    expect(/samuel|suzuki/i.test(lista), "Samuel/Suzuki voltaram pra EXCLUDE_NAMES — a resposta é `foraDoComercial`").toBe(false);
  });

  it("o Geral do Comercial lê os números da Tridify, não soma pedido por conta própria", () => {
    const rota = ler("app/api/comercial/geral/route.ts");
    expect(rota.includes("geralDoComercial"), "a rota do Geral precisa usar geralDoComercial (Tridify)").toBe(true);
    expect(/\bvendasGeral\b/.test(rota), "a rota do Geral voltou a somar os pedidos dos responsáveis").toBe(false);
  });

  it("as rotas de pedidos e responsáveis do Comercial passam pelo filtro", () => {
    expect(ler("app/api/comercial/pedidos/route.ts").includes("semForaDoComercial")).toBe(true);
    expect(ler("app/api/comercial/responsaveis/route.ts").includes("foraDoComercial")).toBe(true);
  });
});
