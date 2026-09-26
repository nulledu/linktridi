import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../../next.config";
import { DOMINIO_PADRAO, linkPublico } from "../tridiflow-db";

// ── Funil no ar mora no gedux (VPS), nunca no endereço do Gaius ──────────────
// Pedido do dono (14/09/2026): "/f/<slug> no tridigaius.vercel.app não deveria
// existir, deveria ir pra gedux". Dois motivos: cada visita de anúncio no Gaius
// era uma invocação da Vercel (o Hobby já caiu por isso), e o funil tem que
// continuar no ar quando o Gaius cai.
//
// Três portas, três travas: o redirect da Vercel (link antigo), o domínio
// padrão do servidor (link que o sistema gera) e o dos editores (link que a
// pessoa copia).

describe("funil mora no gedux", () => {
  it("o domínio padrão é o gedux", () => {
    expect(DOMINIO_PADRAO).toBe("gedux.com.br");
    expect(linkPublico({ tipo: "flow", slug: "chancela" })).toBe("https://gedux.com.br/f/chancela");
  });

  it("/f/ aberto na Vercel redireciona pro gedux, sem pegar /api/f", async () => {
    const regras = (await nextConfig.redirects?.()) ?? [];
    const f = regras.find((r) => r.source === "/f/:caminho*");
    expect(f).toBeDefined();
    expect(f!.destination).toBe("https://gedux.com.br/f/:caminho*");
    expect(f!.has?.[0]).toMatchObject({ type: "host" });
    // Só no host da Vercel: no próprio gedux (mesmo app) viraria laço infinito.
    expect(new RegExp(`^${(f!.has![0] as { value: string }).value}$`).test("tridigaius.vercel.app")).toBe(true);
    expect(new RegExp(`^${(f!.has![0] as { value: string }).value}$`).test("gedux.com.br")).toBe(false);
    // O gedux busca o bot e grava sessão por /api/f — redirecionar ali mata o funil.
    expect(regras.some((r) => r.source.startsWith("/api/"))).toBe(false);
  });

  it("nenhum editor do TridiFlow volta a oferecer o endereço da Vercel", () => {
    const raiz = join(__dirname, "../../app/(plataforma)/tridiflow");
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) { if (nome !== "__tests__") varrer(p); continue; }
        if (!/\.tsx?$/.test(nome)) continue;
        if (/DOMINIO_PADRAO\s*=\s*"tridigaius\.vercel\.app"/.test(readFileSync(p, "utf8"))) achados.push(p);
      }
    };
    varrer(raiz);
    expect(achados).toEqual([]);
  });
});
