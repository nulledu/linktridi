import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import nextConfig from "../../next.config";

/**
 * Trava do Permissions-Policy.
 *
 * Ago/2026 os cabeçalhos de segurança entraram com `camera=()` na crença de que
 * o ERP não usava câmera. `()` desliga o recurso até pra página do PRÓPRIO
 * site: o `getUserMedia` do leitor de código de barras passou a ser recusado
 * pelo navegador sem nem perguntar, e a tela dizia "você bloqueou a câmera"
 * pra quem nunca bloqueou nada — liberar nas permissões do site não resolvia.
 * A pergunta de localização do chat do funil (/f) morreu do mesmo jeito.
 *
 * A regra que isto segura, nos dois sentidos:
 * - recurso que o código USA fica `(self)` — ligado pro site, negado a iframe
 *   de terceiro;
 * - recurso que ninguém usa continua `()`.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

function varrer(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "__tests__") continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, out);
    else if (/\.tsx?$/.test(nome)) out.push(full);
  }
  return out;
}

const USA: Record<string, (codigo: string) => boolean> = {
  camera: (c) => /getUserMedia/.test(c) && /\bvideo\s*:/.test(c),
  microphone: (c) => (/getUserMedia/.test(c) && /\baudio\s*:\s*(true|\{)/.test(c)) || /\bMediaRecorder\b/.test(c),
  geolocation: (c) => /navigator\.geolocation/.test(c),
};

const arquivos = [...varrer(join(RAIZ, "app")), ...varrer(join(RAIZ, "lib"))];
const quemUsa: Record<string, string[]> = Object.fromEntries(Object.keys(USA).map((f) => [f, [] as string[]]));
for (const arq of arquivos) {
  const codigo = readFileSync(arq, "utf8");
  for (const [recurso, usa] of Object.entries(USA)) {
    if (usa(codigo)) quemUsa[recurso].push(relative(RAIZ, arq));
  }
}

async function politicas(): Promise<{ source: string; recursos: Map<string, string> }[]> {
  const regras = (await nextConfig.headers?.()) ?? [];
  const out: { source: string; recursos: Map<string, string> }[] = [];
  for (const regra of regras) {
    const pp = regra.headers.find((h) => h.key.toLowerCase() === "permissions-policy");
    if (!pp) continue;
    const recursos = new Map<string, string>();
    for (const parte of pp.value.split(",")) {
      const [nome, lista] = parte.trim().split("=");
      recursos.set(nome, lista);
    }
    out.push({ source: regra.source, recursos });
  }
  return out;
}

describe("Permissions-Policy × recursos que o código usa", () => {
  it("a varredura acha quem usa câmera e localização (senão ela não protege nada)", () => {
    expect(quemUsa.camera).toContain("app/(plataforma)/ui/LeitorCodigo.tsx");
    expect(quemUsa.geolocation).toContain("app/f/ChatRuntime.tsx");
  });

  it("o cabeçalho continua existindo em todas as regras de página", async () => {
    const regras = await politicas();
    expect(regras.length).toBeGreaterThanOrEqual(3);
  });

  it("recurso usado fica ligado só pro próprio site; recurso sem uso fica desligado", async () => {
    const erros: string[] = [];
    for (const { source, recursos } of await politicas()) {
      for (const [recurso, lista] of recursos) {
        const usos = quemUsa[recurso] ?? [];
        if (usos.length && lista !== "(self)") {
          erros.push(`${source}: ${recurso}=${lista}, mas ${usos.join(", ")} usa — tem de ser (self)`);
        }
        if (!usos.length && lista !== "()") {
          erros.push(`${source}: ${recurso}=${lista} sem ninguém usar — deixe ()`);
        }
      }
    }
    expect(erros).toEqual([]);
  });
});
