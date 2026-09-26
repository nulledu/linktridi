import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULES } from "../rbac";
import { opcoesDePaginaInicial, paginaInicialPermitida } from "../ajustes";

// ── Página inicial escolhida pela própria pessoa (Ajustes) ───────────────────
// Até aqui só quem administra a equipe mudava isso, na ficha. Agora a pessoa
// escolhe nos Ajustes — e o que não pode mudar é a regra: só vale área que ela
// TEM (senão o login mandaria direto pra um 403), e ela só mexe na PRÓPRIA
// ficha, com o id tirado da sessão, nunca do corpo da requisição.

const ler = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");
const prontos = MODULES.filter((m) => m.ready).map((m) => m.key);
const [a, b] = prontos;

describe("página inicial nos Ajustes", () => {
  it("só aceita área que a pessoa tem", () => {
    expect(paginaInicialPermitida(a, [a])).toBe(true);
    expect(paginaInicialPermitida(b, [a]), "módulo existe, mas não é dela").toBe(false);
    expect(paginaInicialPermitida("banana", ["banana"]), "não é módulo").toBe(false);
    expect(paginaInicialPermitida(null, [a])).toBe(false);
  });

  it("as opções são as áreas prontas que ela tem, com o nome de cada uma", () => {
    const ops = opcoesDePaginaInicial([a, "chave-inexistente"]);
    expect(ops).toEqual([{ key: a, label: MODULES.find((m) => m.key === a)!.label }]);
  });

  it("a rota grava só na própria ficha, confere a área e derruba o cache", () => {
    const rota = ler("app/api/ajustes/route.ts");
    expect(rota).toMatch(/getProfile\(\)/);
    expect(rota).toMatch(/paginaInicialPermitida\(/);
    expect(rota).toMatch(/me\.id/);
    expect(rota, "o id nunca vem do cliente").not.toMatch(/body\.(id|userId)|searchParams/);
    expect(ler("lib/ajustes.ts")).toMatch(/invalidate\(`pagina-inicial:/);
  });
});
