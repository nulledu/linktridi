import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ── O que roda em aparelho velho não pode depender de recharts ──────────────
 *
 * O `browserslist` deste repositório mira `Chrome >= 51` / `Android >= 5`, e o
 * comentário dele no `package.json` diz por quê: "alvo legado p/ o WebView
 * antigo do tablet (Android 7, Chrome ~51)". Isso não é conservadorismo — é o
 * aparelho que está no galpão.
 *
 * O `recharts` (que chegou junto com o kit `ui/monocharts`) usa
 * `ResizeObserver` em `RechartsWrapper`, por onde TODO gráfico dele passa.
 * `ResizeObserver` só existe a partir do Chrome 64, e o pre-paint (`lib/preload.ts`) polyfilla
 * apenas `globalThis`. Num Chrome 51 o wrapper lança, e a tela inteira morre —
 * não o gráfico, a TELA.
 *
 * Hoje isso está certo por acidente: as dez telas com recharts são todas do ERP
 * web, atrás de login, em navegador de mesa. Nada impede alguém de importar o
 * kit num widget de painel amanhã.
 *
 * As rotas protegidas aqui, e por que cada uma:
 *  · `app/painel`  — a parede de TV. Roda em Android TV / caixinha barata, sem
 *    ninguém olhando de perto. Uma tela preta ali pode passar dias despercebida.
 *  · `app/app`     — o tablet de atividades do galpão. É O aparelho que o
 *    browserslist descreve.
 *  · `app/f`, `app/p` — o player e a página publicada, que rodam DENTRO do
 *    anúncio, no celular de quem clicou. É a superfície de compatibilidade mais
 *    larga do produto inteiro, e a que menos se controla.
 *
 * A saída, quando alguém precisar de gráfico numa dessas: o kit à mão em
 * `app/(plataforma)/ui/graficos.tsx`, que é SVG puro e não depende de API
 * moderna nenhuma.
 */
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/** Pastas que servem aparelho antigo ou incontrolável. */
const ROTAS_DE_APARELHO = ["app/painel", "app/app", "app/f", "app/p"];

/** O que não pode entrar nelas. */
const PROIBIDO = /from\s+["'][^"']*(recharts|ui\/monocharts)/;

function varrer(dir: string, saida: string[] = []): string[] {
  if (!existsSync(dir)) return saida;
  for (const nome of readdirSync(dir)) {
    if (["node_modules", ".next", "__tests__"].includes(nome) || nome.startsWith(".")) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, saida);
    else if (/\.tsx?$/.test(nome)) saida.push(full);
  }
  return saida;
}

describe("rota de aparelho antigo não importa recharts", () => {
  const arquivos = ROTAS_DE_APARELHO.flatMap((r) => varrer(join(RAIZ, r)));

  it("as pastas protegidas existem e têm código", () => {
    // Sem esta guarda, renomear `app/painel` faria a varredura ficar vazia e o
    // teste passaria para sempre sem olhar nada.
    expect(arquivos.length).toBeGreaterThan(20);
  });

  it("o browserslist ainda descreve o aparelho velho", () => {
    // Se um dia o alvo legado sair do `package.json`, esta trava perde o motivo
    // e deve ser reavaliada em vez de continuar valendo por inércia.
    const pkg = readFileSync(join(RAIZ, "package.json"), "utf8");
    expect(pkg).toMatch(/Chrome >= 51/);
  });

  it("nenhuma delas puxa recharts nem o kit que depende dele", () => {
    const ruins: string[] = [];
    for (const f of arquivos) {
      const texto = readFileSync(f, "utf8");
      for (const [i, linha] of texto.split("\n").entries()) {
        if (PROIBIDO.test(linha)) ruins.push(`${relative(RAIZ, f)}:${i + 1}  ${linha.trim().slice(0, 70)}`);
      }
    }
    expect(
      ruins,
      "`recharts` usa `ResizeObserver` (Chrome 64+) em `RechartsWrapper`, por onde " +
        "todo gráfico dele passa — e o alvo desta rota é Chrome ~51. A tela não " +
        "perde o gráfico: ela MORRE. Use o kit SVG à mão de " +
        "`app/(plataforma)/ui/graficos.tsx`, que não depende de API moderna.",
    ).toEqual([]);
  });
});
