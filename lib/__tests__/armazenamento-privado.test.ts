import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AREAS_DO_NAVEGADOR, AREAS_PRIVADAS, LEITURA_POR_AREA, TETO_PADRAO, areaDaChave, chaveDaUrl, chaveValida,
  ehUrlPrivada, emMB, extensaoDe, nomeParaCabecalho, novaChave, tetoDoEnvio, tipoServido, urlPrivada,
} from "@/lib/armazenamento/referencia";
import { b2Configurado, urlAssinadaEnvio, urlAssinadaLeitura } from "@/lib/armazenamento/privado";

// Armazenamento PRIVADO (Backblaze B2). O contrato que o resto do app depende:
//  - a chave nasce `area/aaaa/mm/<id>.<ext>` e nada fora disso é aceito;
//  - o banco guarda `/api/arquivos/<chave>` (relativo), nunca URL do B2;
//  - caminho antigo do Supabase (`<uuid-do-canal>/<id>.ext`, `ponto/<ts>.jpg`)
//    NÃO passa por `chaveValida` — é assim que os leitores separam os dois mundos.

describe("referência privada", () => {
  it("novaChave nasce no formato area/aaaa/mm/<uuid>.<ext>", () => {
    const k = novaChave("chat", "Relatório Final.PDF", "application/pdf", new Date("2026-09-08T12:00:00Z"));
    expect(k).toMatch(/^chat\/2026\/09\/[0-9a-f-]{36}\.pdf$/);
    expect(chaveValida(k)).toBe(true);
    expect(areaDaChave(k)).toBe("chat");
  });

  it("extensão vem do nome; sem nome, do mime; sem os dois, bin", () => {
    expect(extensaoDe("foto.JPG")).toBe("jpg");
    expect(extensaoDe("", "video/mp4")).toBe("mp4");
    expect(extensaoDe("sem-extensao", "audio/ogg")).toBe("ogg");
    expect(extensaoDe("", "x/y")).toBe("bin");
    // extensão maliciosa/absurda não entra na chave
    expect(novaChave("geral", "a.<script>", null)).toMatch(/\.bin$/);
  });

  it("rejeita o que não é chave nossa (caminhos antigos do Supabase, truques de diretório)", () => {
    for (const ruim of [
      "3f2a1b4c-0000-4000-8000-000000000000/msg.jpg", // tridichat-midia antigo
      "ponto/1725800000000-abc123.jpg", // ponto-selfies antigo
      "chat/2026/09/../../x.jpg",
      "chat/2026/09/id.jpg/extra",
      "fotos/2026/09/id.jpg", // área desconhecida
      "chat/26/9/id.jpg",
      "",
    ]) expect(chaveValida(ruim), ruim).toBe(false);
  });

  it("toda área declarada gera chave válida", () => {
    for (const a of AREAS_PRIVADAS) expect(chaveValida(novaChave(a, "x.png", "image/png"))).toBe(true);
  });

  it("o banco guarda /api/arquivos/<chave> e dá pra voltar pra chave", () => {
    const k = novaChave("videos", "aula.mp4", "video/mp4");
    const u = urlPrivada(k);
    expect(u).toBe(`/api/arquivos/${k}`);
    expect(ehUrlPrivada(u)).toBe(true);
    expect(chaveDaUrl(u)).toBe(k);
    expect(chaveDaUrl(`${u}?download=1`)).toBe(k);
    // URL pública do Supabase não é privada
    expect(ehUrlPrivada("https://x.supabase.co/storage/v1/object/public/chat/a.jpg")).toBe(false);
    expect(chaveDaUrl("/api/arquivos/../etc")).toBe(null);
  });
});

