import { describe, expect, it } from "vitest";
import { deveMostrar, marcosAtingidos, ESTADO_INICIAL, type EstadoRuntime } from "../tridiflow-pagina-runtime";
import { clonarBloco, mapPagina, normalizarPagina, novaSecao, novoBloco, todosBlocos, type PaginaDoc } from "../tridiflow-pagina";
import { embedDoVideo, linkWhatsapp, srcDoIframeColado, urlImagemSegura, urlSegura } from "../tridiflow-pagina-estilo";

const estado = (p: Partial<EstadoRuntime> = {}): EstadoRuntime => ({ ...ESTADO_INICIAL, ...p });

describe("liberação de conteúdo (VSL)", () => {
  it("sempre visível aparece de cara", () => {
    expect(deveMostrar({ modo: "sempre" }, estado())).toBe(true);
    expect(deveMostrar(undefined, estado())).toBe(true);
  });

  it("apos_tempo conta da abertura da página", () => {
    const v = { modo: "apos_tempo" as const, segundos: 300, base: "pagina" as const };
    expect(deveMostrar(v, estado({ segundosPagina: 299 }))).toBe(false);
    expect(deveMostrar(v, estado({ segundosPagina: 300 }))).toBe(true);
  });

  it("apos_tempo com base no vídeo espera o play E o tempo assistido", () => {
    const v = { modo: "apos_tempo" as const, segundos: 60, base: "video" as const };
    const reporta = { videoReporta: true };
    expect(deveMostrar(v, estado({ ...reporta, videoIniciou: false, segundosVideo: 90 }))).toBe(false);
    expect(deveMostrar(v, estado({ ...reporta, videoIniciou: true, segundosVideo: 59 }))).toBe(false);
    expect(deveMostrar(v, estado({ ...reporta, videoIniciou: true, segundosVideo: 60 }))).toBe(true);
  });

  it("player que NÃO reporta progresso cai pro tempo de página (não trava pra sempre)", () => {
    // Este é o caso do iframe genérico: prometer 'contar do vídeo' e nunca
    // liberar seria esconder a oferta do comprador.
    const v = { modo: "apos_tempo" as const, segundos: 10, base: "video" as const };
    expect(deveMostrar(v, estado({ videoReporta: false, segundosPagina: 9 }))).toBe(false);
    expect(deveMostrar(v, estado({ videoReporta: false, segundosPagina: 10 }))).toBe(true);
  });

  it("apos_percentual usa o percentual quando há progresso", () => {
    const v = { modo: "apos_percentual" as const, percentual: 50 };
    expect(deveMostrar(v, estado({ videoReporta: true, percentualVideo: 49 }))).toBe(false);
    expect(deveMostrar(v, estado({ videoReporta: true, percentualVideo: 50 }))).toBe(true);
  });

  it("apos_percentual sem progresso só libera quando o vídeo termina", () => {
    const v = { modo: "apos_percentual" as const, percentual: 50 };
    expect(deveMostrar(v, estado({ videoReporta: false, videoTerminou: false }))).toBe(false);
    expect(deveMostrar(v, estado({ videoReporta: false, videoTerminou: true }))).toBe(true);
  });

  it("ao_terminar espera o fim", () => {
    const v = { modo: "ao_terminar" as const };
    expect(deveMostrar(v, estado({ percentualVideo: 99 }))).toBe(false);
    expect(deveMostrar(v, estado({ videoTerminou: true }))).toBe(true);
  });

  it("uma vez liberado, NUNCA some (bloco não pisca ao pausar)", () => {
    const v = { modo: "apos_percentual" as const, percentual: 80 };
    expect(deveMostrar(v, estado({ videoReporta: true, percentualVideo: 10 }), true)).toBe(true);
  });

  it("marcos de vídeo são acumulativos", () => {
    expect(marcosAtingidos(10)).toEqual([]);
    expect(marcosAtingidos(50)).toEqual([25, 50]);
    expect(marcosAtingidos(100)).toEqual([25, 50, 75, 100]);
  });
});

describe("nada pode ficar invisível", () => {
  // Regra dura da página de vendas: se algo der errado no gatilho ou na
  // animação, o conteúdo APARECE. Bloco escondido por engano é oferta perdida.
  it("bloco sem visibilidade definida aparece", () => {
    expect(deveMostrar(undefined, estado())).toBe(true);
    expect(deveMostrar({ modo: "sempre" }, estado())).toBe(true);
  });

  it("gatilho por vídeo sem player que reporta não prende o bloco pra sempre", () => {
    // Cai pro relógio da página: em algum momento aparece, sempre.
    const v = { modo: "apos_tempo" as const, segundos: 5, base: "video" as const };
    expect(deveMostrar(v, estado({ videoReporta: false, segundosPagina: 5 }))).toBe(true);
  });

  it("percentual impossível ainda libera quando o vídeo termina", () => {
    const v = { modo: "apos_percentual" as const, percentual: 100 };
    expect(deveMostrar(v, estado({ videoReporta: false, videoTerminou: true }))).toBe(true);
  });

  it("uma vez liberado nunca volta a sumir, mesmo com o estado zerado", () => {
    const v = { modo: "ao_terminar" as const };
    expect(deveMostrar(v, ESTADO_INICIAL, true)).toBe(true);
  });
});

