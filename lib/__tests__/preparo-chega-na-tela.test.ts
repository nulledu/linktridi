import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * O servidor MANDA o `preparo` e o `podePreparar` — senão o resto não existe.
 *
 * Este é o defeito que custou o dia: a regra estava certa em `estadoDeEtiqueta`,
 * a gravação estava certa em `registrarConferencia`, a tela sabia desenhar as
 * três frases e o gesto de preparo… e nada aparecia, porque a rota que LISTA as
 * pendentes não mandava o campo. A tela caía no fallback conservador — não
 * prometia etiqueta e escondia o botão — e quem tinha permissão de ligar a
 * etiqueta nunca via como fazer isso.
 *
 * É um modo de falha que teste de unidade não pega: cada peça passa sozinha, e o
 * que falta é o fio entre elas. Por isso a trava é sobre o CÓDIGO das rotas.
 *
 * Se um dia estas rotas ganharem teste de integração de verdade, este arquivo
 * pode morrer — ele existe porque hoje não há.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

const PENDENTES = ler("app", "api", "estoque", "conferencias", "pendentes", "route.ts");
const DESTINOS = ler("app", "api", "estoque", "conferencias", "destinos", "route.ts");
const FILA = ler("lib", "estoque-fila-conferencia.ts");
const SUGESTAO = ler("lib", "estoque-sugestao-item.ts");

describe("o preparo chega na tela", () => {
  it("a rota das pendentes calcula o estado com a MESMA régua da gravação", () => {
    expect(PENDENTES).toContain('from "@/lib/estoque-etiquetavel"');
    expect(PENDENTES).toMatch(/preparo:/);
    // Não vale recalcular à mão: duas réguas divergem, e a tela prometeria uma
    // coisa enquanto a gravação faria outra.
    expect(PENDENTES).toMatch(/estadoDeEtiqueta\(/);
  });

  it("a rota das pendentes diz se QUEM está olhando pode preparar", () => {
    // Sem isto o botão nunca aparece — foi literalmente o buraco.
    expect(PENDENTES).toMatch(/podePreparar:\s*await podeAjustarEstoque\(me\)/);
  });

  it("a busca de destino também traz o preparo do item escolhido", () => {
    // O destino da busca é o caminho de quem escolhe o item na mão, que é
    // justamente quando a promessa muda sem a atividade mudar.
    expect(DESTINOS).toContain('from "@/lib/estoque-etiquetavel"');
    expect(DESTINOS).toMatch(/preparo:/);
  });

  it("as três consultas pedem quantidade e unidade — a régua precisa das duas", () => {
    // `estadoDeEtiqueta` separa "converter agora" (saldo 0) de "precisa preparo"
    // (pilha antiga) e de "nunca etiqueta" (medido em quilo). Sem estas duas
    // colunas ela responderia sempre a mesma coisa.
    for (const [nome, fonte] of [["pendentes (catálogo)", PENDENTES], ["destinos", DESTINOS], ["itensPorNome", FILA]] as const) {
      const selects = fonte.match(/\.select\("[^"]*serializado[^"]*"\)/g) ?? [];
      expect(selects.length, `${nome}: nenhum select com serializado`).toBeGreaterThan(0);
      for (const s of selects) {
        expect(s, `${nome}: ${s} sem quantidade`).toContain("quantidade");
        expect(s, `${nome}: ${s} sem unidade`).toContain("unidade");
      }
    }
  });

  it("a sugestão carrega saldo e unidade em vez de obrigar outra ida ao banco", () => {
    // São três sugestões por caixa e até 23 caixas por página: uma consulta por
    // sugestão seria 69 idas ao banco por abertura de tela.
    expect(SUGESTAO).toMatch(/quantidade:\s*Math\.max\(0,\s*Number\(item\.quantidade\)\s*\|\|\s*0\)/);
    expect(SUGESTAO).toMatch(/unidade:\s*item\.unidade\s*\?\?\s*null/);
  });

  it("nenhuma dessas consultas virou select(*) nem perdeu o limite", () => {
    for (const [nome, fonte] of [["pendentes", PENDENTES], ["destinos", DESTINOS], ["fila", FILA]] as const) {
      expect(fonte, `${nome} usa select("*")`).not.toMatch(/\.select\("\*"\)/);
    }
    // A busca de destino roda a cada tecla; sem teto ela devolve o catálogo.
    expect(DESTINOS).toMatch(/\.limit\(/);
  });
});
