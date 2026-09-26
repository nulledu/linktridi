import { describe, it, expect } from "vitest";
import {
  ACEITA_CARRINHO, ACEITA_WHATSAPP, linkWhatsApp, normalizarWhatsApp,
  telefoneBonito, totalDoCarrinho, type ItemCarrinho,
} from "../lojas";

// O link do WhatsApp é a venda inteira num campo de texto: se o número sair
// errado, o botão abre a conversa ERRADA (ou nenhuma) e o lojista só descobre
// quando um cliente reclama que ninguém respondeu.

describe("normalizarWhatsApp", () => {
  it("aceita as três formas que a pessoa digita", () => {
    expect(normalizarWhatsApp("(14) 99854-4623")).toBe("5514998544623");
    expect(normalizarWhatsApp("14998544623")).toBe("5514998544623");
    expect(normalizarWhatsApp("+55 14 99854-4623")).toBe("5514998544623");
  });

  it("não duplica o DDI de quem já mandou certo", () => {
    expect(normalizarWhatsApp("5514998544623")).toBe("5514998544623");
    // Fixo de 8 dígitos com DDD e DDI.
    expect(normalizarWhatsApp("551433334444")).toBe("551433334444");
  });

  it("fixo sem DDI ganha o 55", () => {
    expect(normalizarWhatsApp("1433334444")).toBe("551433334444");
  });

  it("o que não parece telefone volta vazio", () => {
    // Melhor não oferecer o botão do que oferecer um que leva a lugar nenhum.
    expect(normalizarWhatsApp("")).toBe("");
    expect(normalizarWhatsApp("123")).toBe("");
    expect(normalizarWhatsApp("sem número")).toBe("");
  });

  it("mostra bonito e guarda cru", () => {
    expect(telefoneBonito("5514998544623")).toBe("(14) 99854-4623");
    expect(telefoneBonito("551433334444")).toBe("(14) 3333-4444");
  });
});

describe("linkWhatsApp", () => {
  const loja = { nome: "Carimbos Tridi", whatsapp: "(14) 99854-4623" };
  const itens: ItemCarrinho[] = [
    { produtoId: "a", titulo: "Carimbo de Cera", quantidade: 1, precoUnitario: 115.9 },
    { produtoId: "b", titulo: "Carimbo para Sabonete", quantidade: 2, precoUnitario: 81.9 },
  ];

  it("monta o pedido já escrito, com total", () => {
    const url = linkWhatsApp(loja, itens)!;
    expect(url.startsWith("https://wa.me/5514998544623?text=")).toBe(true);
    const texto = decodeURIComponent(url.split("?text=")[1]);
    expect(texto).toContain("Carimbos Tridi");
    expect(texto).toContain("1x Carimbo de Cera");
    expect(texto).toContain("2x Carimbo para Sabonete");
    // 115,90 + 2 × 81,90 = 279,70
    expect(texto).toContain("279,70");
  });

  it("sem itens ainda leva pra conversa — é o 'fale conosco'", () => {
    const url = linkWhatsApp(loja, [])!;
    expect(decodeURIComponent(url.split("?text=")[1])).toContain("Carimbos Tridi");
  });

  it("sem telefone NÃO existe link — a tela não desenha o botão", () => {
    expect(linkWhatsApp({ nome: "X", whatsapp: "" }, itens)).toBeNull();
    expect(linkWhatsApp({ nome: "X", whatsapp: "abc" }, itens)).toBeNull();
  });

  it("título com & e # não quebra a URL", () => {
    // Sem encode, um "&" no nome do produto corta a mensagem no meio e o resto
    // vira outro parâmetro da URL.
    const url = linkWhatsApp(loja, [
      { produtoId: "c", titulo: "Carimbo & Chancela #2", quantidade: 1, precoUnitario: 10 },
    ])!;
    expect(url.split("?text=")[1]).not.toContain("&");
    expect(decodeURIComponent(url.split("?text=")[1])).toContain("Carimbo & Chancela #2");
  });
});

describe("modo de checkout", () => {
  it("cada modo liga o que promete", () => {
    expect(ACEITA_WHATSAPP("whatsapp")).toBe(true);
    expect(ACEITA_WHATSAPP("ambos")).toBe(true);
    expect(ACEITA_WHATSAPP("proprio")).toBe(false);
    expect(ACEITA_WHATSAPP("nenhum")).toBe(false);

    expect(ACEITA_CARRINHO("proprio")).toBe(true);
    expect(ACEITA_CARRINHO("ambos")).toBe(true);
    expect(ACEITA_CARRINHO("whatsapp")).toBe(false);
    expect(ACEITA_CARRINHO("nenhum")).toBe(false);
  });

  it("total do carrinho conta quantidade", () => {
    expect(totalDoCarrinho([
      { produtoId: "a", titulo: "A", quantidade: 3, precoUnitario: 10.5 },
      { produtoId: "b", titulo: "B", quantidade: 1, precoUnitario: 2.25 },
    ])).toBeCloseTo(33.75, 2);
    expect(totalDoCarrinho([])).toBe(0);
  });
});
