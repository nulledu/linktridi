import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// A aba Fornecedores nasceu vazia e a planilha do galpão tem 17 nomes. Duas
// coisas não podem acontecer aqui:
//
// 1. Cadastrar um a um. Dezessete formulários é o caminho que ninguém percorre
//    — e fornecedor não cadastrado é item sem origem no catálogo inteiro.
// 2. Juntar sozinha o que PARECE igual. "AVARÉ/CERQUEIRA", "EMBALAGENS AVARÉ"
//    e "SIERRA(CERQUEIRA)" podem ser um grupo só ou três empresas; quem sabe é
//    quem compra. A tela avisa e a pessoa decide — duplicata dá pra consertar
//    depois, fornecedor apagado por fusão errada não.
//
// jsdom não tem motor de layout: nada de geometria aqui.
import { FornecedoresPanel } from "../FornecedoresPanel";

const DA_PLANILHA = [
  "AVARÉ/CERQUEIRA", "BOOK EXPRESS", "BRUNIQUÍMICA", "DS EMBALAGENS",
  "EMBALAGENS AVARÉ", "FEMA", "GLORIMAX", "LIDJA GOMES", "MARYSHOPPING",
  "ML", "MR CARIMBOS", "REVAL", "SHOPEE", "SIERRA(CERQUEIRA)",
  "TINTA MÁGICA", "UNITEC", "FORNECEDOR",
];

function resposta(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

/** Rede falsa. `fornecedores` é o cadastro atual; guarda o que saiu no POST. */
function rede(fornecedores: { id: string; nome: string; ativo: boolean }[] = []) {
  const enviados: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    enviados.push({ url, init });
    if (url.startsWith("/api/estoque/fornecedores") && init?.method === "POST") {
      const nomes = (JSON.parse(String(init.body)) as { nomes: string[] }).nomes;
      return Promise.resolve(resposta({ criados: nomes.map((n, i) => ({ id: `n${i}`, nome: n })), jaExistiam: [], falhas: [] }));
    }
    if (url.startsWith("/api/estoque/fornecedores")) return Promise.resolve(resposta({ fornecedores, podeGerir: true }));
    if (url.startsWith("/api/estoque-itens")) return Promise.resolve(resposta({ itens: [] }));
    if (url.startsWith("/api/tridi/estoque")) return Promise.resolve(resposta({ fornecedores: [], materiais: [], podeVerCusto: false }));
    return Promise.resolve(resposta({ ok: true }));
  });
  return { fn, enviados };
}

/** Abre a aba e o painel de colar a lista, com o texto já digitado. */
async function colar(texto: string, cadastro: { id: string; nome: string; ativo: boolean }[] = []) {
  const { fn, enviados } = rede(cadastro);
  vi.stubGlobal("fetch", fn);
  render(<FornecedoresPanel />);
  const abrir = await screen.findByRole("button", { name: /Cadastrar vários/ });
  fireEvent.click(abrir);
  const area = await screen.findByLabelText(/Um por linha/);
  fireEvent.change(area, { target: { value: texto } });
  return { enviados };
}

/** A caixa de marcar (`<Caixa>`, um `role="checkbox"`) da linha daquele
 *  fornecedor. O nome também está dentro do <textarea> (o React escreve o
 *  valor como filho), então a busca fica na linha que tem rótulo. */
function caixaDe(nome: string): HTMLElement {
  const linha = screen.getAllByText(nome).map((n) => n.closest("label")).find(Boolean)!;
  return linha.querySelector('[role="checkbox"]') as HTMLElement;
}
const marcada = (nome: string) => caixaDe(nome).getAttribute("aria-checked") === "true";

const nomesEnviados = (enviados: { url: string; init?: RequestInit }[]) =>
  (JSON.parse(String(enviados.filter((e) => e.init?.method === "POST").at(-1)!.init!.body)) as { nomes: string[] }).nomes;

afterEach(() => vi.unstubAllGlobals());

