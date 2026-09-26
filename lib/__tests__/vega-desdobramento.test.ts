import { describe, it, expect } from "vitest";
import { ehDesdobramentoVega } from "@/lib/plataforma-vendas";

describe("pedido da Vega com /n não conta no tráfego", () => {
  it("VCS…/1 é desdobramento", () => {
    expect(ehDesdobramentoVega({ plataforma_id: 8, id_proprio: "VCS1O8WTEPA/1" })).toBe(true);
    expect(ehDesdobramentoVega({ plataforma_id: 8, id_proprio: "VCS1O8WTEPA/12" })).toBe(true);
  });
  it("código sem sufixo conta normal", () => {
    expect(ehDesdobramentoVega({ plataforma_id: 8, id_proprio: "VCS1O8WTEPA" })).toBe(false);
    expect(ehDesdobramentoVega({ plataforma_id: 8, id_proprio: null })).toBe(false);
  });
  it("só vale pra Vega", () => {
    expect(ehDesdobramentoVega({ plataforma_id: 3, id_proprio: "ABC/1" })).toBe(false);
  });
});
