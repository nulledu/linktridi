import { describe, it, expect } from "vitest";
import type { Pedido } from "@/lib/lojas";
import {
  agruparClientes, classificar, filtrarPorSegmento, resumoDeClientes,
} from "@/lib/lojas-clientes";

// ── Trava do agrupamento de clientes ─────────────────────────────────────────
// Não existe cadastro de cliente: a lista é DEDUZIDA dos pedidos. O
// agrupamento é a parte que erra em silêncio — uma chave mal escolhida
// transforma dez clientes fiéis em trinta clientes de uma compra só, e o número
// de recorrentes passa a mentir sem parecer quebrado.

const p = (n: number, dados: Partial<Pedido>): Pedido => ({
  id: `p${n}`, lojaId: "l1", numero: n, cliente: "Maria Silva",
  itens: [], total: 100, pagamento: "pago", envio: "entregue",
  feitoEm: "2026-08-20T12:00:00Z", ...dados,
});

const HOJE = "2026-08-24";

describe("quem é a mesma pessoa", () => {
  it("junta pelo e-mail, mesmo com nome e telefone diferentes", () => {
    // O e-mail é o campo que menos se digita de dois jeitos. Ele vence.
    const cs = agruparClientes([
      p(1, { cliente: "Maria Silva", clienteEmail: "maria@x.com", clienteTelefone: "14999990000" }),
      p(2, { cliente: "Maria S.", clienteEmail: "MARIA@x.com", clienteTelefone: "11888887777" }),
    ]);
    expect(cs).toHaveLength(1);
    expect(cs[0].pedidos).toBe(2);
    expect(cs[0].criterio).toBe("email");
  });

  it("junta pelo telefone quando não há e-mail, ignorando formatação e DDI", () => {
    const cs = agruparClientes([
      p(1, { clienteEmail: "", clienteTelefone: "+55 (14) 99999-0000" }),
      p(2, { clienteEmail: "", clienteTelefone: "14999990000" }),
    ]);
    expect(cs).toHaveLength(1);
    expect(cs[0].criterio).toBe("telefone");
  });

  it("cai no nome só em último caso, sem acento e sem caixa", () => {
    const cs = agruparClientes([
      p(1, { cliente: "José Antônio", clienteEmail: "", clienteTelefone: "" }),
      p(2, { cliente: "jose antonio", clienteEmail: "", clienteTelefone: "" }),
    ]);
    expect(cs).toHaveLength(1);
    expect(cs[0].criterio).toBe("nome");
  });

  it("não junta pessoas diferentes", () => {
    const cs = agruparClientes([
      p(1, { cliente: "Ana", clienteEmail: "ana@x.com" }),
      p(2, { cliente: "Bia", clienteEmail: "bia@x.com" }),
    ]);
    expect(cs).toHaveLength(2);
  });

  it("descarta pedido sem identidade nenhuma", () => {
    expect(agruparClientes([p(1, { cliente: "", clienteEmail: "", clienteTelefone: "" })])).toEqual([]);
  });
});

describe("as contas de cada cliente", () => {
  it("só soma o que foi PAGO, mas conta todo pedido", () => {
    const cs = agruparClientes([
      p(1, { clienteEmail: "a@x.com", total: 100, pagamento: "pago" }),
      p(2, { clienteEmail: "a@x.com", total: 500, pagamento: "pendente" }),
      p(3, { clienteEmail: "a@x.com", total: 300, pagamento: "estornado" }),
    ]);
    // Pendente é promessa, estornado é dinheiro que voltou. Somar os dois no
    // "gasto total" faria a tela dizer 900 onde entraram 100.
    expect(cs[0].gasto).toBe(100);
    expect(cs[0].pedidos).toBe(3);
  });

  it("guarda o primeiro e o último pedido, em qualquer ordem de entrada", () => {
    const cs = agruparClientes([
      p(2, { clienteEmail: "a@x.com", feitoEm: "2026-08-20T12:00:00Z" }),
      p(1, { clienteEmail: "a@x.com", feitoEm: "2026-01-05T12:00:00Z" }),
      p(3, { clienteEmail: "a@x.com", feitoEm: "2026-05-10T12:00:00Z" }),
    ]);
    expect(cs[0].primeiroEm.slice(0, 10)).toBe("2026-01-05");
    expect(cs[0].ultimoEm.slice(0, 10)).toBe("2026-08-20");
  });

  it("o contato mais RECENTE vence", () => {
    // Quem corrigiu o telefone no último pedido quer ser achado pelo novo.
    const cs = agruparClientes([
      p(1, { clienteEmail: "a@x.com", clienteTelefone: "1400000000", feitoEm: "2026-01-01T12:00:00Z" }),
      p(2, { clienteEmail: "a@x.com", clienteTelefone: "1499999999", feitoEm: "2026-08-01T12:00:00Z" }),
    ]);
    expect(cs[0].telefone).toBe("1499999999");
  });

  it("ordena por quem gastou mais", () => {
    const cs = agruparClientes([
      p(1, { clienteEmail: "pouco@x.com", total: 50 }),
      p(2, { clienteEmail: "muito@x.com", total: 900 }),
    ]);
    expect(cs[0].email).toBe("muito@x.com");
  });
});

describe("segmentos", () => {
  const um = agruparClientes([p(1, { clienteEmail: "novo@x.com", feitoEm: "2026-08-22T12:00:00Z" })])[0];
  const dois = agruparClientes([
    p(1, { clienteEmail: "fiel@x.com", feitoEm: "2026-08-01T12:00:00Z" }),
    p(2, { clienteEmail: "fiel@x.com", feitoEm: "2026-08-22T12:00:00Z" }),
  ])[0];
  const velho = agruparClientes([p(1, { clienteEmail: "sumiu@x.com", feitoEm: "2026-01-05T12:00:00Z" })])[0];

  it("uma compra é novo, duas é recorrente", () => {
    expect(classificar(um, HOJE)).toContain("novos");
    expect(classificar(dois, HOJE)).toContain("recorrentes");
    expect(classificar(dois, HOJE)).not.toContain("novos");
  });

  it("sem comprar há 60 dias ou mais, sumiu", () => {
    expect(classificar(velho, HOJE)).toContain("inativos");
    expect(classificar(um, HOJE)).not.toContain("inativos");
  });

  it("os filtros da tela batem com a classificação", () => {
    const todos = [um, dois, velho];
    expect(filtrarPorSegmento(todos, "todos", HOJE)).toHaveLength(3);
    expect(filtrarPorSegmento(todos, "recorrentes", HOJE)).toEqual([dois]);
    expect(filtrarPorSegmento(todos, "inativos", HOJE)).toEqual([velho]);
  });
});

describe("resumo", () => {
  it("aguenta loja sem cliente nenhum", () => {
    const r = resumoDeClientes([], HOJE);
    // Divisão por zero viraria NaN na tela.
    expect(r).toEqual({ total: 0, recorrentes: 0, sumidos: 0, gastoMedio: 0, pedidosPorCliente: 0 });
  });

  it("calcula o gasto médio por pessoa, não por pedido", () => {
    const cs = agruparClientes([
      p(1, { clienteEmail: "a@x.com", total: 100 }),
      p(2, { clienteEmail: "a@x.com", total: 100 }),
      p(3, { clienteEmail: "b@x.com", total: 200 }),
    ]);
    const r = resumoDeClientes(cs, HOJE);
    expect(r.total).toBe(2);
    expect(r.gastoMedio).toBe(200);          // 400 / 2 pessoas
    expect(r.pedidosPorCliente).toBe(1.5);   // 3 pedidos / 2 pessoas
  });
});
