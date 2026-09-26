"use client";

// Banco de provas do LinkTridi. No editor monta o LinkTridiEditorClient REAL
// (topo, abas, folhas de endereço e compartilhar, auto-save) com a rede
// trocada por respostas de mentira — sem login e sem banco.
//
// A rede falsa entra ANTES de o editor montar: os efeitos do filho rodam
// antes dos do pai, então instalar num efeito ao lado do editor chegaria
// tarde pro fetch de analytics que ele faz ao montar.
// No campo de endereço, "ocupado" simula o endereço de outro projeto.
import { useEffect, useState } from "react";
import { LinkTridiRuntime } from "../f/LinkTridiRuntime";
import { MolduraPaginaMarketing } from "../(plataforma)/marketing/CabecalhoMarketing";
import { LinkTridiEditorClient, type BotDoEditorLT } from "../(plataforma)/marketing/linktridi/[id]/LinkTridiEditorClient";
import { ToastHost } from "../(plataforma)/Toast";
import { SETTINGS_PADRAO } from "@/lib/tridiflow";
import type { LinkTridiDoc } from "@/lib/tridiflow-linktridi";

const DOMINIOS = [{ id: "d1", host: "links.carimbostridi.com.br", verificado: true }];

function redeDeMentira(): () => void {
  const original = window.fetch;
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (url.startsWith("/api/tridiflow/bots")) {
      await new Promise((r) => setTimeout(r, 300));
      const corpo = init?.body ? JSON.parse(String(init.body)) : {};
      if (corpo.acao === "checarCaminho") return json({ livre: corpo.slug !== "ocupado", slug: corpo.slug });
      if (init?.method === "PATCH" && corpo.slug === "ocupado") return json({ error: "Esse endereço já está em uso por outro projeto.", code: "caminho_em_uso" }, 409);
      return json({ ok: true });
    }
    if (url.startsWith("/api/tridiflow/analytics")) return json({ porEtapa: [{ etapa: "p1", abandonos: 42 }, { etapa: "p3", abandonos: 7 }] });
    if (url.startsWith("/api/upload") || url.startsWith("/api/tridiflow/upload-url")) return json({ error: "Envio desligado no banco de provas." }, 400);
    return original(entrada, init);
  };
  return () => { window.fetch = original; };
}

export function DevLinkTridiClient({ tela, doc, leitura, status }: {
  tela: "pagina" | "editor"; doc: LinkTridiDoc; leitura?: boolean; status: "rascunho" | "publicado";
}) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    if (tela !== "editor") return;
    const desfazer = redeDeMentira();
    setPronto(true);
    return desfazer;
  }, [tela]);

  if (tela === "editor") {
    if (!pronto) return null;
    const bot: BotDoEditorLT = {
      id: "dev-linktridi", nome: "Bio da marca", slug: "carimbos-tridi", dominioId: null, status,
      settings: { ...SETTINGS_PADRAO, modo: "linktridi", linktridi: doc },
    };
    return (
      // Como no app: dentro do Marketing (topo e abas), com o respiro do Shell.
      <div className="app-main" style={{ background: "var(--bg)", minHeight: "100dvh", padding: "28px clamp(12px, 3vw, 36px)" }}>
        <MolduraPaginaMarketing permissoes={{ podeDesempenho: true, podeContingencia: true, podeLinkTridiLista: true, podeTutoriais: true }} ver="linktridi">
          <LinkTridiEditorClient initial={bot} dominios={DOMINIOS} podeEditar={!leitura} />
        </MolduraPaginaMarketing>
        <ToastHost />
      </div>
    );
  }
  return <LinkTridiRuntime doc={doc} />;
}
