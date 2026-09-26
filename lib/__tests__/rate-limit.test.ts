import { describe, expect, it } from "vitest";
import { criarFreio, origemDe } from "@/lib/rate-limit";

// Freio das rotas do leitor do galpão e da ativação (M5/M6 da auditoria):
// endpoints sem sessão de usuário precisam de um teto por origem, senão um
// martelo vira invocação e escrita sem limite (Denial of Wallet / brute force).

describe("criarFreio", () => {
  it("libera até o limite e bloqueia a partir do estouro", () => {
    const f = criarFreio({ limite: 3, janelaMs: 1000 });
    const t = 1_000_000;
    expect(f.consumir("ip", t).permitido).toBe(true);   // 1
    expect(f.consumir("ip", t).permitido).toBe(true);   // 2
    expect(f.consumir("ip", t).permitido).toBe(true);   // 3
    expect(f.consumir("ip", t).permitido).toBe(false);  // 4 estourou
    expect(f.consumir("ip", t).restante).toBe(0);
  });

  it("a janela reabre depois que expira", () => {
    const f = criarFreio({ limite: 1, janelaMs: 1000 });
    const t = 5_000_000;
    expect(f.consumir("ip", t).permitido).toBe(true);
    expect(f.consumir("ip", t).permitido).toBe(false);       // ainda na janela
    expect(f.consumir("ip", t + 1001).permitido).toBe(true); // janela nova
  });

  it("chaves diferentes têm contadores independentes", () => {
    const f = criarFreio({ limite: 1, janelaMs: 1000 });
    const t = 9_000_000;
    expect(f.consumir("ip-a", t).permitido).toBe(true);
    expect(f.consumir("ip-b", t).permitido).toBe(true);   // outra origem, próprio teto
    expect(f.consumir("ip-a", t).permitido).toBe(false);
  });

  it("poda sem flush global: chave nova NÃO zera o contador de uma chave viva", () => {
    // O flush global antigo (clear()) deixava um flood de chaves forjadas
    // resetar o balde legítimo do galpão. A poda derruba só a MAIS ANTIGA.
    const f = criarFreio({ limite: 1, janelaMs: 60_000, maxChaves: 2 });
    const t = 2_000_000;
    expect(f.consumir("a", t).permitido).toBe(true);   // a:1  (mapa: a)
    expect(f.consumir("b", t).permitido).toBe(true);   // b:1  (mapa: a,b — cheio)
    expect(f.consumir("c", t).permitido).toBe(true);   // c nova → evicta "a", mapa: b,c
    expect(f.consumir("b", t).permitido).toBe(false);  // b sobreviveu com seu contador → 2 > 1
  });

  it("excedido() lê o estado SEM contar", () => {
    const f = criarFreio({ limite: 2, janelaMs: 1000 });
    const t = 3_000_000;
    expect(f.excedido("ip", t)).toBe(false);            // não criou nem contou nada
    f.consumir("ip", t);
    f.consumir("ip", t);                                 // 2 = limite
    expect(f.excedido("ip", t)).toBe(true);             // atingiu o teto
    expect(f.consumir("ip", t).permitido).toBe(false);  // e o peek não tinha incrementado (3 > 2)
  });
});

describe("origemDe — prioriza o que o cliente NÃO forja", () => {
  it("usa x-vercel-forwarded-for acima de tudo", () => {
    const h = new Headers({ "x-vercel-forwarded-for": "203.0.113.9", "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" });
    expect(origemDe(h)).toBe("203.0.113.9");
  });
  it("cai em x-real-ip antes de confiar no x-forwarded-for do cliente", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4" });
    expect(origemDe(h)).toBe("198.51.100.7");
  });
  it("usa x-forwarded-for só como último recurso, depois 'desconhecida'", () => {
    expect(origemDe(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(origemDe(new Headers())).toBe("desconhecida");
  });
});
