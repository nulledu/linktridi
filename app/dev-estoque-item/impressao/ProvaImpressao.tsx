"use client";

// A tela de configuração de impressão REAL, com as duas rotas dela respondidas
// aqui mesmo. As rotas exigem sessão; a tela é o que precisa ser medido a
// 320px. Trocar o `fetch` só nesta página de prova evita fazer uma versão
// "de mentira" da tela — que é como a versão de mentira acaba divergindo da
// verdadeira e a medição para de valer.

import { useEffect, useState } from "react";
import { ImpressaoClient } from "../../(plataforma)/estoque/impressao/ImpressaoClient";

const CONFIG = { alturaMm: 15, copias: 1 };

const ITENS = [
  { id: "1", nome: "Chapa de MDF 6mm Branco 2750×1840", sku: "MDF6MM-BR-18", categoria: "Chapas", serializado: true, tipo: "unica" },
  { id: "2", nome: "Caixa de chancelas douradas 40mm", sku: "CHAN-0001", categoria: "Acabamento", serializado: true, tipo: "caixa" },
  { id: "3", nome: "Folha de alavanca montada em MDF com nome bem comprido pra cortar", sku: "ALV-0001", categoria: "Peças", serializado: true, tipo: "unica" },
  { id: "4", nome: "Cola branca PVA", sku: null, categoria: "Insumos", serializado: false, tipo: "unica" },
];

export function ProvaImpressao() {
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const original = window.fetch;
    window.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
      const responder = (corpo: unknown) =>
        new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

      if (url.startsWith("/api/estoque/impressao/tipos")) {
        if (init?.method === "PATCH") return responder({ ok: true });
        const caixas = new URL(url, "http://x").searchParams.get("caixas") === "1";
        return responder({ ok: true, itens: caixas ? ITENS.filter((i) => i.tipo === "caixa") : ITENS, pendente: null });
      }
      if (url.startsWith("/api/estoque/impressao")) {
        if (init?.method === "PATCH") return responder({ ok: true, config: CONFIG });
        return responder({ ok: true, config: CONFIG, definida: true, caixas: ["CHAN-0001"], pendente: null });
      }
      return original(entrada, init);
    }) as typeof window.fetch;
    setPronto(true);
    return () => { window.fetch = original; };
  }, []);

  if (!pronto) return null;
  return (
    <div style={{ padding: 16, background: "var(--bg)", minHeight: "100dvh" }}>
      <ImpressaoClient podeConfigurar podeVerItens />
    </div>
  );
}
