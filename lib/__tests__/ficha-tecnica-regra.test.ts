import { describe, it, expect } from "vitest";
import { validarFicha } from "../estoque-hierarquia";

// A rota /api/ficha-tecnica monta exatamente estes argumentos a partir do banco.
// Testar aqui a REGRA (e não o handler) evita ter que forjar o Supabase inteiro
// pra provar uma coisa que é aritmética de conjunto.
describe("regra da ficha técnica (como a rota usa)", () => {
  it("peça feita de matéria-prima passa — é a escada, não o caminho único", () => {
    // Era recusada: a matriz antiga exigia que a peça viesse de componente
    // pronto. No galpão a peça é cortada da chapa, e o resultado da regra
    // errada foi 21 peças sem ficha nenhuma no catálogo.
    const r = validarFicha("peca", [
      { nome: "Componente X", hierarquia: "componente" },
      { nome: "MDF 6mm",      hierarquia: "materia_prima" },
      { nome: "Cola PVA",     hierarquia: "insumo_indireto" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("produto com peça, componente, insumo indireto e embalagem passa", () => {
    const r = validarFicha("produto", [
      { nome: "Peça A",   hierarquia: "peca" },
      { nome: "Comp B",   hierarquia: "componente" },
      { nome: "Cola",     hierarquia: "insumo_indireto" },
      { nome: "Caixa M",  hierarquia: "embalagem" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("subir a escada é recusado com o nome do culpado", () => {
    const r = validarFicha("componente", [
      { nome: "MDF 6mm",     hierarquia: "materia_prima" },
      { nome: "Gaveta Pronta", hierarquia: "peca" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.invalidos.map((l) => l.nome)).toEqual(["Gaveta Pronta"]);
  });

  it("matéria-prima não aceita ficha de nada acima dela", () => {
    expect(validarFicha("materia_prima", [{ nome: "Cola", hierarquia: "insumo_direto" }]).ok).toBe(false);
  });
});
