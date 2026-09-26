import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Avatar } from "../Avatar";

/**
 * O avatar tinha SEIS implementações no app e cada uma divergia num detalhe que
 * ninguém revisa. Estes testes fixam o que agora é único — e principalmente o
 * que nenhuma das seis fazia.
 *
 * jsdom não tem layout: `offsetWidth` e `getBoundingClientRect()` são sempre 0.
 * Por isso aqui se verifica o que está no estilo declarado e no DOM, nunca
 * medida renderizada (ver testes-de-componente no CLAUDE.md).
 */
afterEach(cleanup);

describe("Avatar", () => {
  it("mostra a foto quando existe, e ela é DECORATIVA", () => {
    const { container } = render(<Avatar url="https://exemplo/foto.jpg" nome="Paola" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://exemplo/foto.jpg");
    // `alt=""` + aria-hidden de propósito: o nome já está escrito ao lado, no
    // card. Dar um alt com o nome faria o leitor de tela anunciar "Paola,
    // imagem, Paola" — a foto não acrescenta informação nova, ela ilustra.
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });

  it("sem foto, cai nas iniciais em MAIÚSCULA", () => {
    // O avatar de Colaboradores era o único sem `.toUpperCase()`: "mikael"
    // aparecia com "m" minúsculo lá e "M" em todas as outras telas.
    render(<Avatar url={null} nome="mikael" />);
    expect(screen.getByText("M")).toBeTruthy();
  });

  it("link morto vira iniciais, não caixa quebrada", () => {
    // Nenhuma das seis cópias tinha `onError`. Se a URL expirava ou o arquivo
    // sumia, o navegador desenhava o ícone de imagem quebrada dentro do card.
    const { container } = render(<Avatar url="https://exemplo/sumiu.jpg" nome="Neiva" />);
    const img = container.querySelector("img")!;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("N")).toBeTruthy();
  });

  it("trocar de pessoa limpa a falha anterior", () => {
    // Numa lista, o React reaproveita o componente. Sem reagir à troca de
    // `url`, a foto quebrada de uma pessoa grudava na seguinte.
    const { container, rerender } = render(<Avatar url="https://exemplo/ruim.jpg" nome="A" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    rerender(<Avatar url="https://exemplo/boa.jpg" nome="B" />);
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("toda foto ganha um anel — é o que dá aresta a retrato de fundo claro", () => {
    // Sem contenção, uma selfie contra parede branca se dissolvia no cartão
    // branco e parecia "mais clara" que as vizinhas. A grade parecia desigual;
    // as fotos é que eram, e não havia nada segurando cada uma no seu limite.
    const { container } = render(<Avatar url="https://exemplo/f.jpg" nome="X" />);
    const img = container.querySelector("img")!;
    expect(img.style.boxShadow).toContain("inset");
    // Fundo por baixo da foto: dá piso a PNG com transparência.
    expect(img.style.background).toContain("--surface-2");
  });

  it("nome vazio não quebra", () => {
    render(<Avatar url={null} nome="" />);
    expect(screen.getByText("?")).toBeTruthy();
  });
});
