import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * "Sem organização cadastrada" era um beco sem saída.
 *
 * O seletor de organização listava só quem tinha `natureza = 'empresa'`. Mas
 * `natureza` nasce `'pessoa'` por padrão e ninguém nunca troca: medido no
 * diretório de produção em 24/08/2026, as NOVE fichas existentes eram todas
 * empresas — Madeiranit, Packit, Molas ICO, Unitec — e todas gravadas como
 * pessoa. O seletor abria vazio, escrito "Sem organização cadastrada", num
 * diretório cheio de organizações.
 *
 * O beco: para uma empresa aparecer na lista, alguém teria que adivinhar que
 * existe um campo "Natureza" a corrigir em cada ficha, um por um. Nada na tela
 * dizia isso.
 *
 * A correção tem duas metades, e as duas são travadas aqui:
 *   1. a lista aceita QUALQUER ficha (as já marcadas primeiro);
 *   2. escolher alguém como organização é o que o marca como empresa — a
 *      natureza vira consequência do uso, não uma pergunta prévia.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const TELA = ler("app/(plataforma)/financeiro/cadastros/contatos/ContatosClient.tsx");
const PROMOVER = ler("lib/financeiro/promover-organizacao.ts");

describe("Organização — sem beco sem saída", () => {
  it("a lista NÃO é filtrada por natureza — era isso que a deixava vazia", () => {
    const memo = TELA.slice(TELA.indexOf("const empresasContato"), TELA.indexOf("const nomeDaEmpresa"));
    expect(memo).not.toContain('filter((parte) => parte.natureza === "empresa")');
  });

  it("quem já é empresa aparece primeiro, mas ninguém fica de fora", () => {
    const memo = TELA.slice(TELA.indexOf("const empresasContato"), TELA.indexOf("const nomeDaEmpresa"));
    expect(memo).toContain('natureza === "empresa"');   // só para ordenar
    expect(memo).toContain(".sort(");
  });

  it("a frase do beco não é mais RENDERIZADA", () => {
    // Só vale o que vira `<option>`; a frase continua no comentário que explica
    // por que ela existiu, e isso é para ficar.
    expect(TELA).not.toMatch(/<option[^>]*>Sem organização cadastrada</);
  });
});

describe("Organização — um campo, não dois", () => {
  it("“Organização em texto” não existe mais", () => {
    // Dois campos lado a lado obrigavam quem cadastra a entender que um vira
    // vínculo e o outro vira texto — detalhe de banco, não decisão de negócio.
    expect(TELA).not.toContain('label="Organização em texto"');
  });

  it("o campo único sugere as fichas existentes enquanto se digita", () => {
    expect(TELA).toContain('list="fin-organizacoes"');
    expect(TELA).toContain('<datalist id="fin-organizacoes">');
  });

  it("digitar o nome de uma ficha existente cria o vínculo", () => {
    const campo = TELA.slice(TELA.indexOf('label="Organização"'), TELA.indexOf('label="Cargo / função"'));
    expect(campo).toContain("organizacao_id: igual?.id ?? \"\"");
    // Sem diferenciar caixa: quem digita "packit" quer a Packit.
    expect(campo).toContain("toLocaleLowerCase");
  });

  it("o texto é guardado mesmo quando há vínculo", () => {
    // Se a ficha da organização for apagada, o nome não pode sumir junto.
    const campo = TELA.slice(TELA.indexOf('label="Organização"'), TELA.indexOf('label="Cargo / função"'));
    expect(campo).toContain("organizacao: escrito");
  });
});

describe("A natureza vira consequência do uso", () => {
  it("escolher alguém como organização o marca como empresa", () => {
    expect(PROMOVER).toContain('update({ natureza: "empresa" })');
  });

  it("a empresa entra na condição — não dá para marcar ficha de outra", () => {
    expect(PROMOVER).toContain('.eq("empresa_id", empresaId)');
  });

  it("nunca rebaixa: tirar o vínculo não desmarca a empresa", () => {
    expect(PROMOVER).not.toMatch(/natureza:\s*"pessoa"/);
  });

  it("falhar aqui não derruba um cadastro que deu certo", () => {
    // Banco sem a coluna ainda: o vínculo já foi gravado, que é o que importa.
    expect(PROMOVER).toMatch(/catch\s*\{/);
  });

  it("as duas rotas de salvar contato promovem", () => {
    for (const rota of ["app/api/financeiro/contatos/route.ts", "app/api/financeiro/contatos/[id]/route.ts"]) {
      expect(ler(rota), `${rota} não promove`).toContain("promoverAOrganizacao");
    }
  });
});

describe("A folha não abre com 26 campos", () => {
  it("site, endereço e observação ficam um nível abaixo", () => {
    const principal = TELA.slice(TELA.indexOf("<Campos>"), TELA.indexOf('titulo="Mais detalhes"'));
    expect(principal).not.toContain('label="Endereço"');
    expect(principal).not.toContain('label="Observações"');
  });

  it("os dados bancários do fornecedor também", () => {
    expect(TELA).toContain('titulo="Pagamento e dados fiscais"');
    const antes = TELA.slice(TELA.indexOf('icone="truck"'), TELA.indexOf('titulo="Pagamento e dados fiscais"'));
    // Em cima ficam só os quatro que decidem compra e compromisso.
    expect(antes).toContain('label="Prazo de pagamento (dias)"');
    expect(antes).not.toContain('label="Chave PIX"');
    expect(antes).not.toContain('label="Agência"');
  });

  it("recolhido abre sozinho quando já tem conteúdo — editar não vira caça", () => {
    expect(TELA).toContain("inicialAberta={!!(rascunho.site || rascunho.endereco || rascunho.observacao)}");
  });

  it("o nome vem antes da classificação", () => {
    // "Natureza" era o primeiro campo da folha: a pergunta mais abstrata
    // primeiro, antes até do nome.
    expect(TELA.indexOf('label="Nome"')).toBeLessThan(TELA.indexOf('label="Pessoa ou empresa?"'));
  });
});
