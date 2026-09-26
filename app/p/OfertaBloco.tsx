"use client";

// Card de OFERTA. É um cartão de apresentação com um botão que LEVA pro
// checkout — não é checkout. Nada de cobrança acontece aqui, por decisão de
// escopo: o botão só abre a URL que a equipe colou (Kiwify, Hotmart, etc).

import { useEffect, useRef } from "react";
import type { Bloco } from "@/lib/tridiflow-pagina";
import { urlImagemSegura, urlSegura, TEXTO } from "@/lib/tridiflow-pagina-estilo";
import type { CtxPagina } from "./contexto";

export function OfertaBloco({ bloco, ctx }: { bloco: Bloco; ctx: CtxPagina }) {
  const o = bloco.oferta ?? { produto: "" };
  const ref = useRef<HTMLDivElement | null>(null);
  const jaViu = useRef(false);

  // offer_viewed dispara quando a oferta ENTRA NA TELA de verdade (não quando
  // é renderizada fora da dobra) — senão a métrica mentiria em toda visita.
  useEffect(() => {
    if (ctx.modo !== "publicado" || !ref.current || jaViu.current) return;
    // Sem a API (navegador antigo, webview capada) a oferta continua na página
    // — só a métrica de "viu a oferta" deixa de existir. Mesma guarda do
    // useAnimacao: conteúdo nunca depende de IntersectionObserver.
    if (typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    const ob = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting && !jaViu.current) {
          jaViu.current = true;
          ctx.onEvento("offer_viewed", { blocoId: bloco.id, produto: o.produto });
          ob.disconnect();
        }
      }
    }, { threshold: 0.5 });
    ob.observe(el);
    return () => ob.disconnect();
  }, [ctx, bloco.id, o.produto]);

  const destino = urlSegura(o.checkoutUrl);
  const primaria = o.corBotao || ctx.config.corPrimaria || "var(--primary-texto)";
  const imagem = urlImagemSegura(o.imagemUrl);

  const clicar = (e: React.MouseEvent) => {
    if (ctx.modo === "preview") { e.preventDefault(); return; }
    ctx.onEvento("cta_clicked", { blocoId: bloco.id, origem: "oferta", destino });
  };

  return (
    <div
      ref={ref}
      style={{
        textAlign: "left",
        border: `${o.destaque ? 2 : 1}px solid ${o.destaque ? primaria : "color-mix(in srgb, currentColor 15%, transparent)"}`,
        borderRadius: bloco.estilo?.raio ?? 16,
        background: bloco.estilo?.fundo || "color-mix(in srgb, currentColor 3%, transparent)",
        padding: 20,
        boxShadow: o.destaque ? `0 10px 34px color-mix(in srgb, ${primaria} 22%, transparent)` : "none",
        position: "relative",
        maxWidth: 460, marginInline: "auto",
      }}
    >
      {o.selo && (
        <span style={{
          position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
          background: primaria, color: "#fff", fontSize: 11.5, fontWeight: 800,
          padding: "5px 12px", borderRadius: 999, whiteSpace: "nowrap",
        }}>{o.selo}</span>
      )}

      {imagem && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagem} alt={o.produto} style={{ width: "100%", borderRadius: 12, marginBottom: 14, display: "block" }} />
      )}

      <strong style={{ display: "block", fontSize: 19, fontWeight: 800, letterSpacing: "-.01em" }}>{o.produto}</strong>
      {o.descricao && <p style={{ margin: "6px 0 0", fontSize: 14, opacity: TEXTO.secundario, lineHeight: 1.45 }}>{o.descricao}</p>}

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {o.precoAntes && <span style={{ fontSize: 15, opacity: TEXTO.apagado, textDecoration: "line-through" }}>{o.precoAntes}</span>}
        {o.preco && <span style={{ fontSize: 30, fontWeight: 900, color: primaria, letterSpacing: "-.02em" }}>{o.preco}</span>}
      </div>
      {o.parcelamento && <div style={{ fontSize: 13, opacity: TEXTO.secundario, marginTop: 2 }}>{o.parcelamento}</div>}

      {!!o.beneficios?.length && (
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 8 }}>
          {o.beneficios.map((b, i) => (
            <li key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 14 }}>
              <span aria-hidden style={{
                flex: "none", width: 18, height: 18, borderRadius: "50%", marginTop: 1,
                background: `color-mix(in srgb, ${primaria} 18%, transparent)`, color: primaria,
                display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900,
              }}>✓</span>
              <span style={{ lineHeight: 1.4 }}>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <a
        href={destino || undefined}
        onClick={clicar}
        target={ctx.modo === "publicado" ? "_blank" : undefined}
        rel="noopener noreferrer"
        style={{
          display: "block", marginTop: 18, textAlign: "center", textDecoration: "none",
          background: primaria, color: "#fff", fontWeight: 800, fontSize: 16,
          padding: "15px 18px", borderRadius: bloco.estilo?.raio ?? 12,
          cursor: destino || ctx.modo === "preview" ? "pointer" : "not-allowed",
          opacity: destino || ctx.modo === "preview" ? 1 : 0.55,
        }}
      >{o.rotuloBotao || "Comprar agora"}</a>

      {o.garantia && <div style={{ fontSize: 12.5, opacity: TEXTO.secundario, textAlign: "center", marginTop: 10 }}>{o.garantia}</div>}
      {o.extra && <div style={{ fontSize: 12, opacity: TEXTO.apagado, textAlign: "center", marginTop: 4 }}>{o.extra}</div>}
    </div>
  );
}
