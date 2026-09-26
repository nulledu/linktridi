import { describe, it, expect } from "vitest";
import { aceitePorPessoa, esperandoAceite, minutosParaAceitar, seloDe, textoEspera, type AtividadeAceite } from "@/lib/atividades-aceite";

// 13h em SP = 16h UTC
const T = (hhmm: string, dia = "2026-09-24") => `${dia}T${hhmm}:00.000Z`;
const at = (o: Partial<AtividadeAceite>): AtividadeAceite => ({
  id: Math.random().toString(36), para_id: "ana", para_nome: "Ana", pool: false, status: "em_andamento",
  created_at: T("16:00"), claimed_at: null, aceita_at: T("16:03"), ...o,
});

describe("minutosParaAceitar", () => {
  it("dirigida conta de created_at até aceita_at", () => {
    expect(minutosParaAceitar(at({}))).toEqual({ ok: true, min: 3 });
  });
  it("pool conta a partir de quem pegou, não da fila", () => {
    expect(minutosParaAceitar(at({ pool: true, created_at: T("12:00"), claimed_at: T("16:00"), aceita_at: T("16:01") })))
      .toEqual({ ok: true, min: 1 });
  });
  it("pegar pelo site (claim = aceite) não vira zero", () => {
    expect(minutosParaAceitar(at({ pool: true, claimed_at: T("16:00"), aceita_at: T("16:00") })))
      .toEqual({ ok: false, motivo: "pelo_site" });
  });
  it("ordem que atravessou a noite fica fora", () => {
    expect(minutosParaAceitar(at({ created_at: T("20:50", "2026-09-23"), aceita_at: T("11:00") })))
      .toEqual({ ok: false, motivo: "virou_o_dia" });
  });
  it("sem aceite e relógio invertido", () => {
    expect(minutosParaAceitar(at({ aceita_at: null })).ok).toBe(false);
    expect(minutosParaAceitar(at({ aceita_at: T("15:00") }))).toEqual({ ok: false, motivo: "relogio_invertido" });
  });
});

describe("aceitePorPessoa", () => {
  it("mediana por pessoa, ranking pelo mais rápido e poucos dados por último", () => {
    const lista = [
      at({ aceita_at: T("16:01") }), at({ aceita_at: T("16:02") }), at({ aceita_at: T("16:30") }), // Ana: 1,2,30 → 2
      ...[4, 5, 6].map((m) => at({ para_id: "bia", para_nome: "Bia", aceita_at: T(`16:0${m}`) })),   // Bia: 5
      at({ para_id: "caio", para_nome: "Caio", aceita_at: T("16:00") }),                              // 1 aceite só
    ];
    const r = aceitePorPessoa(lista, 0);
    expect(r.pessoas.map((p) => p.id)).toEqual(["ana", "bia", "caio"]);
    expect(r.pessoas[0]).toMatchObject({ medianaMin: 2, selo: "relampago", aceites: 3 });
    expect(r.pessoas[1].selo).toBe("agil");
    expect(r.pessoas[2].poucosDados).toBe(true);
    expect(r.aceites).toBe(7);
  });
  it("recorta pelo instante do aceite", () => {
    const r = aceitePorPessoa([at({})], Date.parse(T("17:00")));
    expect(r.aceites).toBe(0);
    expect(r.medianaMin).toBeNull();
  });
});

describe("esperandoAceite e textos", () => {
  it("só dirigidas pendentes sem aceite, a mais antiga primeiro", () => {
    const lista = [
      at({ id: "a", status: "pendente", aceita_at: null, created_at: T("16:00") }),
      at({ id: "b", status: "pendente", aceita_at: null, created_at: T("15:00") }),
      at({ id: "c", status: "pendente", aceita_at: null, pool: true }),
    ];
    expect(esperandoAceite(lista, Date.parse(T("16:10"))).map((x) => [x.id, x.esperandoMin])).toEqual([["b", 70], ["a", 10]]);
  });
  it("selos e texto", () => {
    expect([1, 4, 10, 40].map(seloDe)).toEqual(["relampago", "agil", "no_ritmo", "demorado"]);
    expect(textoEspera(0.5)).toBe("30 s");
    expect(textoEspera(65)).toBe("1 h 05");
    expect(textoEspera(119.7)).toBe("2 h 00");
    expect(textoEspera(3 * 1440 + 30)).toBe("3 d");
  });
});
