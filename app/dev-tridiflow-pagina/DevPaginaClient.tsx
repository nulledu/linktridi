"use client";

// Monta o EditorPaginaClient / RenderPagina reais com um template de exemplo.
// Intercepta só as chamadas de /api/tridiflow e /api/p para o preview funcionar
// sem banco — os componentes são exatamente os de produção.

import { useState } from "react";
import { EditorPaginaClient } from "../(plataforma)/tridiflow/p/[id]/EditorPaginaClient";
import { TridiflowShell } from "../(plataforma)/tridiflow/TridiflowShell";
import { TODAS_AS_CHAVES } from "../(plataforma)/tridiflow/abas";
import { MeusBotsClient } from "../(plataforma)/tridiflow/meus-bots/MeusBotsClient";
import { RenderPagina } from "../p/RenderPagina";
import type { PaginaDoc } from "@/lib/tridiflow-pagina";
import { TEMPLATES_PAGINA } from "@/lib/tridiflow-pagina-templates";
import { miniaturaDaPagina } from "@/lib/tridiflow-pagina-miniatura";
import { FLUXO_VAZIO, SETTINGS_PADRAO, THEME_PADRAO } from "@/lib/tridiflow";
import type { BotCompleto } from "@/lib/tridiflow-db";

let instalado = false;
function interceptar() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/tridiflow/") && !url.includes("/api/p/")) return original(input as RequestInfo, init);
    const ok = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/tridiflow/bots")) {
      const corpo = init?.body ? JSON.parse(String(init.body)) : {};
      if (corpo.acao === "checarCaminho") return ok({ livre: true, slug: corpo.slug });
      const metodo = (init?.method || "GET").toUpperCase();
      if (metodo === "GET") return ok({ bots: PROJETOS_EXEMPLO, statsPaginas: STATS_EXEMPLO });
      return ok({ ok: true });
    }
    return ok({ ok: true });
  };
}

// As miniaturas saem dos templates REAIS, pelo mesmo caminho do servidor — é o
// que faz esta tela valer como conferência da silhueta.
const miniDe = (id: string) => {
  const t = TEMPLATES_PAGINA.find((x) => x.id === id);
  return t ? miniaturaDaPagina(t.doc) : undefined;
};

// Dois fluxos e duas páginas — o bastante pra conferir abas, cards e o menu.
const PROJETOS_EXEMPLO = [
  { id: "p1", nome: "VSL Carimbo Personalizado", slug: "carimbo-vsl", dominioId: null, dominioHost: null,
    status: "publicado", pasta: null, updatedAt: new Date(0).toISOString(), publishedAt: new Date(0).toISOString(),
    tipo: "page", arquivado: false, templatePagina: "vsl", miniatura: miniDe("vsl"),
    responsavel: { id: "u1", nome: "Marina Alves" },
    capa: { corHeader: "#7c3aed", corFundo: "#fff", corBolhaUser: "#7c3aed" } },
  { id: "p2", nome: "Captura — Catálogo", slug: "catalogo", dominioId: null, dominioHost: null,
    status: "rascunho", pasta: null, updatedAt: new Date(0).toISOString(), publishedAt: null,
    tipo: "page", arquivado: false, templatePagina: "captura", miniatura: miniDe("captura"),
    capa: { corHeader: "#0ea5e9", corFundo: "#fff", corBolhaUser: "#0ea5e9" } },
  { id: "f1", nome: "Atendimento WhatsApp", slug: "atendimento", dominioId: null, dominioHost: null,
    status: "publicado", pasta: null, updatedAt: new Date(0).toISOString(), publishedAt: new Date(0).toISOString(),
    tipo: "flow", arquivado: false, capa: { corHeader: "#f59e0b", corFundo: "#fff", corBolhaUser: "#f59e0b" },
    stats: { sessoes: 1240, concluidas: 512, leads: 480 } },
  { id: "f2", nome: "Qualificação de lead", slug: "qualifica", dominioId: null, dominioHost: null,
    status: "rascunho", pasta: null, updatedAt: new Date(0).toISOString(), publishedAt: null,
    tipo: "flow", arquivado: false, capa: { corHeader: "#22c55e", corFundo: "#fff", corBolhaUser: "#22c55e" },
    stats: { sessoes: 0, concluidas: 0, leads: 0 } },
];
const STATS_EXEMPLO = {
  p1: { visualizacoes: 3820, cliques: 640, conversoes: 118 },
  p2: { visualizacoes: 0, cliques: 0, conversoes: 0 },
};

export function DevPaginaClient({ tela, doc, nome }: { tela: string; doc: PaginaDoc; nome: string }) {
  useState(() => { interceptar(); return null; });

  // Listagem dentro da shell REAL — é onde o menu lateral aparece, e era
  // justamente o menu que não deixava achar as páginas.
  if (tela === "lista") {
    return (
      <TridiflowShell name="Preview" role="admin" photoUrl={null} keys={TODAS_AS_CHAVES}>
        <MeusBotsClient />
      </TridiflowShell>
    );
  }

  if (tela === "pagina") {
    return (
      <main style={{ minHeight: "100dvh" }}>
        <RenderPagina doc={doc} paginaId="preview" modo="publicado" viewport="desktop" />
      </main>
    );
  }

  const inicial: BotCompleto = {
    id: "00000000-0000-0000-0000-000000000001",
    nome,
    slug: "exemplo",
    dominioId: null, dominioHost: null,
    status: "rascunho", pasta: null,
    updatedAt: new Date(0).toISOString(), publishedAt: null,
    tipo: "page", arquivado: false,
    fluxo: FLUXO_VAZIO, theme: THEME_PADRAO, settings: SETTINGS_PADRAO,
    pagina: doc,
  };

  return (
    <div className="tf-workspace">
      <EditorPaginaClient inicial={inicial} dominios={[]} autor="Preview" />
    </div>
  );
}
