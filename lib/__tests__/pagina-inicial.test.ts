import { describe, expect, it } from "vitest";
import { ehPaginaInicialValida, resolverPaginaInicial } from "../pagina-inicial";
import { homeFor } from "../rbac";

const BASICO = ["central", "minhas-atividades"];

describe("página inicial por pessoa", () => {
  it("sem escolha, cai na home do papel (comportamento de sempre)", () => {
    expect(resolverPaginaInicial(null, BASICO, "colaborador")).toBe(homeFor("colaborador"));
    expect(resolverPaginaInicial(undefined, BASICO, "admin")).toBe(homeFor("admin"));
  });

  it("com a área liberada, entra direto nela", () => {
    expect(resolverPaginaInicial("tridimarket", [...BASICO, "tridimarket"], "colaborador")).toBe("/tridimarket");
    expect(resolverPaginaInicial("estoque", [...BASICO, "estoque"], "estoquista")).toBe("/estoque");
  });

  // O caso que importa: tirar a área e deixar o atalho de pé mandaria a pessoa
  // direto pro 403 no login, sem nem ver a Central pra entender o que houve.
  it("sem a área, ignora a escolha e volta pro padrão", () => {
    expect(resolverPaginaInicial("tridimarket", BASICO, "colaborador")).toBe(homeFor("colaborador"));
  });

  it("chave inventada não vira destino", () => {
    expect(ehPaginaInicialValida("nao-existe")).toBe(false);
    expect(ehPaginaInicialValida("/tridimarket")).toBe(false);   // guardamos a CHAVE, nunca a URL
    expect(ehPaginaInicialValida("tridimarket")).toBe(true);
    expect(resolverPaginaInicial("nao-existe", [...BASICO, "nao-existe"], "colaborador")).toBe(homeFor("colaborador"));
  });
});
