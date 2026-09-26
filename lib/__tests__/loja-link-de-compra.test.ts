import { describe, expect, it } from "vitest";
import { linkDeCompra } from "@/lib/lojas";

// O botão "Comprar" da Central de Tutoriais precisa levar ao CHECKOUT, não a
// mais um passo. Quem manda é a configuração da loja.
const produto = { id: "p-1", titulo: "Carimbo automático", preco: 89.9, precoPromocional: null };
const base = { nome: "Carimbos Tridi", slug: "carimbos-tridi", whatsapp: "5514998544623" };

describe("link de compra fora da vitrine", () => {
  it("carrinho próprio vai pro checkout com o item na sacola", () => {
    // `?add=` porque o carrinho mora no localStorage: link nenhum escreve nele
    // de fora — quem adiciona é a vitrine ao abrir.
    const { href, peloZap } = linkDeCompra({ ...base, checkout: "proprio" }, produto);
    expect(href).toBe("/l/carimbos-tridi/carrinho?add=p-1");
    expect(peloZap).toBe(false);
  });

  it("só WhatsApp: o wa.me com o pedido escrito já é o checkout", () => {
    const { href, peloZap } = linkDeCompra({ ...base, checkout: "whatsapp" }, produto);
    expect(href).toContain("https://wa.me/5514998544623");
    expect(decodeURIComponent(href)).toContain("Carimbo automático");
    expect(peloZap).toBe(true);
  });

  it("aceitando os dois, o carrinho ganha — é o caminho que registra o pedido", () => {
    expect(linkDeCompra({ ...base, checkout: "ambos" }, produto).href).toBe("/l/carimbos-tridi/carrinho?add=p-1");
  });

  it("sem checkout configurado sobra a página do produto", () => {
    const { href } = linkDeCompra({ ...base, checkout: "nenhum" }, produto);
    expect(href).toBe("/l/carimbos-tridi/p/carimbo-automatico-p-1");
  });

  it("WhatsApp ligado mas sem número cai na página do produto", () => {
    const { href, peloZap } = linkDeCompra({ ...base, whatsapp: "", checkout: "whatsapp" }, produto);
    expect(href).toContain("/p/");
    expect(peloZap).toBe(false);
  });
});