describe("sanitização (XSS)", () => {
  it("barra javascript: e data:text/html em links", () => {
    expect(urlSegura("javascript:alert(1)")).toBe("");
    expect(urlSegura("  JaVaScRiPt:alert(1)")).toBe("");
    expect(urlSegura("data:text/html;base64,PHNjcmlwdD4=")).toBe("");
  });

  it("aceita http/https/mailto/tel e caminho relativo", () => {
    expect(urlSegura("https://carimbostridi.com.br/x")).toContain("https://carimbostridi.com.br/x");
    expect(urlSegura("mailto:a@b.com")).toContain("mailto:");
    expect(urlSegura("/obrigado")).toBe("/obrigado");
  });

  it("completa protocolo quando a pessoa cola sem https", () => {
    expect(urlSegura("carimbostridi.com.br/oferta")).toBe("https://carimbostridi.com.br/oferta");
  });

  it("imagem aceita data:image mas não data:text/html", () => {
    expect(urlImagemSegura("data:image/png;base64,iVBORw0KGgo=")).toContain("data:image/png");
    expect(urlImagemSegura("data:text/html;base64,x")).toBe("");
  });

  it("whatsapp monta wa.me só com dígitos", () => {
    expect(linkWhatsapp("(11) 91234-5678", "Oi")).toBe("https://wa.me/11912345678?text=Oi");
    expect(linkWhatsapp("")).toBe("");
  });
});

describe("vídeo — allowlist por provedor", () => {
  it("YouTube vira embed nocookie com API de progresso", () => {
    const e = embedDoVideo({ fonte: "url", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(e.provedor).toBe("youtube");
    expect(e.tipo).toBe("iframe");
    expect(e.src).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(e.src).toContain("enablejsapi=1");
    expect(e.temProgresso).toBe(true);
  });

  it("youtu.be curto também resolve", () => {
    expect(embedDoVideo({ fonte: "url", url: "https://youtu.be/dQw4w9WgXcQ" }).src).toContain("/embed/dQw4w9WgXcQ");
  });

  it("Vimeo resolve por id numérico", () => {
    const e = embedDoVideo({ fonte: "url", url: "https://vimeo.com/123456789" });
    expect(e.provedor).toBe("vimeo");
    expect(e.src).toContain("player.vimeo.com/video/123456789");
  });

  it("mp4 direto vira player nativo", () => {
    const e = embedDoVideo({ fonte: "url", url: "https://cdn.exemplo.com/vsl.mp4" });
    expect(e.tipo).toBe("arquivo");
    expect(e.temProgresso).toBe(true);
  });

  it("iframe colado: extrai só o src e RECUSA provedor fora da allowlist", () => {
    const bom = '<iframe src="https://player.vimeo.com/video/987654321" allowfullscreen></iframe>';
    expect(embedDoVideo({ fonte: "iframe", iframe: bom }).provedor).toBe("vimeo");

    const mau = '<iframe src="https://site-qualquer.com/x"></iframe><script>alert(1)</script>';
    expect(embedDoVideo({ fonte: "iframe", iframe: mau }).tipo).toBe("vazio");
  });

  it("não devolve HTML do usuário — só a URL", () => {
    expect(srcDoIframeColado('<iframe onload="alert(1)" src="https://vimeo.com/1"></iframe>')).toBe("https://vimeo.com/1");
    expect(embedDoVideo({ fonte: "iframe", iframe: "<script>alert(1)</script>" }).tipo).toBe("vazio");
  });

  it("vídeo vazio não quebra", () => {
    expect(embedDoVideo(undefined).tipo).toBe("vazio");
    expect(embedDoVideo({ fonte: "url", url: "" }).tipo).toBe("vazio");
  });
});

describe("documento da página", () => {
  const doc = (): PaginaDoc => {
    const s = novaSecao("Topo");
    s.blocos = [novoBloco("titulo"), novoBloco("video")];
    return { versao: 1, secoes: [s], config: {} };
  };

  it("normaliza documento vazio/corrompido sem quebrar", () => {
    expect(normalizarPagina(null).secoes).toEqual([]);
    expect(normalizarPagina({ secoes: "nada" }).secoes).toEqual([]);
    expect(normalizarPagina(doc()).secoes).toHaveLength(1);
  });

  it("normalizar preenche estilo/visibilidade ausentes", () => {
    const bruto = { versao: 1, secoes: [{ id: "s1", blocos: [{ id: "b1", tipo: "titulo" }] }], config: {} };
    const n = normalizarPagina(bruto);
    expect(n.secoes[0].blocos[0].visivel).toEqual({ modo: "sempre" });
    expect(n.secoes[0].blocos[0].estilo).toEqual({});
  });

  it("mapPagina percorre blocos aninhados (colunas)", () => {
    const col = novoBloco("colunas");
    col.colunas![0].blocos = [novoBloco("texto")];
    const d: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao(), blocos: [col] }], config: {} };
    expect(todosBlocos(d)).toHaveLength(2);   // colunas + texto de dentro
  });

  it("mapPagina remove bloco quando a função devolve null", () => {
    const d = doc();
    const alvo = d.secoes[0].blocos[0].id;
    const r = mapPagina(d, (b) => (b.id === alvo ? null : b));
    expect(r.secoes[0].blocos).toHaveLength(1);
  });

  it("duplicar gera ids novos em toda a subárvore", () => {
    const col = novoBloco("colunas");
    col.colunas![0].blocos = [novoBloco("texto")];
    const copia = clonarBloco(col);
    expect(copia.id).not.toBe(col.id);
    expect(copia.colunas![0].blocos[0].id).not.toBe(col.colunas![0].blocos[0].id);
  });

  it("bloco de oferta nasce utilizável (não fica vazio na tela)", () => {
    const o = novoBloco("oferta");
    expect(o.oferta?.produto).toBeTruthy();
    expect(o.oferta?.rotuloBotao).toBeTruthy();
  });
});
