// Entrada única dos widgets da Yampi no "Meu painel" (pedido do dono, 23/09/2026:
// os widgets têm que ESTAR na Tridify, não só disponíveis em "Adicionar").
// O layout mora no aparelho de cada gestor — o que esta função faz é o que
// muda o painel de todo mundo, então cada regra aqui é uma promessa pra alguém.
import { describe, expect, it } from "vitest";
import { migrarLayout, MIGRACOES } from "@/app/(plataforma)/trafego/layout-migracoes";

const YAMPI = MIGRACOES[0].entram;
const antigo = (o: Partial<{ order: string[]; hidden: string[]; migracoes: string[] }> = {}) => ({
  order: ["resumo_exec", "roas", "vendas"], hidden: ["funil"], sizes: {}, migracoes: [] as string[], ...o,
});

describe("widgets da Yampi entram no painel de quem já tinha layout", () => {
  it("layout antigo recebe os nove, no fim, visíveis — sem mexer no resto", () => {
    const l = migrarLayout(antigo());
    expect(l.order.slice(0, 3)).toEqual(["resumo_exec", "roas", "vendas"]);
    expect(l.order.slice(3)).toEqual(YAMPI);
    expect(l.hidden).toEqual(["funil"]);
    expect(l.migracoes).toContain("yampi-2026-09-23");
  });

  it("roda UMA vez: quem esconder um widget depois não o vê voltar", () => {
    const migrado = migrarLayout(antigo());
    const escondeu = { ...migrado, hidden: [...migrado.hidden, "yampi_p_pix"] };
    expect(migrarLayout(escondeu)).toBe(escondeu);            // nada muda
  });

  it("widget que a pessoa já tinha posto fica onde está", () => {
    const l = migrarLayout(antigo({ order: ["yampi_p_receita", "roas"] }));
    expect(l.order[0]).toBe("yampi_p_receita");
    expect(l.order.filter((k) => k === "yampi_p_receita")).toHaveLength(1);
  });

  it("widget da Yampi que estava escondido pelo padrão antigo passa a aparecer", () => {
    // Layout nascido do preset antigo: TODAS as chaves fora da ordem ficavam
    // em `hidden`, inclusive as da Yampi — sem limpar, entrariam escondidas.
    const l = migrarLayout(antigo({ hidden: ["funil", ...YAMPI] }));
    expect(l.hidden).toEqual(["funil"]);
    for (const k of YAMPI) expect(l.order).toContain(k);
  });
});
