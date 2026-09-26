import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AREA_BY_KEY, chavesDasAreas, SUB_FULL_KEYS } from "../areas";

// ── Ver não é mexer ──────────────────────────────────────────────────────────
// `estoque:itens` foi, por muito tempo, a chave de TUDO no Estoque: quem
// enxergava o catálogo também criava, apagava e ajustava saldo. A separação em
// `estoque:cadastrar` (o QUE existe) e `estoque:ajustar` (QUANTO tem) só vale
// alguma coisa enquanto estas travas estiverem verdes — basta uma rota voltar
// a gatear por `estoque:itens` pra permissão existir na tela e não no sistema.

const raiz = join(__dirname, "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

describe("Estoque — cadastrar × ajustar", () => {
  it("as duas subs existem e implicam ver o catálogo", () => {
    const subs = AREA_BY_KEY["estoque"].subs ?? [];
    for (const key of ["cadastrar", "ajustar"]) {
      const s = subs.find((x) => x.key === key);
      expect(s, `sub estoque:${key}`).toBeDefined();
      // Sem `itens` a tela abre e toda requisição volta 403 — a armadilha
      // que o `implica` existe pra fechar.
      expect(s?.implica).toContain("itens");
    }
    expect(SUB_FULL_KEYS).toContain("estoque:cadastrar");
    expect(SUB_FULL_KEYS).toContain("estoque:ajustar");
  });

  // Esta é a decisão do dono: a permissão NASCE DESLIGADA. Quem tinha a área
  // no modelo antigo não herda o poder de apagar item nem de mexer no saldo —
  // alguém liga o quadradinho de propósito. `sensivel` é o mecanismo.
  it("quem já tinha a área NÃO herda cadastrar nem ajustar na migração", () => {
    const keys = chavesDasAreas({ estoque: true });
    expect(keys).toContain("estoque");
    expect(keys).toContain("estoque:itens");      // leitura migra
    expect(keys).not.toContain("estoque:cadastrar");
    expect(keys).not.toContain("estoque:ajustar");
  });

  it("ligar só uma das duas não liga a outra", () => {
    const soCadastro = chavesDasAreas({ "estoque:cadastrar": true });
    expect(soCadastro).toContain("estoque:cadastrar");
    expect(soCadastro).toContain("estoque:itens");   // veio por implicação
    expect(soCadastro).not.toContain("estoque:ajustar");

    const soAjuste = chavesDasAreas({ "estoque:ajustar": true });
    expect(soAjuste).toContain("estoque:ajustar");
    expect(soAjuste).toContain("estoque:itens");
    expect(soAjuste).not.toContain("estoque:cadastrar");
  });

  it("ver o catálogo não dá nenhum dos dois poderes", () => {
    const keys = chavesDasAreas({ "estoque:itens": true });
    expect(keys).toContain("estoque:itens");
    expect(keys).not.toContain("estoque:cadastrar");
    expect(keys).not.toContain("estoque:ajustar");
  });

  // ── As rotas de escrita ────────────────────────────────────────────────────
  // O teste lê o arquivo porque o que interessa é o gate ESCRITO nele. Uma
  // rota que volte a citar `estoque:itens` na escrita derruba a separação sem
  // erro de tipo e sem teste de unidade nenhum reclamar.
  it("nenhuma rota de escrita do catálogo gateia mais por estoque:itens", () => {
    const porArquivo: Record<string, string> = {
      "app/api/estoque-itens/route.ts": "estoque:cadastrar",
      "app/api/estoque-itens/classificar/route.ts": "estoque:cadastrar",
      "app/api/estoque/importar/route.ts": "estoque:cadastrar",
      "app/api/ficha-tecnica/route.ts": "estoque:cadastrar",
      "app/api/estoque/route.ts": "estoque:ajustar",
      "app/api/estoque/unidades/route.ts": "estoque:ajustar",
      "app/api/estoque/unidades/preparar/route.ts": "estoque:ajustar",
      "app/api/estoque/reabastecer/route.ts": "estoque:ajustar",
    };
    for (const [arquivo, esperado] of Object.entries(porArquivo)) {
      const src = ler(arquivo);
      const usaHelper = esperado === "estoque:cadastrar"
        ? /podeCadastrarEstoque|poderesDoEstoque/.test(src)
        : /podeAjustarEstoque|poderes\.ajustar/.test(src);
      // Ou cita a chave direto, ou passa pelo helper de lib/estoque-permissoes.
      expect(src.includes(esperado) || usaHelper, `${arquivo} deveria gatear por ${esperado}`).toBe(true);
      // E não pode ter voltado a checar a chave de leitura pra escrever.
      expect(/includes\("estoque:itens"\)|papelOuChave\([^)]*"estoque:itens"\)/.test(src),
        `${arquivo} ainda gateia escrita por estoque:itens`).toBe(false);
    }
  });

  it("bipar continua sendo a baixa por código, separado de ajustar", () => {
    const src = ler("app/api/estoque/unidades/route.ts");
    // PATCH (baixa) segue em `bipar`; POST (gerar unidade) foi pra `ajustar`.
    expect(src).toContain('keys.includes("estoque:bipar")');
    expect(src).toContain('keys.includes("estoque:ajustar")');
  });

  // Conferir, imprimir etiqueta e produção do dia FICARAM em `estoque:itens`,
  // de propósito: aprovar conferência lança estoque mas a quantidade vem do
  // banco (o gerente só diz certo ou errado), e papel impresso não mexe em
  // saldo. Exigir chave nova pararia a aba Conferir do galpão no dia seguinte.
  it("conferir e imprimir etiqueta continuam em estoque:itens", () => {
    expect(ler("app/api/estoque/conferencias/route.ts")).toContain('const CHAVE = "estoque:itens"');
    expect(ler("app/api/estoque/etiquetas/route.ts")).toContain('"estoque:itens"');
    expect(ler("app/api/estoque/producao-dia/route.ts")).toContain('const CHAVE = "estoque:itens"');
  });
});