describe("colar a lista da planilha", () => {
  it("os 17 nomes viram 16 cadastros — o rótulo 'FORNECEDOR' fica de fora", async () => {
    const { enviados } = await colar(DA_PLANILHA.join("\n"));
    await waitFor(() => expect(screen.getByText("16 vão entrar")).toBeTruthy());

    // O lixo de digitação aparece na lista (some-lo escondia a decisão), mas
    // desmarcado e com o motivo.
    expect(marcada("FORNECEDOR")).toBe(false);
    expect(marcada("MR CARIMBOS")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Cadastrar 16/ }));
    await waitFor(() => expect(enviados.some((e) => e.init?.method === "POST")).toBe(true));
    const nomes = nomesEnviados(enviados);
    expect(nomes).toHaveLength(16);
    expect(nomes).not.toContain("FORNECEDOR");
    expect(nomes).toContain("AVARÉ/CERQUEIRA");
  });

  it("avisa quem se parece com quem, dentro da mesma colagem", async () => {
    await colar("AVARÉ/CERQUEIRA\nEMBALAGENS AVARÉ\nSIERRA(CERQUEIRA)");
    await waitFor(() => expect(screen.getByText("3 vão entrar")).toBeTruthy());
    // Dois avisos: as duas linhas que se parecem com a primeira.
    const avisos = screen.getAllByText(/Parece com "AVARÉ\/CERQUEIRA"/);
    expect(avisos).toHaveLength(2);
  });

  it("parecido NÃO vira fusão: os três continuam marcados até alguém desmarcar", async () => {
    const { enviados } = await colar("AVARÉ/CERQUEIRA\nEMBALAGENS AVARÉ\nSIERRA(CERQUEIRA)");
    await screen.findByText("3 vão entrar");
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar 3/ }));
    await waitFor(() => expect(enviados.some((e) => e.init?.method === "POST")).toBe(true));
    expect(nomesEnviados(enviados)).toEqual(["AVARÉ/CERQUEIRA", "EMBALAGENS AVARÉ", "SIERRA(CERQUEIRA)"]);
  });

  it("desmarcar tira o nome do cadastro — é assim que a pessoa junta", async () => {
    const { enviados } = await colar("AVARÉ/CERQUEIRA\nEMBALAGENS AVARÉ");
    await screen.findByText("2 vão entrar");
    fireEvent.click(caixaDe("EMBALAGENS AVARÉ"));
    await waitFor(() => expect(screen.getByText("1 vão entrar")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar 1/ }));
    await waitFor(() => expect(enviados.some((e) => e.init?.method === "POST")).toBe(true));
    expect(nomesEnviados(enviados)).toEqual(["AVARÉ/CERQUEIRA"]);
  });

  it("quem já está cadastrado não entra de novo — nem escrito com acento diferente", async () => {
    await colar("TINTA MAGICA LTDA\nREVAL", [{ id: "f1", nome: "Tinta Mágica", ativo: true }]);
    await waitFor(() => expect(screen.getByText("1 vão entrar")).toBeTruthy());
    expect((caixaDe("TINTA MAGICA LTDA") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Já cadastrado como "Tinta Mágica"/)).toBeTruthy();
  });

  it("parecido com um JÁ cadastrado entra, com o aviso do lado", async () => {
    await colar("REVAL PAPELARIA", [{ id: "f1", nome: "REVAL", ativo: true }]);
    await waitFor(() => expect(screen.getByText("1 vão entrar")).toBeTruthy());
    expect(marcada("REVAL PAPELARIA")).toBe(true);
    expect(screen.getByText(/Parece com "REVAL"/)).toBeTruthy();
  });

  it("sem nada marcado, não dá pra cadastrar", async () => {
    await colar("FORNECEDOR");
    await waitFor(() => expect(screen.getByText("0 vão entrar")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Cadastrar" }).hasAttribute("disabled")).toBe(true);
  });
});
