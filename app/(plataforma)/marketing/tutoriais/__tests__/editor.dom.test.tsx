import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorBlocosTutorial } from "../[id]/EditorBlocosTutorial";
import { CentralTutoriaisEditor } from "../[id]/CentralTutoriaisEditor";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("editor da Central de Tutoriais", () => {
  it("toda linha ordenada oferece ações por botão, sem depender de hover", () => {
    render(<EditorBlocosTutorial blocos={[
      { id: "a", tipo: "texto", titulo: "Introdução", conteudo: "" },
      { id: "b", tipo: "produto", produtoId: "p1", titulo: "Produto", botao: "Ver" },
    ]} produtos={[{ id: "p1", titulo: "Carimbo" }]} onMudar={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: "Mover para cima" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Mover para baixo" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Remover bloco" })).toHaveLength(2);
  });

  it("adiciona produto guardando apenas o id e campos editoriais", () => {
    const mudar = vi.fn();
    render(<EditorBlocosTutorial blocos={[]} produtos={[{ id: "p1", titulo: "Carimbo" }]} onMudar={mudar} onUpload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
    const bloco = mudar.mock.calls[0][0][0];
    expect(bloco).toMatchObject({ tipo: "produto", produtoId: "", titulo: "Produto utilizado", botao: "Ver produto" });
    expect(bloco).not.toHaveProperty("nome");
  });

  it("envia mídia diretamente de um bloco e grava a URL devolvida", async () => {
    const mudar = vi.fn();
    const upload = vi.fn().mockResolvedValue("https://cdn.exemplo/imagem.webp");
    const { container } = render(<EditorBlocosTutorial blocos={[
      { id: "img", tipo: "imagem", url: "", alt: "", legenda: "" },
    ]} produtos={[]} onMudar={mudar} onUpload={upload} />);
    const arquivo = new File(["imagem"], "tutorial.webp", { type: "image/webp" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [arquivo] } });
    await waitFor(() => expect(mudar).toHaveBeenCalledWith([
      { id: "img", tipo: "imagem", url: "https://cdn.exemplo/imagem.webp", alt: "", legenda: "" },
    ]));
  });

  it("não publica um rascunho quando salvar o documento falha", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ produtos: [] }), { status: 200 });
      chamadas.push(init.method);
      return new Response(JSON.stringify({ error: "falhou" }), { status: 500 });
    }));
    render(<CentralTutoriaisEditor bot={{ id: "b1", nome: "Central", slug: "central", status: "rascunho", dominioHost: null, dominioId: null, publicadoEm: null, atualizadoEm: "2026-09-03T10:00:00.000Z", pagina: { versao: 1, secoes: [], config: { template: "central_tutoriais", centralTutoriais: { reels: [], depoimentos: [], titulo: "Central", subtitulo: "", sobrelinha: "", mostrarTitulo: true, catalogoLoja: "", catalogoRotulo: "", todosImagemUrl: "", todosRotulo: "", whatsapp: "", atalhos: [], categorias: [], tutoriais: [] } } } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(chamadas).toContain("PATCH"));
    expect(chamadas).not.toContain("POST");
  });
  // Salvar NÃO publica. Sem este par (selo + "Publicar alterações"), quem
  // editava um tutorial via "salvo", abria o link, achava que o app tinha
  // perdido a alteração — e não tinha como republicar, porque o botão
  // principal virava "Despublicar" na hora em que a central subia.
  it("central publicada com alteração salva depois mostra a pendência e permite republicar", async () => {
    const acoes: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ produtos: [] }), { status: 200 });
      if (init.method === "POST") acoes.push(JSON.parse(String(init.body)).acao);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    render(<CentralTutoriaisEditor bot={{
      id: "b1", nome: "Central", slug: "central", status: "publicado", dominioHost: null, dominioId: null,
      publicadoEm: "2026-09-01T10:00:00.000Z", atualizadoEm: "2026-09-03T10:00:00.000Z",
      pagina: { versao: 1, secoes: [], config: { template: "central_tutoriais", centralTutoriais: { reels: [], depoimentos: [], titulo: "Central", subtitulo: "", sobrelinha: "", mostrarTitulo: true, catalogoLoja: "", catalogoRotulo: "", todosImagemUrl: "", todosRotulo: "", whatsapp: "", atalhos: [], categorias: [], tutoriais: [] } } },
    }} />);
    expect(screen.getByText("Alterações não publicadas")).toBeTruthy();
    // Despublicar deixou de ser o único botão: os dois convivem.
    expect(screen.getByRole("button", { name: /Despublicar/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Publicar alterações/ }));
    await waitFor(() => expect(acoes).toEqual(["publicar"]));
    // Republicado: o aviso sai de cena e o botão roxo com ele.
    await waitFor(() => expect(screen.queryByText("Alterações não publicadas")).toBeNull());
    expect(screen.queryByRole("button", { name: /Publicar alterações/ })).toBeNull();
  });

  it("em dia, a central publicada não oferece um botão roxo sem efeito", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ produtos: [] }), { status: 200 })));
    render(<CentralTutoriaisEditor bot={{
      id: "b1", nome: "Central", slug: "central", status: "publicado", dominioHost: null, dominioId: null,
      publicadoEm: "2026-09-03T10:00:00.000Z", atualizadoEm: "2026-09-03T10:00:00.500Z",
      pagina: { versao: 1, secoes: [], config: { template: "central_tutoriais", centralTutoriais: { reels: [], depoimentos: [], titulo: "Central", subtitulo: "", sobrelinha: "", mostrarTitulo: true, catalogoLoja: "", catalogoRotulo: "", todosImagemUrl: "", todosRotulo: "", whatsapp: "", atalhos: [], categorias: [], tutoriais: [] } } },
    }} />);
    expect(screen.queryByText("Alterações não publicadas")).toBeNull();
    expect(screen.queryByRole("button", { name: /Publicar/ })).toBeNull();
  });

  // Filtrar não pode virar reordenar: mover o 3º de uma lista filtrada não quer
  // dizer nada na ordem real da central.
  it("o filtro da lista esconde o que não casa e recolhe as ações de ordem", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ produtos: [] }), { status: 200 })));
    const tutorial = (i: number, titulo: string) => ({
      id: `t${i}`, categoriaId: null, titulo, handle: `t${i}`, descricao: "", capaUrl: "", palavrasChave: [],
      duracaoMinutos: null, quantidadeEtapas: null, tipoMidia: null, selo: null, destaque: false,
      status: "publicado" as const, ordem: i, blocos: [], dificuldade: null, materiais: [],
    });
    const titulos = ["Trocar o refil", "Limpar a almofada", "Montar a chancela", "Guardar o carimbo", "Ajustar a data", "Recarregar o refil"];
    render(<CentralTutoriaisEditor bot={{
      id: "b1", nome: "Central", slug: "central", status: "rascunho", dominioHost: null, dominioId: null,
      publicadoEm: null, atualizadoEm: "2026-09-03T10:00:00.000Z",
      pagina: { versao: 1, secoes: [], config: { template: "central_tutoriais", centralTutoriais: { reels: [], depoimentos: [], titulo: "Central", subtitulo: "", sobrelinha: "", mostrarTitulo: true, catalogoLoja: "", catalogoRotulo: "", todosImagemUrl: "", todosRotulo: "", whatsapp: "", atalhos: [], categorias: [], tutoriais: titulos.map((t, i) => tutorial(i, t)) } } },
    }} />);
    expect(screen.getAllByRole("button", { name: "Mover para cima" })).toHaveLength(6);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filtrar tutoriais" }), { target: { value: "refil" } });
    expect(screen.getByText("Trocar o refil")).toBeTruthy();
    expect(screen.getByText("Recarregar o refil")).toBeTruthy();
    expect(screen.queryByText("Montar a chancela")).toBeNull();
    expect(screen.queryAllByRole("button", { name: "Mover para cima" })).toHaveLength(0);
  });
  // Mirar num lápis de 15px era o único jeito de abrir um tutorial, e a prévia
  // exigia montar a URL na mão.
  it("o título abre a edição e a linha leva à prévia daquele tutorial", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ produtos: [] }), { status: 200 })));
    render(<CentralTutoriaisEditor bot={{
      id: "c9", nome: "Central", slug: "central", status: "publicado", dominioHost: "ajuda.exemplo.com", dominioId: null,
      publicadoEm: "2026-09-03T10:00:00.000Z", atualizadoEm: "2026-09-03T10:00:00.100Z",
      pagina: { versao: 1, secoes: [], config: { template: "central_tutoriais", centralTutoriais: { reels: [], depoimentos: [],
        titulo: "Central", subtitulo: "", sobrelinha: "", mostrarTitulo: true, catalogoLoja: "", catalogoRotulo: "", todosImagemUrl: "", todosRotulo: "", whatsapp: "", atalhos: [], categorias: [],
        tutoriais: [{ id: "t1", categoriaId: null, titulo: "Trocar o refil", handle: "trocar-refil", descricao: "", capaUrl: "", palavrasChave: [], duracaoMinutos: null, quantidadeEtapas: null, tipoMidia: null, selo: null, destaque: false, status: "publicado" as const, ordem: 0, blocos: [], dificuldade: null, materiais: [] }],
      } } },
    }} />);
    expect(screen.getByRole("link", { name: /Abrir prévia de Trocar o refil/ }).getAttribute("href")).toBe("/previa/tutoriais/c9/trocar-refil");
    fireEvent.click(screen.getByText("Trocar o refil"));
    // Abriu o formulário — e ele mostra o endereço final por extenso.
    expect(screen.getByText("Editar tutorial")).toBeTruthy();
    // O endereço vive em "Mais opções" (revelação progressiva).
    expect(screen.getByText(/ajuda\.exemplo\.com\/p\/central\/trocar-refil/)).toBeTruthy();
  });
  // A barra é fixa (Tutoriais · Loja · Contato): a configuração só diz pra
  // onde Loja e Contato levam. Sem os dois, a barra não aparece — e o editor
  // avisa, em vez de a central ficar sem rodapé sem ninguém entender por quê.
  it("barra do rodapé: loja e WhatsApp preenchem os botões e o salvar grava os dois", async () => {
    const chamadas: { url: string; corpo?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url: String(url), corpo: init?.body as string | undefined });
      return new Response(JSON.stringify({ produtos: [], ok: true }), { status: 200 });
    }));
    render(<CentralTutoriaisEditor catalogoUrl="/l/minha-loja" bot={{
      id: "b1", nome: "Central", slug: "central", status: "rascunho", dominioHost: null, dominioId: null,
      publicadoEm: null, atualizadoEm: "2026-09-08T10:00:00.000Z",
      pagina: { versao: 1, secoes: [], config: { template: "central_tutoriais", centralTutoriais: { reels: [], depoimentos: [], titulo: "Central", subtitulo: "", sobrelinha: "", mostrarTitulo: true, catalogoLoja: "", catalogoRotulo: "", todosImagemUrl: "", todosRotulo: "", whatsapp: "", atalhos: [], categorias: [], tutoriais: [] } } },
    }} />);
    fireEvent.click(screen.getByRole("button", { name: /Configurações/ }));
    expect(await screen.findByText(/a barra não aparece na página/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Usar a vitrine publicada/ }));
    expect((screen.getByLabelText("Link da loja") as HTMLInputElement).value).toBe("/l/minha-loja");
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "(11) 99999-8888" } });
    expect(screen.queryByText(/a barra não aparece na página/)).toBeNull();
  });

});
