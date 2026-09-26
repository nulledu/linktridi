import { describe, expect, it } from "vitest";
import { AREAS, AREAS_RESTRITAS, mapaDePermissoes, subFullKey } from "@/lib/areas";

/**
 * "ACESSO TOTAL" NÃO LIGA ÁREA RESTRITA — NEM A CHAVE DA ÁREA, NEM AS SUBS.
 *
 * A regra valia só para a chave da área. Como o TridiMarket (a outra restrita)
 * NÃO tem subs, ninguém percebeu; o Financeiro tem dez, e o resultado era que
 * salvar a ficha de qualquer admin gravava as dez como `true`. Na tela elas
 * apareciam marcadas e travadas: desmarcar não adiantava, porque o salvamento
 * seguinte acendia tudo de novo. Do lado de quem tentava: "não consigo tirar a
 * permissão do financeiro de quem é admin".
 *
 * O teste roda sobre o catálogo REAL de áreas, então uma área restrita nova
 * (com ou sem subs) já nasce coberta.
 */

const CHAVES_RESTRITAS_COM_SUBS = AREAS_RESTRITAS.flatMap((a) => [
  a.key,
  ...(a.subs ?? []).map((s) => subFullKey(a.key, s.key)),
]);

describe('a grade de acesso e o "acesso total"', () => {
  it("admin com NADA marcado não recebe uma chave sequer de área restrita", () => {
    const map = mapaDePermissoes({ ehAdmin: true, selecionadas: new Set() });
    const vazou = CHAVES_RESTRITAS_COM_SUBS.filter((k) => map[k]);
    expect(vazou, `"acesso total" ligou: ${vazou.join(", ")}`).toEqual([]);
  });

  it("admin continua recebendo tudo que NÃO é restrito", () => {
    const map = mapaDePermissoes({ ehAdmin: true, selecionadas: new Set() });
    for (const a of AREAS.filter((x) => !x.restrita)) {
      expect(map[a.key], `${a.key} deixou de vir com o acesso total`).toBe(true);
      // Uma sub pode ser `restrita` dentro de uma área comum (o bônus dos
      // marketplaces): a área vem no bloco, a sub não. Ver o teste abaixo.
      for (const s of (a.subs ?? []).filter((x) => !x.restrita)) {
        expect(map[subFullKey(a.key, s.key)], `${a.key}:${s.key} deixou de vir com o acesso total`).toBe(true);
      }
    }
  });

  it("sub restrita dentro de área comum fica de fora do 'acesso total'", () => {
    const map = mapaDePermissoes({ ehAdmin: true, selecionadas: new Set() });
    const subsRestritas = AREAS.filter((a) => !a.restrita)
      .flatMap((a) => (a.subs ?? []).filter((s) => s.restrita).map((s) => subFullKey(a.key, s.key)));
    // Se um dia não houver nenhuma, o teste acima já cobre o sistema inteiro.
    for (const k of subsRestritas) expect(map[k], `${k} veio de carona no acesso total`).toBe(false);
  });

  it("desmarcar uma sub restrita GRAVA desmarcada, mesmo em ficha de admin", () => {
    // Estado de partida: o Financeiro inteiro ligado na pessoa.
    const tudo = new Set((AREAS.find((a) => a.key === "financeiro")?.subs ?? [])
      .map((s) => subFullKey("financeiro", s.key)));
    expect(mapaDePermissoes({ ehAdmin: true, selecionadas: tudo })["financeiro:pagar"]).toBe(true);

    // A pessoa desmarca "pagar" e salva.
    tudo.delete("financeiro:pagar");
    const depois = mapaDePermissoes({ ehAdmin: true, selecionadas: tudo });
    expect(depois["financeiro:pagar"]).toBe(false);
    expect(depois["financeiro:ver"], "as outras não podem cair junto").toBe(true);
  });

  it("marcar uma sub restrita acende a ÁREA — senão a chave fina fica sem porta", () => {
    const map = mapaDePermissoes({ ehAdmin: false, selecionadas: new Set(["financeiro:ver"]) });
    expect(map["financeiro"]).toBe(true);
    expect(map["financeiro:ver"]).toBe(true);
    expect(map["financeiro:pagar"]).toBe(false);
  });

  it("tirar todas as subs restritas apaga a área junto", () => {
    const map = mapaDePermissoes({ ehAdmin: true, selecionadas: new Set(["estoque:itens"]) });
    expect(map["financeiro"]).toBe(false);
    expect(map["tridimarket"]).toBe(false);
  });
});
