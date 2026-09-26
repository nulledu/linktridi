import { describe, it, expect } from "vitest";
import { filaDaRodada, rodadaDeSync } from "../meta-warehouse";

// Bug de agosto/2026: a Tridify ficava "Sincronizando…" pra sempre e os botões
// de atualizar nasciam desabilitados. Não era a Meta: `restantes` vinha de
// `todas as contas - processadas nesta chamada`, e a fila era RECONTADA inteira
// a cada volta. Com 21 contas (~100s de trabalho) e prazo de 45s por chamada,
// cabiam ~13 — então `restantes` travava em ~8 e `concluido` nunca chegava.
//
// A trava é a RODADA: o carimbo de quando o dreno começou. Cada volta só pega
// quem ainda não foi tentado depois daquele instante, então a fila encolhe de
// verdade e o laço termina.

type Conta = { account_id: string };
const contas = (n: number): Conta[] =>
  Array.from({ length: n }, (_, i) => ({ account_id: `acc${i}` }));

describe("filaDaRodada", () => {
  it("sem rodada, devolve todas as contas (comportamento do cron)", () => {
    expect(filaDaRodada(contas(5), new Map(), undefined)).toHaveLength(5);
  });

  it("tira da fila quem já foi tentado DEPOIS do início da rodada", () => {
    const inicio = "2026-08-17T11:17:00.000Z";
    const tentativas = new Map([
      ["acc0", "2026-08-17T11:17:13.000Z"],   // tentada nesta rodada → sai
      ["acc1", "2026-08-17T11:16:59.000Z"],   // tentada ANTES → continua
    ]);
    const fila = filaDaRodada(contas(3), tentativas, inicio);
    expect(fila.map((c) => c.account_id)).toEqual(["acc1", "acc2"]);
  });

  it("conta sem registro nenhum sempre entra na fila", () => {
    const fila = filaDaRodada(contas(2), new Map(), "2026-08-17T11:17:00.000Z");
    expect(fila).toHaveLength(2);
  });

  it("carimbo corrompido não some com a conta", () => {
    const tentativas = new Map([["acc0", "nao-e-data"]]);
    expect(filaDaRodada(contas(1), tentativas, "2026-08-17T11:17:00.000Z")).toHaveLength(1);
  });

  // O teste que importa: com o prazo cortando a chamada no meio, o dreno TEM
  // que terminar. Antes, este laço rodava pra sempre com restantes travado.
  it("o dreno converge: restantes zera mesmo quando o prazo corta a chamada", () => {
    const TOTAL = 21;
    const CABEM_NO_PRAZO = 13;          // medido em produção: ~5s por conta, prazo 45s
    const inicio = new Date("2026-08-17T11:17:00.000Z").getTime();
    const tentativas = new Map<string, string>();

    let relogio = inicio;
    let voltas = 0;
    let restantes = Infinity;

    while (restantes !== 0) {
      voltas++;
      expect(voltas).toBeLessThanOrEqual(25);   // MAX_VOLTAS do cliente

      const fila = filaDaRodada(contas(TOTAL), tentativas, new Date(inicio).toISOString());
      let processadas = 0;
      for (const c of fila) {
        if (processadas >= CABEM_NO_PRAZO) break;   // prazo estourou
        relogio += 5_000;
        tentativas.set(c.account_id, new Date(relogio).toISOString());
        processadas++;
      }
      restantes = Math.max(0, fila.length - processadas);
    }

    expect(voltas).toBe(2);                     // 13 + 8, e acabou
    expect(tentativas.size).toBe(TOTAL);        // ninguém ficou pra trás
  });
});

describe("rodadaDeSync", () => {
  const agora = Date.parse("2026-08-17T11:17:00.000Z");

  it("sem carimbo, abre rodada nova no relógio do servidor", () => {
    expect(rodadaDeSync(null, agora)).toBe(new Date(agora).toISOString());
  });

  it("continua a rodada que o cliente devolveu", () => {
    const dela = "2026-08-17T11:10:00.000Z";
    expect(rodadaDeSync(dela, agora)).toBe(dela);
  });

  it("carimbo do futuro abre rodada nova (senão pularia todas as contas)", () => {
    const futuro = new Date(agora + 20 * 60_000).toISOString();
    expect(rodadaDeSync(futuro, agora)).toBe(new Date(agora).toISOString());
  });

  it("rodada velha demais recomeça (aba parada a manhã inteira)", () => {
    const velho = new Date(agora - 3 * 3600_000).toISOString();
    expect(rodadaDeSync(velho, agora)).toBe(new Date(agora).toISOString());
  });

  it("lixo na query não derruba o sync", () => {
    expect(rodadaDeSync("../../etc/passwd", agora)).toBe(new Date(agora).toISOString());
  });
});
