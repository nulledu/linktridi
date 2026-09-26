import { describe, expect, it } from "vitest";
import {
  CENTRAL_TUTORIAIS_VAZIA,
  filtrarTutoriais,
  handleDoTutorial,
  normalizarCentralTutoriais,
  reordenarItem,
} from "@/lib/tridiflow-tutoriais";

describe("Central de Tutoriais do TridiFlow", () => {
  it("normaliza documento ausente sem compartilhar listas mutáveis", () => {
    const a = normalizarCentralTutoriais(undefined);
    const b = normalizarCentralTutoriais({ categorias: "ruim", tutoriais: null });
    expect(a).toEqual(CENTRAL_TUTORIAIS_VAZIA);
    expect(b.categorias).toEqual([]);
    expect(b.tutoriais).toEqual([]);
    expect(a.categorias).not.toBe(b.categorias);
  });

  it("mantém somente blocos conhecidos e valores editoriais seguros", () => {
    const doc = normalizarCentralTutoriais({
      titulo: "  Ajuda  ", subtitulo: 99,
      categorias: [{ id: "c1", nome: "Carimbos", ordem: 2, ativa: true }],
      tutoriais: [{ id: "t1", titulo: "Configurar", handle: "CONFIGURAR", status: "publicado", palavrasChave: ["base"], blocos: [
        { id: "b1", tipo: "texto", titulo: "", conteudo: "Olá" },
        { id: "b2", tipo: "script", conteudo: "ruim" },
      ] }],
    });
    expect(doc.titulo).toBe("Ajuda");
    expect(doc.subtitulo).toBe("");
    expect(doc.tutoriais[0].handle).toBe("configurar");
    expect(doc.tutoriais[0].blocos).toHaveLength(1);
  });

  it("busca sem acento e filtra por categoria", () => {
    const itens = [
      { id: "1", categoriaId: "c1", titulo: "Configuração", descricao: "", palavrasChave: ["máquina"], destaque: false, ordem: 0 },
      { id: "2", categoriaId: "c2", titulo: "Trocar refil", descricao: "", palavrasChave: [], destaque: false, ordem: 1 },
    ];
    expect(filtrarTutoriais(itens, "configuracao", "c1").map((x) => x.id)).toEqual(["1"]);
    expect(filtrarTutoriais(itens, "maquina", null).map((x) => x.id)).toEqual(["1"]);
  });

  it("gera handle único dentro da central", () => {
    expect(handleDoTutorial("Como usar?", ["como-usar", "como-usar-2"])).toBe("como-usar-3");
  });

  it("atualiza o campo ordem ao mover dentro do documento", () => {
    expect(reordenarItem([{ id: "a", ordem: 0 }, { id: "b", ordem: 1 }], "b", -1)).toEqual([{ id: "b", ordem: 0 }, { id: "a", ordem: 1 }]);
  });
});

describe("vídeo vertical (Shorts)", () => {
  it("link /shorts/ já nasce vertical; watch?v= não sabe", async () => {
    const { embedDoTutorialVideo } = await import("@/lib/tridiflow-tutoriais");
    expect(embedDoTutorialVideo("https://youtube.com/shorts/x38jvgefUtI")).toMatchObject({ tipo: "youtube", id: "x38jvgefUtI", vertical: true });
    expect(embedDoTutorialVideo("https://www.youtube.com/watch?v=x38jvgefUtI")?.vertical).toBeUndefined();
  });

  it("lê largura × altura do SOF pulando os segmentos antes dele", async () => {
    const { dimensoesDoJpeg } = await import("@/lib/tridiflow-tutoriais");
    // SOI, APP0 de 16 bytes, DQT de 4, SOF0 1080×1920
    const app0 = [0xFF, 0xE0, 0x00, 0x10, ...new Array(14).fill(0)];
    const dqt = [0xFF, 0xDB, 0x00, 0x04, 0, 0];
    const sof = [0xFF, 0xC0, 0x00, 0x11, 0x08, 0x07, 0x80, 0x04, 0x38, 3, 0, 0, 0];
    const b = new Uint8Array([0xFF, 0xD8, ...app0, ...dqt, ...sof]);
    expect(dimensoesDoJpeg(b)).toEqual({ w: 1080, h: 1920 });
    expect(dimensoesDoJpeg(new Uint8Array([0x89, 0x50, 0x4E, 0x47]))).toBeNull();
    expect(dimensoesDoJpeg(new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA, 0, 2, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe("recorte das barras pretas do vídeo", () => {
  // Miniatura sintética: fundo preto, retângulo claro em (x0,y0)–(x1,y1).
  const imagem = (W: number, H: number, x0: number, y0: number, x1: number, y1: number) => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; const dentro = x >= x0 && x < x1 && y >= y0 && y < y1;
      data[i] = data[i + 1] = data[i + 2] = dentro ? 180 : 4; data[i + 3] = 255;
    }
    return { width: W, height: H, data };
  };

  it("vídeo 16:9 com conteúdo 3:4 gravado no meio vira caixa 3:4 recortada", async () => {
    const { regiaoSemBarras, conteudoDoVideo, estiloDoRecorte } = await import("@/lib/tridiflow-tutoriais");
    // hqdefault 480×360: quadro 16:9 ocupa 480×270 (y 45..315); conteúdo 3:4 = 202×270 no meio.
    const r = regiaoSemBarras(imagem(480, 360, 139, 45, 341, 315));
    const c = conteudoDoVideo(16 / 9, r);
    expect(c.proporcao).toBe(3 / 4);
    expect(c.regiao.y).toBe(0);
    expect(c.regiao.h).toBe(1);
    expect(c.regiao.w).toBeCloseTo(202 / 480, 2);
    const e = estiloDoRecorte(c.regiao);
    expect(parseFloat(e.width)).toBeCloseTo(100 / (202 / 480), 0);
    expect(e.height).toBe("100%");
  });

  it("arquivo já 3:4 (sem barra gravada) não recorta nada e fica 3:4", async () => {
    const { regiaoSemBarras, conteudoDoVideo } = await import("@/lib/tridiflow-tutoriais");
    // quadro 3:4 na 4:3 ocupa 270×360 no meio: só as barras do encaixe.
    const c = conteudoDoVideo(3 / 4, regiaoSemBarras(imagem(480, 360, 105, 0, 375, 360)));
    expect(c).toEqual({ proporcao: 3 / 4, regiao: { x: 0, y: 0, w: 1, h: 1 } });
  });

  it("16:9 comum fica 16:9 inteiro; miniatura toda escura não recorta", async () => {
    const { regiaoSemBarras, conteudoDoVideo } = await import("@/lib/tridiflow-tutoriais");
    expect(conteudoDoVideo(16 / 9, regiaoSemBarras(imagem(480, 360, 0, 45, 480, 315)))).toEqual({ proporcao: 16 / 9, regiao: { x: 0, y: 0, w: 1, h: 1 } });
    expect(regiaoSemBarras(imagem(480, 360, 0, 0, 0, 0))).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});
