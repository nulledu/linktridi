import { describe, expect, it } from "vitest";
import { isMissingMarketSchema } from "../tridimarket/repository";
import { financialStatus, saldoPessoa } from "../tridimarket/domain";

// O mercadinho passou a ter schema PRÓPRIO (`mercadinho`), então os antigos
// testes de mapeamento do ERP legado (mapLegacyProduct/mapLegacyEmployee) saíram
// junto com as funções — aquele schema não existe mais. O que continua valendo
// é o que decide DINHEIRO e o que a tela mostra quando o banco não está pronto.

describe("schema do mercadinho ausente", () => {
  it("reconhece schema NÃO PUBLICADO no Supabase (Exposed schemas)", () => {
    // Caso real: o SQL rodou, mas o schema não foi exposto na API — o PostgREST
    // devolve PGRST106 e a tela precisa pedir a publicação, não mostrar erro cru.
    expect(isMissingMarketSchema({ code: "PGRST106", message: "Only the following schemas are exposed: public" })).toBe(true);
  });

  it("reconhece tabela inexistente (migração não rodada)", () => {
    expect(isMissingMarketSchema({ code: "42P01", message: 'relation "mercadinho.vendas" does not exist' })).toBe(true);
  });

  it("não confunde erro comum com schema ausente", () => {
    expect(isMissingMarketSchema({ message: "permission denied" })).toBe(false);
    expect(isMissingMarketSchema(null)).toBe(false);
  });
});

describe("saldo da carteira (fonte única: o razão)", () => {
  const agora = Date.parse("2026-07-27T12:00:00Z");
  const dias = (n: number) => agora - n * 86_400_000;

  it("soma as compras e abate o que foi pago", () => {
    const s = saldoPessoa([{ value: 30, at: dias(2) }, { value: 20, at: dias(1) }], -20, agora);
    expect(s.open).toBe(30);
  });

  it("compra recente não conta como atrasada", () => {
    const s = saldoPessoa([{ value: 50, at: dias(3) }], 0, agora, 30);
    expect(s.open).toBe(50);
    expect(s.overdue).toBe(0);
  });

  it("compra além do prazo vira dívida vencida", () => {
    const s = saldoPessoa([{ value: 50, at: dias(45) }], 0, agora, 30);
    expect(s.overdue).toBeGreaterThan(0);
  });

  it("pagamento quita a dívida MAIS ANTIGA primeiro (FIFO)", () => {
    // Pagou o valor da compra velha: o vencido tem que sumir, não sobrar
    // cobrança fantasma de 45 dias depois de a pessoa já ter quitado.
    const s = saldoPessoa([{ value: 40, at: dias(45) }, { value: 25, at: dias(1) }], -40, agora, 30);
    expect(s.open).toBe(25);
    expect(s.overdue).toBe(0);
  });
});

describe("status financeiro", () => {
  it("bloqueado ganha de qualquer saldo", () => {
    expect(financialStatus(0, 0, 500, true)).toBe("blocked");
  });
  it("dívida vencida marca inadimplente", () => {
    expect(financialStatus(100, 100, 500)).toBe("overdue");
  });
  it("dentro do limite fica saudável", () => {
    expect(financialStatus(50, 0, 500)).toBe("good");
  });
});
