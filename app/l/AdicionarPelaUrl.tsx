"use client";

// "Comprar" de fora da vitrine (a Central de Tutoriais, por exemplo) chega
// aqui: `/l/<loja>/carrinho?add=<produtoId>`.
//
// O carrinho mora no `localStorage` do visitante — nenhum link consegue
// escrever nele de fora. Então o link traz o pedido na URL e QUEM adiciona é a
// própria vitrine, ao abrir o carrinho. Sem isso, o botão de compra da central
// só conseguiria levar até a página do produto e pedir mais um clique.
//
// A query é limpa logo depois: recarregar a página não pode somar o item de
// novo, e o endereço copiado não deve carregar um pedido junto.
import { useEffect } from "react";
import { useCarrinho } from "./Carrinho";
import type { ItemCarrinho, Produto } from "@/lib/lojas";
import { precoVigente } from "@/lib/lojas";

export function AdicionarPelaUrl({ lojaId, produtos }: { lojaId: string; produtos: Produto[] }) {
  const { mudar } = useCarrinho(lojaId);

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("add");
    if (!id) return;
    const produto = produtos.find((p) => p.id === id && p.status === "ativo");
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url);
    if (!produto) return;

    mudar((atuais) => {
      const existente = atuais.find((i) => i.produtoId === produto.id);
      if (existente) return atuais.map((i) => i.produtoId === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i);
      const novo: ItemCarrinho = { produtoId: produto.id, titulo: produto.titulo, quantidade: 1, precoUnitario: precoVigente(produto) };
      return [...atuais, novo];
    });
  }, [produtos, mudar]);

  return null;
}
