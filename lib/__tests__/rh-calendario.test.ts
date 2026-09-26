/**
 * RH → Calendário: a parte PURA.
 *
 * O que fica travado aqui é o que já saiu errado em calendário de empresa:
 * Páscoa e os móveis que dependem dela, o 29/02 que some três anos a cada
 * quatro, o aniversário de quem foi desligado, a precedência das camadas de
 * feriado (o manual corrige a fonte, a fonte corrige o piso) e a grade que
 * cortava o dia 31.
 */
import { describe, it, expect } from "vitest";
import {
  diaDaSemana, gradeDoMes, mesmaDataNoAno, nesimoDiaDaSemana, pascoa, somarDias, utcDe, rotuloDistancia,
} from "../rh/calendario/datas";
import { comemorativasBase, feriadosBase } from "../rh/calendario/feriados-base";
import { esferaInferida, fundirFeriados } from "../rh/calendario/fundir-feriados";
import { filtrar, montarAno, ocorrenciaNoAno, proximos } from "../rh/calendario/montar";
import { validarEvento } from "../rh/calendario/validar";
import { LEGENDA, TIPOS_ACONTECIMENTO, resumirContagem } from "../rh/calendario/tipos";
import { ICONS } from "../../app/(plataforma)/Icon";
import type { ColaboradorRh } from "../rh/tipos";
import type { EventoRh, FeriadoRh } from "../rh/calendario/tipos";

const pessoa = (id: string, extra: Partial<ColaboradorRh> = {}): ColaboradorRh => ({
  id, nome: `Pessoa ${id}`, username: id, ativo: true, pendente: false, foto: null,
  cargo: null, setor: "Produção", departamento: null, telefone: null, admissao: null, situacao: "ativo", ...extra,
});

