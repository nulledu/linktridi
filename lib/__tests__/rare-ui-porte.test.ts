import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Trava do porte rare-ui. O commando pedido era `npx shadcn add
// swamimalode07/rare-ui/*`, que traria shadcn + Tailwind + `motion` + hex de
// tema cravado + `lucide`/emoji — tudo o que o projeto não usa. Portamos à mão;
// este teste é o que impede a próxima edição de reintroduzir a dependência
// estrangeira por baixo do pano. Regra viva em CLAUDE.md, não neste texto.
const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

const bloco = ler("app/(plataforma)/ui/BlocoDeCodigo.tsx");
const controles = ler("app/(plataforma)/ui/controles.tsx");
const css = ler("app/globals.css");

describe("porte rare-ui fiel ao idioma do projeto", () => {
  it("BlocoDeCodigo não arrasta Tailwind/motion/cn nem cor em hex", () => {
    expect(bloco).not.toMatch(/from ["']motion/);
    expect(bloco).not.toMatch(/lucide-react/);
    expect(bloco).not.toMatch(/@\/lib\/utils/);
    expect(bloco).not.toMatch(/\bcn\(/);
    // cor de token é `var(--cod-*)`, nunca hex — se aparecer #hex, alguém colou o exemplo
    expect(bloco).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    // o realçador escolhido (dependência que o usuário aprovou) e o copiar do kit
    expect(bloco).toMatch(/prism-react-renderer/);
    expect(bloco).toContain("BotaoCopiar");
  });

  it("BotãoApagar e CampoOTP existem, usam Icon (Tabler) e não importam motion", () => {
    expect(controles).not.toMatch(/from ["']motion/);
    expect(controles).toContain("export function BotaoApagar");
    expect(controles).toContain("export function CampoOTP");
    for (const nome of ["trash", "check", "x"]) {
      expect(controles).toContain(`name="${nome}"`);
    }
  });

  it("cores de código existem nos DOIS temas (escuro base + html.light)", () => {
    expect(css).toContain("--cod-fg:");
    // o bloco claro sobrescreve as mesmas chaves
    const iClaro = css.indexOf("html.light {\n  --cod-bg");
    expect(iClaro).toBeGreaterThan(-1);
    const claro = css.slice(iClaro, iClaro + 400);
    for (const v of ["--cod-bg", "--cod-keyword", "--cod-string"]) {
      expect(claro).toContain(`${v}:`);
    }
  });

  it("código rola DENTRO do bloco e o toque chega a 44px", () => {
    // o rolador é o <pre>, não a página
    expect(css).toMatch(/\.ui-cod-pre\s*\{[^}]*overflow-x:\s*auto/s);
    // no toque as ações do apagar vão a var(--tap)
    expect(css).toMatch(/@media \(pointer: coarse\)[^{]*\{[^}]*var\(--tap\)/s);
    // OTP encolhe pra caber (flex:1 1 0 + teto), sem largura fixa que estoure 320
    expect(css).toMatch(/\.ui-otp-slot\s*\{[^}]*flex:\s*1 1 0/s);
  });
});
