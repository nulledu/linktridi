import { describe, it, expect } from "vitest";
import {
  chaveTelefone, chaveEmail, contatosDaSessao, casarVendas, resumir,
  JANELA_VENDA_DIAS, type SessaoLead, type CompraErp,
} from "@/lib/tridiflow-vendas";

// ── Trava da atribuição de venda por funil ───────────────────────────────────
//
// O que este módulo faz é contar dinheiro, e cada regra aqui existe porque a
// alternativa dava um número errado que ninguém conferiria:
//
//  · o funil escreve "(11) 98888-7777" e o ERP escreve "5511988887777" — sem
//    normalizar, TODA venda ficaria de fora e a tela mostraria zero pra sempre;
//  · sem a janela, o funil levaria crédito por compra de meses depois;
//  · sem a dedupe por pedido, a mesma venda contaria duas vezes (ela chega por
//    duas portas do ERP: o webhook do checkout e a ficha do cliente);
//  · sem o último clique, uma pessoa que passou por dois funis somaria a venda
//    nos dois e o total do módulo ficaria maior que o faturamento real.

const sess = (p: Partial<SessaoLead> = {}): SessaoLead => ({
  botId: "bot-a", iniciadaEm: "2026-09-01T10:00:00.000Z", fone: "", email: "", adId: null, ...p,
});
const compra = (p: Partial<CompraErp> & { pedidoId: number }): CompraErp => ({
  quando: "2026-09-01T12:00:00.000Z", fone: "", email: "", valor: 100, loja: "Carimbos Tridi", ...p,
});

describe("chave de telefone", () => {
  it("casa o formato do funil com o do ERP", () => {
    expect(chaveTelefone("(11) 98888-7777")).toBe("11988887777");
    expect(chaveTelefone("5511988887777")).toBe("11988887777");
    expect(chaveTelefone("+55 11 98888 7777")).toBe("11988887777");
    expect(chaveTelefone("011988887777")).toBe("11988887777");
  });

  it("ignora número incompleto — casaria com qualquer um", () => {
    expect(chaveTelefone("98888777")).toBe("");
    expect(chaveTelefone("")).toBe("");
    expect(chaveTelefone(null)).toBe("");
  });

  it("fixo de 10 dígitos continua valendo", () => {
    expect(chaveTelefone("(14) 3322-1100")).toBe("1433221100");
  });
});

describe("chave de e-mail", () => {
  it("normaliza e recusa o que não é e-mail", () => {
    expect(chaveEmail("  Ana@Loja.COM  ")).toBe("ana@loja.com");
    expect(chaveEmail("não tenho")).toBe("");
    expect(chaveEmail("ana@loja")).toBe("");
  });
});

describe("contato da sessão", () => {
  it("acha telefone e e-mail nas chaves usuais", () => {
    expect(contatosDaSessao({ name: "Ana", phone: "(11) 98888-7777", email: "ana@loja.com" }))
      .toEqual({ fone: "11988887777", email: "ana@loja.com" });
  });

  it("acha mesmo quando o bot nomeia a variável de outro jeito", () => {
    expect(contatosDaSessao({ whatsapp: "(11) 98888-7777", "e-mail": "ana@loja.com" }))
      .toEqual({ fone: "11988887777", email: "ana@loja.com" });
  });

  it("não confunde CPF com telefone", () => {
    // 11 dígitos secos e sem pontuação de telefone: não vira contato.
    expect(contatosDaSessao({ cpf: "69844879604" }).fone).toBe("");
  });

  it("não lê UTM como contato", () => {
    expect(contatosDaSessao({ utm_content: "120248269003290574", fbclid: "PAcGRvZ" }))
      .toEqual({ fone: "", email: "" });
  });
});

