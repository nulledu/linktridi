import { describe, expect, it } from "vitest";
import {
  AREAS_RESTRITAS, chaveQueConcede, podeConcederArea, preservarAreasNaoAdministradas,
} from "@/lib/areas";

/**
 * SÓ QUEM ADMINISTRA A ÁREA A CONCEDE.
 *
 * `permissoes` já era campo de poder (exige admin). Não bastava: a grade de
 * Pessoas grava o MAPA INTEIRO, então qualquer admin editando o cargo de um
 * colega podia mandar `financeiro:pagar: true` no mesmo PATCH e se dar o cofre.
 * Área restrita protegia contra concessão em BLOCO — não contra alguém marcando
 * de propósito.
 *
 * Quem administra é a própria área que diz: o Financeiro declara
 * `financeiro:acessos`. Área restrita sem essa sub (o TridiMarket) segue como
 * sempre foi, concedida por qualquer admin — mudar isso seria apertar uma trava
 * que ninguém pediu, num commit sobre outra coisa.
 */

const FIN = [
  "financeiro", "financeiro:ver", "financeiro:pagar", "financeiro:folha",
  "financeiro:contas", "financeiro:acessos",
];

describe("quem pode conceder área restrita", () => {
  it("o Financeiro declara a própria chave de administração", () => {
    expect(chaveQueConcede("financeiro")).toBe("financeiro:acessos");
  });

  it("área restrita sem administrador próprio continua com qualquer admin", () => {
    expect(chaveQueConcede("tridimarket")).toBeNull();
    expect(podeConcederArea("tridimarket", [])).toBe(true);
  });

  it("admin comum NÃO concede o Financeiro; quem tem a chave, sim", () => {
    expect(podeConcederArea("financeiro", ["colaboradores", "comercial"])).toBe(false);
    expect(podeConcederArea("financeiro", ["financeiro:acessos"])).toBe(true);
    expect(podeConcederArea("financeiro", [], true), "superusuário atravessa").toBe(true);
  });

  it("o que um admin comum mandar sobre o Financeiro é DESCARTADO", () => {
    const gravado = preservarAreasNaoAdministradas({
      enviado: { admin: true, comercial: true, financeiro: true, "financeiro:pagar": true },
      guardado: null,
      minhasChaves: ["colaboradores"],
    });
    expect(gravado["financeiro:pagar"]).toBeUndefined();
    expect(gravado["financeiro"]).toBeUndefined();
    expect(gravado.comercial, "o resto da grade passa normalmente").toBe(true);
  });

  it("PRESERVA o que já estava — salvar o telefone não revoga o cofre de ninguém", () => {
    // O caso silencioso: um admin abre a ficha de quem TEM o Financeiro, muda o
    // cargo e salva. A grade dele nem mostra essas chaves, então elas iriam
    // como `false` e a pessoa perderia o acesso sem ninguém decidir.
    const gravado = preservarAreasNaoAdministradas({
      enviado: { "financeiro:ver": false, "financeiro:pagar": false, comercial: true },
      guardado: { "financeiro:ver": true, "financeiro:pagar": true },
      minhasChaves: ["colaboradores"],
    });
    expect(gravado["financeiro:ver"]).toBe(true);
    expect(gravado["financeiro:pagar"]).toBe(true);
  });

  it("quem TEM a chave manda de verdade — inclusive para revogar", () => {
    const gravado = preservarAreasNaoAdministradas({
      enviado: { "financeiro:ver": false, "financeiro:pagar": false },
      guardado: { "financeiro:ver": true, "financeiro:pagar": true },
      minhasChaves: ["financeiro:acessos"],
    });
    expect(gravado["financeiro:ver"]).toBe(false);
    expect(gravado["financeiro:pagar"]).toBe(false);
  });

  it("toda área restrita com sub `acessos` fica coberta, hoje e amanhã", () => {
    for (const a of AREAS_RESTRITAS) {
      const chave = chaveQueConcede(a.key);
      if (!chave) continue;
      expect(podeConcederArea(a.key, []), `${a.key} ficou aberto a qualquer admin`).toBe(false);
    }
  });
});