describe("assinatura S3 (sem rede)", () => {
  const env = { B2_ENDPOINT: "https://s3.us-east-005.backblazeb2.com", B2_REGION: "us-east-005", B2_BUCKET: "tridi-privado", B2_KEY_ID: "k", B2_APP_KEY: "s" };
  const antes: Record<string, string | undefined> = {};
  beforeEach(() => { for (const [k, v] of Object.entries(env)) { antes[k] = process.env[k]; process.env[k] = v; } });
  afterEach(() => { for (const k of Object.keys(env)) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; } });

  it("b2Configurado só com as cinco variáveis", () => {
    expect(b2Configurado()).toBe(true);
    delete process.env.B2_APP_KEY;
    expect(b2Configurado()).toBe(false);
  });

  it("leitura assinada aponta pro bucket, expira e carrega o nome do arquivo", async () => {
    const u = new URL(await urlAssinadaLeitura("chat/2026/09/abc.pdf", 600, { nome: "Relatório.pdf", download: true }));
    expect(u.origin + u.pathname).toBe("https://s3.us-east-005.backblazeb2.com/tridi-privado/chat/2026/09/abc.pdf");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(u.searchParams.get("X-Amz-Credential")).toMatch(/^k\/\d{8}\/us-east-005\/s3\/aws4_request$/);
    expect(u.searchParams.get("response-content-disposition")).toContain('attachment; filename="Relatório.pdf"');
    expect(u.searchParams.get("response-content-type")).toBe("application/pdf");
  });

  it("prazo de leitura nunca passa de 10 min, mesmo que alguém peça mais", async () => {
    const u = new URL(await urlAssinadaLeitura("chat/2026/09/abc.pdf", 86400));
    expect(u.searchParams.get("X-Amz-Expires")).toBe("600");
  });

  it("tipo servido vem da EXTENSÃO, não do que o cliente gravou; o que não é exibível baixa como binário", async () => {
    // .html enviado como "imagem" — sem isso, HTML de um usuário abriria inline
    const html = new URL(await urlAssinadaLeitura("chat/2026/09/abc.html"));
    expect(html.searchParams.get("response-content-type")).toBe("application/octet-stream");
    expect(html.searchParams.get("response-content-disposition")).toMatch(/^attachment;/);
    const svg = new URL(await urlAssinadaLeitura("chat/2026/09/abc.svg"));
    expect(svg.searchParams.get("response-content-type")).toBe("application/octet-stream");
    // mídia de verdade continua inline com o mime certo (player de vídeo/áudio depende disso)
    for (const [ext, mime] of [["jpg", "image/jpeg"], ["ogg", "audio/ogg"], ["mp4", "video/mp4"], ["amr", "audio/amr"]]) {
      const u = new URL(await urlAssinadaLeitura(`chat/2026/09/abc.${ext}`));
      expect(u.searchParams.get("response-content-type"), ext).toBe(mime);
      expect(u.searchParams.get("response-content-disposition"), ext).toMatch(/^inline;/);
    }
    expect(tipoServido("chat/2026/09/x.exe")).toEqual({ mime: "application/octet-stream", inline: false });
  });

  it("nome no cabeçalho não carrega aspas, barra nem quebra de linha", () => {
    expect(nomeParaCabecalho('a"b\\c/d\r\ne.pdf')).toBe("a_b_c_d__e.pdf");
    expect(nomeParaCabecalho("   ", "arquivo")).toBe("arquivo");
    expect(nomeParaCabecalho("x".repeat(500)).length).toBe(150);
  });

  it("envio assinado é PUT, amarra o TAMANHO e não amarra o content-type", async () => {
    const u = new URL(await urlAssinadaEnvio("videos/2026/09/abc.mp4", 1234));
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;host");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("900");
    await expect(urlAssinadaEnvio("videos/2026/09/abc.mp4", 0)).rejects.toThrow(/tamanho/);
    await expect(urlAssinadaEnvio("videos/2026/09/abc.mp4", 1.5)).rejects.toThrow(/tamanho/);
  });

  it("chave fora do formato não é assinada nunca", async () => {
    await expect(urlAssinadaLeitura("ponto/1725800000000-abc.jpg")).rejects.toThrow(/inválida/);
    await expect(urlAssinadaEnvio("../x", 10)).rejects.toThrow(/inválida/);
  });
});

