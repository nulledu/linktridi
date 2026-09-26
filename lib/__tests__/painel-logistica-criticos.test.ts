import { describe, it, expect } from "vitest";
import { criticosDoPainel, type LogiPedido } from "@/lib/logistica";

/**
 * A TV da logística mostra pedido crítico SEM dado de cliente.
 *
 * A rota `/api/logistica/painel` é pública (a TV não tem sessão) e o repo já
 * tem a regra: nome e telefone de cliente não saem por ela. O pedido na parede
 * é identificado pela CAIXA separadora + pendências + dias parado — que é como
 * o galpão o encontra fisicamente.
 */

const ped = (extra: Partial<LogiPedido>): LogiPedido => ({
  id: 1, idProprio: "Maria Silva - 11 99999-0000", caixa: "12",
  cliente: "Maria Silva - 11 99999-0000", nome: "Maria Silva", contato: "11 99999-0000",
  responsavel: "Vera", formularioPendente: false, urgente: false,
  dataAprovado: "2026-08-10", criadoEm: "2026-08-10", dias: 3,
  checks: [], pronto: false, bloqueado: false, indefinido: false,
  pendencias: [], itens: [], faltam: 0, feitos: 2, temFalta: false,
  ...extra,
});

describe("criticosDoPainel", () => {
  it("entra quem é urgente, travado ou parado há 7+ dias", () => {
    const out = criticosDoPainel(
      [ped({ id: 1, urgente: true }), ped({ id: 2, dias: 3 })],
      [ped({ id: 3, bloqueado: true, pendencias: ["Etiqueta a emitir"] }), ped({ id: 4, dias: 9 })],
    );
    expect(out).toHaveLength(3);
  });

  it("urgente primeiro, depois o mais velho", () => {
    const out = criticosDoPainel(
      [ped({ id: 1, dias: 8, caixa: "3" })],
      [ped({ id: 2, urgente: true, dias: 2, caixa: "7" }), ped({ id: 3, dias: 12, caixa: "9" })],
    );
    expect(out.map((c) => c.caixa)).toEqual(["7", "9", "3"]);
  });

  it("NUNCA expõe nome, telefone ou id_proprio de cliente", () => {
    const [c] = criticosDoPainel([ped({ id: 1, urgente: true })], []);
    const chaves = Object.keys(c);
    expect(chaves).not.toContain("cliente");
    expect(chaves).not.toContain("nome");
    expect(chaves).not.toContain("contato");
    expect(chaves).not.toContain("idProprio");
    expect(chaves).not.toContain("responsavel");
    const texto = JSON.stringify(c);
    expect(texto).not.toMatch(/Maria|99999/);
  });

  it("carrega o que a parede precisa: caixa, dias, pendências, faltam", () => {
    const [c] = criticosDoPainel(
      [ped({ id: 1, urgente: true, caixa: "07", dias: 4, pendencias: ["Sem formulário", "Falta produzir"], faltam: 2, feitos: 1 })],
      [],
    );
    expect(c).toEqual({
      etapa: "entrada", caixa: "07", dias: 4, urgente: true, bloqueado: false,
      pendencias: ["Sem formulário", "Falta produzir"], faltam: 2, itens: 3,
    });
  });

  it("teto de 10 — é uma parede, não um relatório", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ped({ id: i, dias: 8 + i }));
    expect(criticosDoPainel(muitos, [])).toHaveLength(10);
  });
});
