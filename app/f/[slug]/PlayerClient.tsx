"use client";

// Player público: injeta pixels, captura UTMs (viram variáveis {{utm_source}}…),
// abre a sessão (lead), grava respostas e dispara eventos (client + CAPI).
import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { normalizarLinkTridi } from "@/lib/tridiflow-linktridi";
import { dispararPixel, injetarPixels } from "../pixels";
import type { BotPublicado } from "@/lib/tridiflow-db";
import { conversoesEfetivas, iframeEmbed, pixelsPublicos, uid, type GatilhoConversao, type Vars } from "@/lib/tridiflow";
import { PARAM_SESSAO, lerRespostas } from "@/lib/tridiflow-pagina-runtime";

// Cada modo baixa SÓ o próprio runtime: um LinkTridi não paga o JS do chat
// nem do quiz (e vice-versa). O SSR continua — o HTML chega completo; o
// import quebrado em chunks muda só o que o navegador baixa pra hidratar.
const ChatRuntime = dynamic(() => import("../ChatRuntime").then((m) => m.ChatRuntime));
const QuizRuntime = dynamic(() => import("../QuizRuntime").then((m) => m.QuizRuntime));
const LinkTridiRuntime = dynamic(() => import("../LinkTridiRuntime").then((m) => m.LinkTridiRuntime));

