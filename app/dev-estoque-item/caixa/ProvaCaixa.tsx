"use client";

// Banco de provas da CAIXA LACRADA: a etiqueta que vale N peças e a ficha que
// conta peças em vez de etiquetas. As duas telas reais só existem atrás de
// login, e credencial não se digita aqui — então o `fetch` vira dublê, do mesmo
// jeito que /dev-estoque-item/catalogo faz.
//
// Mora sob /dev-estoque-item/ de propósito: o prefixo já é público fora de
// produção no middleware, e a página tem a segunda trava (notFound).
//
// O que medir aqui: `scrollWidth − clientWidth` a 320/390/430 (tem que dar 0),
// e se o selo "CAIXA 50 un" sai INTEIRO — ele é a única coisa da etiqueta que
// não pode cortar com reticências.

import { FolhaDeEtiquetas, type DadosEtiqueta } from "../../(plataforma)/estoque/Etiqueta";
import { UnidadesDoItem } from "../../(plataforma)/estoque/UnidadesDoItem";

const ETIQUETAS: DadosEtiqueta[] = [
  {
    codigo: "ALV-0001-000001", nome: "Folha de alavanca", quantidade: 50,
    corDimensoes: "Branco · 2750×1840", local: "GAL-A", localDetalhe: "C3 · B2",
    impressoEm: "2026-08-12T12:00:00.000Z", responsavel: "João",
  },
  {
    // Nome comprido + quantidade de 4 dígitos: é o caso em que a coluna do nome
    // aperta. O nome corta; o número, não.
    codigo: "ALV-0001-000002", nome: "Compensado Naval 15mm Virola Selecionado", quantidade: 1000,
    corDimensoes: "Natural · 2200×1600", local: "GAL-B", localDetalhe: "A1",
    impressoEm: "2026-08-12T12:00:00.000Z", responsavel: "Maria",
  },
  {
    // Peça avulsa: nenhuma menção a quantidade, como era antes da caixa existir.
    codigo: "ALV-0001-000003", nome: "Alavanca montada",
    corDimensoes: "Preto", local: "GAL-A", localDetalhe: "C3 · B1",
    impressoEm: "2026-08-12T12:00:00.000Z", responsavel: "João",
  },
];

const UNIDADES = [
  { id: "u1", codigo: "ALV-0001-000001", status: "em_estoque", criado_em: "2026-08-10T12:00:00.000Z", quantidade: 50 },
  { id: "u2", codigo: "ALV-0001-000002", status: "em_estoque", criado_em: "2026-08-10T12:00:00.000Z", quantidade: 1000 },
  { id: "u3", codigo: "ALV-0001-000003", status: "em_estoque", criado_em: "2026-08-09T12:00:00.000Z", quantidade: 1 },
  { id: "u4", codigo: "ALV-0001-000004", status: "consumido", criado_em: "2026-08-08T12:00:00.000Z", quantidade: 50 },
];

if (typeof window !== "undefined") {
  const original = window.fetch.bind(window);
  window.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    if (url.startsWith("/api/estoque/unidades")) {
      return Promise.resolve(new Response(
        JSON.stringify({ unidades: UNIDADES, contagem: { em_estoque: 3, consumido: 1 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));
    }
    return original(entrada as RequestInfo, init);
  }) as typeof window.fetch;
}

export function ProvaCaixa() {
  return (
    <div style={{ padding: 16, minHeight: "100dvh" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Prova — caixa lacrada</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 18 }}>
        Dados de mentira. Meça <code>scrollWidth − clientWidth</code> a 320/390/430 e confira
        que o selo da caixa sai inteiro nas três etiquetas.
      </p>

      <h2 style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Etiqueta impressa</h2>
      <FolhaDeEtiquetas etiquetas={ETIQUETAS} />

      <h2 style={{ fontSize: 14, fontWeight: 800, margin: "26px 0 8px" }}>Ficha do item · unidades</h2>
      {/* 1051 peças (50 + 1000 + 1) em 3 etiquetas. */}
      <UnidadesDoItem itemId="prova-1" pecasEmEstoque={1051} />
    </div>
  );
}
