import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// gedux.com.br é um servidor dedicado que roda o app SEM segredo nenhum: ele
// não fala com o Supabase, pergunta ao Gaius (PLAYER_API_BASE). O player de
// fluxo (/f) já era assim; a página (/p) não era — e por isso a Central de
// Tutoriais publicada naquele domínio respondia "Este link não está
// disponível". Não era a página faltando: era o banco faltando.
//
// Qualquer `import` do banco de volta nessas rotas reabre exatamente esse
// buraco, e o sintoma aparece só no servidor dedicado — nunca na Vercel, nunca
// no `npm run dev`.
const rotasPublicas = [
  "app/p/[slug]/page.tsx",
  "app/p/[slug]/[tutorial]/page.tsx",
];

describe("páginas públicas no servidor sem banco", () => {
  it("resolvem pelo player-remoto, não pelo banco direto", () => {
    for (const caminho of rotasPublicas) {
      const fonte = readFileSync(caminho, "utf8");
      expect(fonte, caminho).toContain('from "@/lib/player-remoto"');
      expect(fonte, caminho).not.toContain("getPaginaPublicada");
      expect(fonte, caminho).not.toContain("buscarProdutosTutoriais");
    }
  });

  it("o Gaius expõe as duas rotas que o servidor dedicado consome", () => {
    const pagina = readFileSync("app/api/f/pagina/route.ts", "utf8");
    const produtos = readFileSync("app/api/f/tutorial-produtos/route.ts", "utf8");
    expect(pagina).toContain("getPaginaPublicada");
    expect(produtos).toContain("buscarProdutosTutoriais");
    // Só o que a página já mostra a qualquer visitante — nada de segredo.
    expect(pagina).toContain("PÚBLICO");
  });

  it("o modo remoto tem prazo — Gaius lento não pode pendurar o visitante", () => {
    const remoto = readFileSync("lib/player-remoto.ts", "utf8");
    const trecho = remoto.slice(remoto.indexOf("resolverPaginaPublicada"));
    expect(trecho).toMatch(/AbortSignal\.timeout\(\d+\)/);
  });
});
