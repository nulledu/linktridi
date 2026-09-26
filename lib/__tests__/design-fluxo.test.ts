import { describe, expect, it } from "vitest";
import { colunaDoProjeto, eventosDe, prioridadeDe, statusDoPedido, tempoCurto } from "../design-fluxo";

describe("etapa do ERP → status do Design", () => {
  it("Sem Arte só vira criação quando alguém pegou", () => {
    expect(statusDoPedido(1, false)).toBe("nova");
    expect(statusDoPedido(1, true)).toBe("criacao");
  });
  it("cada etapa cai no seu passo do fluxo", () => {
    expect([2, 3, 6, 5, 4, 7, 16, 9].map((e) => statusDoPedido(e, false)))
      .toEqual(["criacao", "criacao", "aguardando", "revisao", "ajustes", "aprovado", "finalizado", "finalizado"]);
  });
});

describe("coluna do controle", () => {
  it("urgente passa na frente, mas aprovado não volta pra urgentes", () => {
    expect(colunaDoProjeto({ status: "criacao", urgente: true, emAtraso: false })).toBe("urgentes");
    expect(colunaDoProjeto({ status: "aprovado", urgente: true, emAtraso: false })).toBe("finalizados");
    expect(colunaDoProjeto({ status: "ajustes", urgente: false, emAtraso: false })).toBe("revisao");
    expect(colunaDoProjeto({ status: "revisao", urgente: false, emAtraso: false })).toBe("aprovacao");
    expect(colunaDoProjeto({ status: "nova", urgente: false, emAtraso: false })).toBe("retorno");
  });
});

describe("prioridade sem prazo inventado", () => {
  const agora = new Date("2026-09-22T15:00:00Z");
  it("urgente/atraso = alta; parado além do limite = média", () => {
    expect(prioridadeDe({ urgente: false, emAtraso: true, status: "criacao", desde: null }, agora)).toBe("alta");
    expect(prioridadeDe({ urgente: false, emAtraso: false, status: "criacao", desde: "2026-09-20T15:00:00Z" }, agora)).toBe("media");
    // Esperando o cliente não é parado do Design, por mais velho que seja.
    expect(prioridadeDe({ urgente: false, emAtraso: false, status: "revisao", desde: "2026-09-01T15:00:00Z" }, agora)).toBe("baixa");
  });
  it("tempo curto", () => {
    expect([0.2, 5, 30, 50].map(tempoCurto)).toEqual(["12 min", "5h", "1 dia", "2 dias"]);
  });
});

describe("linha do tempo", () => {
  it("só o que aconteceu depois do corte, do mais novo pro mais velho", () => {
    const ev = eventosDe([{
      id: 1, ref: "#1", criadoEm: "2026-09-20T10:00:00Z", iniciadoEm: "2026-09-22T09:00:00Z", enviadaEm: "2026-09-22T11:00:00Z",
      naoAprovadoEm: null, aprovadoEm: "2026-09-22T13:00:00Z", responsavel: "Ana",
    }], new Date("2026-09-21T00:00:00Z"));
    expect(ev.map((e) => e.tipo)).toEqual(["aprovado", "enviada", "iniciado"]);
  });
});
