import { describe, expect, it } from "vitest";
import { resolvePeriod } from "@/lib/period";

/**
 * `?from&to` SEM `period=custom` não pode virar "o mês atual" em silêncio.
 *
 * Duas vezes esse buraco virou tela errada sem nenhum erro no caminho:
 * - o widget da TV mandava `de/ate` em vez de `period` e o card ignorava o
 *   seletor — a rota devolvia o mês inteiro e ninguém percebia;
 * - o comparativo "vs período anterior" do Cockpit buscava
 *   `/api/trafego/vendas?from=…&to=…` e recebia O MÊS ATUAL como baseline:
 *   com "Este mês" selecionado os deltas davam ~0%, com "Hoje" davam
 *   percentuais absurdos (um dia comparado contra o mês inteiro).
 *
 * A regra agora: from/to VÁLIDOS sem uma chave fixa conhecida = custom.
 * Chave fixa explícita ("hoje", "mes"…) continua mandando — from/to perdido
 * na querystring não a derruba.
 */

const AGORA = new Date("2026-08-28T15:00:00Z");

describe("resolvePeriod — from/to sem chave é custom, não o mês", () => {
  it("key ausente + from/to válidos resolve o intervalo pedido", () => {
    const r = resolvePeriod(null, "2026-07-01", "2026-07-07", AGORA);
    expect(r.key).toBe("custom");
    expect(r.fromDate).toBe("2026-07-01");
    expect(r.toDate).toBe("2026-07-07");
    expect(r.days.length).toBe(7);
  });

  it("key vazia ('') + from/to válidos também resolve o intervalo", () => {
    const r = resolvePeriod("", "2026-07-10", "2026-07-12", AGORA);
    expect(r.fromDate).toBe("2026-07-10");
    expect(r.toDate).toBe("2026-07-12");
  });

  it("key desconhecida + from/to válidos resolve o intervalo", () => {
    const r = resolvePeriod("qualquer-coisa", "2026-06-01", "2026-06-30", AGORA);
    expect(r.fromDate).toBe("2026-06-01");
    expect(r.toDate).toBe("2026-06-30");
  });

  it("from/to invertidos sem chave são normalizados como no custom", () => {
    const r = resolvePeriod(null, "2026-07-07", "2026-07-01", AGORA);
    expect(r.fromDate).toBe("2026-07-01");
    expect(r.toDate).toBe("2026-07-07");
  });

  it("chave fixa explícita continua mandando mesmo com from/to na querystring", () => {
    const hoje = resolvePeriod("hoje", "2026-01-01", "2026-01-31", AGORA);
    expect(hoje.key).toBe("hoje");
    expect(hoje.fromDate).toBe("2026-08-28");
    const mes = resolvePeriod("mes", "2026-01-01", "2026-01-31", AGORA);
    expect(mes.key).toBe("mes");
    expect(mes.fromDate).toBe("2026-08-01");
  });

  it("sem chave e sem from/to válidos, o fallback segue sendo o mês", () => {
    const r = resolvePeriod(null, null, null, AGORA);
    expect(r.key).toBe("mes");
    expect(r.fromDate).toBe("2026-08-01");
    expect(r.toDate).toBe("2026-08-28");
    const quebrado = resolvePeriod(null, "01/07/2026", "07/07/2026", AGORA);
    expect(quebrado.key).toBe("mes");
  });
});