describe("quem pode o quê, por área", () => {
  it("o navegador só pede presign em área que não é de módulo fechado", () => {
    expect(Object.keys(AREAS_DO_NAVEGADOR).sort()).toEqual(["atestados", "chat", "criativos", "design", "geral", "modelos", "stories", "videos"]);
    // Material do Design (template, fonte, editável) sobe da Biblioteca do
    // Design e é lido por quem tem o módulo — a mesma chave da página.
    expect(AREAS_DO_NAVEGADOR.design).toBe("design");
    expect(LEITURA_POR_AREA.design).toBe("design");
    // Modelo 3D sobe e é lido por quem tem a área 3D — a mesma chave da página
    // e das rotas /api/3d. A biblioteca não tem papel "só leitura" por ora.
    expect(AREAS_DO_NAVEGADOR.modelos).toBe("3d");
    // Atestado sobe sem chave de módulo porque quem anexa é o COLABORADOR ao
    // pedir a justificativa do próprio ponto — ele não tem nenhuma chave do RH.
    // A restrição do atestado está na LEITURA, não na escrita.
    expect(AREAS_DO_NAVEGADOR.atestados).toBe(null);
    // Story sobe de quem cria no Marketing — a mesma chave que a rota de
    // stories pede pra gravar a linha que aponta pro arquivo.
    expect(AREAS_DO_NAVEGADOR.stories).toBe("marketing:criar");
    expect("ponto" in AREAS_DO_NAVEGADOR).toBe(false);
    expect("documentos" in AREAS_DO_NAVEGADOR).toBe(false);
    // as chaves existem em lib/areas.ts: quem sobe peça é quem cria criativo,
    // quem vê a biblioteca é quem vê o painel. Chave inventada aqui = 403 mudo.
    expect(AREAS_DO_NAVEGADOR.criativos).toBe("marketing:criar");
  });

  it("toda área tem regra de leitura, e as sensíveis não são 'qualquer um'", () => {
    for (const a of AREAS_PRIVADAS) expect(a in LEITURA_POR_AREA, a).toBe(true);
    expect(LEITURA_POR_AREA.ponto).toBe("superusuario");
    // Informação de saúde: só quem cuida de atestado no RH ou administra o
    // ponto. Nunca `null` — seria o arquivo médico aberto a todo logado.
    expect(LEITURA_POR_AREA.atestados).toEqual(["rh:atestados", "administracao", "colaboradores"]);
    expect(LEITURA_POR_AREA.documentos).toBe("financeiro:ver");
    // Marketing produz, Tridify compra mídia: os dois enxergam a peça.
    expect(LEITURA_POR_AREA.criativos).toEqual(["marketing:ver", "trafego:analisar"]);
    // Stories lê pela chave da ÁREA, a mesma da página: quem abre o quadro
    // precisa enxergar a mídia dele.
    expect(LEITURA_POR_AREA.stories).toBe("marketing");
  });

  it("story aceita imagem e vídeo curto, e nada mais", () => {
    expect(tetoDoEnvio("stories", "image/webp")).toBe(8 * 1024 * 1024);
    expect(tetoDoEnvio("stories", "video/mp4")).toBe(40 * 1024 * 1024);
    expect(tetoDoEnvio("stories", "application/pdf")).toBe(0);
    expect(tetoDoEnvio("stories", "audio/mpeg")).toBe(0);
  });

  it("o teto de tamanho é por área E por tipo, e a área de criativo é a mais apertada", () => {
    expect(tetoDoEnvio("criativos", "image/png")).toBe(8 * 1024 * 1024);
    expect(tetoDoEnvio("criativos", "video/mp4")).toBe(30 * 1024 * 1024);
    // criativo é imagem ou vídeo; PDF e áudio não entram na biblioteca
    expect(tetoDoEnvio("criativos", "application/pdf")).toBe(0);
    expect(tetoDoEnvio("criativos", "audio/mpeg")).toBe(0);
    // área sem regra própria cai no padrão
    expect(tetoDoEnvio("chat", "application/pdf")).toBe(TETO_PADRAO);
    // o mime vem do navegador com sujeira ("video/mp4; codecs=...")
    expect(tetoDoEnvio("criativos", "VIDEO/MP4; codecs=avc1")).toBe(30 * 1024 * 1024);
    expect(emMB(8 * 1024 * 1024)).toBe("8 MB");
  });

  it("a rota de presign e a de leitura usam as tabelas, não listas próprias", () => {
    const presign = readFileSync(join(process.cwd(), "app/api/arquivos/presign/route.ts"), "utf8");
    const leitura = readFileSync(join(process.cwd(), "app/api/arquivos/[...chave]/route.ts"), "utf8");
    expect(presign).toContain("AREAS_DO_NAVEGADOR");
    expect(presign).toContain("urlAssinadaEnvio(chave, tamanho)");
    expect(leitura).toContain("LEITURA_POR_AREA");
    expect(leitura).not.toContain("lerPrivado");   // redirect, não proxy — decisão do usuário (10 min)
  });
});
