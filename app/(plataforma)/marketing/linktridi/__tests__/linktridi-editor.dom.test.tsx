import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { normalizarLinkTridi, TEMAS_LINKTRIDI, type LinkTridiDoc } from "@/lib/tridiflow-linktridi";
import { SETTINGS_PADRAO, type BotSettings } from "@/lib/tridiflow";

// A prévia é o player inteiro (vídeo, IntersectionObserver) — aqui só importa
// que ela recebe o doc. Os Resultados buscam dados que o teste não tem.
vi.mock("@/app/f/LinkTridiRuntime", () => ({
  LinkTridiRuntime: ({ doc }: { doc: LinkTridiDoc }) => <div data-testid="previa">{doc.perfil.nome}</div>,
}));
vi.mock("../../[id]/resultados/ResultadosClient", () => ({ ResultadosClient: () => null }));

import { LinkTridiEditor, LinkTridiEditorClient, type BotDoEditorLT } from "../[id]/LinkTridiEditorClient";
import { AjustesLT } from "../[id]/AjustesLT";

// Cores ajustadas à mão (nenhum tema) — é o caso em que trocar de tema
// poderia jogar fora o trabalho de alguém.
const DOC = normalizarLinkTridi({
  perfil: { nome: "Tridi Gaia", bio: "Carimbos feitos à mão", social: {} },
  cores: { fundo: "#101010", cartao: "#202020", destaque: "#abcdef", cta: "#123456", preco: "#654321", badge: "#fedcba", formas: true },
  posts: [
    { id: "a", titulo: "Kit", destinoUrl: "https://x.com/kit", tipo: "imagem", mediaUrl: "", publicado: true },
    { id: "b", titulo: "Curso", destinoUrl: "https://x.com/curso", tipo: "imagem", mediaUrl: "", publicado: true },
    { id: "c", titulo: "Grupo", destinoUrl: "https://x.com/grupo", tipo: "imagem", mediaUrl: "", publicado: true },
  ],
});
const BOT: BotDoEditorLT = {
  id: "b1", nome: "Bio", slug: "carimbos-tridi", dominioId: null, status: "publicado",
  settings: { ...SETTINGS_PADRAO, modo: "linktridi", linktridi: DOC },
};

function Corpo({ onDoc }: { onDoc: (d: LinkTridiDoc) => void }) {
  const [doc, setDoc] = useState(DOC);
  return <LinkTridiEditor doc={doc} onChange={(d) => { setDoc(d); onDoc(d); }} />;
}

