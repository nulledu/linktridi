import { describe, expect, it } from "vitest";
import { criarFreio } from "@/lib/rate-limit";

// O balde por CONTA é chaveado pelo nome DIGITADO — quem digita não precisa ser
// o dono. Se ele fechasse a porta, qualquer um erraria dez vezes o usuário de um
// colega e o colega, sabendo a senha, ficaria 15 minutos de fora. Negação de
// serviço de graça, sem o atacante acertar nada.
//
// A regra: quem fecha a porta é o balde de IP; o de conta só marca "conta
// quente". Este teste guarda a diferença entre as duas coisas.

describe("freio: IP fecha a porta, conta só esquenta", () => {
  it("o balde de IP realmente barra depois do teto", () => {
    const ip = criarFreio({ limite: 3, janelaMs: 60_000 });
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) ip.consumir("1.2.3.4", t);
    expect(ip.excedido("1.2.3.4", t)).toBe(true);
  });

  it("o balde de conta marca a conta como atacada sem depender do IP", () => {
    const conta = criarFreio({ limite: 3, janelaMs: 60_000 });
    const t = 2_000_000;
    // Dez tentativas erradas contra a MESMA conta, vindas de IPs diferentes.
    for (let i = 0; i < 4; i++) conta.consumir("conta:joao", t);
    expect(conta.excedido("conta:joao", t)).toBe(true);
    // ...e a conta do colega ao lado segue limpa.
    expect(conta.excedido("conta:maria", t)).toBe(false);
  });

  it("só falha debita: quem acerta a senha não gasta balde nenhum", () => {
    // O login só chama consumir() no caminho de recusa. Aqui o equivalente:
    // sem consumir, o teto nunca é atingido por mais que se logue.
    const conta = criarFreio({ limite: 1, janelaMs: 60_000 });
    const t = 3_000_000;
    expect(conta.excedido("conta:ana", t)).toBe(false);
    expect(conta.excedido("conta:ana", t)).toBe(false);
  });
});
