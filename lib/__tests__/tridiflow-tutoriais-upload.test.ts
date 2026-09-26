import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACEITE_MIDIA_TUTORIAL, TETO_IMAGEM_CRUA, TETO_MIDIA_TUTORIAL, caminhoMidiaTutorial, classificarMidiaTutorial,
  descreverMidiaTutorial, extensaoTutorial, mimeDoArquivo, reconhecerLinkDeMidia, validarArquivoTutorial,
} from "@/lib/tridiflow-tutoriais-upload";

// Sessão e Storage de mentira pra rota de URL assinada. O perfil só existe pra
// chave que a pessoa TEM: se a rota conferir outra (a tela exigia
// `tridiflow:tutoriais` e a API de salvar, `tridiflow:projetos`), o caso
// válido quebra aqui em vez de virar 403 — ou porta aberta — em produção.
const m = vi.hoisted(() => ({ chaves: [] as string[], assinar: vi.fn() }));

vi.mock("@/lib/require-auth", () => ({
  getProfileForAnyModule: async (...ks: string[]) =>
    (ks.some((k) => m.chaves.includes(k)) ? { id: "u1", name: "Pessoa", username: "pessoa", role: "user" } : null),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      // A rota confere (e cria) o bucket próprio dos tutoriais antes de
      // assinar: sem ele no mock, a conferência falhava e o caso válido dava 502.
      getBucket: async () => ({ data: null, error: null }),
      createBucket: async () => ({ data: {}, error: null }),
      updateBucket: async () => ({ data: {}, error: null }),
      from: (bucket: string) => ({
        createSignedUploadUrl: (caminho: string) => m.assinar(bucket, caminho),
        getPublicUrl: (caminho: string) => ({
          data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${caminho}` },
        }),
      }),
    },
  }),
}));

import { POST, dynamic } from "@/app/api/tridiflow/tutoriais/upload-url/route";

const MB = 1024 * 1024;
const erroDe = (r: ReturnType<typeof classificarMidiaTutorial>) => (r.ok ? "" : r.erro);

describe("upload de tutorial", () => {
  it("aceita os formatos e limites definidos", () => {
    expect(validarArquivoTutorial({ type: "image/webp", size: 8 * 1024 * 1024 })).toBeNull();
    expect(validarArquivoTutorial({ type: "video/mp4", size: 100 * 1024 * 1024 })).toBeNull();
    expect(extensaoTutorial("video/webm")).toBe("webm");
  });
  it("recusa formato e excesso com mensagem acionável", () => {
    expect(validarArquivoTutorial({ type: "text/html", size: 1 })).toContain("imagem");
    expect(validarArquivoTutorial({ type: "image/png", size: 9 * 1024 * 1024 })).toContain("8 MB");
    expect(validarArquivoTutorial({ type: "video/mp4", size: 101 * 1024 * 1024 })).toContain("100 MB");
  });
});

// O envio passava pela função da Vercel (corte em 4,5 MB) e a foto subia
// crua. Estes testes travam a tabela que o editor e a rota de URL assinada
// leem juntos — a tela recusa antes, o servidor recusa pra valer.
describe("mídia do tutorial por URL assinada", () => {
  it("tetos: foto 8 MB (já comprimida), GIF 4 MB, vídeo 20 MB", () => {
    expect(TETO_MIDIA_TUTORIAL).toEqual({ imagem: 8 * MB, gif: 4 * MB, video: 20 * MB });
    expect(classificarMidiaTutorial("image/webp", 8 * MB, "imagem")).toEqual({ ok: true, tipo: "imagem", ext: "webp" });
    expect(classificarMidiaTutorial("image/gif", 4 * MB, "imagem")).toEqual({ ok: true, tipo: "gif", ext: "gif" });
    expect(classificarMidiaTutorial("video/mp4", 20 * MB, "video")).toEqual({ ok: true, tipo: "video", ext: "mp4" });
    expect(classificarMidiaTutorial("video/webm", MB, "qualquer")).toEqual({ ok: true, tipo: "video", ext: "webm" });
    expect(classificarMidiaTutorial("image/avif", MB, "qualquer")).toEqual({ ok: true, tipo: "imagem", ext: "avif" });
  });

  it("vídeo acima do teto manda pro YouTube, com o tamanho real e o limite", () => {
    expect(erroDe(classificarMidiaTutorial("video/mp4", 64 * MB, "video"))).toBe(
      "Vídeo de 64 MB passa do limite de 20 MB. Suba no YouTube (pode ser não listado) e cole o link aqui — carrega mais rápido pra quem assiste.",
    );
  });

  it("a foto crua entra até 25 MB pra ser comprimida; depois da compressão o teto é 8 MB", () => {
    expect(TETO_IMAGEM_CRUA).toBe(25 * MB);
    expect(classificarMidiaTutorial("image/jpeg", 18 * MB, "imagem", { crua: true }).ok).toBe(true);
    expect(erroDe(classificarMidiaTutorial("image/jpeg", 30 * MB, "imagem", { crua: true }))).toContain("limite de 25 MB");
    const depois = erroDe(classificarMidiaTutorial("image/jpeg", 12 * MB, "imagem"));
    expect(depois).toContain("Foto de 12 MB passa do limite de 8 MB");
    expect(depois).toMatch(/2000 px/);
    // GIF não é comprimido: a folga da foto crua não vale pra ele.
    expect(erroDe(classificarMidiaTutorial("image/gif", 6 * MB, "imagem", { crua: true }))).toContain("limite de 4 MB");
  });

  it(".mov é recusado com o caminho: exportar em MP4 (H.264)", () => {
    const erro = erroDe(classificarMidiaTutorial("video/quicktime", MB, "video"));
    expect(erro).toMatch(/\.mov/);
    expect(erro).toMatch(/Exporte em MP4 \(H\.264\)/);
  });

  it("HEIC do iPhone é recusado mandando exportar como JPG", () => {
    for (const mime of ["image/heic", "image/heif"]) {
      expect(erroDe(classificarMidiaTutorial(mime, 3 * MB, "imagem")), mime).toMatch(/Exporte como JPG/);
    }
  });

  it("GIF acima do teto: no campo só de foto não manda pro MP4; onde cabe vídeo, manda", () => {
    const soFoto = erroDe(classificarMidiaTutorial("image/gif", 6 * MB, "imagem"));
    expect(soFoto).toContain("GIF de 6 MB passa do limite de 4 MB");
    expect(soFoto).not.toMatch(/MP4/);
    expect(erroDe(classificarMidiaTutorial("image/gif", 6 * MB, "qualquer"))).toMatch(/MP4/);
  });

  it("tipo errado pro campo diz o que o campo aceita, antes de qualquer outra regra", () => {
    expect(erroDe(classificarMidiaTutorial("video/mp4", MB, "imagem"))).toBe("Este campo é só de foto: envie JPG, PNG, WebP ou GIF.");
    // .mov na capa: "exporte em MP4" responderia uma pergunta que ninguém fez.
    expect(erroDe(classificarMidiaTutorial("video/quicktime", MB, "imagem"))).toContain("só de foto");
    expect(erroDe(classificarMidiaTutorial("image/png", MB, "video"))).toContain("só de vídeo");
  });

  it("recusa formato desconhecido, SVG e arquivo vazio", () => {
    expect(erroDe(classificarMidiaTutorial("application/pdf", MB, "qualquer"))).toMatch(/^Formato não aceito/);
    expect(erroDe(classificarMidiaTutorial("", MB, "imagem"))).toMatch(/^Formato não aceito/);
    expect(erroDe(classificarMidiaTutorial("image/svg+xml", 10_000, "imagem"))).toMatch(/SVG/);
    expect(erroDe(classificarMidiaTutorial("image/jpeg", 0, "imagem"))).toMatch(/vazio/);
  });

  it("deduz o tipo pelo nome quando o navegador não diz", () => {
    expect(mimeDoArquivo({ name: "IMG_0042.HEIC", type: "" })).toBe("image/heic");
    expect(mimeDoArquivo({ name: "passo.mov", type: "" })).toBe("video/quicktime");
    expect(mimeDoArquivo({ name: "foto.jpg", type: "image/jpeg" })).toBe("image/jpeg");
    expect(mimeDoArquivo({ name: "sem-extensao", type: "" })).toBe("");
  });

  it("o seletor de cada campo lista só o que a tabela aceita", () => {
    expect(ACEITE_MIDIA_TUTORIAL.video).toBe("video/mp4,video/webm");
    expect(ACEITE_MIDIA_TUTORIAL.imagem).not.toContain("video/");
    for (const mime of ACEITE_MIDIA_TUTORIAL.qualquer.split(",")) {
      expect(classificarMidiaTutorial(mime, MB, "qualquer").ok, mime).toBe(true);
    }
  });

  it("caminho nunca repete e mora no prefixo dos tutoriais, por ano e mês", () => {
    const d = new Date("2026-09-10T12:00:00Z");
    const a = caminhoMidiaTutorial("webp", d), b = caminhoMidiaTutorial("webp", d);
    expect(a).toMatch(/^tridiflow\/tutoriais\/2026\/09\/[0-9a-f-]{36}\.webp$/);
    expect(a).not.toBe(b);
  });
});

// Chama a rota de verdade. Procurar o texto no arquivo passava verde com o `if`
// da chave invertido ou com o `!c.ok` sem `return` — e quem tem a URL assinada
// sobe no bucket PÚBLICO.
describe("rota de URL assinada dos tutoriais", () => {
  const pedir = (corpo: unknown) =>
    POST(new NextRequest("http://x/api/tridiflow/tutoriais/upload-url", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
    }));

  beforeEach(() => {
    m.chaves = ["tridiflow:tutoriais"];
    m.assinar.mockReset().mockImplementation(async (bucket: string, caminho: string) => ({
      data: { signedUrl: `https://x.supabase.co/storage/v1/object/upload/sign/${bucket}/${caminho}?token=t`, path: caminho, token: "t" },
      error: null,
    }));
  });

  it("sem Marketing nem a chave dos Tutoriais responde 403 e não assina nada — nem com outra chave do TridiFlow", async () => {
    for (const chaves of [[], ["tridiflow:projetos"]] as string[][]) {
      m.chaves = chaves;
      expect((await pedir({ mime: "image/webp", tamanho: MB })).status, chaves.join() || "sem chave").toBe(403);
    }
    expect(m.assinar).not.toHaveBeenCalled();
  });

  it("quem tem só o Marketing assina (a central é da área dele)", async () => {
    m.chaves = ["marketing"];
    expect((await pedir({ mime: "image/webp", tamanho: MB })).status).toBe(200);
  });

  it("reconfere a regra no servidor: recusa com a mesma mensagem do editor, antes de assinar", async () => {
    const html = await pedir({ mime: "text/html", tamanho: 1 });
    expect(html.status).toBe(400);
    expect((await html.json()).error).toMatch(/^Formato não aceito/);
    const grande = await pedir({ mime: "video/mp4", tamanho: 64 * MB });
    expect(grande.status).toBe(400);
    expect((await grande.json()).error).toBe(erroDe(classificarMidiaTutorial("video/mp4", 64 * MB, "qualquer")));
    expect(m.assinar).not.toHaveBeenCalled();
  });

  // O endereço público precisa ser do MESMO caminho assinado: com dois
  // caminhos, o editor salvaria o link de um arquivo que nunca subiu e a foto
  // sumiria da página pública.
  it("caso válido: assina caminho novo no prefixo dos tutoriais e devolve o endereço público dele", async () => {
    const r = await pedir({ mime: "image/webp", tamanho: 300 * 1024 });
    expect(r.status).toBe(200);
    const d = (await r.json()) as { signedUrl: string; publicUrl: string; tipo: string };
    expect(m.assinar).toHaveBeenCalledTimes(1);
    const [, caminho] = m.assinar.mock.calls[0] as [string, string];
    expect(caminho).toMatch(/^tridiflow\/tutoriais\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
    expect(d.signedUrl).toContain(caminho);
    expect(d.publicUrl.endsWith(`/${caminho}`)).toBe(true);
    expect(d.tipo).toBe("imagem");
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("link colado no campo de mídia", () => {
  it("reconhece YouTube, Vimeo e arquivo de vídeo — mesmo sem https no começo", () => {
    expect(reconhecerLinkDeMidia("youtu.be/dQw4w9WgXcQ", "video")).toEqual({ ok: true, url: "https://youtu.be/dQw4w9WgXcQ", tipo: "video" });
    expect(reconhecerLinkDeMidia("https://vimeo.com/76979871", "qualquer")).toMatchObject({ ok: true, tipo: "video" });
    expect(reconhecerLinkDeMidia("https://cdn.exemplo/passo.mp4", "video")).toMatchObject({ ok: true, tipo: "video" });
  });

  it("página de site não vira player preto, e http é recusado", () => {
    expect(reconhecerLinkDeMidia("https://minhaloja.com.br/produto", "video")).toEqual({
      ok: false, erro: "Esse link não abre como vídeo. Use um link do YouTube, do Vimeo ou de um arquivo .mp4.",
    });
    expect(reconhecerLinkDeMidia("http://cdn.exemplo/passo.mp4", "video").ok).toBe(false);
    expect(reconhecerLinkDeMidia("", "video").ok).toBe(false);
  });

  it("imagem: extensão de imagem em qualquer campo; qualquer https no campo só de foto", () => {
    expect(reconhecerLinkDeMidia("https://cdn.exemplo/a.jpg", "qualquer")).toMatchObject({ ok: true, tipo: "imagem" });
    expect(reconhecerLinkDeMidia("https://images.cdn.exemplo/abc?w=800", "imagem")).toMatchObject({ ok: true, tipo: "imagem" });
    expect(reconhecerLinkDeMidia("https://cdn.exemplo/a.jpg", "video").ok).toBe(false);
  });
});

describe("o que o campo cheio mostra", () => {
  const nosso = "https://x.supabase.co/storage/v1/object/public/photos/tridiflow/tutoriais/2026/09/a";

  it("YouTube ganha a miniatura do próprio YouTube", () => {
    expect(descreverMidiaTutorial("https://youtu.be/dQw4w9WgXcQ", "", "video")).toMatchObject({
      origem: "youtube", rotulo: "YouTube", imagem: false, miniatura: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
  });

  it("vídeo enviado usa a capa; .mp4 de fora é link", () => {
    expect(descreverMidiaTutorial(`${nosso}.mp4`, `${nosso}.webp`, "video")).toMatchObject({
      origem: "video-enviado", rotulo: "Vídeo enviado", miniatura: `${nosso}.webp`, enviada: true,
    });
    expect(descreverMidiaTutorial("https://cdn.exemplo/passo.mp4", "", "video")).toMatchObject({ origem: "link", rotulo: "Link", enviada: false });
  });

  it("foto é foto e pede descrição; campo vazio é null", () => {
    expect(descreverMidiaTutorial(`${nosso}.webp`, "", "imagem")).toMatchObject({ origem: "foto", rotulo: "Foto", imagem: true, miniatura: `${nosso}.webp` });
    expect(descreverMidiaTutorial("", "", "qualquer")).toBeNull();
  });
});
