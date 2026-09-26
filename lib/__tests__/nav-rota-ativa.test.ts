import { describe, expect, it } from "vitest";
import { navForKeys, rotaAtiva } from "../rbac";

describe("barra lateral: um item ativo por vez", () => {
  it("Contingência não acende o Geral junto", () => {
    expect(rotaAtiva("/marketing/contingencia", "/marketing/contingencia")).toBe(true);
    expect(rotaAtiva("/marketing/contingencia", "/marketing")).toBe(false);
    expect(rotaAtiva("/marketing/contingencia/x", "/marketing")).toBe(false);
  });

  it("subpágina do Geral continua acendendo o Geral", () => {
    expect(rotaAtiva("/marketing", "/marketing")).toBe(true);
    expect(rotaAtiva("/marketing/criativos", "/marketing")).toBe(true);
    expect(rotaAtiva("/marketingx", "/marketing")).toBe(false);
  });

  // `colaboradores` saiu do grupo em b2c9122c, quando Pessoas virou RH: a porta
  // mudou (/colaboradores só REDIRECIONA pra /rh/colaboradores) e o módulo foi
  // pra MODULOS_DISCRETOS — que não aparece em menu nenhum, de propósito. Ter a
  // chave continua valendo (ela gateia ponto e dispositivos); o que sumiu é o
  // anúncio. Este teste guarda o grupo, não o item que mudou de casa.
  it("Analytics, Financeiro e Configurações moram no grupo Gestão", () => {
    const nav = navForKeys(["central", "analytics", "financeiro", "colaboradores", "administracao"]);
    const gestao = nav.find((i) => i.type === "group" && i.key === "gestao");
    expect(gestao?.type === "group" && gestao.children.map((c) => c.key))
      .toEqual(["analytics", "financeiro", "administracao"]);
    // Discreto quer dizer discreto: não pode reaparecer em outro canto do menu.
    const todasAsChaves = nav.flatMap((i) =>
      i.type === "group" ? i.children.map((c) => c.key) : [i.type === "module" ? i.module.key : ""],
    );
    expect(todasAsChaves).not.toContain("colaboradores");
    expect(nav.filter((i) => i.type === "module").map((i) => i.type === "module" && i.module.key)).toEqual(["central"]);
  });
});
