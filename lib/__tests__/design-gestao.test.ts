import { describe, expect, it } from "vitest";
import { ciclo, envelhecendo, etapasDeGestao, fluxoDoPeriodo, gargalo, mediana, retrabalho } from "../design-gestao";
import { serieDiaria } from "../design-projetos";
import type { ProjetoDesign } from "../design-projetos";
import type { StatusDesign } from "../design-fluxo";

const agora = new Date("2026-09-22T15:00:00Z");
const p = (id: number, status: StatusDesign, horas: number, o: Partial<ProjetoDesign> = {}): ProjetoDesign => ({
  id, ref: `#${id}`, cliente: "C", produto: "P", tipos: [], itens: 1, thumb: null,
  arquivos: { arteCliente: 0, vetorizadas: 0, reprovadas: 0, logo: false, drive: null },
  etapaId: 1, status, coluna: null, prioridade: "baixa", urgente: false, emAtraso: false, parado: false,
  responsavelId: null, responsavel: null, foto: null, desde: new Date(agora.getTime() - horas * 3_600_000).toISOString(),
  horasNaEtapa: horas, criadoEm: null, iniciadoEm: null, enviadaEm: null, naoAprovadoEm: null, aprovadoEm: null,
  atualizadoEm: null, reaprovado: false, ...o,
});

describe("WIP e gargalo", () => {
  const ps = [p(1, "criacao", 30), p(2, "criacao", 50), p(3, "nova", 5), p(4, "revisao", 400)];
  it("conta fila, idade e o que estourou o limite da etapa", () => {
    const e = etapasDeGestao(ps);
    expect(e.find((x) => x.status === "criacao")).toMatchObject({ wip: 2, idadeMediaH: 40, maisVelhaH: 50, estouradas: 2, doSetor: true });
    expect(e.find((x) => x.status === "revisao")).toMatchObject({ wip: 1, estouradas: 0, doSetor: false });
  });
  it("o gargalo ignora quem depende do cliente, por mais cheia que a etapa esteja", () => {
    expect(gargalo(etapasDeGestao(ps))?.status).toBe("criacao");
    expect(gargalo(etapasDeGestao([p(9, "revisao", 900)]))).toBeNull();
  });
});

describe("entrou × saiu", () => {
  it("saldo e dias de fila no ritmo de saída", () => {
    const e = Array.from({ length: 7 }, () => ({ valor: 10 }));
    const s = Array.from({ length: 7 }, () => ({ valor: 7 }));
    expect(fluxoDoPeriodo(e, s, 21, 7)).toEqual({ entrou: 70, saiu: 49, saldo: 21, diasDeFila: 3 });
    expect(fluxoDoPeriodo(e, Array.from({ length: 7 }, () => ({ valor: 0 })), 5, 7).diasDeFila).toBeNull();
  });
  it("a série diária cobre todos os dias, inclusive os sem nada", () => {
    const s = serieDiaria(["2026-09-22T13:00:00Z", "2026-09-22T14:00:00Z"], agora, 3);
    expect(s.map((x) => x.valor)).toEqual([0, 0, 2]);
  });
});

describe("ciclo e retrabalho", () => {
  it("mediana, não média: um esquecido não estica o número do setor", () => {
    expect(mediana([1, 2, 3, 100])).toBe(2.5);
    const ps = [
      p(1, "revisao", 1, { criadoEm: "2026-09-22T09:00:00Z", enviadaEm: "2026-09-22T12:00:00Z" }),
      p(2, "revisao", 1, { criadoEm: "2026-09-21T09:00:00Z", enviadaEm: "2026-09-21T14:00:00Z" }),
      p(3, "aprovado", 1, { criadoEm: "2026-06-01T09:00:00Z", enviadaEm: "2026-09-20T09:00:00Z", aprovadoEm: "2026-09-20T15:00:00Z" }),
    ];
    const c = ciclo(ps, agora);
    // 3h e 5h → mediana 4. O de junho (2.600h) fica FORA: pedido antigo que
    // só agora ganhou arte não é o tempo de ciclo do setor.
    expect(c.ateArteH).toBe(4);
    expect(c.ateAprovacaoH).toBe(6);
    expect(c.base).toBe(3);
  });
  it("retrabalho conta devolução do cliente e reincidência", () => {
    const ps = [
      p(1, "ajustes", 2, { naoAprovadoEm: "2026-09-21T10:00:00Z", reaprovado: true }),
      p(2, "aprovado", 2, { aprovadoEm: "2026-09-21T10:00:00Z" }),
      p(3, "aprovado", 2, { aprovadoEm: "2026-09-20T10:00:00Z" }),
    ];
    expect(retrabalho(ps, agora)).toEqual({ devolvidas: 1, aprovadas: 2, taxaPrimeira: 67, reincidentes: 1 });
  });
});

describe("envelhecendo", () => {
  it("só a fila do setor, do mais velho pro mais novo", () => {
    const ps = [p(1, "criacao", 10), p(2, "revisao", 900), p(3, "nova", 80)];
    expect(envelhecendo(ps).map((x) => x.id)).toEqual([3, 1]);
  });
});
