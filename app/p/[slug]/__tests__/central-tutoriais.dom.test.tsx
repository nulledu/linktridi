import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CentralTutoriais } from "../CentralTutoriais";
import { Icon } from "@/app/(plataforma)/Icon";
import { linkWhatsapp, normalizarAtalhos, type AtalhoCentral, type MetaCartao, type TutorialCartao } from "@/lib/tridiflow-tutoriais";

afterEach(cleanup);
const meta = (extra: Partial<MetaCartao> = {}): MetaCartao => ({ icone: "clock", texto: "3 min", passos: 0, minutos: 3, video: false, ...extra });
const item = (id: string, extra: Partial<TutorialCartao> = {}): TutorialCartao => ({ id, categoriaId: "c", titulo: `Tutorial ${id}`, handle: id, descricao: "Configuração da máquina", capaUrl: "", selo: null, destaque: false, ordem: 0, meta: meta(), ...extra });
const cat = (id: string, nome: string, ativa = true) => ({ id, nome, imagemUrl: "", ordem: 0, ativa });
const ZAP = "5511999999999";

describe("Central pública", () => {
  // ── Biblioteca visual: busca + círculos que filtram + destaques + grade ──
  // Duas telas: primeiro SÓ as categorias; tocar numa abre outra tela com os
  // tutoriais dela e o "← Categorias". Misturadas, viravam uma parede só.
  it("tela 1 só tem categorias; tocar abre a tela 2 com os tutoriais dela, e voltar retorna", () => {
    window.history.replaceState(null, "", "/p/t");
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t"
      categorias={[cat("emb", "Embalagens"), cat("mad", "Madeira")]}
      tutoriais={[item("a", { categoriaId: "emb", titulo: "Carimbar a caixa" }), item("b", { categoriaId: "mad", titulo: "Gravar na tábua" })]} />);
    const nav = screen.getByRole("navigation", { name: "Categorias" });
    expect(within(nav).getByRole("button", { name: /^Todos 2 tutoriais$/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Carimbar a caixa/ })).toBeNull();

    fireEvent.click(within(nav).getByRole("button", { name: /^Madeira 1 tutorial$/ }));
    expect(screen.queryByRole("navigation", { name: "Categorias" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: /Madeira/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gravar na tábua/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Carimbar a caixa/ })).toBeNull();
    expect(new URLSearchParams(window.location.search).get("c")).toBe("mad");

    // "Todos" é a tela 2 com a lista inteira, cada cartão dizendo a categoria.
    fireEvent.click(screen.getByRole("button", { name: /Categorias/ }));
  });

  it("“Todos” abre a lista inteira com a categoria em cada cartão", () => {
    window.history.replaceState(null, "", "/p/t");
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={[cat("emb", "Embalagens"), cat("mad", "Madeira")]}
      tutoriais={[item("a", { categoriaId: "emb", titulo: "Carimbar a caixa" }), item("b", { categoriaId: "mad", titulo: "Gravar na tábua" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Todos/ }));
    expect(within(screen.getByRole("link", { name: /Gravar na tábua/ })).getByText("Madeira")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Carimbar a caixa/ })).toBeTruthy();
  });
  it("link com ?c= abre direto a tela da categoria; inexistente ou oculta cai nas categorias, e voltar não sai do site", () => {
    const categorias = [cat("oculta", "Oculta", false), cat("real", "Real")];
    const tutoriais = [item("a", { categoriaId: "real", titulo: "Trocar o refil" }), item("x", { categoriaId: "oculta", titulo: "Guia escondido" })];
    window.history.replaceState(null, "", "/p/t?c=real");
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={categorias} tutoriais={tutoriais} />);
    expect(screen.getByRole("link", { name: /Trocar o refil/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Guia escondido/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Categorias/ }));
    expect(screen.getByRole("navigation", { name: "Categorias" })).toBeTruthy();
    expect(window.location.pathname + window.location.search).toBe("/p/t");
    cleanup();
    for (const c of ["fantasma", "oculta"]) {
      window.history.replaceState(null, "", `/p/t?c=${c}`);
      render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={categorias} tutoriais={tutoriais} />);
      expect(screen.getByRole("navigation", { name: "Categorias" })).toBeTruthy();
      // Esconder a categoria tira o CARTÃO do ar, não os guias: seguem em Todos.
      expect(screen.queryByRole("button", { name: /Oculta|Outros/ })).toBeNull();
      expect(screen.getByRole("button", { name: /^Todos 2 tutoriais$/ })).toBeTruthy();
      cleanup();
    }
  });
  it("“Outros” junta o que não tem categoria e o que era de categoria apagada", () => {
    window.history.replaceState(null, "", "/p/t");
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={[cat("real", "Real")]}
      tutoriais={[item("a", { categoriaId: null, titulo: "Sem gaveta" }), item("b", { categoriaId: "apagada", titulo: "Gaveta apagada" }), item("c", { categoriaId: "real", titulo: "Da real" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Outros 2 tutoriais$/ }));
    expect(screen.getByRole("link", { name: /Sem gaveta/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gaveta apagada/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Da real/ })).toBeNull();
  });

  it("sem categoria nenhuma, não há fileira de círculos — só a grade", () => {
    window.history.replaceState(null, "", "/p/t");
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={[cat("vazia", "Vazia")]} tutoriais={[item("a", { categoriaId: null, titulo: "Trocar o refil" })]} />);
    expect(screen.getByRole("link", { name: /Trocar o refil/ })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Categorias" })).toBeNull();
  });

  // Pedido do dono: categoria só aparece com pelo menos 1 tutorial — nem na prévia.
  it("categoria sem tutorial não aparece, nem na prévia", () => {
    window.history.replaceState(null, "", "/p/t");
    const categorias = [cat("cheia", "Cheia"), cat("vazia", "Vazia")];
    const tutoriais = [item("a", { categoriaId: "cheia" })];
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={categorias} tutoriais={tutoriais} mostrarVazias />);
    expect(screen.getByRole("button", { name: /^Cheia 1 tutorial$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Vazia/ })).toBeNull();
  });
  it("não há fileira de Destaques; o destaque vem primeiro na lista", () => {
    window.history.replaceState(null, "", "/p/t?c=c");
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={[cat("c", "Máquinas")]}
      tutoriais={[item("comum", { titulo: "Guia comum" }), item("d", { destaque: true, ordem: 5, titulo: "Guia destaque" })]} />);
    expect(screen.queryByRole("region", { name: "Destaques" })).toBeNull();
    const grade = document.querySelector<HTMLElement>(".tut-grade")!;
    expect(within(grade).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/p/t/d", "/p/t/comum"]);
  });
  it("selo Novo no cartão e a contagem de novos no cartão Todos; o cartão não mostra duração", () => {
    window.history.replaceState(null, "", "/p/t");
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={[cat("c", "Máquinas")]}
      tutoriais={[item("a", { selo: "novo", titulo: "Recém-chegado" }), item("b", { selo: "novo" }), item("v", { titulo: "Em vídeo", meta: meta({ video: true, minutos: 4, icone: "player-play" }) })]} />);
    expect(within(screen.getByRole("button", { name: /Todos 3 tutoriais/ })).getByText("2 novos")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Todos 3 tutoriais/ }));
    expect(within(screen.getByRole("link", { name: /Recém-chegado/ })).getByText("Novo")).toBeTruthy();
    expect(within(screen.getByRole("link", { name: /Em vídeo/ })).queryByText(/min/)).toBeNull();
  });
  it("fim da lista convida pro feed de ideias (não mais o “Não achou?”)", () => {
    window.history.replaceState(null, "", "/p/t");
    const base = { titulo: "C", subtitulo: "", slug: "t", categorias: [cat("c", "Máquinas")], tutoriais: [item("a")], whatsapp: ZAP };
    const reel = { id: "r", titulo: "R", legenda: "", videoUrl: "https://x.com/a.mp4", capaUrl: "", linkUrl: "", botao: "Comprar", ativo: true, ordem: 0 };
    const { rerender } = render(<CentralTutoriais {...base} />);
    expect(screen.queryByRole("link", { name: /Fale com a gente/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ver ideias/ })).toBeNull();
    rerender(<CentralTutoriais {...base} reels={[reel]} />);
    expect(screen.getByRole("button", { name: /Ver ideias/ })).toBeTruthy();
  });

  it("sobrelinha, título e subtítulo somem quando desligados", () => {
    const { rerender } = render(<CentralTutoriais titulo="Central" subtitulo="Aprenda" sobrelinha="No seu ritmo" slug="t" categorias={[]} tutoriais={[item("a")]} />);
    expect(screen.getByText("No seu ritmo")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Central" })).toBeTruthy();
    rerender(<CentralTutoriais titulo="Central" subtitulo="" sobrelinha="" mostrarTitulo={false} slug="t" categorias={[]} tutoriais={[item("a")]} />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("No seu ritmo")).toBeNull();
    // O cabeçalho inteiro sai de cena — nada de casca vazia com padding.
    expect(document.querySelector(".tut-cabecalho")).toBeNull();
  });

  // ── Navegação em dois níveis ───────────────────────────────────────────────
  // A categoria deixou de ser um filtro discreto (bolinha de 72px) e virou o
  // CAMINHO: é a primeira escolha, então ocupa um cartão e diz quanto tem
  // dentro. Clicar abre a lista daquela gaveta.

  it("não há campo de busca", () => {
    render(<CentralTutoriais titulo="Tutoriais" subtitulo="" slug="t" categorias={[]} tutoriais={[item("a")]} />);
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  // A barra é fixa: Tutoriais, Loja e Compartilhar. "Site" configurado não entra.
  it("a barra do rodapé tem só Tutoriais, Loja e Compartilhar", () => {
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={[]} tutoriais={[item("a")]} whatsapp={ZAP} atalhos={[
      { id: "1", rotulo: "Site", icone: "world-www", acao: "link", url: "https://site.test", destaque: false },
      { id: "2", rotulo: "Loja", icone: "shopping-bag", acao: "link", url: "https://ex.com", destaque: false },
    ]} />);
    const barra = screen.getByRole("navigation", { name: "Atalhos da central" });
    expect(within(barra).getByRole("button", { name: /Tutoriais/ })).toBeTruthy();
    expect(within(barra).getByRole("link", { name: /Loja/ }).getAttribute("href")).toBe("https://ex.com");
    expect(within(barra).getByRole("button", { name: /Compartilhar/ })).toBeTruthy();
    expect(within(barra).queryByText("Contato")).toBeNull();
    expect(within(barra).queryByText("Site")).toBeNull();
  });

  it("normalizar deixa um destaque só e derruba link sem endereço", () => {
    const a = normalizarAtalhos([
      { rotulo: "Um", acao: "link", url: "https://a", destaque: true },
      { rotulo: "Dois", acao: "link", url: "https://b", destaque: true },
      { rotulo: "Sem endereço", acao: "link", url: "" },
      { rotulo: "Topo", acao: "topo" },
    ]);
    expect(a.map((x) => x.rotulo)).toEqual(["Um", "Dois", "Topo"]);
    expect(a.filter((x) => x.destaque)).toHaveLength(1);
    expect(a[0].destaque).toBe(true);
  });
  // Categoria recém-criada, ainda sem tutorial: no ar ela não vira caminho
  // morto, mas na PRÉVIA o dono precisa vê-la pra saber que ela existe.

  it("o cartão não mostra o resumo de passos/tempo (saiu em 24/09/26)", () => {
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={[]}
      tutoriais={[item("a", { meta: meta({ icone: "list-numbers", texto: "4 passos · 3 min", passos: 4 }) })]} />);
    expect(within(screen.getByRole("link", { name: /Tutorial a/ })).queryByText("4 passos · 3 min")).toBeNull();
  });

  // Esconder a categoria tira o CARTÃO do ar, não os guias.

  it("sem loja, a barra fica com Tutoriais e Compartilhar", () => {
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" categorias={[]} tutoriais={[item("a")]} />);
    const barra = screen.getByRole("navigation", { name: "Atalhos da central" });
    expect(within(barra).getAllByRole("button").map((b) => b.textContent)).toEqual(["Tutoriais", "Compartilhar"]);
  });
});
