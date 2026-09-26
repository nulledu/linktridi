import { describe, it, expect } from "vitest";
import { itemDaLinha, somarAmostras, visaoPublica, type StatusCompleto } from "../status-servidor";
import { calcularCustos, segundosPorDia } from "../status-custo";
import { agrupar } from "../status-plataformas";
import { fmtDuracao, nomeDoIncidente, resumoDaSemana } from "../status-relatorio";

describe("relatório da semana", () => {
  const inc = (id: number, key: string, nome: string, min: number, fim = true) => ({
    id, key, nome, tipo: null, motivo: null,
    inicio: "2026-09-10T12:00:00Z", fim: fim ? new Date(Date.parse("2026-09-10T12:00:00Z") + min * 60000).toISOString() : null,
    duracao_s: fim ? min * 60 : null,
  });

  it("semana limpa diz que ficou tudo no ar", () => {
    expect(resumoDaSemana([]).titulo).toBe("Status da semana: nenhuma queda");
  });

  it("soma o tempo fora, aponta o mais afetado e o custo estimado", () => {
    const r = resumoDaSemana([inc(1, "funis_chancela", "chancela", 30), inc(2, "funis_chancela", "chancela", 12), inc(3, "terceiros_yampi", "Yampi", 14)], { 1: 60, 2: 26 });
    expect(r.titulo).toBe("Status da semana: 3 quedas, 56 min fora");
    expect(r.pior).toEqual({ nome: "/f/chancela", quedas: 2, segundos: 42 * 60 });
    expect(r.corpo).toContain("~R$");
    expect(r.custo).toBe(86);
  });

  it("nome na linha do tempo: terceiro pelo nome dele, funil com /f/", () => {
    expect(nomeDoIncidente({ key: "terceiros_yampi", nome: "Yampi" })).toBe("Yampi");
    expect(nomeDoIncidente({ key: "funis_chancela", nome: "chancela" })).toBe("/f/chancela");
    expect(nomeDoIncidente({ key: "tridi_typebot-(chat-dos-funis)", nome: "Typebot (chat dos funis)" })).toBe("Chat dos funis (Typebot)");
    expect(fmtDuracao(84 * 60)).toBe("1 h 24 min");
  });
});

// ── Status no servidor: o que o público vê e quanto uma queda custou ────────
// Travas do que já deu errado ou daria: a visão pública vazando nome de funil
// (a página é aberta — nome interno de funil e de infraestrutura é mapa pra
// quem procura brecha), a trilha perdendo o último estado, e o custo contando
// o dia inteiro de gasto por uma queda de minutos.

const linha = (key: string, nome: string, grupo: string, estado: "ok" | "caiu", motivo: string | null = null) => ({
  key, nome, grupo, estado, tipo: null, motivo, ms: 300, verificado_em: "2026-09-15T12:00:00Z", trilha: [1, 1, estado === "ok" ? 1 : 0],
});

describe("itemDaLinha", () => {
  it("o último resultado carrega estado, motivo e hora", () => {
    const i = itemDaLinha(linha("funis_chancela", "chancela", "Funis", "caiu", "Página não encontrada (404)"));
    const ult = i.results![i.results!.length - 1];
    expect(ult.success).toBe(false);
    expect(ult.errors).toEqual(["Página não encontrada (404)"]);
    expect(ult.timestamp).toBe("2026-09-15T12:00:00Z");
    expect(i.results).toHaveLength(3);
    // o agrupar continua pondo o funil caído no gedux
    expect(agrupar([i])[0].caidos[0].motivo).toBe("Página não encontrada (404)");
  });
});

describe("visão pública", () => {
  it("só plataforma e estado — nenhum nome de funil, motivo ou infraestrutura fina", () => {
    const s: StatusCompleto = {
      itens: [
        itemDaLinha(linha("funis_carimbodouglasnovo", "carimbodouglasnovo", "Funis", "caiu", "404")),
        itemDaLinha(linha("tridi_typebot-(chat-dos-funis)", "Typebot (chat dos funis)", "Tridi", "ok")),
        itemDaLinha(linha("terceiros_supabase", "Supabase", "Terceiros", "ok")),
      ],
      flags: null, incidentes: [], amostras: {}, atualizado: "2026-09-15T12:00:00Z",
    };
    const pub = visaoPublica(s);
    const texto = JSON.stringify(pub);
    expect(pub.plataformas.find((p) => p.id === "gedux")!.estado).toBe("caiu");
    expect(texto).not.toMatch(/carimbodouglasnovo|Typebot|funis_|404/);
  });
});

describe("amostras de 7 e 30 dias", () => {
  it("separa a semana do mês pelo dia de São Paulo", () => {
    const a = somarAmostras([
      { key: "x", dia: "2026-09-15", ok: 10, falha: 2 },
      { key: "x", dia: "2026-09-09", ok: 5, falha: 0 },
      { key: "x", dia: "2026-09-01", ok: 7, falha: 1 },
    ], "2026-09-15");
    expect(a.x).toEqual({ ok7: 15, falha7: 2, ok30: 22, falha30: 3 });
  });
});

describe("custo estimado da queda", () => {
  it("reparte a queda pelos dias de São Paulo", () => {
    // 23:30 → 00:30 (horário de SP) = 30 min em cada dia
    const m = segundosPorDia("2026-09-15T02:30:00Z", "2026-09-15T03:30:00Z");
    expect(Object.fromEntries(m)).toEqual({ "2026-09-14": 1800, "2026-09-15": 1800 });
  });

  it("cobra só a fração do dia em que o funil estava fora, somando os anúncios dele", () => {
    const inc = [{ id: 1, key: "funis_chancela", nome: "chancela", tipo: "nao_encontrado", motivo: null,
      inicio: "2026-09-15T13:00:00Z", fim: "2026-09-15T15:00:00Z", duracao_s: 7200 }];
    const ads = new Map([["chancela", new Set(["111111", "222222"])]]);
    const gasto = new Map([["111111", new Map([["2026-09-15", 240]])], ["222222", new Map([["2026-09-15", 120]])]]);
    // (240 + 120) × 2h/24h = 30
    expect(calcularCustos(inc, ads, gasto)).toEqual({ 1: 30 });
    // incidente que não é funil não ganha custo
    expect(calcularCustos([{ ...inc[0], key: "terceiros_supabase" }], ads, gasto)).toEqual({});
  });
});
