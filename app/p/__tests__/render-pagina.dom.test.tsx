import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// next/font só roda dentro do build do Next — no vitest a fábrica explode.
// As classes de fonte não importam pra estes testes.
vi.mock("../fontes", () => ({ CLASSES_FONTES: "" }));

import { RenderPagina } from "../RenderPagina";
import {
  BLOCOS_CONTEUDO, BLOCOS_CONVERSAO, BLOCOS_ESTRUTURA,
  novaSecao, novoBloco, type Bloco, type BlocoTipo, type PaginaDoc,
} from "@/lib/tridiflow-pagina";

afterEach(cleanup);

// Preenche o que o novoBloco deixa vazio, pra nenhum tipo renderizar "nada"
// por falta de conteúdo (imagem sem src, vídeo sem link).
function blocoCheio(tipo: BlocoTipo): Bloco {
  const b = novoBloco(tipo);
  if (tipo === "imagem") return { ...b, url: "https://exemplo.com/foto.jpg", alt: "Foto do produto" };
  if (tipo === "video") return { ...b, video: { ...b.video!, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } };
  if (tipo === "botao") return { ...b, url: "https://exemplo.com/checkout" };
  if (tipo === "whatsapp") return { ...b, telefone: "5511912345678" };
  return b;
}

const TODOS: BlocoTipo[] = [...BLOCOS_ESTRUTURA, ...BLOCOS_CONTEUDO, ...BLOCOS_CONVERSAO];

function docComTudo(): PaginaDoc {
  const secao = { ...novaSecao("Tudo"), blocos: TODOS.map(blocoCheio) };
  return { versao: 1, secoes: [secao], config: {} };
}

