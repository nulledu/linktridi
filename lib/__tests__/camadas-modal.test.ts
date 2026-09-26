import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Modal aberto de dentro de um painel lateral ──────────────────────────────
// O painel lateral (`PainelLateral`) mora em `--z-scrim: 1200` / `--z-sheet: 1201`.
// Todo modal escrito com `zIndex: 400` ou `zIndex: 1000` na mão nasce ATRÁS dele:
// o conteúdo some e o toque acerta o véu — que FECHA o painel. Foi assim que
// justificar falta e lançar batida ficaram impossíveis pelo drawer da pessoa:
// os dois pop-ups existiam, só nasciam por baixo.
//
// A camada certa é `--z-modal` (1300): passa do painel e continua abaixo do
// dropdown (`--z-pop`, 1400), pra que o `select` dentro do modal não nasça atrás
// do próprio modal.
const raiz = join(__dirname, "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

// Arquivos cujos modais são abertos com um painel lateral já na tela.
const SOBRE_PAINEL = [
  "app/(plataforma)/meu-ponto/MeuPontoClient.tsx",
  "app/(plataforma)/administracao/PontoPanel.tsx",
];

// O erro simétrico: modal ACIMA do dropdown. O painel do `GlassSelect` (e do
// `PeriodPicker`) vai pro <body> por portal em `--z-pop` (1400); um véu com
// `zIndex: 5000` escrito na mão nasce por cima dele — a lista abre invisível
// atrás do véu e o clique na opção acerta o véu, que FECHA o modal. Era o "não
// consigo trocar o domínio" do Publicação & Embed do TridiFlow.
const COM_SELECT_DENTRO = [
  "app/(plataforma)/tridiflow/[id]/PublicarModal.tsx",
  "app/(plataforma)/tridiflow/p/[id]/PublicarPaginaModal.tsx",
];

const Z_SHEET = 1201;

describe("camadas: modal por cima do painel lateral", () => {
  it("--z-modal existe e fica entre a folha e o dropdown", () => {
    const css = ler("app/globals.css");
    const num = (nome: string) => Number(new RegExp(`--${nome}:\\s*(\\d+)`).exec(css)?.[1]);
    expect(num("z-modal")).toBeGreaterThan(num("z-sheet"));
    expect(num("z-modal")).toBeLessThan(num("z-pop"));
  });

  for (const arquivo of SOBRE_PAINEL) {
    it(`${arquivo} não tem modal abaixo do painel`, () => {
      // Só o que é `position: "fixed"` disputa camada com o painel. Dropdown
      // `absolute` dentro do próprio modal empilha na caixa dele, não na tela —
      // flagrar aquele `zIndex: 10` seria falso positivo.
      const baixos = ler(arquivo)
        .split("\n")
        .filter((l) => /position:\s*"fixed"/.test(l))
        .flatMap((l) => [...l.matchAll(/zIndex:\s*(\d+)/g)].map((m) => Number(m[1])))
        .filter((z) => z <= Z_SHEET);
      // A mensagem importa: quem quebrar isto precisa saber QUAL é a camada certa.
      expect(baixos, `use zIndex: "var(--z-modal, 1300)" — ${baixos.join(", ")} nasce(m) atrás do painel lateral`).toEqual([]);
    });
  }

  for (const arquivo of COM_SELECT_DENTRO) {
    it(`${arquivo} não tem véu por cima do dropdown`, () => {
      const css = ler("app/globals.css");
      const zPop = Number(/--z-pop:\s*(\d+)/.exec(css)?.[1]);
      const altos = ler(arquivo)
        .split("\n")
        .filter((l) => /position:\s*"fixed"/.test(l))
        .flatMap((l) => [...l.matchAll(/zIndex:\s*(\d+)/g)].map((m) => Number(m[1])))
        .filter((z) => z >= zPop);
      expect(altos, `use zIndex: "var(--z-modal, 1300)" — ${altos.join(", ")} cobre o painel do GlassSelect (--z-pop ${zPop})`).toEqual([]);
    });
  }
});