export function PlayerClient({ bot }: { bot: BotPublicado }) {
  const sessao = useRef<string | null>(null);
  const iniciou = useRef(false);   // já disparou o gatilho "início"?
  const varsRef = useRef<Vars>({});   // últimas respostas (p/ advanced matching: e-mail/telefone)
  const pixels = useMemo(() => pixelsPublicos(bot.settings.pixels), [bot.settings.pixels]);
  const regras = useMemo(() => conversoesEfetivas(bot.settings), [bot.settings]);

  // UTMs/click-ids da URL do anúncio → variáveis do bot ({{utm_source}} etc).
  // Junto vem o que a pessoa já respondeu numa tela anterior do MESMO funil
  // (a landing page guardou no navegador dela). É isso que faz o funil não
  // perguntar de novo o telefone que ela acabou de digitar na LP.
  //
  // Os valores vêm do localStorage e não da URL de propósito: assim um link
  // com `tf_s` compartilhado não carrega o nome nem o telefone de ninguém.
  const varsIniciais = useMemo<Vars>(() => {
    if (typeof window === "undefined") return {};
    const v: Vars = { ...lerRespostas() };
    new URLSearchParams(window.location.search).forEach((val, k) => {
      if (/^(utm_|fbclid|ttclid|gclid)/.test(k)) v[k] = val.slice(0, 300);
    });
    return v;
  }, []);

  useEffect(() => {
    injetarPixels(pixels);
    // Sessão trazida da landing page: continua a MESMA em vez de abrir outra —
    // um lead só, com os UTMs do anúncio preservados.
    const adotar = typeof window === "undefined"
      ? null : new URLSearchParams(window.location.search).get(PARAM_SESSAO);
    fetch("/api/f/sessao", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botId: bot.id, utm: varsIniciais, ...(adotar ? { adotar } : {}) }),
    })
      .then((r) => r.json()).then((d) => { sessao.current = d.sessaoId ?? null; })
      .catch(() => {});
  }, [bot.id, pixels, varsIniciais]);

  // Custom head code (GTM, <link>, <script>…) → injetado uma vez no <head>.
  useEffect(() => {
    const codigo = bot.settings.customHead;
    if (!codigo) return;
    const container = document.createElement("div");
    container.innerHTML = codigo;
    // Recria os <script> (innerHTML não executa scripts inertes).
    const nodes = Array.from(container.childNodes).map((n) => {
      if (n.nodeName === "SCRIPT") {
        const s = document.createElement("script");
        const orig = n as HTMLScriptElement;
        for (const a of Array.from(orig.attributes)) s.setAttribute(a.name, a.value);
        s.text = orig.text;
        return s;
      }
      return n;
    });
    nodes.forEach((n) => document.head.appendChild(n));
    return () => nodes.forEach((n) => { if (n.parentNode) n.parentNode.removeChild(n); });
  }, [bot.settings.customHead]);

  // Extrai e-mail/telefone das respostas p/ advanced matching (hash no servidor).
  const dadosUsuario = () => {
    let email: string | undefined, telefone: string | undefined;
    for (const val of Object.values(varsRef.current)) {
      const s = String(val ?? "");
      if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) email = s.toLowerCase();
      if (!telefone) { const d = s.replace(/\D/g, ""); if (d.length >= 10 && d.length <= 13) telefone = d; }
    }
    return { ...(email ? { email } : {}), ...(telefone ? { telefone } : {}) };
  };

  const gravar = (vars: Vars, grupoId?: string, concluida?: boolean) => {
    varsRef.current = vars;
    if (!sessao.current) return;
    fetch("/api/f/sessao", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ sessaoId: sessao.current, respostas: vars, ultimaEtapa: grupoId, concluida }),
    }).catch(() => {});
  };

  // Upload do currículo (etapa `upload` do quiz): presign na rota pública do
  // funil (amarra à sessão) e PUT direto no B2. O que volta é `/api/arquivos/…`,
  // gravado como resposta e lido depois pelo RH na tela de Resultados.
  const enviarCurriculo = async (file: File): Promise<{ url: string; nome: string }> => {
    if (!sessao.current) throw new Error("sessao");
    const pre = await fetch("/api/f/curriculo", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessaoId: sessao.current, nome: file.name, tamanho: file.size }),
    });
    const j = (await pre.json().catch(() => null)) as { url?: string; put?: string; error?: string } | null;
    if (!pre.ok || !j?.put || !j.url) throw new Error(j?.error || "upload");
    const put = await fetch(j.put, { method: "PUT", body: file, headers: file.type ? { "Content-Type": file.type } : {} });
    if (!put.ok) throw new Error("put");
    return { url: j.url, nome: file.name };
  };

  // Evento de pixel: dispara no navegador + manda pro server (Meta CAPI, dedup
  // por eventId) — CAPI só quando a plataforma Meta está marcada na regra.
  const evento = (nome: string, plataformas: string[], valor?: string) => {
    const eventId = uid() + uid();   // MESMO id no pixel e na CAPI → dedup
    dispararPixel(pixels, nome, plataformas, valor, eventId);
    if (plataformas.includes("meta")) {
      fetch("/api/f/evento", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ botId: bot.id, evento: nome, eventId, valor, url: window.location.href, ...dadosUsuario() }),
      }).catch(() => {});
    }
  };

  // Dispara todas as regras de um gatilho, respeitando ativo/amostragem.
  const dispararGatilho = (gatilho: GatilhoConversao) => {
    for (const r of regras) {
      if (r.gatilho !== gatilho || !r.ativo) continue;
      if (r.amostragem < 100 && Math.random() * 100 >= r.amostragem) continue;   // amostragem: manda só às vezes
      evento(r.evento, r.plataformas, r.valor);
    }
  };

  // Gatilho "abertura" → uma vez, ao carregar (depois dos pixels serem injetados).
  useEffect(() => { dispararGatilho("abertura"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Iframe: o endereço publica uma página EXTERNA em tela cheia — seja o
  // projeto dedicado (modo "iframe"), seja um fluxo/quiz existente com a chave
  // `iframeAtivo` ligada. A sessão abre, os pixels injetam e o gatilho
  // "abertura" dispara normalmente — o que acontece DENTRO do iframe é da
  // página embutida (domínio dela). Só http(s) renderiza (ver iframePublicado);
  // fluxo/quiz com a chave ligada mas URL inválida publica normal (o funil não
  // pode cair por um campo mal preenchido).
  const emb = iframeEmbed(bot.settings);
  if (emb || bot.settings.modo === "iframe") {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000" }}>
        {emb ? (
          // As configs vêm do snippet colado (style/allow/etc, ver iframeEmbed);
          // sem snippet, valem os padrões de tela cheia.
          <iframe src={emb.url} title={bot.nome}
            allowFullScreen={emb.allowFullScreen ?? true}
            allow={emb.allow ?? "autoplay; encrypted-media; fullscreen; clipboard-write; picture-in-picture; payment"}
            referrerPolicy={emb.referrerPolicy as React.HTMLAttributeReferrerPolicy | undefined}
            sandbox={emb.sandbox} loading={emb.loading as "eager" | "lazy" | undefined} scrolling={emb.scrolling}
            style={{ width: "100%", height: "100%", border: 0, display: "block", ...emb.estilo }} />
        ) : (
          <div style={{ height: "100%", display: "grid", placeItems: "center", background: "#F2F2F7", fontFamily: "system-ui, sans-serif", color: "#6B7280", fontSize: 15, padding: 24, textAlign: "center" }}>
            Este link não está disponível.
          </div>
        )}
      </div>
    );
  }

  // LinkTridi: vitrine de bio link. Não tem "conclusão" — o momento que vale é
  // o clique num cartão: primeira interação vira "inicio", o clique dispara o
  // gatilho "oferta" e a sessão guarda QUAL cartão levou a pessoa embora.
  if (bot.settings.modo === "linktridi") {
    return (
      <LinkTridiRuntime doc={normalizarLinkTridi(bot.settings.linktridi)} customCss={bot.settings.customCss}
        aoClicarPost={(post) => {
          if (!iniciou.current) { iniciou.current = true; dispararGatilho("inicio"); }
          gravar({ ...varsRef.current, post_clicado: post.titulo || post.destinoUrl || post.id }, post.id);
          dispararGatilho("oferta");
        }}
      />
    );
  }

  // O bot tem dois modos de apresentação e UM contrato: os dois abrem sessão,
  // gravam as respostas na mesma tabela, mandam o lead pro mesmo destino e
  // disparam os mesmos gatilhos de pixel. Só muda quem desenha a tela.
  if (bot.settings.modo === "quiz" && bot.settings.quiz) {
    return (
      <QuizRuntime
        quiz={bot.settings.quiz} theme={bot.theme} customCss={bot.settings.customCss}
        resumeKey={bot.id} altura="100dvh" varsIniciais={varsIniciais}
        enviarCurriculo={enviarCurriculo}
        aoResponder={(vars, etapaId) => {
          gravar(vars, etapaId);
          if (!iniciou.current) { iniciou.current = true; dispararGatilho("inicio"); }
        }}
        aoConcluir={(vars) => { gravar(vars, undefined, true); dispararGatilho("conclusao"); }}
        aoOferta={() => dispararGatilho("oferta")}
      />
    );
  }

  return (
    <ChatRuntime
      fluxo={bot.fluxo} theme={bot.theme} settings={bot.settings} customCss={bot.settings.customCss} resumeKey={bot.id}
      altura="100dvh" varsIniciais={varsIniciais}
      aoResponder={(vars, grupoId) => {
        gravar(vars, grupoId);
        if (!iniciou.current) { iniciou.current = true; dispararGatilho("inicio"); }   // 1ª resposta
      }}
      aoConcluir={(vars) => {
        gravar(vars, undefined, true);   // server grava o lead + dispara o webhook de destino
        dispararGatilho("conclusao");
      }}
      aoEvento={evento}
    />
  );
}
