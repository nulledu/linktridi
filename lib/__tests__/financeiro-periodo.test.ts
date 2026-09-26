import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agruparPorEmpresa, andarMes, chaveDoMes, cobraNoMes, ehMes, janelaDoMes, mesRelativo, noMes, opcoesDePeriodo, rotuloDoMes,
} from "@/lib/financeiro/periodo";

const HOJE = "2026-09-09";

describe("Período por mês", () => {
  it("chave e janela do mês", () => {
    expect(chaveDoMes(HOJE)).toBe("m:2026-09");
    expect(janelaDoMes("m:2026-09")).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(janelaDoMes("m:2026-02")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
    expect(janelaDoMes("7")).toBeNull();
    expect(janelaDoMes("m:2026-13")).toBeNull();
  });

  it("mês relativo atravessa a virada do ano", () => {
    expect(mesRelativo("2026-12-15", 1)).toBe("m:2027-01");
    expect(mesRelativo("2026-01-15", -1)).toBe("m:2025-12");
    expect(mesRelativo("2026-01-31", 1)).toBe("m:2026-02");   // não escorrega pra março
  });

  it("noMes: só o que cai no mês; período que não é mês deixa tudo passar", () => {
    expect(noMes("m:2026-09", "2026-09-30")).toBe(true);
    expect(noMes("m:2026-09", "2026-10-01")).toBe(false);
    expect(noMes("m:2026-09", null)).toBe(false);
    expect(noMes("", "2020-01-01")).toBe(true);
    expect(noMes("vencidos", "2020-01-01")).toBe(true);
  });

  it("rótulo como a pessoa fala", () => {
    expect(rotuloDoMes("m:2026-09", HOJE)).toBe("Este mês");
    expect(rotuloDoMes("m:2026-10", HOJE)).toBe("Mês que vem");
    expect(rotuloDoMes("m:2026-08", HOJE)).toBe("Mês passado");
    expect(rotuloDoMes("m:2026-12", HOJE)).toBe("Dezembro");
    expect(rotuloDoMes("m:2027-03", HOJE)).toBe("Março de 2027");
  });

  it("as setas andam de mês em mês, e partem de hoje quando o período é atalho", () => {
    expect(andarMes("m:2026-09", HOJE, 1)).toBe("m:2026-10");
    expect(andarMes("m:2026-01", HOJE, -1)).toBe("m:2025-12");
    expect(andarMes("7", HOJE, 1)).toBe("m:2026-10");
    expect(andarMes("", HOJE, -1)).toBe("m:2026-08");
  });

  it("o seletor sempre contém o mês em que a pessoa está", () => {
    const base = opcoesDePeriodo(HOJE, "m:2026-09", [{ valor: "7", label: "Próximos 7 dias" }]);
    expect(base.map((o) => o.valor)).toEqual(["m:2026-08", "m:2026-09", "m:2026-10", "7"]);
    const longe = opcoesDePeriodo(HOJE, "m:2027-02");
    expect(longe.map((o) => o.valor)).toEqual(["m:2026-08", "m:2026-09", "m:2026-10", "m:2027-02"]);
    expect(longe.at(-1)?.label).toBe("Fevereiro de 2027");
    expect(ehMes("m:2026-09")).toBe(true);
    expect(ehMes("mes")).toBe(false);
  });
});

describe("Recorrência cobra no mês?", () => {
  const mensal = { inicio: "2026-01-10", periodicidade: "mensal" };
  const trimestral = { inicio: "2026-01-10", periodicidade: "trimestral" };
  const anual = { inicio: "2025-12-05", periodicidade: "anual" };
  const cada5 = { inicio: "2026-02-01", periodicidade: "customizada", intervalo_meses: 5 };
  it("cadência, não o onde-o-gerador-parou", () => {
    expect(cobraNoMes(mensal, "m:2026-09")).toBe(true);
    expect(cobraNoMes(trimestral, "m:2026-04")).toBe(true);
    expect(cobraNoMes(trimestral, "m:2026-05")).toBe(false);
    expect(cobraNoMes(trimestral, "m:2026-10")).toBe(true);
    expect(cobraNoMes(anual, "m:2026-12")).toBe(true);
    expect(cobraNoMes(anual, "m:2026-09")).toBe(false);
    expect(cobraNoMes(cada5, "m:2026-07")).toBe(true);
    expect(cobraNoMes(cada5, "m:2026-08")).toBe(false);
  });
  it("antes do início e depois do fim não cobra; sem mês, tudo passa", () => {
    expect(cobraNoMes(mensal, "m:2025-12")).toBe(false);
    expect(cobraNoMes({ ...mensal, fim: "2026-06-30" }, "m:2026-07")).toBe(false);
    expect(cobraNoMes({ ...mensal, fim: "2026-06-30" }, "m:2026-06")).toBe(true);
    expect(cobraNoMes(anual, "")).toBe(true);
  });
});

describe("Blocos por empresa", () => {
  const empresas = [{ id: "tridi", nome: "Tridi" }, { id: "gedux", nome: "Gedux" }];
  it("um bloco por empresa, na ordem das empresas, sem bloco vazio", () => {
    const blocos = agruparPorEmpresa([
      { id: "a", empresa_id: "gedux" }, { id: "b", empresa_id: "tridi" }, { id: "c", empresa_id: "gedux" },
    ], empresas);
    expect(blocos.map((b) => [b.empresa.nome, b.itens.map((i) => i.id)])).toEqual([
      ["Tridi", ["b"]], ["Gedux", ["a", "c"]],
    ]);
  });
  it("item de empresa desconhecida não some", () => {
    const blocos = agruparPorEmpresa([{ id: "x", empresa_id: "zzz" }], empresas);
    expect(blocos).toHaveLength(1);
    expect(blocos[0].empresa.nome).toBe("Outra empresa");
  });
});

/**
 * As telas com período nascem no mês de hoje e usam o MESMO filtro. Um
 * `useState("")` de volta aqui é a tela abrindo em "Todas" de novo.
 */
describe("As telas do Financeiro abrem no mês de hoje", () => {
  const telas = [
    "app/(plataforma)/financeiro/compromissos/CompromissosClient.tsx",
    "app/(plataforma)/financeiro/compras/ComprasClient.tsx",
    "app/(plataforma)/financeiro/notas/NotasClient.tsx",
    "app/(plataforma)/financeiro/cadastros/contas/ContasClient.tsx",
    "app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx",
  ];
  for (const tela of telas) {
    it(tela, () => {
      const src = readFileSync(join(process.cwd(), tela), "utf8");
      expect(src).toMatch(/useState\(\(\) => mesRelativo\(hoje, 0\)\)/);
      expect(src).toContain("<FiltroPeriodo");
      expect(src).not.toMatch(/\[periodo, setPeriodo\] = useState\(""\)/);
    });
  }
  it("em Visão geral, bancos e recorrências saem em blocos por empresa", () => {
    // A tela de Bancos delega o desenho ao PorBanco; é lá que o agrupamento mora.
    for (const arquivo of [
      "app/(plataforma)/financeiro/cadastros/contas/PorBanco.tsx",
      "app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx",
    ]) {
      expect(readFileSync(join(process.cwd(), arquivo), "utf8")).toContain("agruparPorEmpresa(");
    }
    expect(readFileSync(join(process.cwd(), telas[3]), "utf8")).toContain("<PorBanco");
  });
  it("a Visão Geral só lista compromisso e recorrência do mês vigente", () => {
    const src = readFileSync(join(process.cwd(), "app/(plataforma)/financeiro/page.tsx"), "utf8");
    expect(src).toMatch(/noMes\(mesVigente, c\.vencimento\)/);
    expect(src).toMatch(/cobraNoMes\(r, mesVigente\)/);
  });
  it("as previsões da agenda obedecem ao período, não à janela do servidor", () => {
    const src = readFileSync(join(process.cwd(), telas[0]), "utf8");
    expect(src).toMatch(/noMes\(periodo, c\.vencimento\)/);
  });
});
