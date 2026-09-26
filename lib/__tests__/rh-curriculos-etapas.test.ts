/**
 * RH → Currículos — as etapas do processo (colunas do Kanban) e as filas do
 * topo da tela. A config é do RH; o que o código conhece não pode sumir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ARQUIVADO, ETAPAS_PADRAO, destinoValido, etapaDeEntrada, filasDo, normalizarEtapas, seloDaEtapa,
} from "../rh/curriculos/etapas";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const DIA = 86_400_000;
const AGORA = Date.parse("2026-09-18T12:00:00Z");
const ha = (d: number) => new Date(AGORA - d * DIA).toISOString();

describe("etapas do processo", () => {
  it("o padrão tem as sete etapas pedidas, começando em Recebidos", () => {
    expect(ETAPAS_PADRAO.map((e) => e.label)).toEqual(["Recebidos", "Em análise", "Pré-selecionados", "Entrevista", "Aprovados", "Reprovados", "Contratados"]);
    expect(etapaDeEntrada(ETAPAS_PADRAO)).toBe("novo");
  });

  it("config do RH renomeia, reordena e cria etapa — mas não apaga as do sistema", () => {
    const e = normalizarEtapas([
      { id: "em_analise", label: "Triagem", cor: "var(--azul)" },
      { id: "teste_pratico", label: "Teste prático", papel: "andamento" },
      { id: "novo", label: "Chegaram", ativa: false, papel: "final_positivo" },
    ]);
    expect(e[0]).toMatchObject({ id: "em_analise", label: "Triagem" });
    expect(e.find((x) => x.id === "teste_pratico")).toMatchObject({ papel: "andamento", ativa: true });
    // "Recebidos" não desliga nem deixa de ser a entrada.
    expect(e.find((x) => x.id === "novo")).toMatchObject({ ativa: true, papel: "entrada", label: "Chegaram" });
    for (const p of ETAPAS_PADRAO) expect(e.some((x) => x.id === p.id)).toBe(true);
    expect(normalizarEtapas(e)).toEqual(e);
  });

  it("cor fora da paleta semântica e id inválido não entram", () => {
    const e = normalizarEtapas([{ id: "Com Espaço", label: "x" }, { id: "ok", label: "Ok", cor: "#ff00ff" }, { id: ARQUIVADO, label: "Arq" }]);
    expect(e.some((x) => x.id === "Com Espaço" || x.id === ARQUIVADO)).toBe(false);
    expect(e.find((x) => x.id === "ok")?.cor).toBe("var(--neutro)");
  });

  it("mover só pra etapa configurada ou arquivado", () => {
    expect(destinoValido(ETAPAS_PADRAO, "entrevista")).toBe(true);
    expect(destinoValido(ETAPAS_PADRAO, ARQUIVADO)).toBe(true);
    expect(destinoValido(ETAPAS_PADRAO, "inventada")).toBe(false);
    expect(seloDaEtapa(ETAPAS_PADRAO, "inventada").cor).toBe("var(--neutro)");
  });
});

describe("as filas da triagem", () => {
  const f = (status: string, recebido: number, etapa: number | null) => filasDo({ status, recebido_em: ha(recebido), etapa_em: etapa == null ? null : ha(etapa) }, ETAPAS_PADRAO, AGORA);

  it("recém-chegado em Recebidos: chegou e precisa de análise", () => {
    expect([...f("novo", 1, 1)].sort()).toEqual(["analisar", "chegaram"]);
  });
  it("em andamento: avançando até 7 dias na etapa, parado depois", () => {
    expect(f("em_analise", 30, 2).has("avancando")).toBe(true);
    expect(f("entrevista", 30, 10).has("parados")).toBe(true);
    // Sem carimbo de etapa (candidato antigo), conta da chegada.
    expect(f("em_analise", 20, null).has("parados")).toBe(true);
  });
  it("aprovado, reprovado, contratado e arquivado são finalizados", () => {
    for (const s of ["aprovado", "reprovado", "contratado", ARQUIVADO]) expect(f(s, 30, 1).has("finalizados")).toBe(true);
  });
});

describe("recebimento alimenta o quadro", () => {
  const dados = readFileSync(`${RAIZ}/lib/rh/curriculos/dados.ts`, "utf8");
  it("todo candidato novo entra na etapa de entrada, com o carimbo de etapa", () => {
    expect(dados).toMatch(/status: etapaDeEntrada\(etapas\)/);
    expect(dados).toMatch(/etapa_em: c\.recebido_em/);
  });
  it("mudar de etapa carimba etapa_em (é o 'parado há N dias')", () => {
    expect(dados).toMatch(/status !== antes \? \{ etapa_em:/);
  });
  it("o link do currículo na lista só sai pra quem abre o arquivo", () => {
    expect(dados).toMatch(/curriculo_url: comArquivo &&/);
  });
});
