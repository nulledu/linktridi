"use client";

// Banco de provas do CATÁLOGO do Estoque (progresso de etiquetagem, filtro,
// selo no card e o painel de etiquetar em lote). A tela real só existe atrás de
// login, e credencial não se digita aqui — então o `fetch` é trocado por um
// dublê com itens de mentira, do mesmo jeito que /dev-estoque-item faz com o
// modal. Serve pra medir 320px, alvo de toque e os dois temas.
//
// Mora sob /dev-estoque-item/ de propósito: o prefixo já é público fora de
// produção no middleware, e a página tem a segunda trava (notFound) igual às
// outras /dev-*.

import { useState } from "react";
import { CatalogoClient } from "../../(plataforma)/estoque/CatalogoClient";

interface FakeItem {
  id: string; nome: string; hierarquia: string; produzido: boolean; serializado: boolean;
  categoria: string | null; imagem_url: null; unidade: string; quantidade: number;
  qtd_minima: number; ativo: boolean; custo: number; sku: string | null;
}

function montarItens(): FakeItem[] {
  const defs: [string, string, number][] = [
    ["materia_prima", "Chapa MDF", 7],
    ["componente", "Pé de mesa", 12],
    ["peca", "Tampo montado", 15],
    ["produto", "Mesa Tridi", 6],
  ];
  const itens: FakeItem[] = [];
  for (const [hierarquia, nome, n] of defs) {
    for (let i = 1; i <= n; i++) {
      itens.push({
        id: `${hierarquia}-${i}`,
        nome: `${nome} ${i} — nome comprido pra testar o corte na tela estreita`,
        hierarquia,
        produzido: hierarquia !== "materia_prima",
        serializado: hierarquia === "peca" && i <= 3,
        categoria: i % 3 === 0 ? "Insumos" : i % 3 === 1 ? "Madeira" : null,
        imagem_url: null,
        unidade: "un",
        quantidade: i % 4 === 0 ? 0 : i * 3,
        qtd_minima: 2,
        ativo: true,
        custo: 12.5 * i,
        sku: i % 2 === 0 ? `${hierarquia.slice(0, 3).toUpperCase()}-${String(i).padStart(4, "0")}` : null,
      });
    }
  }
  return itens;
}

const ITENS = montarItens();

if (typeof window !== "undefined") {
  const original = window.fetch.bind(window);
  window.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    const responder = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

    if (url.startsWith("/api/estoque-itens")) {
      return responder({ itens: ITENS, podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: true });
    }
    if (url.startsWith("/api/estoque/unidades/preparar")) {
      const corpo = JSON.parse(String(init?.body ?? "{}")) as { itens: { item_id: string; quantidade: number }[] };
      const resultados = corpo.itens.map(({ item_id, quantidade }) => {
        const it = ITENS.find((x) => x.id === item_id);
        if (it) { it.serializado = true; it.quantidade = quantidade; it.sku = it.sku ?? "PEC-9999"; }
        return { item_id, nome: it?.nome ?? "—", ok: true, geradas: quantidade, sku: it?.sku ?? null };
      });
      return responder({ ok: true, resultados, resumo: { itens: resultados.length, etiquetas: 0, falhas: 0 } });
    }
    if (url.startsWith("/api/estoque/unidades")) return responder({ unidades: [], contagem: { em_estoque: 0 } });
    if (url.startsWith("/api/estoque/fornecedores")) return responder({ fornecedores: [] });
    if (url.startsWith("/api/estoque/locais")) return responder({ locais: [] });
    if (url.startsWith("/api/ficha-tecnica")) return responder({ ficha: [] });
    return original(entrada as RequestInfo, init);
  }) as typeof window.fetch;
}

export function ProvaCatalogo() {
  const [visivel, setVisivel] = useState(true);
  return (
    <div style={{ padding: 16, minHeight: "100dvh" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Prova — catálogo do Estoque</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
        Dados de mentira. Meça <code>scrollWidth − clientWidth</code> a 320/390/430 e os alvos por <code>offsetHeight</code>.
      </p>
      <button onClick={() => setVisivel((v) => !v)}
        style={{ minHeight: "var(--tap)", padding: "0 14px", marginBottom: 14, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontWeight: 700, cursor: "pointer" }}>
        {visivel ? "Esconder" : "Mostrar"} catálogo
      </button>
      {visivel && <CatalogoClient />}
    </div>
  );
}
