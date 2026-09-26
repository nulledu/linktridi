import { describe, expect, it } from "vitest";
import { TridiMarketRepository } from "../tridimarket/repository";

// Banco falso: cada tabela devolve linhas fixas. Os encadeamentos do supabase-js
// (.select().in().eq().order()...) só retornam o próprio builder, e o await no
// fim resolve com {data,error} — é o suficiente para exercitar o repositório
// inteiro sem rede.
function fakeDb(tabelas: Record<string, unknown[]>) {
  const builder = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "lte", "not", "order", "limit", "range", "neq"]) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    // `count: "exact"` com head: o repositório usa isso pra contar operações
    // presas sem baixar as linhas — o fake precisa devolver o total.
    b.select = (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) {
        const r: Record<string, unknown> = {};
        for (const m of ["eq", "in", "gte", "lte", "not", "neq", "order", "limit", "range"]) r[m] = () => r;
        r.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, count: rows.length, error: null }).then(resolve);
        return r;
      }
      return b;
    };
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
    return b;
  };
  return { from: (t: string) => builder(tabelas[t] ?? []) };
}

const PERFIL = "11111111-1111-1111-1111-111111111111";
const HOJE = new Date().toISOString();

function repositorio() {
  return new TridiMarketRepository(fakeDb({
    unidades: [{ id: PERFIL, nome: "Tridi Escritório", ativo: true, descricao: null }],
    funcionarios: [
      { id: 1, unidade_id: PERFIL, nome: "Ana", foto_url: null, ativo: true, limite_proprio: null, bloqueado: false },
      { id: 2, unidade_id: PERFIL, nome: "Bruno", foto_url: null, ativo: true, limite_proprio: null, bloqueado: false },
    ],
    vendas: [
      { id: 100, criado_em: HOJE, unidade_id: PERFIL, funcionario_id: 1, pago: false, total: 10 },
      { id: 101, criado_em: HOJE, unidade_id: PERFIL, funcionario_id: 2, pago: true, total: 7 },
    ],
    // 3 unidades de refrigerante (Bebida) + 1 de bolacha (Doce)
    venda_itens: [
      { venda_id: 100, produto_id: 10, quantidade: 2, preco_unit: 5 },
      { venda_id: 101, produto_id: 10, quantidade: 1, preco_unit: 5 },
      { venda_id: 101, produto_id: 20, quantidade: 1, preco_unit: 2 },
    ],
    produtos: [
      { id: 10, codigo_barras: "789", nome: "Refrigerante", preco_padrao: 5, custo_padrao: null, imagem_url: null, categoria_id: 1, ativo: true, sem_codigo: false },
      { id: 20, codigo_barras: "790", nome: "Bolacha", preco_padrao: 2, custo_padrao: null, imagem_url: null, categoria_id: 3, ativo: true, sem_codigo: false },
    ],
    categorias: [{ id: 1, nome: "Bebida" }, { id: 3, nome: "Doce" }],
    estoque: [
      { produto_id: 10, unidade_id: PERFIL, quantidade: 12, minimo: 5, permite_negativo: true },
      { produto_id: 20, unidade_id: PERFIL, quantidade: 1, minimo: 5, permite_negativo: true },
    ],
    precos: [],
    dispositivos: [
      { id: "d1", nome: "Mesa Carimbos", unidade_id: PERFIL, ativo: true, visto_em: HOJE, versao_app: null, bateria: null },
      { id: "d2", nome: "Mesa Produção", unidade_id: PERFIL, ativo: true, visto_em: new Date(Date.now() - 5 * 3600_000).toISOString(), versao_app: null, bateria: null },
    ],
    // No sistema novo a DÍVIDA vem do razão, não de recalcular vendas: a RPC
    // registrar_compra grava a venda e o lançamento na mesma transação. Ana
    // deve 10; Bruno comprou 7 e pagou, então zera.
    // 3 operações presas (2 em revisão + 1 subindo) → pendingSync = 3.
    operacoes_compra: [
      { operacao_id: "o1", unidade_id: PERFIL, status: "REVISAR" },
      { operacao_id: "o2", unidade_id: PERFIL, status: "REVISAR" },
      { operacao_id: "o3", unidade_id: PERFIL, status: "SINCRONIZANDO" },
    ],
    lancamentos: [
      { funcionario_id: 1, tipo: "compra", valor: 10, ocorrido_em: HOJE },
      { funcionario_id: 2, tipo: "compra", valor: 7, ocorrido_em: HOJE },
      { funcionario_id: 2, tipo: "pagamento", valor: -7, ocorrido_em: HOJE },
    ],
    ajustes: [],
    scores: [],
    creditos: [],
    pessoa_unidade: [],
  }));
}

