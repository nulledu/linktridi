import { describe, expect, it } from "vitest";
import { ehRotaPublica } from "@/lib/middleware-rotas";

// O casamento de prefixo que decide o que é público no middleware. O `=== p ||
// startsWith(p + "/")` (com a BARRA) é o que impede um prefixo curto de casar
// uma rota irmã: liberar "/api/p" (páginas do TridiFlow) não pode abrir
// "/api/perfis" nem "/api/producao" sem sessão. Casar prefixo cru
// (startsWith(p) sem barra) escancararia essas rotas.
const PUB = ["/painel", "/f", "/api/p", "/api/sales", "/api/estoque/device"];

describe("ehRotaPublica", () => {
  it("casa a rota exata e o que está abaixo dela", () => {
    expect(ehRotaPublica("/painel", PUB)).toBe(true);
    expect(ehRotaPublica("/painel/telao", PUB)).toBe(true);
    expect(ehRotaPublica("/api/p", PUB)).toBe(true);
    expect(ehRotaPublica("/api/p/evento", PUB)).toBe(true);
    expect(ehRotaPublica("/api/estoque/device/activate", PUB)).toBe(true);
  });

  it("NÃO casa uma rota irmã que só compartilha o começo", () => {
    expect(ehRotaPublica("/paineladmin", PUB)).toBe(false);
    expect(ehRotaPublica("/api/perfis", PUB)).toBe(false);   // "/api/p" não abre isto
    expect(ehRotaPublica("/api/producao", PUB)).toBe(false);
    expect(ehRotaPublica("/api/salespeople", PUB)).toBe(false); // "/api/sales" não abre isto
    expect(ehRotaPublica("/api/estoque/unidades", PUB)).toBe(false); // só /device é público
    expect(ehRotaPublica("/foo", PUB)).toBe(false);
  });
});