describe("RenderPagina — página publicada", () => {
  // TRAVA de paridade editor ↔ ar: todo tipo que a paleta oferece tem que
  // desenhar alguma coisa. Um tipo novo adicionado só no modelo (sem caso no
  // BlocoView) sumiria da página em silêncio — este teste é quem grita.
  it("renderiza todos os tipos de bloco do catálogo", () => {
    render(<RenderPagina doc={docComTudo()} paginaId="pg_teste" modo="publicado" viewport="desktop" />);
    const ids = new Set(
      Array.from(document.querySelectorAll("[data-bloco]")).map((el) => el.getAttribute("data-bloco")),
    );
    // Container e colunas nascem vazios; os demais 16 têm que estar na página.
    expect(ids.size).toBeGreaterThanOrEqual(TODOS.length);
  });

  it("o conteúdo padrão de cada bloco chega ao HTML", () => {
    render(<RenderPagina doc={docComTudo()} paginaId="pg_teste" modo="publicado" viewport="desktop" />);
    expect(screen.getByRole("heading", { level: 1, name: "Seu título aqui" })).toBeTruthy();
    expect(screen.getByText(/explica sua oferta/)).toBeTruthy();
    expect(screen.getByAltText("Foto do produto")).toBeTruthy();
    expect(screen.getByText("Primeiro benefício")).toBeTruthy();
    expect(screen.getByText("Como funciona?")).toBeTruthy();
    expect(screen.getByText(/Depoimento aqui/)).toBeTruthy();
    expect(screen.getByText("Quero agora")).toBeTruthy();
    expect(screen.getByText("Falar no WhatsApp")).toBeTruthy();
    expect(screen.getByText("Nome do produto")).toBeTruthy();
    expect(screen.getByText("Oferta termina em")).toBeTruthy();
    expect(screen.getByText("Vagas limitadas!")).toBeTruthy();
    // Formulário: campos padrão com rótulo.
    expect(screen.getByText("Nome")).toBeTruthy();
    // Só dentro do formulário: o rodapé padrão também tem um link "WhatsApp".
    expect(document.querySelector("form")!.textContent).toContain("WhatsApp");
    // Blocos novos: o conteúdo padrão chega ao HTML.
    expect(screen.getByText("clientes atendidos")).toBeTruthy();   // métricas
    expect(screen.getByText("Rápido de usar")).toBeTruthy();       // recursos
    expect(screen.getByText("Primeiro passo")).toBeTruthy();       // passos
    expect(screen.getByText("Resultado rápido")).toBeTruthy();     // comparação
    expect(screen.getByText("Com a gente")).toBeTruthy();          // comparação (coluna)
    expect(screen.getByText("Essencial")).toBeTruthy();            // planos
    expect(screen.getByText("Profissional")).toBeTruthy();         // planos (destaque)
    expect(screen.getByText("Garantia de 7 dias")).toBeTruthy();   // garantia
  });

  it("cabeçalho mostra marca, links e botão", () => {
    render(<RenderPagina doc={docComTudo()} paginaId="pg_cab" modo="publicado" viewport="desktop" />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(nav.textContent).toContain("Sua marca");
    expect(nav.textContent).toContain("Recursos");
    expect(nav.textContent).toContain("Começar");
  });

  it("cabeçalho: link com filhos vira botão de submenu, e o menu do celular lista tudo", () => {
    const cab = novoBloco("cabecalho");
    cab.cabecalho!.links = [
      { id: "a", texto: "Início", url: "/p/casa" },
      { id: "b", texto: "Produtos", url: "", filhos: [
        { id: "b1", texto: "Totem", url: "/p/totem", descricao: "Autoatendimento" },
        { id: "b2", texto: "PDV", url: "/p/pdv" },
      ] },
    ];
    const doc: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao("C"), blocos: [cab] }], config: {} };
    render(<RenderPagina doc={doc} paginaId="pg_menu" modo="publicado" viewport="desktop" />);
    const gatilho = screen.getByRole("button", { name: /Produtos/ });
    expect(gatilho.getAttribute("aria-expanded")).toBe("false");
    // Fechado, o submenu é inert: não recebe foco nem clique.
    const sub = document.getElementById(gatilho.getAttribute("aria-controls")!)!;
    expect(sub.hasAttribute("inert")).toBe(true);
    // O menu do celular tem os filhos achatados, com o grupo rotulado.
    const movel = document.querySelector(".tfp-cab-movel")!;
    expect(movel.textContent).toContain("Totem");
    expect(movel.querySelector(".tfp-movel-rotulo")!.textContent).toBe("Produtos");
  });

  it("rolagem viva: só na página no ar e nunca com as animações desligadas", () => {
    const doc: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao("R"), blocos: [novoBloco("texto")] }], config: { rolagemViva: true } };
    const { container, unmount } = render(<RenderPagina doc={doc} paginaId="pg_rv" modo="publicado" viewport="desktop" />);
    expect(container.querySelector(".tfp-pagina")!.className).toContain("tfp-rolagem-viva");
    unmount();
    const ed = render(<RenderPagina doc={doc} paginaId="pg_rv2" modo="preview" viewport="desktop" />);
    expect(ed.container.querySelector(".tfp-pagina")!.className).not.toContain("tfp-rolagem-viva");
    ed.unmount();
    const off = render(<RenderPagina doc={{ ...doc, config: { rolagemViva: true, semAnimacoes: true } }} paginaId="pg_rv3" modo="publicado" viewport="desktop" />);
    expect(off.container.querySelector(".tfp-pagina")!.className).not.toContain("tfp-rolagem-viva");
  });

  it("cabeçalho fixo: preso só na página no ar, com espaço guardando o lugar", () => {
    const cab = novoBloco("cabecalho");
    expect(cab.cabecalho!.fixo).toBe(true);   // cabeçalho novo já nasce fixo
    const doc: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao("C"), blocos: [cab] }], config: {} };
    render(<RenderPagina doc={doc} paginaId="pg_fixo" modo="publicado" viewport="desktop" />);
    expect(screen.getByRole("navigation", { name: "Principal" }).className).toContain("tfp-cab-fixo");
    expect(document.querySelector(".tfp-cab-espaco")).toBeTruthy();
    cleanup();
    // No editor ele fica parado — preso, flutuaria por cima do painel.
    render(<RenderPagina doc={doc} paginaId="pg_fixo2" modo="preview" viewport="desktop" />);
    expect(screen.getByRole("navigation", { name: "Principal" }).className).not.toContain("tfp-cab-fixo");
    expect(document.querySelector(".tfp-cab-espaco")).toBeNull();
  });

  it("bento: um quadro por item, com tamanho e tom na classe", () => {
    const bento = novoBloco("bento");
    const doc: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao("B"), blocos: [bento] }], config: {} };
    render(<RenderPagina doc={doc} paginaId="pg_bento" modo="publicado" viewport="desktop" />);
    const quadros = Array.from(document.querySelectorAll(".tfp-bento-q"));
    expect(quadros).toHaveLength(bento.bento!.length);
    expect(quadros[0].className).toContain("tfp-bento-grande");
    expect(quadros[0].className).toContain("tfp-bento-escuro");
    expect(screen.getByText("O quadro principal").tagName).toBe("H3");
  });

  it("carrossel: rola dentro do bloco e a seta anterior nasce apagada", () => {
    const car = novoBloco("carrossel");
    const doc: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao("C"), blocos: [car] }], config: {} };
    render(<RenderPagina doc={doc} paginaId="pg_car" modo="publicado" viewport="desktop" />);
    expect(document.querySelectorAll(".tfp-car-cartao")).toHaveLength(car.slides!.length);
    // A região rolável é focável (teclado) e tem nome.
    expect(screen.getByRole("region", { name: /role de lado/ }).getAttribute("tabindex")).toBe("0");
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("rodapé: colunas, link sem destino vira texto e o © leva a marca", () => {
    render(<RenderPagina doc={docComTudo()} paginaId="pg_rod" modo="publicado" viewport="desktop" />);
    const rod = document.querySelector("footer.tfp-rod")!;
    expect(rod).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Rodapé" }).textContent).toContain("Produtos");
    // "WhatsApp" nasce sem destino: aparece como texto, nunca como <a href="">.
    const zap = Array.from(rod.querySelectorAll(".tfp-rod-link")).find((e) => e.textContent === "WhatsApp")!;
    expect(zap.tagName).toBe("SPAN");
    expect(rod.querySelector(".tfp-rod-base")!.textContent).toContain(`© ${new Date().getFullYear()} Sua marca`);
  });

  it("título com destaque: o trecho vira <em> e o texto continua inteiro", () => {
    const titulo = { ...novoBloco("titulo"), texto: "Venda mais no WhatsApp", destaque: "mais" };
    const doc: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao("T"), blocos: [titulo] }], config: {} };
    render(<RenderPagina doc={doc} paginaId="pg_dest" modo="publicado" viewport="desktop" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Venda mais no WhatsApp");
    expect(h1.querySelector("em.tfp-destaque")?.textContent).toBe("mais");
  });

  it("troca de palavra: só no ar, leitor de tela ouve a primeira, e todas na mesma célula", () => {
    const titulo = { ...novoBloco("titulo"), texto: "Venda mais no balcão.", destaque: "no balcão.", trocas: ["no totem.", "no WhatsApp."] };
    const doc: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao("T"), blocos: [titulo] }], config: {} };
    render(<RenderPagina doc={doc} paginaId="pg_troca" modo="publicado" viewport="desktop" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.querySelector(".tfp-sr")!.textContent).toBe("no balcão.");
    const palavras = Array.from(h1.querySelectorAll(".tfp-troca-palavra"));
    // O espaço vira \u00a0 dentro da animação (letra-espaço não pode colapsar).
    expect(palavras.map((p) => p.textContent!.replace(/\u00a0/g, " "))).toEqual(["no balcão.", "no totem.", "no WhatsApp."]);
    expect(h1.querySelector(".tfp-troca-grade")!.getAttribute("aria-hidden")).toBe("true");
    expect(palavras[0].getAttribute("data-estado")).toBe("fixa");
    cleanup();
    // No editor não troca: quem está escrevendo precisa ver o texto parado.
    render(<RenderPagina doc={doc} paginaId="pg_troca2" modo="preview" viewport="desktop" />);
    expect(document.querySelector(".tfp-troca")).toBeNull();
  });

  it("destaque que não aparece no título é ignorado, sem quebrar o texto", () => {
    const titulo = { ...novoBloco("titulo"), texto: "Venda mais", destaque: "inexistente" };
    const doc: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao("T"), blocos: [titulo] }], config: {} };
    render(<RenderPagina doc={doc} paginaId="pg_dest2" modo="publicado" viewport="desktop" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Venda mais");
    expect(h1.querySelector("em")).toBeNull();
  });

  it("formatos: selo, pílulas e depoimentos em colunas", () => {
    const selo = { ...novoBloco("texto"), texto: "Novidade", formato: "selo" as const };
    const pilulas = { ...novoBloco("beneficios"), formato: "pilulas" as const };
    const colunas = { ...novoBloco("depoimentos"), formato: "colunas" as const };
    const doc: PaginaDoc = { versao: 1, secoes: [{ ...novaSecao("F"), blocos: [selo, pilulas, colunas] }], config: {} };
    render(<RenderPagina doc={doc} paginaId="pg_fmt" modo="publicado" viewport="desktop" />);
    expect(document.querySelector(".tfp-selo")?.textContent).toBe("Novidade");
    expect(document.querySelectorAll(".tfp-pilulas li").length).toBe(novoBloco("beneficios").itens!.length);
    // Colunas rolando: a lista vai duas vezes no trilho, mas a cópia é
    // aria-hidden — leitor de tela ouve cada depoimento UMA vez.
    const visiveis = Array.from(document.querySelectorAll(".tfp-dep-copia:not([aria-hidden]) .tfp-dep-card"));
    const ocultos = Array.from(document.querySelectorAll(".tfp-dep-copia[aria-hidden] .tfp-dep-card"));
    expect(visiveis.length).toBeGreaterThan(0);
    expect(ocultos.length).toBe(visiveis.length);
  });

  it("bloco com liberação temporizada nasce escondido no ar (e o resto não)", () => {
    const doc = docComTudo();
    const oferta = doc.secoes[0].blocos.find((b) => b.tipo === "oferta")!;
    oferta.visivel = { modo: "apos_tempo", segundos: 300, base: "pagina" };
    render(<RenderPagina doc={doc} paginaId="pg_teste2" modo="publicado" viewport="desktop" />);
    expect(screen.queryByText("Nome do produto")).toBeNull();
    expect(screen.getByText("Quero agora")).toBeTruthy();
  });

  it("bloco oculto não vai pro ar", () => {
    const doc = docComTudo();
    doc.secoes[0].blocos.find((b) => b.tipo === "aviso")!.oculto = true;
    render(<RenderPagina doc={doc} paginaId="pg_teste3" modo="publicado" viewport="desktop" />);
    expect(screen.queryByText("Vagas limitadas!")).toBeNull();
  });
});
