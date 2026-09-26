// ── O tablet e o servidor falam o MESMO vocabulário de conferência ───────────
//
// Por que este teste existe, em uma frase: três das sete chaves de defeito
// divergiam entre o app Kotlin e o servidor, e nada no caminho pegava isso.
//
// O que acontecia na prática: o gestor tocava "Peças sujas" no tablet, o app
// mandava `pecas_sujas`, o servidor validava com `defeitoValido()` de
// lib/estoque-qualidade.ts — que só conhece `peca_suja` — e devolvia 400
// `defeito_invalido`. A conferência INTEIRA voltava: o preenchimento todo
// (aprovadas, recusadas, nota, observação) se perdia e a tela dizia "um dos
// defeitos marcados saiu da lista do sistema". Como quatro das sete chaves
// batiam, a falha parecia intermitente — a mesma tela, na mesma caixa, gravava
// ou recusava dependendo de qual chip a pessoa tocasse.
//
// E por que passou por tudo: a coluna `defeitos` é `text[]` SEM `check`
// (supabase/estoque_conferencias.sql:40), então o banco não reclamaria nem se
// a tabela existisse. Os testes do Kotlin afirmavam a lista do Kotlin, os do
// TypeScript afirmavam a do TypeScript, e os dois passavam — cada lado
// conferindo consigo mesmo. Só a comparação ENTRE os dois pega, e é ela que
// mora aqui.
//
// Fica no `npm test` de propósito: é o portão que roda em todo commit deste
// repositório. O `./gradlew test` do app não roda aqui, então uma trava só do
// lado Kotlin não protegeria ninguém.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFEITOS, RESULTADOS, defeitoValido, resultadoValido } from "../estoque-qualidade";

const KOTLIN = join(
  __dirname,
  "../../estoque-app/app/src/main/java/com/tridi/estoque/conferencia/Conferencia.kt",
);

/**
 * Extrai as chaves de um `enum class X(val chave: String, ...)` do Kotlin.
 *
 * Lê só o corpo do enum pedido (do `{` até o `;` que fecha as entradas) e pega
 * o PRIMEIRO literal de cada entrada — que é `chave`, a que viaja no JSON. O
 * rótulo vem depois e é deliberadamente ignorado: ver o teste no fim.
 */
function chavesDoEnum(fonte: string, nome: string): string[] {
  const inicio = fonte.indexOf(`enum class ${nome}`);
  if (inicio < 0) throw new Error(`enum ${nome} não encontrado em Conferencia.kt`);
  const abre = fonte.indexOf("{", inicio);
  const fecha = fonte.indexOf(";", abre);
  if (abre < 0 || fecha < 0) throw new Error(`corpo do enum ${nome} não delimitado`);
  const corpo = fonte.slice(abre, fecha);
  return [...corpo.matchAll(/^\s*[A-Z][A-Z0-9_]*\("([^"]+)"/gm)].map((m) => m[1]);
}

describe("vocabulário de conferência: tablet ↔ servidor", () => {
  const fonte = readFileSync(KOTLIN, "utf-8");

  it("o parser realmente acha as entradas (senão o teste passaria vazio)", () => {
    // Sem isto, um `enum class` renomeado faria `chavesDoEnum` devolver [] e a
    // comparação viraria [] vs [] — verde sem verificar nada.
    expect(chavesDoEnum(fonte, "DefeitoConferencia").length).toBe(7);
  });

  it("as chaves de DEFEITO são idênticas, na mesma ordem", () => {
    // Ordem junto porque o app manda `chavesDeDefeito()` na ordem do catálogo e
    // a tela do ERP lista os chips na ordem de DEFEITOS: divergir aqui não
    // quebra a gravação, mas faz as duas telas nomearem o mesmo defeito em
    // posições diferentes, que é como a confusão começa.
    expect(chavesDoEnum(fonte, "DefeitoConferencia")).toEqual(DEFEITOS.map((d) => d.key));
  });

  // ── O RESULTADO (certo/errado) ─────────────────────────────────────────────
  //
  // O app migrou: `NotaConferencia` virou `ResultadoConferencia`, e a paridade
  // que estava prometida aqui em comentário passou a ser verificável. Ela vale
  // MAIS que a dos defeitos, e por um motivo mecânico: `defeitos` é `text[]`
  // sem `check`, mas `resultado` TEM `check (resultado in ('certo','errado'))`
  // em supabase/estoque_conferencias.sql. Divergir aqui não é um chip que some
  // do relatório — é o INSERT recusado pelo banco na cara de quem está de pé na
  // frente da caixa, com a conferência inteira perdida.
  //
  // O app tem a trava espelhada (ContratoDeChavesTest.kt), mas `./gradlew test`
  // NÃO roda no `npm test` — que é o portão de todo commit deste repositório.
  // Uma trava só do lado Kotlin não protege quem mexe no TypeScript, e é o
  // TypeScript que manda: é ele que valida na entrada e grava a coluna.

  it("o parser acha os resultados (senão a comparação seria vazia)", () => {
    expect(chavesDoEnum(fonte, "ResultadoConferencia").length).toBe(2);
  });

  it("as chaves de RESULTADO são idênticas, na mesma ordem", () => {
    expect(chavesDoEnum(fonte, "ResultadoConferencia")).toEqual(RESULTADOS.map((r) => r.key));
  });

  it("todo resultado do tablet passa no validador do servidor", () => {
    // Dito pelo lado que de fato recusa: `resultadoValido` é o que decide entre
    // gravar e devolver 400 `resultado_invalido`.
    for (const chave of chavesDoEnum(fonte, "ResultadoConferencia")) {
      expect(resultadoValido(chave), `"${chave}" seria recusado com 400 resultado_invalido`).toBe(true);
    }
  });

  it("a nota de 1 a 5 não sobreviveu em nenhum dos dois lados", () => {
    // O formato antigo mandava `nota: "mediano"`. Se qualquer um dos dois lados
    // ressuscitar uma das cinco, o `check` do banco recusa o INSERT — e o
    // sintoma (conferência que some ao confirmar) não aponta pra cá.
    const antigas = ["excelente", "bom", "mediano", "ruim", "pessimo"];
    for (const nota of antigas) {
      expect(chavesDoEnum(fonte, "ResultadoConferencia")).not.toContain(nota);
      expect(resultadoValido(nota)).toBe(false);
    }
  });

  it("todo defeito do tablet passa no validador do servidor", () => {
    // A mesma verdade dita pelo lado que de fato recusa a requisição: é
    // `defeitoValido` que decide se a conferência grava ou volta 400.
    for (const chave of chavesDoEnum(fonte, "DefeitoConferencia")) {
      expect(defeitoValido(chave), `"${chave}" seria recusado com 400 defeito_invalido`).toBe(true);
    }
  });
});

// Os RÓTULOS de propósito não são travados. O contrato é a chave — o rótulo é
// o que a pessoa lê, e as duas telas são lidas em distâncias diferentes (o
// tablet fica a um braço, no galpão). Se um dia o rótulo do tablet precisar
// encurtar, isso não pode quebrar o build; o que não pode mudar sozinho é a
// chave que viaja no JSON.
