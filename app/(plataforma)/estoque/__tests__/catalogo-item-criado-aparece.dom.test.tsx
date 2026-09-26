import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CatalogoClient } from "../CatalogoClient";

/**
 * Item cadastrado APARECE — na aba onde ele nasceu, sem filtro escondendo.
 *
 * O relato do dono foi "não to conseguindo criar produtos". Ele estava criando:
 * o banco tinha os dois itens, gravados às 15:04 e 15:21. O que faltava era a
 * tela levá-lo até eles.
 *
 * O botão de criar se chama pelo nome da ABA e manda `hierarquiaInit={hier}` —
 * mas o modal deixa trocar a hierarquia lá dentro. Quem abre pela aba
 * "Matéria-Prima", escolhe "Processada" e salva, salvava mesmo: o item ia pra
 * aba do lado, a lista atrás não mudava uma linha, e não havia toast. Da
 * cadeira de quem clica, isso é idêntico a "não salvou" — e a reação natural é
 * tentar de novo, que foi o que gerou o segundo item.
 *
 * Mesma armadilha com um chip de categoria ligado, ou com a busca vinda de
 * `/estoque?busca=…`: o item cai na aba certa e o filtro o esconde.
 *
 * A importação, dez linhas abaixo no mesmo arquivo, já fazia o certo desde
 * sempre (zera aba e filtros quando cria). Só o cadastro manual ficou de fora.
 *
 * Sem geometria: jsdom não tem motor de layout (ver testes-de-componente).
 */

const ITENS = [
  { id: "p1", nome: "Cavalete", hierarquia: "peca", produzido: false, serializado: false, categoria: "Madeira", imagem_url: null, unidade: "un", quantidade: 12, qtd_minima: 0, ativo: true, sku: "PEC-0001" },
  { id: "p2", nome: "Trava de encaixe", hierarquia: "peca", produzido: false, serializado: false, categoria: "Metal", imagem_url: null, unidade: "un", quantidade: 4, qtd_minima: 0, ativo: true, sku: "PEC-0002" },
  { id: "m1", nome: "Chapa crua", hierarquia: "materia_prima", produzido: false, serializado: false, categoria: "Madeira", imagem_url: null, unidade: "ch", quantidade: 3, qtd_minima: 0, ativo: true, sku: "MP-0001" },
];

/** O item que a pessoa acabou de cadastrar — em OUTRA hierarquia que não a aba. */
const NOVO = {
  id: "novo-1", nome: "MDF 6mm pintado", hierarquia: "mp_processada", produzido: false, serializado: false,
  categoria: null, imagem_url: null, unidade: "un", quantidade: 0, qtd_minima: 0, ativo: true, sku: "MPP-0001",
};

/** O catálogo cresce depois do POST, como o servidor faria. */
function rede() {
  let criou = false;
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("/api/estoque-itens") && init?.method === "POST") {
      criou = true;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ item: { id: NOVO.id } }) } as Response);
    }
    const body = u.startsWith("/api/estoque-itens")
      ? { itens: criou ? [...ITENS, NOVO] : ITENS, podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: false }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  });
}

beforeEach(() => {
  localStorage.clear();
  // A pessoa está na aba Peça — é a que o `useSticky` lembrou.
  localStorage.setItem("estoque.hierarquia", "peca");
  vi.stubGlobal("fetch", rede());
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Abre o modal, troca a hierarquia pra Processada, digita o nome e salva. */
async function cadastrarNoutraHierarquia() {
  render(<CatalogoClient />);
  await screen.findByText("Cavalete");

  // O botão diz o que FAZ. Ele se chamava pelo nome da aba ("＋ Peça"),
  // idêntico à aba logo acima — e foi assim que o dono concluiu que não dava
  // pra cadastrar item, com o botão à vista na tela.
  const criar = screen.getByRole("button", { name: /Cadastrar item/ });
  fireEvent.click(criar);

  const trocar = (await screen.findAllByRole("button", { name: "Matéria-Prima Processada" }))[0];
  fireEvent.click(trocar);

  const nome = await screen.findByPlaceholderText(/Nome do produto/i);
  fireEvent.change(nome, { target: { value: NOVO.nome } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

describe("cadastrar no catálogo leva a pessoa até o item", () => {
  it("item criado em OUTRA hierarquia aparece na lista, sem ela procurar", async () => {
    await cadastrarNoutraHierarquia();
    // A prova: o nome está na tela depois de salvar. Antes deste conserto a
    // lista continuava mostrando só Peça, e o item ficava invisível.
    await waitFor(() => expect(screen.getAllByText(NOVO.nome).length).toBeGreaterThan(0));
  });

  it("a aba muda pra onde o item nasceu", async () => {
    await cadastrarNoutraHierarquia();
    await waitFor(() => expect(localStorage.getItem("estoque.hierarquia")).toBe("mp_processada"));
  });

  it("os itens da aba antiga saem da vista — a tela mudou mesmo de assunto", async () => {
    await cadastrarNoutraHierarquia();
    await waitFor(() => expect(screen.getAllByText(NOVO.nome).length).toBeGreaterThan(0));
    // "Cavalete" é da aba Peça. Se ele continua aparecendo, a aba não mudou e o
    // teste acima passou por outro motivo qualquer.
    expect(screen.queryByText("Cavalete")).toBeNull();
  });

  it("salvar tem voz: a frase diz o nome E a hierarquia", async () => {
    // Sem isso, "salvou mas não vejo" continua sendo o mesmo silêncio de antes —
    // só que numa aba diferente. Nomear a hierarquia é o que ensina a tela.
    await cadastrarNoutraHierarquia();
    await waitFor(() => {
      const txt = document.body.textContent ?? "";
      expect(txt).toContain(NOVO.nome);
      expect(txt).toMatch(/Matéria-Prima Processada/);
    });
  });
});
