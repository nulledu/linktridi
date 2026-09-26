import { describe, expect, it } from "vitest";
import {
  DURACAO_MAX_S, formatoDe, NOME_DO_FORMATO, tipoDoCriativo, textoDosLimites, validarCriativo,
} from "@/lib/criativos/regras";
import { tetoDoEnvio } from "@/lib/armazenamento/referencia";

const arquivo = (nome: string, mime: string, bytes: number) =>
  new File([new Uint8Array(bytes)], nome, { type: mime });

describe("o que é criativo", () => {
  it("aceita imagem e vídeo de anúncio, recusa o resto", () => {
    expect(tipoDoCriativo("image/jpeg")).toBe("imagem");
    expect(tipoDoCriativo("image/webp")).toBe("imagem");
    expect(tipoDoCriativo("video/mp4")).toBe("video");
    expect(tipoDoCriativo("video/quicktime")).toBe("video");   // .mov sai de iPhone e de editor
    expect(tipoDoCriativo("video/mp4; codecs=avc1.42E01E")).toBe("video");
    for (const m of ["application/pdf", "audio/mpeg", "text/html", "image/svg+xml", ""]) {
      expect(tipoDoCriativo(m), m).toBe(null);
    }
  });
});

describe("formato pela proporção", () => {
  it("rotula as proporções de anúncio, com tolerância pro tamanho exato variar", () => {
    expect(formatoDe(1080, 1080)).toBe("1:1");
    expect(formatoDe(1080, 1350)).toBe("4:5");
    expect(formatoDe(864, 1080)).toBe("4:5");     // mesma peça, outro tamanho
    expect(formatoDe(1080, 1920)).toBe("9:16");
    expect(formatoDe(720, 1280)).toBe("9:16");
    expect(formatoDe(1920, 1080)).toBe("16:9");
    expect(formatoDe(1000, 300)).toBe("outro");
  });

  it("sem medida não inventa formato", () => {
    expect(formatoDe(null, null)).toBe("outro");
    expect(formatoDe(0, 100)).toBe("outro");
    expect(formatoDe(undefined, undefined)).toBe("outro");
  });

  it("todo formato tem nome pra tela", () => {
    for (const f of ["1:1", "4:5", "9:16", "16:9", "outro"] as const) {
      expect(NOME_DO_FORMATO[f], f).toBeTruthy();
    }
  });
});

describe("validação antes de subir", () => {
  it("deixa passar o criativo do tamanho de verdade (30 s 1080p ≈ 18 MB)", async () => {
    expect(await validarCriativo(arquivo("peca.mp4", "video/mp4", 18 * 1024 * 1024))).toBe(null);
    expect(await validarCriativo(arquivo("peca.jpg", "image/jpeg", 400 * 1024))).toBe(null);
  });

  it("barra export cru de vídeo e diz o limite, o tamanho real e como resolver", async () => {
    const p = await validarCriativo(arquivo("cru.mp4", "video/mp4", 47 * 1024 * 1024));
    expect(p?.motivo).toBe("tamanho");
    expect(p?.texto).toContain("30 MB");   // o limite
    expect(p?.texto).toContain("47 MB");   // o que a pessoa tem
    expect(p?.texto).toMatch(/1080p|bitrate/);  // o caminho pra consertar
  });

  it("imagem tem teto próprio, bem menor que o de vídeo", async () => {
    expect(tetoDoEnvio("criativos", "image/png")).toBeLessThan(tetoDoEnvio("criativos", "video/mp4"));
    // 12 MB passaria fosse vídeo; como imagem, não
    const p = await validarCriativo(arquivo("arte.png", "image/png", 12 * 1024 * 1024));
    expect(p?.motivo).toBe("tamanho");
    expect(p?.texto).toContain("8 MB");
    expect(await validarCriativo(arquivo("arte.mp4", "video/mp4", 12 * 1024 * 1024))).toBe(null);
  });

  it("recusa tipo que não é peça de anúncio, e arquivo vazio", async () => {
    expect((await validarCriativo(arquivo("doc.pdf", "application/pdf", 1000)))?.motivo).toBe("tipo");
    expect((await validarCriativo(arquivo("vazio.jpg", "image/jpeg", 0)))?.motivo).toBe("vazio");
  });

  it("vídeo longo é barrado pela duração medida no navegador", async () => {
    const curto = { largura: 1080, altura: 1920, duracao: 28 };
    const longo = { largura: 1080, altura: 1920, duracao: 140 };
    const f = arquivo("peca.mp4", "video/mp4", 5 * 1024 * 1024);
    expect(await validarCriativo(f, curto)).toBe(null);
    const p = await validarCriativo(f, longo);
    expect(p?.motivo).toBe("duracao");
    expect(p?.texto).toContain(String(DURACAO_MAX_S));
    expect(p?.texto).toContain("140");
  });

  it("arquivo que o navegador não conseguiu medir NÃO é recusado por isso", async () => {
    const semMedida = { largura: null, altura: null, duracao: null };
    expect(await validarCriativo(arquivo("peca.mov", "video/quicktime", 9 * 1024 * 1024), semMedida)).toBe(null);
  });

  it("a tela consegue mostrar os limites antes de escolher o arquivo", () => {
    const t = textoDosLimites();
    expect(t).toContain("8 MB");
    expect(t).toContain("30 MB");
    expect(t).toContain(String(DURACAO_MAX_S));
  });
});
