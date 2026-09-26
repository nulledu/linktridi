import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ── Espaço entre uma feature e a seguinte ───────────────────────────────────
 *
 * Medido antes de escrever esta trava: 2939 `gap` numéricos no JSX, em 27
 * valores distintos. A maior parte é micro-espaço legítimo — o vão entre um
 * ícone e seu rótulo não tem por que ser o vão entre dois cartões.
 *
 * O que NÃO é legítimo é a mesma folga sair de dois lugares ao mesmo tempo.
 * `.page-head` já carrega `margin-bottom: 24px` (12 no celular, 8 no miúdo).
 * Quando o irmão seguinte também declara `marginTop`, os dois SOMAM: quatro
 * telas estavam com 46px e 42px onde o resto do app usa 24 — e ninguém decidiu
 * isso, foi cada arquivo resolvendo sozinho o mesmo problema.
 *
 * Margem que soma é invisível na revisão de código (as duas linhas estão em
 * arquivos diferentes) e invisível no teste de tela (nada quebra, só respira
 * errado). Por isso vira trava.
 *
 * Escopo estreito de propósito: só o vizinho IMEDIATO do cabeçalho de página.
 * Ampliar para "todo filho de container com gap" acusaria centenas de casos
 * legítimos e a trava seria desligada na primeira semana.
 */
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

function varrer(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (["node_modules", ".next", "__tests__"].includes(nome) || nome.startsWith(".")) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, saida);
    else if (nome.endsWith(".tsx")) saida.push(full);
  }
  return saida;
}

describe("o espaço entre seções não é declarado duas vezes", () => {
  const arquivos = varrer(join(RAIZ, "app")).map((f) => ({
    caminho: relative(RAIZ, f),
    linhas: readFileSync(f, "utf8").split("\n"),
  }));

  it("varre uma quantidade plausível de telas", () => {
    // Sem esta guarda, um `readdirSync` que errasse o caminho passaria com zero
    // achados e a trava viraria enfeite verde.
    expect(arquivos.length).toBeGreaterThan(300);
  });

  it("nenhum vizinho do cabeçalho soma margem com ele", () => {
    const ruins: string[] = [];
    for (const { caminho, linhas } of arquivos) {
      for (let i = 0; i < linhas.length; i++) {
        if (!/<PageHead|className="page-head"/.test(linhas[i])) continue;

        // Anda até fechar a tag do cabeçalho.
        let j = i;
        for (; j < Math.min(linhas.length, i + 14); j++) {
          if (/\/>|<\/PageHead>/.test(linhas[j])) { j++; break; }
        }
        // E olha só o irmão IMEDIATO.
        for (let k = j; k < Math.min(linhas.length, j + 4); k++) {
          if (/<PageHead/.test(linhas[k])) break;
          const m = /marginTop: (\d+)/.exec(linhas[k]);
          if (!m) continue;
          ruins.push(
            `${caminho}:${k + 1}  page-head(24) + marginTop(${m[1]}) = ${24 + Number(m[1])}px ` +
            `— o ritmo da tela é 24`,
          );
          break;
        }
      }
    }
    expect(
      ruins,
      "O `.page-head` já entrega a folga abaixo dele (24px / 12 no celular / 8 no " +
        "miúdo). Um `marginTop` no vizinho SOMA e a seção nasce com quase o dobro " +
        "do respiro do resto do app. Tire o `marginTop`. Se o cabeçalho for " +
        "CONDICIONAL naquela tela, condicione a margem junto " +
        "(`marginTop: title ? 0 : 22`) — sem cabeçalho não há o que somar.",
    ).toEqual([]);
  });
});
