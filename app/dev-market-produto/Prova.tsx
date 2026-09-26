"use client";

// TEMPORÁRIO — banco de provas do modal "Editar Produto" do TridiMarket.
// O modal real vive atrás de login, então não dá pra medir a 320px na tela de
// verdade. Aqui ele é montado isolado, com as categorias vindo de um fetch
// fingido: o objetivo é medir largura e alvos de toque, não exercitar a API.

import { useEffect, useState } from "react";
import { ModalProduto, type ProdutoEdicao, type Unidade } from "../(plataforma)/tridimarket/Cadastro";

const UNIDADES: Unidade[] = [
  { id: "u1", nome: "Tridi Matriz", ativo: true },
  { id: "u2", nome: "Tridi Filial Centro", ativo: true },
  { id: "u3", nome: "Tridi Galpão", ativo: true },
];

const PRODUTO: ProdutoEdicao = {
  id: 1, nome: "Coca cola com cafe 220ml", imagemUrl: null, preco: 3.99,
  ativo: true, semCodigo: false, minimo: 5, unidades: ["u1"],
  codigoBarras: "7894900025019", categoriaId: 2,
};

const CATEGORIAS = [
  { id: 1, nome: "Bebida", imagemUrl: null },
  { id: 2, nome: "Salgado", imagemUrl: null },
  { id: 3, nome: "Doce", imagemUrl: null },
  { id: 4, nome: "Congelado", imagemUrl: null },
  { id: 5, nome: "Congelado especial de padaria", imagemUrl: null },
];

export function Prova() {
  const [pronto, setPronto] = useState(false);

  // Intercepta só a chamada de categorias; o resto do fetch segue normal.
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (entrada, init) => {
      const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      if (url.includes("/api/tridimarket/categorias")) {
        return new Response(JSON.stringify({ ok: true, data: CATEGORIAS }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      return original(entrada, init);
    };
    setPronto(true);
    return () => { window.fetch = original; };
  }, []);

  if (!pronto) return null;
  return <ModalProduto produto={PRODUTO} unidadeId="u1" unidades={UNIDADES} onFechar={() => {}} onSalvo={() => {}} />;
}
