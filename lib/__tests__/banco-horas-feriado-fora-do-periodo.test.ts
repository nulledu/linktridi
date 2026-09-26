import { describe, it, expect } from "vitest";
import { calcBanco, mesclarFeriados } from "../banco-horas";
import type { PontoRegistro } from "../ponto";
import type { TipoFeriado } from "../jornada-calendario";

// ── O feriado do mês PASSADO estragava o extra do mês aberto ────────────────
// A tela pergunta os feriados do período aberto ("agosto"), mas o ledger é
// recalculado desde o início do banco (15/07). Sem o feriado de julho no mapa,
// aquele dia virava dia útil; como ninguém bateu ponto num feriado, o dia caía
// como FALTA e a dívida fantasma de uma jornada inteira comia o crédito —
// derrubando as horas extras de todos os meses seguintes.

const HOJE = "2026-08-20";
const SETE_JULHO = "2026-07-16";   // quinta feriada, dentro do banco (começa 15/07)
const AGOSTO = "2026-08";

const PESSOA = {
  id: "p1", nome: "Ana", fotoUrl: null,
  jornadaMin: 480, entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null as number | null,
};

let seq = 0;
const bat = (dia: string, hhmm: string): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  return {
    id: `r${++seq}`, pessoaId: "p1", tipo: "entrada",
    batidoEm: new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString(),
    selfieUrl: null, confianca: null, origem: "tablet",
  };
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** 8h cravadas + `extra` min no fim. */
const diaCom = (dia: string, extraMin = 0) =>
  [bat(dia, "08:00"), bat(dia, "12:00"), bat(dia, "13:00"), bat(dia, hhmm(17 * 60 + extraMin))];

// Todo dia útil do intervalo trabalhado certinho, menos o feriado (ninguém
// bate ponto em feriado) — e 1h extra numa segunda de agosto.
const registros = (): PontoRegistro[] => {
  const out: PontoRegistro[] = [];
  for (let d = new Date(Date.UTC(2026, 6, 15)); d <= new Date(Date.UTC(2026, 7, 20)); d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || dia === SETE_JULHO) continue;
    out.push(...diaCom(dia, dia === "2026-08-10" ? 60 : 0));
  }
  return out;
};

const SO_AGOSTO = new Map<string, TipoFeriado>();                       // a tela leu só agosto: julho não veio
const TUDO = new Map<string, TipoFeriado>([[SETE_JULHO, "folga"]]);      // o ledger inteiro

const calc = (feriados: Map<string, TipoFeriado>) =>
  calcBanco(PESSOA, registros(), AGOSTO, HOJE, feriados, [], 480, [], "23:59", []);
const mesDe = (b: ReturnType<typeof calc>, m: string) => b.ledger.meses.find((x) => x.mes === m)!;

describe("feriado de mês anterior no ledger corrido", () => {
  it("com o mapa completo, a 1h extra de agosto é 1h extra de agosto", () => {
    const b = calc(TUDO);
    expect(mesDe(b, AGOSTO).geradoMin).toBe(60);
    expect(mesDe(b, AGOSTO).creditoMin).toBe(60);
    expect(b.ledger.creditoMin).toBe(60);
    expect(b.ledger.faltasNaoJustificadas).toHaveLength(0);
  });

  it("sem o feriado de julho, o dia vira FALTA e come a hora extra de agosto", () => {
    // É o defeito que o mesclarFeriados existe pra impedir. Fica documentado:
    // o mapa incompleto não "erra um pouco", ele apaga o extra do mês inteiro.
    const b = calc(SO_AGOSTO);
    expect(b.ledger.faltasNaoJustificadas.map((f) => f.dia)).toContain(SETE_JULHO);
    expect(mesDe(b, AGOSTO).creditoMin).toBe(0);   // a 1h foi embora
    expect(b.ledger.debitoMin).toBe(480 - 60);     // e ainda sobrou dívida
  });

  it("o mapa remendado devolve o resultado certo", () => {
    const remendado = mesclarFeriados(SO_AGOSTO, TUDO);
    const b = calcBanco(PESSOA, registros(), AGOSTO, HOJE, remendado, [], 480, [], "23:59", []);
    expect(mesDe(b, AGOSTO).creditoMin).toBe(60);
    expect(b.ledger.faltasNaoJustificadas).toHaveLength(0);
  });
});

describe("mesclarFeriados", () => {
  it("quem chamou tem prioridade; o outro só preenche o buraco", () => {
    const tela = new Map<string, TipoFeriado>([["2026-08-15", "troca"]]);
    const ledger = new Map<string, TipoFeriado>([["2026-08-15", "folga"], ["2026-07-16", "folga"]]);
    const m = mesclarFeriados(tela, ledger);
    expect(m.get?.("2026-08-15")).toBe("troca");   // a leitura fresca manda
    expect(m.has("2026-07-16")).toBe(true);        // e o antigo aparece
    expect(m.get?.("2026-07-16")).toBe("folga");
    expect(m.has("2026-08-01")).toBe(false);
  });

  it("aceita Set (mapa sem tipo) dos dois lados", () => {
    const m = mesclarFeriados(new Set(["2026-08-15"]), new Set(["2026-07-16"]));
    expect(m.has("2026-08-15")).toBe(true);
    expect(m.has("2026-07-16")).toBe(true);
  });
});
