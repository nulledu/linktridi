import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

let celular = false;
vi.mock("../useMediaQuery", () => ({ useIsMobile: () => celular }));

import { DataList, type Coluna } from "../DataList";

/**
 * O `DataList` desenha a tabela do computador com o Table do HeroUI (React
 * Aria). Isto fixa o que as telas contam com ele: ordenação que vale nos dois
 * desenhos, linha que abre o detalhe, e controle DENTRO da linha que não abre
 * o detalhe junto (o "Excluir" que também abria a ficha).
 */
afterEach(() => { cleanup(); celular = false; });

type P = { id: string; nome: string; valor: number };
const ITENS: P[] = [
  { id: "a", nome: "Borracha", valor: 30 },
  { id: "b", nome: "almofada", valor: 5 },
  { id: "c", nome: "Carimbo", valor: 120 },
];

function colunas(onExcluir = vi.fn()): Coluna<P>[] {
  return [
    { chave: "nome", titulo: "Nome", papel: "titulo", render: (p) => p.nome, ordenar: (p) => p.nome },
    { chave: "valor", titulo: "Valor", alinhar: "right", render: (p) => `R$ ${p.valor}`, ordenar: (p) => p.valor },
    { chave: "acoes", titulo: "", papel: "acoes", render: (p) => <button onClick={() => onExcluir(p.id)}>Excluir {p.nome}</button> },
  ];
}

const nomes = () => screen.getAllByRole("row").slice(1).map((r) => r.querySelector("td")!.textContent);

describe("DataList · tabela do HeroUI", () => {
  it("é uma tabela de verdade (grid acessível) com cabeçalho do HeroUI", () => {
    const { container } = render(<DataList itens={ITENS} colunas={colunas()} chaveDe={(p) => p.id} rotulo="Produtos" />);
    expect(screen.getByRole("grid", { name: "Produtos" })).toBeTruthy();
    expect(container.querySelector(".table-root.ui-tabela")).toBeTruthy();
    expect(nomes()).toEqual(["Borracha", "almofada", "Carimbo"]);
  });

  it("ordena pelo cabeçalho, sem diferenciar maiúscula, e inverte no segundo clique", () => {
    render(<DataList itens={ITENS} colunas={colunas()} chaveDe={(p) => p.id} />);
    fireEvent.click(screen.getByRole("columnheader", { name: /Nome/ }));
    expect(nomes()).toEqual(["almofada", "Borracha", "Carimbo"]);
    fireEvent.click(screen.getByRole("columnheader", { name: /Nome/ }));
    expect(nomes()).toEqual(["Carimbo", "Borracha", "almofada"]);
  });

  it("número ordena como número (5 < 30 < 120), não como texto", () => {
    render(<DataList itens={ITENS} colunas={colunas()} chaveDe={(p) => p.id} ordemInicial={{ coluna: "valor" }} />);
    expect(nomes()).toEqual(["almofada", "Borracha", "Carimbo"]);
  });

  it("a mesma ordem vale nos cartões do celular", () => {
    celular = true;
    const { container } = render(<DataList itens={ITENS} colunas={colunas()} chaveDe={(p) => p.id} ordemInicial={{ coluna: "valor", sentido: "desc" }} />);
    const itens = [...container.querySelectorAll("li")].map((li) => li.textContent);
    expect(itens[0]).toContain("Carimbo");
    expect(itens[2]).toContain("almofada");
  });

  it("clicar na linha abre; clicar no botão da linha NÃO abre", () => {
    const abrir = vi.fn();
    const excluir = vi.fn();
    render(<DataList itens={ITENS} colunas={colunas(excluir)} chaveDe={(p) => p.id} onAbrir={abrir} />);

    const botao = screen.getByRole("button", { name: "Excluir Carimbo" });
    fireEvent.pointerDown(botao); fireEvent.pointerUp(botao); fireEvent.click(botao);
    expect(excluir).toHaveBeenCalledWith("c");
    expect(abrir).not.toHaveBeenCalled();

    const celula = screen.getByText("R$ 30");
    fireEvent.pointerDown(celula, { pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(celula, { pointerType: "mouse", button: 0 });
    fireEvent.click(celula);
    expect(abrir).toHaveBeenCalledWith(ITENS[0]);
  });
});
