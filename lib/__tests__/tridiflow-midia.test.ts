import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TETO_MIDIA_LT, caminhoMidiaLT, classificarMidiaLT } from "../tridiflow-midia";

const MB = 1024 * 1024;

// O bio link caiu por GIF de 9 MB: a página demorava a abrir e o host gratuito
// cortou o acesso. Estes testes são a trava do botão "Enviar" do editor.
describe("LinkTridi — mídia de cartão", () => {
  it("aceita foto, GIF e MP4/WebM dentro do teto", () => {
    expect(classificarMidiaLT("image/jpeg", 2 * MB)).toMatchObject({ ok: true, tipo: "imagem", ext: "jpg" });
    expect(classificarMidiaLT("image/webp", 200 * 1024)).toMatchObject({ ok: true, tipo: "imagem", ext: "webp" });
    expect(classificarMidiaLT("image/gif", 2 * MB)).toMatchObject({ ok: true, tipo: "gif", ext: "gif" });
    expect(classificarMidiaLT("video/mp4", 4 * MB)).toMatchObject({ ok: true, tipo: "video", ext: "mp4" });
    expect(classificarMidiaLT("video/webm", 4 * MB)).toMatchObject({ ok: true, tipo: "video", ext: "webm" });
  });

  it("o GIF de 9 MB que derrubou a página é recusado — e a mensagem manda pro MP4", () => {
    const r = classificarMidiaLT("image/gif", 9 * MB);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("9 MB");
    expect(r.erro).toContain("3 MB");
    expect(r.erro).toMatch(/MP4/);
  });

  it("toda recusa por tamanho diz o limite, o tamanho real e como resolver", () => {
    for (const [mime, teto] of [["image/png", TETO_MIDIA_LT.imagem], ["video/mp4", TETO_MIDIA_LT.video]] as const) {
      const r = classificarMidiaLT(mime, teto + MB);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.erro).toMatch(/limite de/);
      expect(r.erro.length).toBeGreaterThan(60);   // não é só "arquivo muito grande"
    }
  });

  it(".mov é recusado com o motivo (HEVC não toca no Chrome/Android)", () => {
    const r = classificarMidiaLT("video/quicktime", MB);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/MP4/);
  });

  it("recusa formato estranho e arquivo vazio", () => {
    expect(classificarMidiaLT("application/pdf", MB).ok).toBe(false);
    expect(classificarMidiaLT("image/svg+xml", 10 * 1024).ok).toBe(false);   // SVG executa script
    expect(classificarMidiaLT("image/jpeg", 0).ok).toBe(false);
  });

  it("GIF é o formato mais apertado: sai mais caro por segundo que vídeo", () => {
    expect(TETO_MIDIA_LT.gif).toBeLessThan(TETO_MIDIA_LT.video);
  });

  it("caminho nunca repete e mora no prefixo do LinkTridi", () => {
    const d = new Date("2026-09-10T12:00:00Z");
    const a = caminhoMidiaLT("mp4", d), b = caminhoMidiaLT("mp4", d);
    expect(a).toMatch(/^linktridi\/2026\/09\/[0-9a-f-]{36}\.mp4$/);
    expect(a).not.toBe(b);
  });

  it("a rota de upload exige a chave de EDITAR e reconfere a regra no servidor", () => {
    const rota = readFileSync("app/api/tridiflow/upload-url/route.ts", "utf8");
    expect(rota).toContain('getProfileForAnyModule("marketing", "tridiflow:linktridi")');
    expect(rota).toContain("classificarMidiaLT(");
  });
});
