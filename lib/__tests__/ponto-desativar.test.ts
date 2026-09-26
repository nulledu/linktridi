import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Desativar alguém no ponto tem de valer nas TRÊS portas.
 *
 * "Tirar do sistema de ponto" é marcar `ativo = false` — não apagar, porque
 * apagar leva as batidas e o banco de horas junto. Só que desligar num lugar
 * não desliga nos outros:
 *
 *   1. o /sync do tablet lista `listPessoas(false)` → a pessoa some da tela;
 *   2. mas um tablet com a lista velha em CACHE (ou a fila offline drenando
 *      horas depois) continuaria mandando batida dela — quem tem de recusar é
 *      o servidor, no `baterPonto`;
 *   3. e a recusa precisa ser 4xx: com 500 o app trata como erro transitório e
 *      reenvia pra sempre.
 *
 * O lançamento MANUAL (gestão corrigindo o passado) continua passando: é
 * justamente o caso de acertar o mês de quem já saiu.
 */
const raiz = (p: string) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");

describe("desativar pessoa no ponto", () => {
  it("o tablet só recebe as ativas", () => {
    expect(raiz("app/api/ponto/sync/route.ts")).toMatch(/listPessoas\(false\)/);
  });

  it("bater ponto recusa pessoa inativa, e só o manual escapa", () => {
    const src = raiz("lib/ponto.ts");
    expect(src, "sem esta guarda o tablet com cache velho continua batendo")
      .toMatch(/!pessoa\.ativo && input\.origem !== "manual"/);
    expect(src).toMatch(/pessoa_inativa/);
  });

  it("a recusa é 409, nunca 500 (senão a fila do tablet reenvia pra sempre)", () => {
    const src = raiz("app/api/ponto/bater/route.ts");
    expect(src).toMatch(/pessoa_inativa[\s\S]{0,120}status:\s*409/);
  });

  it("a lista de gestão inclui as inativas — senão não dá pra reativar", () => {
    expect(raiz("app/api/ponto/pessoas/route.ts")).toMatch(/listPessoas\(true\)/);
  });

  it("o drawer da pessoa tem Arquivar sem apagar batidas", () => {
    const src = raiz("app/(plataforma)/administracao/ponto/PessoasDoPonto.tsx");
    expect(src, "arquivar é PUT ativo:false — remover apaga o histórico")
      .toMatch(/ativo: !arquivando/);
    expect(src).toMatch(/onArquivar=/);
  });
});