describe("datas — aritmética sem fuso", () => {
  it("dia inválido não vira outro dia", () => {
    expect(Number.isNaN(utcDe("2026-02-31"))).toBe(true);
    expect(Number.isNaN(utcDe("2026-13-01"))).toBe(true);
    expect(Number.isFinite(utcDe("2024-02-29"))).toBe(true);
  });

  it("Páscoa: anos conhecidos", () => {
    expect(pascoa(2024)).toBe("2024-03-31");
    expect(pascoa(2025)).toBe("2025-04-20");
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
  });

  it("2º domingo de maio e de agosto (Dia das Mães / dos Pais)", () => {
    expect(nesimoDiaDaSemana(2026, 5, 0, 2)).toBe("2026-05-10");
    expect(nesimoDiaDaSemana(2026, 8, 0, 2)).toBe("2026-08-09");
    expect(diaDaSemana("2026-05-10")).toBe(0);
  });

  it("29/02 cai em 28/02 em ano comum, e volta a 29 em bissexto", () => {
    expect(mesmaDataNoAno("2000-02-29", 2026)).toBe("2026-02-28");
    expect(mesmaDataNoAno("2000-02-29", 2028)).toBe("2028-02-29");
    expect(mesmaDataNoAno("1995-09-18", 2026)).toBe("2026-09-18");
  });

  it("a grade começa no domingo, termina no sábado e nunca corta o 31", () => {
    // Maio/2026 começa numa sexta e tem 31 dias: são 6 semanas.
    const g = gradeDoMes(2026, 5);
    expect(g.length % 7).toBe(0);
    expect(diaDaSemana(g[0].dia)).toBe(0);
    expect(diaDaSemana(g.at(-1)!.dia)).toBe(6);
    expect(g.filter((c) => c.doMes).length).toBe(31);
    expect(g.some((c) => c.dia === "2026-05-31" && c.doMes)).toBe(true);
    // Fevereiro/2026 começa num domingo e tem 28 dias: 4 semanas exatas.
    expect(gradeDoMes(2026, 2).length).toBe(28);
  });

  it("rótulo de distância", () => {
    expect(rotuloDistancia("2026-09-16", "2026-09-16")).toBe("hoje");
    expect(rotuloDistancia("2026-09-16", "2026-09-17")).toBe("amanhã");
    expect(rotuloDistancia("2026-09-16", "2026-09-28")).toBe("em 12 dias");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("feriados — o piso calculado", () => {
  const f = feriadosBase(2026);
  const dia = (nome: string) => f.filter((x) => x.nome === nome).map((x) => x.dia);

  it("móveis a partir da Páscoa de 2026 (05/04)", () => {
    expect(dia("Carnaval")).toEqual(["2026-02-16", "2026-02-17"]);
    expect(dia("Sexta-feira Santa")).toEqual(["2026-04-03"]);
    expect(dia("Corpus Christi")).toEqual(["2026-06-04"]);
  });

  it("Brasil → SP → Cerqueira César", () => {
    expect(f.find((x) => x.esfera === "estadual")).toMatchObject({ dia: "2026-07-09" });
    expect(f.find((x) => x.esfera === "municipal")).toMatchObject({ dia: "2026-10-10", nome: "Aniversário de Cerqueira César" });
    expect(dia("Dia da Consciência Negra")).toEqual(["2026-11-20"]);
  });

  it("Consciência Negra só é nacional a partir de 2024", () => {
    expect(feriadosBase(2023).some((x) => x.nome === "Dia da Consciência Negra")).toBe(false);
  });

  it("está ordenado e tudo é do ano pedido", () => {
    for (let i = 1; i < f.length; i++) expect(f[i].dia >= f[i - 1].dia).toBe(true);
    expect(f.every((x) => x.dia.startsWith("2026-"))).toBe(true);
  });

  it("comemorativas móveis", () => {
    const c = comemorativasBase(2026);
    expect(c.find((x) => x.nome === "Dia das Mães")?.dia).toBe("2026-05-10");
    expect(c.find((x) => x.nome === "Dia dos Pais")?.dia).toBe("2026-08-09");
    expect(c.find((x) => x.nome === "Dia das Crianças")?.dia).toBe("2026-10-12");
  });
});

describe("feriados — fusão das camadas", () => {
  it("manual > api > ponto > base, por dia e esfera", () => {
    const base = feriadosBase(2026);
    const api: FeriadoRh[] = [{ dia: "2026-01-01", nome: "Confraternização mundial", esfera: "nacional", origem: "api" }];
    const manual: FeriadoRh[] = [{ dia: "2026-01-01", nome: "Ano-Novo", esfera: "nacional", origem: "manual", id: "m1" }];
    const ponto: FeriadoRh[] = [{ dia: "2026-01-01", nome: "Feriado", esfera: "nacional", origem: "ponto" }];

    const soApi = fundirFeriados([base, api]).find((x) => x.dia === "2026-01-01")!;
    expect(soApi.origem).toBe("api");
    const comManual = fundirFeriados([base, ponto, api, manual]).find((x) => x.dia === "2026-01-01")!;
    expect(comManual).toMatchObject({ origem: "manual", nome: "Ano-Novo", id: "m1" });
    // A ordem das camadas não importa: quem decide é o peso.
    expect(fundirFeriados([manual, base]).find((x) => x.dia === "2026-01-01")!.origem).toBe("manual");
  });

  it("esferas diferentes no mesmo dia convivem", () => {
    const manual: FeriadoRh[] = [{ dia: "2026-09-07", nome: "Feriado local", esfera: "municipal", origem: "manual" }];
    const r = fundirFeriados([feriadosBase(2026), manual]).filter((x) => x.dia === "2026-09-07");
    expect(r.map((x) => x.esfera)).toEqual(["nacional", "municipal"]);
  });

  it("feriado do Ponto ganha esfera inferida", () => {
    expect(esferaInferida("2026-09-07", 2026)).toBe("nacional");
    expect(esferaInferida("2026-07-09", 2026)).toBe("estadual");
    expect(esferaInferida("2026-03-19", 2026)).toBe("municipal");
  });
});

describe("montar o ano", () => {
  const equipe = [
    pessoa("a"),
    pessoa("b", { situacao: "desligado" }),
    pessoa("c", { situacao: "ferias", setor: "Financeiro" }),
  ];
  const fichas = [
    { employee_id: "a", data_nascimento: "1995-09-18" },
    { employee_id: "b", data_nascimento: "1990-09-18" },
    { employee_id: "c", data_nascimento: "1992-02-29" },
  ];
  const eventos: EventoRh[] = [
    { id: "e1", tipo: "setor", categoria: null, nome: "Dia da Produção", descricao: null, observacoes: null, dia: "2025-09-25", hora: null, hora_fim: null, setor: "Produção", colaboradores: [], recorrencia: "anual", ativo: true, autor_nome: null, created_at: "" },
    { id: "e2", tipo: "evento", categoria: "treinamento", nome: "Treinamento de Segurança", descricao: "Obrigatório.", observacoes: null, dia: "2026-09-25", hora: "14:00", hora_fim: null, setor: "Produção", colaboradores: ["a", "b"], recorrencia: "nenhuma", ativo: true, autor_nome: null, created_at: "" },
    { id: "e3", tipo: "evento", categoria: "reuniao", nome: "Reunião antiga", descricao: null, observacoes: null, dia: "2025-03-01", hora: null, hora_fim: null, setor: null, colaboradores: [], recorrencia: "nenhuma", ativo: true, autor_nome: null, created_at: "" },
    { id: "e4", tipo: "setor", categoria: null, nome: "Data desligada", descricao: null, observacoes: null, dia: "2026-01-10", hora: null, hora_fim: null, setor: "Vendas", colaboradores: [], recorrencia: "anual", ativo: false, autor_nome: null, created_at: "" },
  ];
  const ano = montarAno({ ano: 2026, colaboradores: equipe, fichas, eventos, feriados: feriadosBase(2026) });

  it("aniversário vem da ficha; desligado não aparece; férias aparece", () => {
    const anivs = ano.filter((a) => a.tipo === "aniversario");
    expect(anivs.map((a) => a.pessoa!.id).sort()).toEqual(["a", "c"]);
    expect(anivs.find((a) => a.pessoa!.id === "a")).toMatchObject({ dia: "2026-09-18", sub: "Aniversário · Produção", origem: "ficha" });
    expect(anivs.find((a) => a.pessoa!.id === "c")!.dia).toBe("2026-02-28");
  });

  it("recorrência anual repete a partir do ano de origem; evento único só no ano dele", () => {
    expect(ocorrenciaNoAno(eventos[0], 2026)).toBe("2026-09-25");
    expect(ocorrenciaNoAno(eventos[0], 2024)).toBeNull();
    expect(ocorrenciaNoAno(eventos[2], 2026)).toBeNull();
    expect(ano.some((a) => a.id === "e3")).toBe(false);
    expect(ano.find((a) => a.id === "e1")).toMatchObject({ tipo: "setor", dia: "2026-09-25", sub: "Produção" });
  });

  it("envolvidos resolvem para a equipe; quem não existe some", () => {
    const t = ano.find((a) => a.id === "e2")!;
    expect(t.envolvidos.map((p) => p.id)).toEqual(["a", "b"]);
    expect(t.sub).toBe("Treinamento · Produção");
    expect(t.hora).toBe("14:00");
  });

  it("data de setor desativada some, salvo para quem gerencia", () => {
    expect(ano.some((a) => a.id === "e4")).toBe(false);
    const comInativos = montarAno({ ano: 2026, colaboradores: equipe, fichas, eventos, feriados: [] });
    expect(comInativos.some((a) => a.id === "e4")).toBe(false);
    const gerente = montarAno({ ano: 2026, colaboradores: equipe, fichas, eventos, feriados: [], verInativos: true });
    expect(gerente.find((a) => a.id === "e4")).toMatchObject({ inativo: true });
  });

  it("feriados e comemorativas do piso entram com o tipo certo", () => {
    expect(ano.find((a) => a.dia === "2026-07-09")).toMatchObject({ tipo: "feriado_estadual" });
    expect(ano.find((a) => a.dia === "2026-10-10" && a.tipo === "feriado_municipal")).toBeTruthy();
    expect(ano.find((a) => a.titulo === "Dia das Mães")).toMatchObject({ tipo: "comemorativa", dia: "2026-05-10" });
  });

  it("está ordenado por dia e depois por hora", () => {
    for (let i = 1; i < ano.length; i++) expect(ano[i].dia >= ano[i - 1].dia).toBe(true);
    const chaves = new Set(ano.map((a) => a.chave));
    expect(chaves.size).toBe(ano.length);
  });

  it("filtro por tipo, setor e pessoa", () => {
    expect(filtrar(ano, { tipos: ["aniversario"], setor: "", pessoa: "" }).every((a) => a.tipo === "aniversario")).toBe(true);
    expect(filtrar(ano, { tipos: [...TIPOS_ACONTECIMENTO], setor: "Financeiro", pessoa: "" }).map((a) => a.pessoa?.id)).toEqual(["c"]);
    // Pessoa "a" bate no aniversário dela E no treinamento em que está envolvida.
    const daA = filtrar(ano, { tipos: [...TIPOS_ACONTECIMENTO], setor: "", pessoa: "a" });
    expect(daA.map((a) => a.tipo).sort()).toEqual(["aniversario", "evento"]);
    expect(filtrar(ano, { tipos: [], setor: "", pessoa: "" })).toEqual([]);
  });

  it("próximos: de hoje em diante, sem inativos, limitado", () => {
    const p = proximos(ano, "2026-09-16", 3);
    expect(p.length).toBe(3);
    expect(p[0].dia >= "2026-09-16").toBe(true);
    expect(p.every((a) => !a.inativo)).toBe(true);
  });
});

describe("validação do formulário", () => {
  it("rota de setores não grava evento; setor exige setor; hora inválida barra", () => {
    expect(validarEvento({ tipo: "evento", nome: "x", dia: "2026-01-01", categoria: "reuniao" }, ["setor"])).toMatchObject({ ok: false });
    expect(validarEvento({ tipo: "setor", nome: "Dia X", dia: "2026-01-01" }, ["setor"])).toMatchObject({ ok: false, erro: expect.stringContaining("setor") });
    expect(validarEvento({ tipo: "evento", nome: "x", dia: "2026-01-01", categoria: "reuniao", hora: "25:00" }, ["evento"])).toMatchObject({ ok: false });
    expect(validarEvento({ tipo: "evento", nome: "x", dia: "2026-01-01", categoria: "reuniao", hora: "14:00", hora_fim: "13:00" }, ["evento"])).toMatchObject({ ok: false });
  });

  it("setor nasce anual; colaboradores só uuid, sem repetição", () => {
    const r = validarEvento({
      tipo: "setor", nome: " Dia da Produção ", dia: "2026-09-25", setor: "Produção",
      colaboradores: ["8c5c1b2e-2b1e-4c0e-9c9e-1a2b3c4d5e6f", "8c5c1b2e-2b1e-4c0e-9c9e-1a2b3c4d5e6f", "lixo"],
    }, ["setor"]);
    expect(r).toMatchObject({ ok: true, linha: { nome: "Dia da Produção", recorrencia: "anual", colaboradores: ["8c5c1b2e-2b1e-4c0e-9c9e-1a2b3c4d5e6f"] } });
  });
});

describe("legenda", () => {
  it("todo tipo tem ícone que existe no Icon.tsx (nada de emoji)", () => {
    for (const t of TIPOS_ACONTECIMENTO) expect(ICONS[LEGENDA[t].icone], LEGENDA[t].icone).toBeTruthy();
  });

  it("resumo da contagem satura em três linhas", () => {
    expect(resumirContagem({ aniversario: 3, feriado_nacional: 1, evento: 2 })).toEqual(["3 aniversários", "1 feriado nacional", "2 eventos internos"]);
    expect(resumirContagem({ aniversario: 1, setor: 1, comemorativa: 1, evento: 1 })).toEqual(["1 aniversário", "1 data do setor", "+ 2 tipos"]);
  });
});