describe("painel do TridiMarket", () => {
  it("conta unidades vendidas e monta o mix por categoria", async () => {
    const o = await repositorio().overview();
    expect(o.itemsSold).toBe(4);
    expect(o.categories.map((c) => c.name)).toEqual(["Bebida", "Doce"]);
    expect(o.categories[0]).toMatchObject({ items: 3, revenue: 15 });
    // A soma das fatias fecha em 100% — senão a rosca desenha errado.
    expect(o.categories.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 6);
  });

  it("ordena os mais vendidos por valor", async () => {
    const o = await repositorio().overview();
    expect(o.topProducts[0]).toMatchObject({ id: 10, name: "Refrigerante", units: 3, revenue: 15 });
    expect(o.topProducts[1]).toMatchObject({ id: 20, units: 1, revenue: 2 });
  });

  it("lista compras recentes com pessoa, itens e total", async () => {
    const o = await repositorio().overview();
    expect(o.recentPurchases).toHaveLength(2);
    const compra = o.recentPurchases.find((c) => c.id === 100)!;
    expect(compra).toMatchObject({ employeeName: "Ana", items: 2, total: 10, paid: false, unitName: "Tridi Escritório" });
    expect(o.recentPurchases.find((c) => c.id === 101)).toMatchObject({ employeeName: "Bruno", items: 2, total: 7, paid: true });
  });

  it("marca como sem contato o tablet que não fala há horas", async () => {
    const o = await repositorio().overview();
    expect(o.devices.find((d) => d.id === "d1")?.online).toBe(true);
    expect(o.devices.find((d) => d.id === "d2")?.online).toBe(false);
    expect(o.offlineDevices).toBe(1);
    expect(o.pendingSync).toBe(3);   // soma das operações presas nos tablets
  });

  it("declara o intervalo que gerou os números", async () => {
    const de = new Date("2026-07-17T00:00:00.000Z").toISOString();
    const ate = new Date("2026-07-23T23:59:59.999Z").toISOString();
    const o = await repositorio().overview(undefined, { de, ate });
    // O intervalo devolvido é EXATAMENTE o pedido — a tela precisa poder
    // escrever na página a faixa que gerou os números.
    expect(o.periodStart).toBe(de);
    expect(o.periodEnd).toBe(ate);
    expect(o.periodDays).toBe(7);
  });

  it("aceita um único dia (o padrão 'hoje')", async () => {
    const de = new Date("2026-07-23T00:00:00.000Z").toISOString();
    const ate = new Date("2026-07-23T23:59:59.999Z").toISOString();
    const o = await repositorio().overview(undefined, { de, ate });
    expect(o.periodDays).toBe(1);
  });

  it("ticket médio é o consumo dividido pelas compras do período", async () => {
    const o = await repositorio().overview();
    expect(o.consumed).toBe(17);
    expect(o.purchases).toBe(2);
    expect(o.ticket).toBe(8.5);
  });

  it("quem mais gastou no período não é a mesma lista de quem mais deve", async () => {
    const o = await repositorio().overview();
    // Ana gastou 10 e Bruno 7 → Ana lidera o consumo do período...
    expect(o.topSpenders[0]?.name).toBe("Ana");
    // ...mas a compra do Bruno está PAGA, então a dívida em aberto é só a da Ana.
    expect(o.open).toBe(10);
  });
});
