import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Avatar } from "../central/mensagens/ui/Avatar";

// Foto que não carrega caía no ícone de imagem quebrada do navegador — era um
// dos jeitos do "avatar bugando". Agora cai na inicial, como quem não tem foto.
describe("Avatar", () => {
  it("troca a foto quebrada pela inicial", () => {
    const { container } = render(<Avatar nome="Douglas Franco" src="https://erp.exemplo/foto.jpg" />);
    const img = container.querySelector("img")!;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("D");
  });

  it("volta a tentar quando a URL muda", () => {
    const { container, rerender } = render(<Avatar nome="Ana" src="https://x/1.jpg" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    rerender(<Avatar nome="Ana" src="https://x/2.jpg" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://x/2.jpg");
  });

  it("grupo desenha ícone, não inicial", () => {
    const { container } = render(<Avatar nome="Douglas e Letícia" grupo icone="users" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent).toBe("");
  });
});
