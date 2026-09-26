import { describe, it, expect } from "vitest";
import { MODULES, MODULOS_DISCRETOS, canAccess, homeFor, modulesFor, navForKeys } from "../rbac";
import { AREAS, CHAVES_RESTRITAS, SUB_FULL_KEYS, chavesDasAreas } from "../areas";
import { PERMISSOES_DE_ADMIN, TODAS_PERMISSOES, resolveModuleKeys } from "../permissions";
import { ehSuperusuario } from "../superusuario";

describe("rbac", () => {
  it("admin acessa todos os módulos", () => {
    for (const key of ["comercial", "producao", "estoque", "colaboradores", "minhas-atividades"]) {
      expect(canAccess("admin", key)).toBe(true);
    }
  });

  it("cada papel só acessa o seu módulo", () => {
    expect(canAccess("gerente_vendas", "comercial")).toBe(true);
    expect(canAccess("gerente_vendas", "estoque")).toBe(false);
    expect(canAccess("gerente_producao", "producao")).toBe(true);
    expect(canAccess("gerente_producao", "comercial")).toBe(false);
    expect(canAccess("estoquista", "estoque")).toBe(true);
    expect(canAccess("estoquista", "colaboradores")).toBe(false);
    expect(canAccess("gerente_vendas", "colaboradores")).toBe(true);
    expect(canAccess("colaborador", "minhas-atividades")).toBe(true);
    expect(canAccess("colaborador", "comercial")).toBe(true);
  });

  it("homeFor aponta pro 1º módulo do papel (Central é a entrada de todos)", () => {
    expect(homeFor("gerente_vendas")).toBe("/central");
    expect(homeFor("gerente_producao")).toBe("/central");
    expect(homeFor("estoquista")).toBe("/central");
    expect(homeFor("colaborador")).toBe("/central");
    expect(homeFor("admin")).toBe("/central");
  });

  it("colaborador vê Central + suas atividades/comercial", () => {
    expect(modulesFor("colaborador").map((m) => m.key)).toContain("central");
  });

  it("TridiMarket é área PRÓPRIA e restrita, não mais uma sub de Configurações", () => {
    const area = AREAS.find((a) => a.key === "tridimarket");
    expect(area?.restrita).toBe(true);
    // Saiu de dentro de Configurações: quem tem a área "administracao" não
    // pode reencontrar o mercadinho por lá.
    expect(SUB_FULL_KEYS).not.toContain("administracao:tridimarket");
    expect(AREAS.find((a) => a.key === "administracao")?.subs?.some((s) => s.key === "tridimarket")).toBeFalsy();
  });

  it("acesso total NÃO abre o TridiMarket", () => {
    // O ponto da restrição: dentro do mercadinho está a carteira e a dívida de
    // cada pessoa. Isso não pode vir de brinde com "acesso total ao sistema".
    expect(TODAS_PERMISSOES).toContain("tridimarket");
    expect(PERMISSOES_DE_ADMIN).not.toContain("tridimarket");
    expect(resolveModuleKeys({ role: "admin" })).not.toContain("tridimarket");
    // E nada mais foi perdido no caminho.
    for (const k of ["administracao", "colaboradores", "trafego", "estoque"]) {
      expect(PERMISSOES_DE_ADMIN).toContain(k);
    }
  });

  it("TridiMarket entra só por concessão explícita naquela pessoa", () => {
    expect(chavesDasAreas({ administracao: true })).not.toContain("tridimarket");
    expect(chavesDasAreas({ tridimarket: true })).toContain("tridimarket");
  });

  it("ter TODAS as outras áreas ainda não abre o TridiMarket", () => {
    // O caminho por onde isso voltaria a vazar: alguém marca a grade inteira e
    // o mercadinho entra de carona.
    const tudoMenos: Record<string, boolean> = {};
    for (const k of PERMISSOES_DE_ADMIN) tudoMenos[k] = true;
    expect(chavesDasAreas(tudoMenos)).not.toContain("tridimarket");
  });

  it("TridiMarket não aparece na sidebar de ninguém — nem de quem tem a área", () => {
    // Decisão de produto: entra digitando /tridimarket, e ponto. Não é segurança
    // por obscuridade — o gate continua sendo a chave da área (o teste acima
    // garante que ela não vem junto com "acesso total"), então saber o endereço
    // não abre nada. O que o menu faz é só não anunciar a área pra plateia.
    const comArea = navForKeys(["central", "tridimarket", "administracao"]);
    const chaves = comArea.flatMap((i) => i.type === "module" ? [i.module.key] : i.children.map((c) => c.key));
    expect(chaves).not.toContain("tridimarket");
    // E o módulo continua existindo (a rota e o gate seguem de pé).
    expect(MODULES.some((m) => m.key === "tridimarket")).toBe(true);
  });

  it("módulo discreto some de TODO menu, não só da sidebar", () => {
    // A sidebar é só um dos anúncios: a barra do celular preenche os slots que
    // sobram varrendo os módulos da pessoa, e o ⌘K lista todos ao abrir. Tirar
    // de um e esquecer dos outros deixa a área anunciada do mesmo jeito — foi
    // o que aconteceu quando ela saiu só do `NAV_HIDDEN`.
    //
    // Este teste guarda a LISTA. Quem consome (MobileTabBar, CommandPalette)
    // filtra por ela; a busca no repo por `MODULOS_DISCRETOS` mostra os pontos.
    expect([...MODULOS_DISCRETOS]).toContain("tridimarket");
    // Discreto não é o mesmo que "coberto por outra tela": Minhas atividades
    // some da sidebar mas continua achável na busca.
    expect([...MODULOS_DISCRETOS]).not.toContain("minhas-atividades");
  });

  it("a página e a API do TridiMarket gateiam pela MESMA chave", () => {
    // Divergir aqui é o clássico "a página abre e a API devolve 403".
    const modulo = MODULES.find((m) => m.href === "/tridimarket");
    expect(modulo?.key).toBe("tridimarket");
    expect(CHAVES_RESTRITAS).toContain(modulo!.key);
  });

  it("superusuário é reconhecido por id e por username, e ninguém mais", () => {
    expect(ehSuperusuario("862eb118-084d-48cc-a12b-287f87946689")).toBe(true);
    expect(ehSuperusuario(null, "caio")).toBe(true);
    expect(ehSuperusuario(null, "CAIO")).toBe(true);          // caixa não importa
    expect(ehSuperusuario("becf5047-6276-417c-8688-86ea07ba4396")).toBe(false);  // outro admin
    expect(ehSuperusuario(null, "douglasfranco")).toBe(false);
    expect(ehSuperusuario(null, null)).toBe(false);
    expect(ehSuperusuario("", "")).toBe(false);
  });
});
