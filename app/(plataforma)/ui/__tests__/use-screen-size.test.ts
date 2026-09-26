import { describe, expect, it } from "vitest";
import { FaixaComparavel, faixaDaLargura } from "../useMediaQuery";

describe("useScreenSize — faixa por largura", () => {
  it("corta na escala do Tailwind", () => {
    expect(faixaDaLargura(320)).toBe("xs");
    expect(faixaDaLargura(639)).toBe("xs");
    expect(faixaDaLargura(640)).toBe("sm");
    expect(faixaDaLargura(768)).toBe("md");
    expect(faixaDaLargura(1024)).toBe("lg");
    expect(faixaDaLargura(1280)).toBe("xl");
    expect(faixaDaLargura(1536)).toBe("2xl");
  });
  it("compara em ordem", () => {
    const md = new FaixaComparavel("md");
    expect(md.equals("md")).toBe(true);
    expect(md.lessThan("lg")).toBe(true);
    expect(md.greaterThan("sm")).toBe(true);
    expect(md.greaterThanOrEqual("md")).toBe(true);
    expect(md.lessThanOrEqual("sm")).toBe(false);
    expect(`${md}`).toBe("md");
    expect(+md).toBe(2);
  });
});
