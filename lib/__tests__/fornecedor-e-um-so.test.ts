import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * O fornecedor é UM cadastro só — o do Financeiro.
 *
 * Existiram dois: `estoque_fornecedores` e `fin_fornecedores`. Dois cadastros
 * da mesma coisa nunca ficam iguais — um ganha o CNPJ novo, o outro fica com o
 * telefone velho — e "de quem a gente compra isso?" passa a ter duas respostas,
 * sendo a errada sempre a que está aberta na tela.
 *
 * Isto não se sustenta por documentação: volta como UMA linha, num arquivo
 * sobre outro assunto, no dia em que alguém precisar de um fornecedor rápido e
 * o cadastro antigo ainda estiver ali. Por isso é teste.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

function varrer(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next" || nome.startsWith(".")) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, out);
    else if (/\.tsx?$/.test(nome)) out.push(full);
  }
  return out;
}

const CODIGO = [join(RAIZ, "app"), join(RAIZ, "lib")]
  .flatMap((d) => varrer(d))
  .map((f) => ({ arquivo: relative(RAIZ, f), texto: readFileSync(f, "utf8") }))
  // Os próprios testes falam da tabela morta para provar que ela ficou marcada.
  .filter((c) => !c.arquivo.includes("__tests__"));

describe("O cadastro antigo do estoque está morto", () => {
  it("nenhum código lê ou escreve em estoque_fornecedores", () => {
    const vivos = CODIGO
      .filter((c) => /from\(["'`]estoque_fornecedores["'`]\)/.test(c.texto))
      .map((c) => c.arquivo);
    expect(
      vivos,
      "o fornecedor vem de fin_fornecedores (ver lib/estoque-fornecedor-fonte.ts)",
    ).toEqual([]);
  });
});

describe("A fronteira com a área restrita", () => {
  const FONTE = readFileSync(join(RAIZ, "lib", "estoque-fornecedor-fonte.ts"), "utf8");

  it("só o arquivo da fronteira lê fin_fornecedores fora do Financeiro", () => {
    // O Financeiro é área RESTRITA. Ler `fin_*` de fora do módulo é aceitável
    // num lugar só, com a lista de colunas escrita e explicada. Espalhado, cada
    // consulta nova decide sozinha o que expor — e a que expuser demais não vai
    // parecer diferente das outras.
    const DENTRO_DO_MODULO = (a: string) =>
      a.startsWith("lib/financeiro/") || a.startsWith("app/api/financeiro/") || a.includes("/financeiro/");
    // A regra é sobre a LEITURA DA LISTA — é ela que decide o que sai do
    // módulo restrito. Estas duas rotas são a porta de ESCRITA do estoque: elas
    // gravam colunas nomeadas uma a uma, atrás de `financeiro:cadastros` e da
    // conferência de empresa, e só leem `id`/`empresa_id` para saber se podem.
    // Ler a lista, quem lê é a fonte.
    const PORTA_DE_ESCRITA = [
      "app/api/estoque/fornecedores/route.ts",
      "app/api/estoque/importar/route.ts",
    ];
    const fora = CODIGO
      .filter((c) => !DENTRO_DO_MODULO(c.arquivo))
      .filter((c) => c.arquivo !== "lib/estoque-fornecedor-fonte.ts")
      .filter((c) => !PORTA_DE_ESCRITA.includes(c.arquivo))
      .filter((c) => /from\(["'`]fin_fornecedores["'`]\)/.test(c.texto))
      .map((c) => c.arquivo);
    expect(fora, "leia por lib/estoque-fornecedor-fonte.ts").toEqual([]);
  });

  it("a porta de escrita não LÊ a lista — ela grava e confere", () => {
    // Se uma dessas rotas passar a montar a lista sozinha, a fronteira de
    // colunas deixa de existir num lugar só e volta a ser decisão espalhada.
    for (const arquivo of ["app/api/estoque/fornecedores/route.ts", "app/api/estoque/importar/route.ts"]) {
      const texto = readFileSync(join(RAIZ, arquivo), "utf8");
      const selects = [...texto.matchAll(/from\("fin_fornecedores"\)[\s\S]{0,120}?\.select\("([^"]*)"\)/g)]
        .map((m) => m[1]);
      for (const cols of selects) {
        expect(
          cols.split(",").every((c) => ["id", "nome", "empresa_id"].includes(c.trim())),
          `${arquivo} lê "${cols}" — use fornecedoresDoFinanceiro()`,
        ).toBe(true);
      }
    }
  });

  it("condição comercial não atravessa a fronteira", () => {
    // `prazo_dias` e `forma_pagamento` são o assunto do módulo trancado. Se um
    // dia entrarem na lista de colunas, é decisão consciente — e este teste
    // obriga a tomá-la em vez de deixar acontecer.
    const colunas = FONTE.match(/const COLUNAS = "([^"]+)"/)?.[1] ?? "";
    expect(colunas, "COLUNAS sumiu de lib/estoque-fornecedor-fonte.ts").toBeTruthy();
    expect(colunas.split(",")).not.toContain("prazo_dias");
    expect(colunas.split(",")).not.toContain("forma_pagamento");
  });

  it("escrever fornecedor exige a chave do Financeiro, não a do galpão", () => {
    // Era `estoque:fornecedores`. Mantê-la deixaria um estoquista gravando
    // dentro da área restrita por uma porta lateral — o buraco exato que a área
    // restrita existe para não ter.
    expect(FONTE).toMatch(/keys\.includes\("financeiro:cadastros"\)/);
    expect(FONTE).not.toMatch(/keys\.includes\("estoque:fornecedores"\)/);
  });
});