describe("casamento venda × funil", () => {
  it("liga a venda ao funil pelo telefone", () => {
    const v = casarVendas([sess({ fone: "11988887777" })], [compra({ pedidoId: 9, fone: "11988887777" })]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ pedidoId: 9, botId: "bot-a", via: "telefone", horas: 2 });
  });

  it("liga pelo e-mail quando o telefone não bate", () => {
    const v = casarVendas([sess({ email: "ana@loja.com" })], [compra({ pedidoId: 9, email: "ana@loja.com" })]);
    expect(v[0]?.via).toBe("email");
  });

  it("descarta venda anterior à sessão — não foi o funil que trouxe", () => {
    const v = casarVendas(
      [sess({ fone: "11988887777", iniciadaEm: "2026-09-02T10:00:00.000Z" })],
      [compra({ pedidoId: 9, fone: "11988887777", quando: "2026-09-01T10:00:00.000Z" })],
    );
    expect(v).toHaveLength(0);
  });

  it("descarta venda fora da janela", () => {
    const depois = new Date(Date.parse("2026-09-01T10:00:00.000Z") + (JANELA_VENDA_DIAS + 1) * 864e5).toISOString();
    const v = casarVendas(
      [sess({ fone: "11988887777" })],
      [compra({ pedidoId: 9, fone: "11988887777", quando: depois })],
    );
    expect(v).toHaveLength(0);
  });

  it("conta o mesmo pedido UMA vez, mesmo vindo pelas duas portas do ERP", () => {
    const v = casarVendas(
      [sess({ fone: "11988887777", email: "ana@loja.com" })],
      [compra({ pedidoId: 9, fone: "11988887777" }), compra({ pedidoId: 9, email: "ana@loja.com" })],
    );
    expect(v).toHaveLength(1);
  });

  it("último clique: a venda é do funil mais recente antes da compra", () => {
    const v = casarVendas(
      [
        sess({ botId: "bot-a", fone: "11988887777", iniciadaEm: "2026-09-01T08:00:00.000Z" }),
        sess({ botId: "bot-b", fone: "11988887777", iniciadaEm: "2026-09-01T11:00:00.000Z" }),
      ],
      [compra({ pedidoId: 9, fone: "11988887777" })],
    );
    expect(v).toHaveLength(1);
    expect(v[0].botId).toBe("bot-b");
  });

  it("a ordem em que o banco devolveu as sessões não muda o resultado", () => {
    const a = sess({ botId: "bot-a", fone: "11988887777", iniciadaEm: "2026-09-01T08:00:00.000Z" });
    const b = sess({ botId: "bot-b", fone: "11988887777", iniciadaEm: "2026-09-01T11:00:00.000Z" });
    const c = [compra({ pedidoId: 9, fone: "11988887777" })];
    expect(casarVendas([a, b], c)[0].botId).toBe(casarVendas([b, a], c)[0].botId);
  });

  it("carrega o anúncio da sessão junto da venda", () => {
    const v = casarVendas([sess({ fone: "11988887777", adId: "120248269003290574" })], [compra({ pedidoId: 9, fone: "11988887777" })]);
    expect(v[0].adId).toBe("120248269003290574");
  });

  it("sessão sem contato não puxa venda nenhuma", () => {
    expect(casarVendas([sess()], [compra({ pedidoId: 9, fone: "11988887777" })])).toHaveLength(0);
  });
});

describe("resumo", () => {
  it("fecha vendas, receita, ticket e conversão", () => {
    const sessoes = [
      sess({ fone: "11988887777" }),
      sess({ fone: "11955554444" }),
      sess(),
      sess(),
    ];
    const vendas = casarVendas(sessoes, [
      compra({ pedidoId: 1, fone: "11988887777", valor: 100 }),
      compra({ pedidoId: 2, fone: "11955554444", valor: 200 }),
    ]);
    const r = resumir(sessoes, vendas);
    expect(r).toMatchObject({ sessoes: 4, leads: 2, vendas: 2, receita: 300, ticket: 150, conversao: 50 });
  });

  it("sem venda não divide por zero", () => {
    expect(resumir([sess()], [])).toMatchObject({ vendas: 0, receita: 0, ticket: 0, conversao: 0, ultimaVenda: null });
  });
});
