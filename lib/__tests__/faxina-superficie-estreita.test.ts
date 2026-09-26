import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * /api/fotos-faxina é a ÚNICA rota do sistema aberta a qualquer pessoa logada,
 * sem exigir área nenhuma. O que segura essa abertura não é permissão: é a
 * superfície ser estreita — ela grava três colunas e mais nada.
 *
 * Isso é exatamente o tipo de garantia que se perde num commit distraído: dá
 * uma linha só ("já que estou aqui, deixa a pessoa corrigir a unidade também")
 * e vira, sem ninguém notar, a porta pra qualquer colaborador reescrever custo,
 * mínimo e saldo do catálogo inteiro. Documentação não segura isso; teste sim.
 *
 * O que este arquivo trava é o CONJUNTO de colunas escritas, não o texto do
 * código: mexer na rota é livre, acrescentar coluna nova é que precisa passar
 * por aqui — e por quem estiver lendo o diff.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ROTA = join(RAIZ, "app", "api", "fotos-faxina", "route.ts");

/** O que a ferramenta de faxina pode mudar. Acrescentar aqui é decisão de
 *  segurança, não de conveniência. */
const PERMITIDAS = new Set([
  "imagem_url",   // a foto (e ela tem que ser URL do nosso bucket)
  "local_id",     // onde a coisa está — aponta pra estoque_locais
  "observacoes",  // a nota em texto livre
  "updated_at",   // carimbo, não conteúdo
]);

let fonte = "";
beforeAll(() => { fonte = readFileSync(ROTA, "utf8"); });

describe("a rota aberta grava três colunas e mais nada", () => {
  it("o patch do item só monta colunas permitidas", () => {
    const chaves = [...fonte.matchAll(/\bpatch\.(\w+)\s*=/g)].map((m) => m[1]);
    expect(chaves.length, "o patch precisa existir — se sumiu, este teste está medindo o nada").toBeGreaterThan(0);
    expect([...new Set(chaves)].filter((c) => !PERMITIDAS.has(c))).toEqual([]);
  });

  it("nenhum update escreve um objeto literal com coluna de fora", () => {
    // `.update({ ... })` inline (o do mercadinho) — o do estoque passa `patch`,
    // já coberto acima.
    for (const [, corpo] of fonte.matchAll(/\.update\(\{([^}]*)\}\)/g)) {
      const chaves = [...corpo.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
      expect(chaves.filter((c) => !PERMITIDAS.has(c))).toEqual([]);
    }
  });

  it("só escreve nas tabelas da faxina — nada de preço, saldo ou etiqueta", () => {
    const tabelas = [...fonte.matchAll(/\.from\("(\w+)"\)/g)].map((m) => m[1]);
    // `estoque_locais` entra porque o mutirão CRIA lugar (é o objetivo);
    // `estoque_faxina_log` e `auditoria` são registro, não catálogo.
    expect([...new Set(tabelas)].sort()).toEqual(
      ["auditoria", "estoque_faxina_log", "estoque_itens", "estoque_locais", "produtos"],
    );
  });

  // A abertura é "qualquer pessoa DA EQUIPE", e quem confere isso é o
  // `getProfile` — o único que olha `profiles.active`. Com `getAuthedUser` (só
  // "existe sessão") quem foi desligado continuava reescrevendo a localização
  // do galpão, e o rastro saía como "alguém", porque o `registrarNaFaxina` lê
  // `getProfile` e recebia null. Numa rota COM área isso nunca aparece: o gate
  // de área derruba o inativo antes. Nesta, que é a única sem área nenhuma, o
  // gate É este.
  it("o gate confere que a pessoa ainda está ativa, não só que tem sessão", () => {
    // A CHAMADA, não a menção: o comentário do arquivo cita `getAuthedUser`
    // justamente pra explicar por que ele não serve aqui.
    expect(fonte, "getAuthedUser não confere profiles.active — use getProfile").not.toMatch(/getAuthedUser\s*\(/);
    const gates = [...fonte.matchAll(
      /export async function (GET|POST|PATCH|PUT|DELETE)\s*\([^)]*\)\s*\{([\s\S]{0,200})/g)];
    expect(gates.map((g) => g[1]), "os métodos exportados precisam existir").toEqual(["GET", "PATCH"]);
    for (const [, nome, corpo] of gates) {
      expect(corpo, `${nome} tem que barrar quem não tem perfil ativo na primeira linha`)
        .toMatch(/await getProfile\(\)[\s\S]{0,80}401/);
    }
  });

  it("não usa select(*) — a rota devolve só o que a tela desenha", () => {
    // Com o ponto: o arquivo CITA `select("*")` no comentário que explica por
    // que ele não usa isso, e a citação não pode reprovar o teste.
    expect(fonte).not.toMatch(/\.select\(\s*["'`]\*/);
  });

  it("toda listagem tem limite", () => {
    const selects = [...fonte.matchAll(/\.select\([^)]*\)((?:\s*\.\w+\([^)]*\))*)/g)];
    const semLimite = selects.filter(([, encadeado]) =>
      !/\.limit\(/.test(encadeado) && !/\.(single|maybeSingle)\(/.test(encadeado));
    expect(semLimite.map((s) => s[0].slice(0, 60))).toEqual([]);
  });
});
