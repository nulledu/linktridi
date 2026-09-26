"use client";

// Banco de provas da aba FORNECEDORES do Estoque — em especial o "Cadastrar
// vários" (colar a lista da planilha, triagem, aviso de parecido). A tela real
// só existe atrás de login e credencial não se digita aqui, então o `fetch` é
// trocado por um dublê, do mesmo jeito que /dev-estoque-item/catalogo faz.
//
// Serve pra medir 320/390/430px, alvo de toque e os dois temas. Mora sob
// /dev-estoque-item/ de propósito: o prefixo já é público fora de produção no
// middleware, e a página tem a segunda trava (notFound).

import { useState } from "react";
import { FornecedoresPanel } from "../../(plataforma)/estoque/FornecedoresPanel";

/** O que já estaria cadastrado — inclui um nome comprido, que é onde a linha
 *  da triagem estoura a largura se alguém esquecer o `overflowWrap`. */
const CADASTRADOS = [
  { id: "f1", nome: "REVAL", cnpj: null, contato: null, telefone: null, email: null, obs: null, ativo: true },
  { id: "f2", nome: "Tinta Mágica", cnpj: null, contato: "Seu Zé", telefone: "(14) 99999-0000", email: null, obs: null, ativo: true },
  { id: "f3", nome: "DISTRIBUIDORA DE EMBALAGENS E DESCARTÁVEIS DO VALE DO PARANAPANEMA", cnpj: null, contato: null, telefone: null, email: null, obs: null, ativo: false },
];

/** Colar isto na caixa reproduz a planilha inteira, com o lixo e os parecidos. */
export const LISTA_DA_PLANILHA = [
  "AVARÉ/CERQUEIRA", "BOOK EXPRESS", "BRUNIQUÍMICA", "DS EMBALAGENS",
  "EMBALAGENS AVARÉ", "FEMA", "GLORIMAX", "LIDJA GOMES", "MARYSHOPPING",
  "ML", "MR CARIMBOS", "REVAL", "SHOPEE", "SIERRA(CERQUEIRA)",
  "TINTA MÁGICA", "UNITEC", "FORNECEDOR",
].join("\n");

if (typeof window !== "undefined") {
  const original = window.fetch.bind(window);
  window.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    const responder = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

    if (url.startsWith("/api/estoque/fornecedores") && init?.method === "POST") {
      const nomes = (JSON.parse(String(init.body ?? "{}")) as { nomes?: string[] }).nomes ?? [];
      return responder({ criados: nomes.map((n, i) => ({ id: `novo-${i}`, nome: n })), jaExistiam: [], falhas: [] });
    }
    if (url.startsWith("/api/estoque/fornecedores")) return responder({ fornecedores: CADASTRADOS, podeGerir: true });
    if (url.startsWith("/api/estoque-itens")) return responder({ itens: [], podeGerir: true, podeCadastrar: true, podeAjustar: true });
    if (url.startsWith("/api/tridi/estoque")) return responder({ fornecedores: [], materiais: [], podeVerCusto: true });
    return original(entrada as RequestInfo, init);
  }) as typeof window.fetch;
}

export function ProvaFornecedores() {
  const [visivel, setVisivel] = useState(true);
  return (
    <div style={{ padding: 16, minHeight: "100dvh" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Prova — fornecedores do Estoque</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
        Dados de mentira. Abra <strong>Cadastrar vários</strong>, cole a lista abaixo e meça{" "}
        <code>scrollWidth − clientWidth</code> a 320/390/430 e os alvos por <code>offsetHeight</code>.
      </p>
      <pre style={{ fontSize: 11, lineHeight: 1.45, color: "var(--text-dim)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 10, marginBottom: 14, overflowX: "auto", whiteSpace: "pre" }}>{LISTA_DA_PLANILHA}</pre>
      <button onClick={() => setVisivel((v) => !v)}
        style={{ minHeight: "var(--tap)", padding: "0 14px", marginBottom: 14, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontWeight: 700, cursor: "pointer" }}>
        {visivel ? "Esconder" : "Mostrar"} aba
      </button>
      {visivel && <FornecedoresPanel />}
    </div>
  );
}
