import { describe, it, expect } from "vitest";
import {
  AREA_BY_KEY, CHAVES_RESTRITAS, CHAVES_SO_POR_CONCESSAO, chavesDasAreas,
  ehChaveRestrita, mapaDePermissoes,
} from "@/lib/areas";
import { TODAS_PERMISSOES } from "@/lib/permissions";
import { ehChaveSoPorConcessao } from "@/lib/areas";
import { tipoDaFonte, chaveLojaYampi, chavePlataforma, PLAT_SHOPEE } from "@/lib/marketing-config";

const CHAVE = "administracao:marketplaces-bonus";

// ── O bônus dos marketplaces é salário dentro de uma aba de operação ─────────
// Quem confere pedido da Shopee tem `administracao:marketplaces`. Isso NÃO
// pode trazer junto quanto o colega ganha por cuidar da Shopee. A separação
// só vale se nenhum caminho de concessão em bloco alcançar a chave do bônus.
describe("Bônus dos marketplaces é área restrita à parte", () => {
  it("a sub existe, é sensível, é restrita e implica a aba", () => {
    const sub = AREA_BY_KEY.administracao?.subs?.find((s) => s.key === "marketplaces-bonus");
    expect(sub, "a sub do bônus sumiu de lib/areas.ts").toBeTruthy();
    expect(sub!.sensivel).toBe(true);
    expect(sub!.restrita).toBe(true);
    // Sem `implica`, quem recebe só o bônus abre a aba e leva 403 na rota.
    expect(sub!.implica).toContain("marketplaces");
  });

  it("conta como chave restrita", () => {
    expect(ehChaveRestrita(CHAVE)).toBe(true);
    expect(CHAVES_RESTRITAS).toContain(CHAVE);
  });

  // O superusuário (dono do sistema) é a ÚNICA exceção, e por um beco real: a
  // grade proíbe editar a própria ficha, então sem isto ele precisaria de um
  // segundo admin pra se conceder a chave — e a tela nasceria invisível pra
  // quem mandou construí-la. Ver O_DONO_ALCANCA em lib/areas.ts.
  it("o dono alcança a chave sem depender de um segundo admin", () => {
    expect(CHAVES_SO_POR_CONCESSAO, "o dono ficaria trancado do lado de fora").not.toContain(CHAVE);
    // O caminho de verdade do superusuário em resolveMyModuleKeys, sem banco.
    const doSuperusuario = TODAS_PERMISSOES.filter((k) => !ehChaveSoPorConcessao(k));
    expect(doSuperusuario).toContain(CHAVE);
  });

  it("o card 'acesso total' NÃO liga o bônus, mas liga a aba", () => {
    const mapa = mapaDePermissoes({ ehAdmin: true, selecionadas: new Set() });
    expect(mapa["administracao:marketplaces"], "a aba é operação: vem no bloco").toBe(true);
    expect(mapa[CHAVE], "o bônus é salário: nunca vem no bloco").toBe(false);
  });

  it("marcar de propósito liga — é o único caminho", () => {
    const mapa = mapaDePermissoes({ ehAdmin: false, selecionadas: new Set([CHAVE]) });
    expect(mapa[CHAVE]).toBe(true);
  });

  it("quem tem a aba no modelo antigo não herda o bônus na migração", () => {
    const keys = chavesDasAreas({ administracao: true });
    expect(keys).toContain("administracao:marketplaces");
    expect(keys, "back-compat não pode conceder salário").not.toContain(CHAVE);
  });

  it("quem tem o bônus tem a aba junto", () => {
    const keys = chavesDasAreas({ [CHAVE]: true });
    expect(keys).toContain(CHAVE);
    expect(keys).toContain("administracao:marketplaces");
  });
});

// ── Yampi sem loja não é marketplace ─────────────────────────────────────────
// `yampi:` é venda que chegou sem identificar a loja. Salva como marketplace
// (por engano, numa passagem pela tela de Fontes) ela entrava no faturamento
// dos marketplaces e, por tabela, no bônus de quem cuida das contas.
describe("Yampi sem loja fora do marketplace", () => {
  const semLoja = chaveLojaYampi("");

  it("nunca é marketplace, nem salva como tal", () => {
    expect(tipoDaFonte(semLoja, { [semLoja]: "marketplace" }, "Carimbos Tridi")).toBe("ignorar");
  });

  it("sem classificação nenhuma, segue ignorada", () => {
    expect(tipoDaFonte(semLoja, {}, "Carimbos Tridi")).toBe("ignorar");
  });

  it("outra classificação salva continua valendo", () => {
    expect(tipoDaFonte(semLoja, { [semLoja]: "organico" }, "Carimbos Tridi")).toBe("organico");
  });

  // Desde 12/09/2026 marketplace é a plataforma do pedido: nenhuma loja Yampi
  // vira marketplace por classificação, com nome ou sem.
  it("loja Yampi COM nome também não vira marketplace", () => {
    const loja = chaveLojaYampi("Loja Nova");
    expect(tipoDaFonte(loja, { [loja]: "marketplace" }, "Carimbos Tridi")).toBe("ignorar");
    expect(tipoDaFonte(loja, { [loja]: "marketplace" }, "Loja Nova"), "cai no padrão, que aqui é tráfego").toBe("trafego");
  });

  it("a Shopee segue marketplace por natureza", () => {
    expect(tipoDaFonte(chavePlataforma(PLAT_SHOPEE), {}, "Carimbos Tridi")).toBe("marketplace");
  });
});
