import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialPublico, type ProdutoTutorial } from "../TutorialPublico";
import { embedDoTutorialVideo, linkWhatsapp, normalizarTutorial, normalizarUrlPublica, type Tutorial } from "@/lib/tridiflow-tutoriais";
import { mensagemWhatsapp } from "@/lib/tridiflow-tutoriais-leitura";

const produto: ProdutoTutorial = { id: "p1", titulo: "Carimbo atual", descricao: "Descrição atual", imagemUrl: "https://img.test/a.jpg", href: "/l/tridi/carimbo" };
const passos = (quantos: number) => Array.from({ length: quantos }, (_, i) => ({
  id: `p${i + 1}`, tipo: "passo", titulo: `Etapa ${i + 1}`, conteudo: `<p>Faça a etapa ${i + 1}.</p>`,
}));
const tut = (extra: Record<string, unknown> = {}): Tutorial =>
  normalizarTutorial({ id: "t", titulo: "Usar", handle: "usar", status: "publicado", blocos: [], ...extra });
type Props = Parameters<typeof TutorialPublico>[0];
const ler = (props: Partial<Props> & { tutorial: Tutorial }) =>
  render(<TutorialPublico centralTitulo="Central" centralUrl="/p/central" produtos={[]} {...props} />);

/** Wake Lock de mentira: o jsdom não tem, e o navegador real só concede com gesto. */
function simularWakeLock() {
  const release = vi.fn(() => Promise.resolve());
  const request = vi.fn((_tipo: string) => Promise.resolve({ release, addEventListener: vi.fn() }));
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, release };
}
/** Clique em link não navega no jsdom (só polui a saída com "not implemented"). */
const semNavegar = (e: Event) => { if ((e.target as Element | null)?.closest?.("a")) e.preventDefault(); };

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/p/central/usar");
  document.addEventListener("click", semNavegar, true);
});
afterEach(() => {
  document.removeEventListener("click", semNavegar, true);
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("tutorial público", () => {
  it("numera só os passos, com 'Passo N de T', e higieniza o texto", () => {
    const { container } = ler({ tutorial: tut({ blocos: [
      { id: "x", tipo: "texto", conteudo: "<script>ruim</script><p>Bom</p>" },
      { id: "a", tipo: "passo", titulo: "Primeiro" }, { id: "b", tipo: "passo", titulo: "Segundo" },
    ] }) });
    expect(screen.getByText("Passo 1 de 2")).toBeTruthy();
    expect(screen.getByText("Passo 2 de 2")).toBeTruthy();
    // Cada passo é uma seção com nome — o leitor de tela navega por eles.
    expect(screen.getByRole("region", { name: "Primeiro" }).id).toBe("passo-1");
    expect(container.innerHTML).not.toContain("<script");
    expect(screen.getByText("Bom")).toBeTruthy();
  });

  it("produto usa os dados atuais e link externo é protegido", () => {
    ler({ tutorial: tut({ blocos: [{ id: "p", tipo: "produto", produtoId: "p1", botao: "Ver" }, { id: "l", tipo: "link", titulo: "Manual", url: "https://example.com", botao: "Abrir" }] }), produtos: [produto] });
    expect(screen.getByText("Carimbo atual")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir" }).getAttribute("rel")).toBe("noreferrer noopener");
  });

  // Endereço copiado da barra do navegador vem sem "https://" — e sem
  // normalizar, o bloco inteiro SUMIA da página. É o "o link não funciona".
  it("link sem esquema continua sendo link, e o externo abre em aba nova", () => {
    ler({ tutorial: tut({ blocos: [
      { id: "l1", tipo: "link", titulo: "Loja", url: "loja.com.br/carimbos", botao: "Ver loja" },
      { id: "l2", tipo: "link", titulo: "Interno", url: "/p/central", botao: "Abrir interno" },
    ] }) });
    const externo = screen.getByRole("link", { name: /Ver loja/ });
    expect(externo.getAttribute("href")).toBe("https://loja.com.br/carimbos");
    expect(externo.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: /Abrir interno/ }).getAttribute("target")).toBeNull();
  });

  // O link pra outro guia é resolvido contra a central de QUEM VÊ: trocar o
  // endereço da central, ou abrir pela prévia, não pode quebrar o caminho.
  it("link pra outro tutorial resolve contra a central de quem vê e abre na mesma aba", () => {
    const t = tut({ blocos: [{ id: "l", tipo: "link", titulo: "Refil", url: "/p/antiga/trocar-refil", tutorial: "trocar-refil", botao: "Ver o guia" }] });
    const { rerender } = ler({ tutorial: t });
    const link = screen.getByRole("link", { name: /Ver o guia/ });
    expect(link.getAttribute("href")).toBe("/p/central/trocar-refil");
    expect(link.getAttribute("target")).toBeNull();
    rerender(<TutorialPublico tutorial={t} centralTitulo="Central" centralUrl="/previa/tutoriais/abc" produtos={[]} />);
    expect(screen.getByRole("link", { name: /Ver o guia/ }).getAttribute("href")).toBe("/previa/tutoriais/abc/trocar-refil");
  });

  // O embed do YouTube custa ~1,3 MB de terceiro: nada disso entra antes do
  // play. E o YouTube vira player PRÓPRIO — no clique nasce o nosso chrome
  // (barra com play/pausa e trilho), não o iframe cru com a marca deles.
  it("vídeo YouTube nasce como fachada e vira player próprio no clique", () => {
    const { container } = ler({ tutorial: tut({ blocos: [
      { id: "v", tipo: "video", origem: "link", url: "youtube.com/watch?v=abc12345", legenda: "Demonstração" },
    ] }) });
    expect(container.querySelector(".ytp-own")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Assistir/ }));
    // A fachada some e o player próprio entra, com controles nossos.
    expect(container.querySelector(".tut-video-capa")).toBeNull();
    expect(container.querySelector(".ytp-own")).not.toBeNull();
    expect(screen.getByRole("slider", { name: /Avançar o vídeo/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Pausar|Tocar/ }).length).toBeGreaterThan(0);
  });

  it("vídeo usa a capa do editor: arquivo com poster e nada baixado antes do play; YouTube com a capa na fachada", () => {
    const { container } = ler({ tutorial: tut({ blocos: [
      { id: "a", tipo: "passo", titulo: "Veja", videoUrl: "https://cdn.test/v.mp4", videoCapaUrl: "https://cdn.test/capa.webp" },
      { id: "v", tipo: "video", origem: "link", url: "youtu.be/abc12345", capaUrl: "https://cdn.test/yt.webp", legenda: "Demo" },
    ] }) });
    const video = container.querySelector("video");
    expect(video?.getAttribute("poster")).toBe("https://cdn.test/capa.webp");
    expect(video?.getAttribute("preload")).toBe("none");
    expect(screen.getByRole("button", { name: "Assistir: Demo" }).querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/yt.webp");
  });

  it("endereço sem esquema também vira vídeo reconhecido", () => {
    expect(normalizarUrlPublica("youtu.be/abc12345")).toBe("https://youtu.be/abc12345");
    expect(normalizarUrlPublica("/p/central")).toBe("/p/central");
    expect(embedDoTutorialVideo("youtu.be/abc12345")?.id).toBe("abc12345");
  });

  // Fim de tutorial sem saída é o beco que gera chamado — a central de ajuda
  // sempre oferece o próximo passo.
  it("oferece outros tutoriais no fim, com link relativo à central", () => {
    ler({ tutorial: tut({ blocos: [{ id: "x", tipo: "texto", conteudo: "<p>Oi</p>" }] }),
      relacionados: [{ handle: "trocar-refil", titulo: "Trocar o refil", capaUrl: "", duracaoMinutos: 2 }] });
    const link = screen.getByRole("link", { name: /Trocar o refil/ });
    expect(link.getAttribute("href")).toBe("/p/central/trocar-refil");
    expect(screen.getByText("Continue por aqui")).toBeTruthy();
  });

  it("sem relacionados, a seção não aparece", () => {
    ler({ tutorial: tut() });
    expect(screen.queryByText("Continue por aqui")).toBeNull();
  });

  // Guia longo no celular vira rolagem cega: a pessoa quer "o passo 4".
  it("passos ganham âncora, e o sumário (e o trilho de duas colunas) aparece a partir de três", () => {
    const { container, rerender } = render(<TutorialPublico tutorial={tut({ blocos: passos(2) })} centralTitulo="Central" centralUrl="/p/c" produtos={[]} />);
    // Com dois passos o sumário é maior que o caminho que encurtaria.
    expect(screen.queryByRole("navigation", { name: "Passos deste tutorial" })).toBeNull();
    expect(container.querySelector("#passo-1")).toBeTruthy();
    expect(container.querySelector("#passo-2")).toBeTruthy();
    expect(container.querySelector(".tut-leitura")?.hasAttribute("data-trilho")).toBe(false);

    rerender(<TutorialPublico tutorial={tut({ blocos: passos(4) })} centralTitulo="Central" centralUrl="/p/c" produtos={[]} />);
    const sumario = screen.getByRole("navigation", { name: "Passos deste tutorial" });
    expect(sumario.querySelectorAll("a")).toHaveLength(4);
    expect(sumario.querySelector("a")?.getAttribute("href")).toBe("#passo-1");
    expect(container.querySelector(".tut-leitura")?.getAttribute("data-trilho")).toBe("1");
  });

  it("escolher um passo no sumário leva até ele com o foco; a sanfona do celular não existe mais", () => {
    ler({ tutorial: tut({ blocos: passos(4) }) });
    expect(screen.queryByRole("button", { name: /Neste tutorial/ })).toBeNull();
    const sumario = screen.getByRole("navigation", { name: "Passos deste tutorial" });
    fireEvent.click(within(sumario).getByRole("link", { name: /Etapa 3/ }));
    expect(window.location.hash).toBe("#passo-3");
    expect(document.activeElement?.id).toBe("passo-3");
  });

  it("cada passo oferece copiar o próprio link, além do compartilhar do tutorial", () => {
    ler({ tutorial: tut({ blocos: [{ id: "a", tipo: "passo", titulo: "Primeiro", conteudo: "" }] }) });
    expect(screen.getAllByRole("button", { name: /Compartilhar/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Copiar link")).toHaveLength(1);
  });
});

describe("você vai precisar", () => {
  it("mostra só os materiais — o ligado a produto vira link; tempo, dificuldade e passos saíram", () => {
    ler({ produtos: [produto], tutorial: tut({
      dificuldade: "facil", blocos: passos(3),
      materiais: [
        { id: "m1", nome: "Tinta preta", produtoId: "p1" },
        { id: "m2", nome: "Papel de teste", produtoId: "" },
        { id: "m3", nome: "Almofada", produtoId: "saiu-de-linha" },
      ],
    }) });
    const secao = screen.getByRole("region", { name: "Você vai precisar" });
    expect(within(secao).queryByText(/min$/)).toBeNull();
    expect(within(secao).queryByText("Fácil")).toBeNull();
    expect(within(secao).queryByText("3 passos")).toBeNull();
    expect(within(secao).getByRole("link", { name: /Tinta preta/ }).getAttribute("href")).toBe("/l/tridi/carimbo");
    expect(within(secao).getByText("Papel de teste").closest("a")).toBeNull();
    // Produto que não voltou da loja (inativo) fica como texto, sem link morto.
    expect(within(secao).getByText("Almofada").closest("a")).toBeNull();
  });

  it("sem material o cartão não aparece, nem com passos e dificuldade", () => {
    ler({ tutorial: tut({ duracaoMinutos: 5, dificuldade: "facil", blocos: passos(4) }) });
    expect(screen.queryByRole("region", { name: "Você vai precisar" })).toBeNull();
  });

  it("guia de um parágrafo, sem material nem dificuldade, não ganha o cartão", () => {
    ler({ tutorial: tut({ blocos: [{ id: "x", tipo: "texto", conteudo: "<p>Oi</p>" }] }) });
    expect(screen.queryByRole("region", { name: "Você vai precisar" })).toBeNull();
  });
});

describe("passo feito", () => {
  it("Feito grava no aparelho, esmaece o passo, enche a barra por passos e Recomeçar limpa", () => {
    const { container } = ler({ tutorial: tut({ blocos: passos(2) }) });
    const [primeiro] = screen.getAllByRole("button", { name: "Marcar como feito" });
    expect(primeiro.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(primeiro);
    expect(primeiro.getAttribute("aria-pressed")).toBe("true");
    expect(primeiro.textContent).toBe("Feito");
    expect(JSON.parse(localStorage.getItem("tut-feitos:previa:usar") ?? "[]")).toEqual(["p1"]);
    expect(document.getElementById("passo-1")?.getAttribute("data-feito")).toBe("1");
    // Com passos, a barra do topo conta passos feitos — não a rolagem.
    expect((container.querySelector(".tut-progresso > div") as HTMLElement).style.transform).toBe("scaleX(0.5)");
    expect(screen.getByRole("status").textContent).toBe("1 de 2 passos feitos");

    fireEvent.click(screen.getByRole("button", { name: /Recomeçar/ }));
    expect(localStorage.getItem("tut-feitos:previa:usar")).toBeNull();
    expect(screen.queryByRole("button", { name: /Recomeçar/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Marcar como feito" })).toHaveLength(2);
  });

  it("o que ficou guardado volta marcado na próxima visita, sem anunciar nada ao abrir", () => {
    localStorage.setItem("tut-feitos:b1:usar", JSON.stringify(["p2", "passo-que-sumiu"]));
    ler({ tutorial: tut({ blocos: passos(2) }), botId: "b1" });
    expect(document.getElementById("passo-2")?.getAttribute("data-feito")).toBe("1");
    expect(document.getElementById("passo-1")?.hasAttribute("data-feito")).toBe(false);
    expect(screen.getByText("1 de 2 passos feitos")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

describe("avisos e problemas", () => {
  it("aviso é uma nota com o rótulo do estilo, e aviso vazio não vira caixa", () => {
    ler({ tutorial: tut({ blocos: [
      { id: "a1", tipo: "aviso", estilo: "atencao", conteudo: "<p>Cera quente queima.</p>" },
      { id: "a2", tipo: "aviso", estilo: "lembrete", conteudo: "Guarde longe do sol." },
      { id: "a3", tipo: "aviso", estilo: "dica", conteudo: "" },
    ] }) });
    const atencao = screen.getByRole("note", { name: "Atenção" });
    expect(atencao.getAttribute("data-estilo")).toBe("atencao");
    expect(within(atencao).getByText("Cera quente queima.")).toBeTruthy();
    expect(within(screen.getByRole("note", { name: "Lembrete" })).getByText("Guarde longe do sol.")).toBeTruthy();
    expect(screen.queryByRole("note", { name: "Dica" })).toBeNull();
  });

  it("'Deu errado?' lista sintoma e solução e oferece o WhatsApp com a mensagem pronta", () => {
    ler({ whatsapp: "11999998888", tutorial: tut({ blocos: [{ id: "pr", tipo: "problemas", itens: [
      { id: "i1", sintoma: "Saiu borrado", solucao: "<p>Use menos tinta.</p>" },
      { id: "i2", sintoma: "Saiu falhado", solucao: "Pressione por dois segundos." },
    ] }] }) });
    const secao = screen.getByRole("region", { name: "Deu errado?" });
    expect(within(secao).getAllByRole("listitem")).toHaveLength(2);
    expect(within(secao).getByText("Saiu borrado")).toBeTruthy();
    expect(within(secao).getByText("Use menos tinta.")).toBeTruthy();
    const zap = within(secao).getByRole("link", { name: /Não resolveu\? Fale com a gente/ });
    expect(zap.getAttribute("href")).toBe(linkWhatsapp("11999998888", mensagemWhatsapp({ titulo: "Usar", motivo: "problemas" })));
    expect(zap.getAttribute("href")).toContain(encodeURIComponent("tutorial “Usar”"));
    expect(zap.getAttribute("target")).toBe("_blank");
    expect(zap.getAttribute("rel")).toBe("noreferrer noopener");
  });

  it("sem WhatsApp na central, o 'Deu errado?' não oferece contato", () => {
    ler({ tutorial: tut({ blocos: [{ id: "pr", tipo: "problemas", itens: [{ id: "i1", sintoma: "Saiu borrado", solucao: "Limpe." }] }] }) });
    expect(screen.queryByRole("link", { name: /Fale com a gente/ })).toBeNull();
  });
});

describe("este tutorial resolveu?", () => {
  it("'Ainda não' abre os motivos no lugar e manda o motivo certo — e o WhatsApp leva a mensagem", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);
    const corpos = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as { botId: string; handle: string; campo: string });
    ler({ tutorial: tut({ blocos: passos(2) }), botId: "b1", whatsapp: "11999998888" });

    fireEvent.click(await screen.findByRole("button", { name: /Ainda não/ }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/p/tutorial-metrica");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", keepalive: true });
    expect(corpos()).toEqual([{ botId: "b1", handle: "usar", campo: "inuteis" }]);
    // No lugar da pergunta, sem modal por cima.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ainda não/ })).toBeNull();

    const confuso = screen.getByRole("button", { name: "Um passo ficou confuso" });
    fireEvent.click(confuso);
    expect(confuso.getAttribute("aria-pressed")).toBe("true");
    expect(corpos().at(-1)).toEqual({ botId: "b1", handle: "usar", campo: "motivo_passo" });
    // Trocar de ideia muda a seleção (e a mensagem), mas não soma outro "não".
    fireEvent.click(screen.getByRole("button", { name: "O resultado saiu errado" }));
    expect(confuso.getAttribute("aria-pressed")).toBe("false");
    expect(corpos().filter((c) => c.campo.startsWith("motivo_"))).toHaveLength(1);

    const zap = screen.getByRole("link", { name: /Falar no WhatsApp/ });
    expect(decodeURIComponent(zap.getAttribute("href")!.split("text=")[1])).toContain("O resultado saiu errado.");
    fireEvent.click(zap);
    expect(corpos().at(-1)).toEqual({ botId: "b1", handle: "usar", campo: "contatos" });
    // Um voto por tutorial por navegador.
    expect(localStorage.getItem("tut-voto:b1:usar")).toBe("inuteis");
  });

  it("prévia (sem central publicada) não pergunta nem conta", () => {
    ler({ tutorial: tut({ blocos: passos(2) }) });
    expect(screen.queryByText("Este tutorial resolveu?")).toBeNull();
  });
});

describe("manter tela acesa", () => {
  it("sem Wake Lock no navegador, o botão nem aparece", () => {
    ler({ tutorial: tut({ blocos: passos(2) }) });
    expect(screen.queryByRole("button", { name: /Manter tela acesa/ })).toBeNull();
  });

  it("com Wake Lock, nunca liga sozinho: o toque pede a tela e o segundo toque solta", async () => {
    const { request, release } = simularWakeLock();
    ler({ tutorial: tut({ blocos: passos(2) }) });
    const botao = await screen.findByRole("button", { name: /Manter tela acesa/ });
    expect(request).not.toHaveBeenCalled();
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(botao);
    expect(request).toHaveBeenCalledWith("screen");
    expect(botao.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {});
    fireEvent.click(botao);
    expect(release).toHaveBeenCalled();
    expect(botao.getAttribute("aria-pressed")).toBe("false");
  });

  it("o passo a passo pede a tela acesa ao entrar e solta ao sair", async () => {
    const { request, release } = simularWakeLock();
    ler({ tutorial: tut({ blocos: passos(2) }) });
    fireEvent.click(await screen.findByRole("button", { name: /Passo a passo em tela cheia/ }));
    expect(request).toHaveBeenCalledWith("screen");
    await act(async () => {});
    fireEvent.keyDown(document, { key: "Escape" });
    expect(release).toHaveBeenCalled();
  });
});

describe("passo a passo em tela cheia", () => {
  it("abre por cima de tudo, troca por Próximo/Anterior e setas, e Esc fecha devolvendo o foco", () => {
    ler({ tutorial: tut({ blocos: passos(3) }) });
    const abrir = screen.getByRole("button", { name: /Passo a passo em tela cheia/ });
    fireEvent.click(abrir);
    const dialogo = screen.getByRole("dialog", { name: "Passo a passo" });
    // Portal no <body>: nenhum ancestral da página recorta nem empilha a camada.
    expect(dialogo.parentElement).toBe(document.body);
    expect(within(dialogo).getByText("Passo 1 de 3")).toBeTruthy();
    expect(within(dialogo).getByRole("heading", { level: 2 }).textContent).toContain("Etapa 1");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(within(dialogo).getByRole("button", { name: /Próximo/ }));
    expect(within(dialogo).getByText("Passo 2 de 3")).toBeTruthy();
    expect(window.location.hash).toBe("#passo-2");
    // O foco vai pro título do passo novo: o leitor de tela anuncia onde está.
    expect(document.activeElement?.textContent).toContain("Etapa 2");

    fireEvent.click(within(dialogo).getByRole("button", { name: /Anterior/ }));
    expect(within(dialogo).getByText("Passo 1 de 3")).toBeTruthy();

    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(dialogo).getByText("Passo 3 de 3")).toBeTruthy();
    // No último, o principal vira "Concluir".
    expect(within(dialogo).queryByRole("button", { name: /Próximo/ })).toBeNull();
    expect(within(dialogo).getByRole("button", { name: /Concluir/ })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(abrir);
  });

  it("Feito no modo marca o passo da página e segue pro próximo", () => {
    ler({ tutorial: tut({ blocos: passos(3) }) });
    fireEvent.click(screen.getByRole("button", { name: /Passo a passo em tela cheia/ }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Feito" }));
    expect(within(dialogo).getByText("Passo 2 de 3")).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Feito" }).getAttribute("aria-pressed")).toBe("false");
    expect(document.getElementById("passo-1")?.getAttribute("data-feito")).toBe("1");
  });

  it("com um passo só não há passo a passo", () => {
    ler({ tutorial: tut({ blocos: passos(1) }) });
    expect(screen.queryByRole("button", { name: /Passo a passo em tela cheia/ })).toBeNull();
  });
});
