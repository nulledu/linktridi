import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pedido, Produto } from "@/lib/lojas";
import { montarResumo } from "@/app/(plataforma)/lojas/[id]/page";

// ── Trava das contas do painel da loja ───────────────────────────────────────
// Painel de dinheiro que mente não parece quebrado: mostra um número, e o
// número está errado. As duas formas conhecidas de errar aqui são a JANELA
// (period deslocado por um dia) e o FUSO (às 21h o servidor já está no dia
// seguinte em UTC e "hoje" passa a incluir as vendas de amanhã).
//
// Por isso o relógio é fixado no teste: sem fixar, esta suíte passaria de dia e
// falharia de noite.

const produto = (id: string, categoria: string): Produto => ({
  id, lojaId: "l1", titulo: `Produto ${id}`, descricao: "desc",
  imagens: [{ id: `${id}-1`, url: "/f.png", alt: "" }],
  preco: 100, precoPromocional: null, custo: null, estoque: 5,
  venderSemEstoque: false, sku: "", codigoBarras: "", categorias: [categoria],
  status: "ativo", atualizadoEm: "2026-08-01T00:00:00Z",
});

const pedido = (numero: number, iso: string, total: number, extra: Partial<Pedido> = {}): Pedido => ({
  id: `p${numero}`, lojaId: "l1", numero, cliente: `Cliente ${numero}`,
  itens: [{ produtoId: "a", titulo: "Produto a", quantidade: 1, precoUnitario: total }],
  total, pagamento: "pago", envio: "enviado", feitoEm: iso, ...extra,
});

describe("montarResumo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 23h de São Paulo = 02h do dia SEGUINTE em UTC. É exatamente a hora em que
    // um `new Date().toISOString()` cru começa a mentir.
    vi.setSystemTime(new Date("2026-08-24T02:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const produtos = [produto("a", "Carimbos"), produto("b", "Chancelas")];

  it("conta o período de 7 dias no fuso de São Paulo", () => {
    const r = montarResumo(
      [
        pedido(1, "2026-08-23T15:00:00Z", 100), // hoje em SP
        pedido(2, "2026-08-17T15:00:00Z", 50),  // primeiro dia da janela
        pedido(3, "2026-08-16T15:00:00Z", 999), // fora: é do período anterior
      ],
      produtos, null,
    );
    expect(r.vendas.hoje).toBe(150);
    expect(r.vendas.antes).toBe(999);
    expect(r.pedidos.hoje).toBe(2);
    expect(r.ticket.hoje).toBe(75);
    // Sete pontos, um por dia, mesmo nos dias sem venda — buraco na série faria
    // a curva pular dias e mentir sobre o ritmo.
    expect(r.serie).toHaveLength(7);
    expect(r.serie.map((p) => p.valor).reduce((s, v) => s + v, 0)).toBe(150);
    expect(r.serieAntes).toHaveLength(7);
  });

  it("só conta pedido PAGO no faturamento", () => {
    const r = montarResumo(
      [
        pedido(1, "2026-08-23T15:00:00Z", 100),
        pedido(2, "2026-08-23T15:00:00Z", 500, { pagamento: "pendente" }),
        pedido(3, "2026-08-23T15:00:00Z", 300, { pagamento: "estornado" }),
      ],
      produtos, null,
    );
    // Pedido pendente é promessa, estornado é dinheiro que voltou. Somar os
    // dois no "vendas totais" é o erro que faz o painel dizer 900 quando
    // entraram 100.
    expect(r.vendas.hoje).toBe(100);
    expect(r.pedidos.hoje).toBe(1);
    // Mas a lista de RECENTES mostra todos: quem abre o painel precisa ver o
    // pendente justamente porque ele ainda não virou dinheiro.
    expect(r.recentes).toHaveLength(3);
  });

  it("conta a fila de envio independente do período", () => {
    const r = montarResumo(
      [
        pedido(1, "2026-01-05T12:00:00Z", 100, { envio: "nao_enviado" }),
        pedido(2, "2026-08-23T12:00:00Z", 100, { envio: "preparando" }),
        pedido(3, "2026-08-23T12:00:00Z", 100, { envio: "entregue" }),
      ],
      produtos, null,
    );
    // Pedido de janeiro que ninguém enviou continua sendo um pedido que ninguém
    // enviou — limitar a fila à janela de 7 dias esconderia justamente o mais
    // atrasado.
    expect(r.aEnviar).toBe(2);
  });

  it("agrupa por categoria e ranqueia por unidade vendida", () => {
    const r = montarResumo(
      [
        pedido(1, "2026-08-23T12:00:00Z", 200, {
          itens: [
            { produtoId: "a", titulo: "A", quantidade: 3, precoUnitario: 50 },
            { produtoId: "b", titulo: "B", quantidade: 1, precoUnitario: 50 },
          ],
        }),
      ],
      produtos, null,
    );
    expect(r.porCategoria).toEqual([
      { nome: "Carimbos", valor: 150 },
      { nome: "Chancelas", valor: 50 },
    ]);
    expect(r.maisVendidos.map((m) => [m.produto.id, m.unidades])).toEqual([["a", 3], ["b", 1]]);
  });

  it("deduz as tarefas do catálogo, e não de uma lista fixa", () => {
    const semFoto = { ...produto("c", "Carimbos"), imagens: [] };
    const r = montarResumo([], [produtos[0], semFoto], null);
    const texto = r.tarefas.map((t) => `${t.feito ? "x" : "-"} ${t.texto}`);
    expect(texto).toContain("x Cadastrar o primeiro produto");
    expect(texto).toContain("- Adicionar foto em 1 produto(s)");
    expect(texto).toContain("- Conectar um domínio próprio");

    const comDominio = montarResumo([], [produtos[0]], "loja.com.br");
    expect(comDominio.tarefas.find((t) => t.texto.includes("loja.com.br"))?.feito).toBe(true);
  });

  it("aguenta loja sem nada", () => {
    const r = montarResumo([], [], null);
    expect(r.vendas).toEqual({ hoje: 0, antes: 0 });
    expect(r.ticket.hoje).toBe(0); // divisão por zero viraria NaN na tela
    expect(r.porCategoria).toEqual([]);
    expect(r.serie).toHaveLength(7);
  });
});