type Chamada = { url: string; metodo: string; corpo: Record<string, unknown> };
function redeFalsa(opcoes: { livre?: boolean } = {}) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : {};
    chamadas.push({ url: String(url), metodo: init?.method ?? "GET", corpo });
    if (String(url).includes("/analytics")) return new Response(JSON.stringify({ porEtapa: [] }), { status: 200 });
    if (corpo.acao === "checarCaminho") return new Response(JSON.stringify({ livre: opcoes.livre ?? true }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }));
  return chamadas;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("editor do LinkTridi — corpo", () => {
  it("tocar num tema troca as seis cores, e 'Minhas cores' devolve as ajustadas à mão", () => {
    let ultimo = DOC;
    render(<Corpo onDoc={(d) => { ultimo = d; }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Aparência" }));
    const temas = screen.getByRole("radiogroup", { name: "Tema de cores" });
    expect(within(temas).getByRole("radio", { name: "Minhas cores" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(temas).getByRole("radio", { name: "Noite" }));
    expect(ultimo.cores).toMatchObject(TEMAS_LINKTRIDI.find((t) => t.id === "noite")!.cores);

    fireEvent.click(within(temas).getByRole("radio", { name: "Minhas cores" }));
    expect(ultimo.cores).toMatchObject({ fundo: "#101010", destaque: "#abcdef", badge: "#fedcba" });
  });

  it("remover deixa o Desfazer no lugar do cartão, e desfazer devolve na mesma posição", () => {
    let ultimo = DOC;
    render(<Corpo onDoc={(d) => { ultimo = d; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Curso/, expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(ultimo.posts.map((p) => p.id)).toEqual(["a", "c"]);
    expect(screen.getByRole("status")).toHaveTextContent("“Curso” removido");

    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(ultimo.posts.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("o @ do Instagram vira o link do perfil ao sair do campo", () => {
    let ultimo = DOC;
    render(<Corpo onDoc={(d) => { ultimo = d; }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Aparência" }));
    const campo = screen.getByLabelText("Instagram");
    fireEvent.change(campo, { target: { value: "@carimbostridi" } });
    fireEvent.blur(campo);
    expect(ultimo.perfil.social.instagram).toBe("https://instagram.com/carimbostridi");
    expect(campo).toHaveValue("https://instagram.com/carimbostridi");
  });
});

describe("editor do LinkTridi — ajustes", () => {
  it("a prévia do link usa o perfil (nunca 'Atendimento') e desligar o clique do cartão grava a regra", () => {
    const onSettings = vi.fn();
    const settings: BotSettings = { ...SETTINGS_PADRAO, modo: "linktridi", linktridi: DOC };
    render(<AjustesLT doc={DOC} nome="Projeto" settings={settings} onSettings={onSettings} publicacao={{
      status: "publicado", link: "https://tridigaius.vercel.app/f/carimbos-tridi", publicando: false,
      onPublicar: vi.fn(), onTirarDoAr: vi.fn(), onEndereco: vi.fn(), onCompartilhar: vi.fn(),
    }} />);
    const previa = screen.getByLabelText("Como o link aparece quando é compartilhado");
    expect(previa).toHaveTextContent("Tridi Gaia");
    expect(previa).toHaveTextContent("Carimbos feitos à mão");
    expect(previa).not.toHaveTextContent("Atendimento");

    fireEvent.click(screen.getByRole("switch", { name: "Tocou num cartão" }));
    const s = onSettings.mock.calls.at(-1)![0] as BotSettings;
    expect(s.conversoes?.find((r) => r.gatilho === "oferta")?.ativo).toBe(false);
    expect(s.conversoes?.find((r) => r.gatilho === "abertura")?.ativo).toBe(true);
  });
});

describe("editor do LinkTridi — salvar e endereço", () => {
  it("o auto-save manda nome e settings — o endereço nunca vai junto", async () => {
    const chamadas = redeFalsa();
    render(<LinkTridiEditorClient initial={BOT} dominios={[]} />);
    fireEvent.change(screen.getByLabelText(/Nome do projeto/), { target: { value: "Bio nova" } });
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "PATCH")).toBe(true), { timeout: 2500 });
    const patch = chamadas.find((c) => c.metodo === "PATCH")!;
    expect(patch.corpo).toMatchObject({ id: "b1", nome: "Bio nova" });
    expect(patch.corpo).not.toHaveProperty("slug");
    expect(patch.corpo).not.toHaveProperty("dominioId");
    expect(await screen.findByText(/Salvo às/)).toBeInTheDocument();
  });

  it("trocar o endereço no ar avisa que o link de agora morre e só grava quando está livre", async () => {
    const chamadas = redeFalsa({ livre: true });
    render(<LinkTridiEditorClient initial={BOT} dominios={[]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Ajustes" }));
    fireEvent.click(screen.getByRole("button", { name: /^Endereço/ }));
    const campo = await screen.findByRole("textbox", { name: "Endereço" });
    expect(screen.getByRole("button", { name: "Salvar endereço" })).toBeDisabled();

    fireEvent.change(campo, { target: { value: "Novo Link" } });
    expect(campo).toHaveValue("novo-link");
    expect(screen.getByText(/para de abrir assim que você salvar/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar endereço" })).toBeEnabled(), { timeout: 2500 });

    fireEvent.click(screen.getByRole("button", { name: "Salvar endereço" }));
    await waitFor(() => expect(chamadas.find((c) => c.metodo === "PATCH" && c.corpo.slug)).toBeTruthy());
    expect(chamadas.find((c) => c.metodo === "PATCH" && c.corpo.slug)!.corpo).toEqual({ id: "b1", slug: "novo-link", dominioId: null });
  });

  it("endereço de outro projeto vira erro no campo e o Salvar não libera", async () => {
    redeFalsa({ livre: false });
    render(<LinkTridiEditorClient initial={BOT} dominios={[]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Ajustes" }));
    fireEvent.click(screen.getByRole("button", { name: /^Endereço/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Endereço" }), { target: { value: "ocupado" } });
    expect(await screen.findByText("Esse endereço já é de outro projeto.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar endereço" })).toBeDisabled();
  });

  it("sem a chave de editar: nada de Publicar, e o conteúdo das abas fica inerte", () => {
    redeFalsa();
    const { container } = render(<LinkTridiEditorClient initial={{ ...BOT, status: "rascunho" }} dominios={[]} podeEditar={false} />);
    expect(screen.queryByRole("button", { name: "Publicar" })).toBeNull();
    expect(container.querySelector(".lte-form-conteudo")).toHaveAttribute("inert");
  });
});
