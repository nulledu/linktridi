import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { compactarImagem, trocarExtensao, LADO_MAXIMO } from "@/lib/armazenamento/compactar";

// Regra do dono (24/09/2026): toda imagem entra COMPACTADA, antes de gravar.
// Duas travas: a função faz o que promete, e nenhum gravador do servidor
// escreve no storage sem passar por ela.

describe("compactarImagem", () => {
  it("PNG grande vira WebP de até 1600px, e a extensão acompanha", async () => {
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#7c3aed" } })
      .composite([{ input: Buffer.from(`<svg width="3000" height="2000"><text x="50" y="500" font-size="300">Tridi</text></svg>`) }])
      .png().toBuffer();
    const r = await compactarImagem(png, "image/png", "tridiflow/tutoriais/x.png");
    expect(r.mime).toBe("image/webp");
    expect(r.caminho).toBe("tridiflow/tutoriais/x.webp");
    const meta = await sharp(r.corpo as Buffer).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(LADO_MAXIMO);
    expect((r.corpo as Buffer).length).toBeLessThan(png.length);
  });

  it("PDF, GIF e SVG passam intocados", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    for (const mime of ["application/pdf", "image/gif", "image/svg+xml"]) {
      const r = await compactarImagem(bytes, mime, "a/b.bin");
      expect(r.corpo).toBe(bytes);
      expect(r.caminho).toBe("a/b.bin");
    }
  });

  it("arquivo que o sharp não lê segue como veio (não perde o envio)", async () => {
    const lixo = new Uint8Array([0, 1, 2, 3, 4]);
    const r = await compactarImagem(lixo, "image/jpeg", "x.jpg");
    expect(r.corpo).toBe(lixo);
    expect(r.mime).toBe("image/jpeg");
  });

  it("trocarExtensao só mexe no nome do arquivo", () => {
    expect(trocarExtensao("a.b/c", "webp")).toBe("a.b/c.webp");
    expect(trocarExtensao("a/c.PNG", "webp")).toBe("a/c.webp");
  });
});

describe("nenhum gravador pula a compactação", () => {
  const raiz = path.resolve(__dirname, "../..");
  const arquivos: string[] = [];
  const varrer = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) varrer(p);
      else if (/\.(ts|tsx)$/.test(e.name)) arquivos.push(p);
    }
  };
  varrer(path.join(raiz, "app")); varrer(path.join(raiz, "lib"));

  // Quem grava IMAGEM direto no Supabase Storage (fora de guardarPublico/
  // enviarPrivado) precisa chamar compactarImagem no mesmo arquivo.
  const EXCECOES: Record<string, string> = {
    "lib/armazenamento/publico.ts": "é a própria porta — compacta dentro de guardarPublico",
  };

  it("todo `.storage.from(...).upload(` convive com compactarImagem", () => {
    const soltos = arquivos
      .map((p) => path.relative(raiz, p))
      .filter((rel) => !EXCECOES[rel])
      .filter((rel) => {
        const s = fs.readFileSync(path.join(raiz, rel), "utf8");
        return /\.upload\(/.test(s) && /storage/.test(s) && !/compactarImagem/.test(s);
      });
    expect(soltos, "gravador de storage sem compactarImagem").toEqual([]);
  });

  it("as duas portas do servidor compactam", () => {
    for (const rel of ["lib/armazenamento/publico.ts", "lib/armazenamento/privado.ts"]) {
      expect(fs.readFileSync(path.join(raiz, rel), "utf8")).toMatch(/await compactarImagem\(/);
    }
  });

  it("os dois envios diretos do navegador comprimem antes do PUT", () => {
    expect(fs.readFileSync(path.join(raiz, "app/(plataforma)/ui/enviarArquivo.ts"), "utf8")).toMatch(/comprimirImagem\(file\)/);
    expect(fs.readFileSync(path.join(raiz, "app/(plataforma)/ui/midia.ts"), "utf8")).toMatch(/f = await comprimirImagem\(f\)/);
  });
});
