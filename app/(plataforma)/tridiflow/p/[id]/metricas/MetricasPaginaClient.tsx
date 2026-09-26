"use client";

// Métricas de UMA página. Simples de propósito: o TridiFlow mostra o
// COMPORTAMENTO DENTRO da página (viu, assistiu, clicou, enviou). Campanha,
// investimento, faturamento, ROAS e atribuição continuam no Tridify — misturar
// os dois daria dois números diferentes pra mesma pergunta.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../../Icon";
import type { MetricasPagina } from "@/lib/tridiflow-db";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const PERIODOS: [number, string][] = [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"]];

export function MetricasPaginaClient({ id, nome, slug, host }: {
  id: string; nome: string; slug: string; host: string | null;
}) {
  const [dias, setDias] = useState(30);
  const [m, setM] = useState<MetricasPagina | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setM(null); setErro(null);
    fetch(`/api/tridiflow/paginas/metricas?id=${id}&dias=${dias}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) setErro(d.error); else setM(d.metricas); })
      .catch(() => setErro("Sem conexão."));
  }, [id, dias]);
  useEffect(() => { carregar(); }, [carregar]);

  const link = `https://${host || (typeof window !== "undefined" ? window.location.host : "")}/p/${slug}`;
  // Retenção do vídeo relativa a quem DEU PLAY — "50% dos que começaram", não
  // "50% de quem abriu a página". São perguntas diferentes.
  const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);

  return (
    <div style={{ maxWidth: 1080 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <Link href="/tridiflow/meus-bots" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-dim)", textDecoration: "none", marginBottom: 6 }}>
            <Icon name="chevron-left" size={14} color="var(--text-dim)" /> Projetos
          </Link>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>{nome}</h1>
          <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--text-dim)", textDecoration: "none" }}>{link}</a>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PERIODOS.map(([d, label]) => (
            <button key={d} onClick={() => setDias(d)}
              style={{
                padding: "8px 13px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                border: `1px solid ${dias === d ? "transparent" : "var(--border)"}`,
                background: dias === d ? "var(--primary)" : "var(--surface)",
                color: dias === d ? "#fff" : "var(--text-dim)",
              }}>{label}</button>
          ))}
          <Link href={`/tridiflow/p/${id}`} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10,
            border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
            fontSize: 12.5, fontWeight: 700, textDecoration: "none",
          }}><Icon name="edit" size={14} color="var(--text-dim)" /> Editar</Link>
        </div>
      </div>

      {erro && (
        <div style={{ padding: 14, borderRadius: 12, background: "color-mix(in srgb, var(--perigo) 10%, transparent)", color: "var(--perigo)", fontSize: 13, marginBottom: 16 }}>{erro}</div>
      )}

      {!m ? <Esqueleto /> : (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px),1fr))", marginBottom: 18 }}>
            <Cartao rotulo="Visualizações" valor={fmt(m.visualizacoes)} icone="eye" />
            <Cartao rotulo="Visitantes únicos" valor={fmt(m.visitantes)} icone="users" />
            <Cartao rotulo="Cliques no botão" valor={fmt(m.cliques)} icone="click" />
            <Cartao rotulo="Formulários" valor={fmt(m.formularios)} icone="forms" />
            <Cartao rotulo="Taxa de conversão" valor={`${m.conversao}%`} icone="chart-line" destaque />
          </div>

          <Painel titulo="Vídeo" hint="Percentual sobre quem deu play.">
            {m.videoInicios === 0 ? (
              <Vazio texto="Nenhuma reprodução registrada no período. Se o player não for YouTube, Vimeo, Panda ou arquivo direto, o progresso pode não ser detectado." />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <Barra rotulo="Começaram a assistir" valor={m.videoInicios} pct={100} />
                <Barra rotulo="25% assistido" valor={m.video25} pct={pct(m.video25, m.videoInicios)} />
                <Barra rotulo="50% assistido" valor={m.video50} pct={pct(m.video50, m.videoInicios)} />
                <Barra rotulo="75% assistido" valor={m.video75} pct={pct(m.video75, m.videoInicios)} />
                <Barra rotulo="Assistiram até o fim" valor={m.videoFim} pct={pct(m.videoFim, m.videoInicios)} />
              </div>
            )}
          </Painel>

          <Painel titulo="Oferta" hint="Quantas pessoas chegaram a ver o card de oferta na tela.">
            <div style={{ display: "grid", gap: 8 }}>
              <Barra rotulo="Viram a oferta" valor={m.ofertaVista} pct={pct(m.ofertaVista, m.visualizacoes)} />
              <Barra rotulo="Clicaram no botão" valor={m.cliques} pct={pct(m.cliques, m.visualizacoes)} />
            </div>
          </Painel>

          {/* Placar do teste A/B — só existe quando há tráfego carimbado com
              versão, ou seja, quando o teste está (ou esteve) ligado. */}
          {(m.ab.a.visitantes > 0 || m.ab.b.visitantes > 0) && (
            <Painel titulo="Teste A/B" hint="Quem viu cada versão e quantos viraram lead.">
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
                {([m.ab.a, m.ab.b] as const).map((br) => {
                  const venceu = m.ab.vencedora === br.variante;
                  return (
                    <div key={br.variante} style={{
                      padding: 14, borderRadius: 12,
                      border: `1px solid ${venceu ? "var(--ok)" : "var(--border)"}`,
                      background: venceu ? "color-mix(in srgb, var(--ok) 8%, transparent)" : "var(--surface)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <strong style={{ fontSize: 13, fontWeight: 800 }}>Versão {br.variante.toUpperCase()}</strong>
                        {venceu && <Icon name="trophy" size={14} color="var(--ok)" />}
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>{br.taxa}%</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
                        {fmt(br.conversoes)} lead(s) de {fmt(br.visitantes)} visitante(s) · {fmt(br.cliques)} clique(s)
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* O motivo é tão importante quanto o número: é ele que impede
                  alguém de trocar a página vencedora por causa de 12 visitas. */}
              <p style={{
                fontSize: 12.5, lineHeight: 1.5, marginTop: 12, marginBottom: 0,
                color: m.ab.vencedora ? "var(--ok)" : "var(--text-dim)",
                fontWeight: m.ab.vencedora ? 700 : 400,
              }}>{m.ab.motivo}</p>
            </Painel>
          )}

          <Painel titulo="Origem do tráfego" hint="Parâmetros UTM do link do anúncio.">
            {m.utm.length === 0 ? <Vazio texto="Nenhuma UTM recebida. Use links com utm_source, utm_medium e utm_campaign para ver a origem aqui." /> : (
              <div style={{ display: "grid", gap: 2 }}>
                {m.utm.map((u, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-dim)", flex: "0 1 96px", minWidth: 0, textTransform: "uppercase" }}>{u.chave.replace("utm_", "")}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.valor}</span>
                    <strong style={{ fontSize: 13, fontWeight: 800 }}>{fmt(u.total)}</strong>
                  </div>
                ))}
              </div>
            )}
          </Painel>

          <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.55, marginTop: 18 }}>
            Investimento, faturamento, ROAS e atribuição de venda continuam no Tridify — esta tela mostra
            só o que acontece dentro da página.
          </p>
        </>
      )}
    </div>
  );
}

function Cartao({ rotulo, valor, icone, destaque }: { rotulo: string; valor: string; icone: string; destaque?: boolean }) {
  return (
    <div style={{
      padding: 16, borderRadius: 16, background: "var(--surface)",
      border: `1px solid ${destaque ? "color-mix(in srgb, var(--primary) 40%, transparent)" : "var(--border)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>{rotulo}</span>
        <Icon name={icone} size={15} color={destaque ? "var(--primary-texto)" : "var(--text-dim)"} />
      </div>
      <div className="stat" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 6, color: destaque ? "var(--primary-texto)" : "var(--text)" }}>{valor}</div>
    </div>
  );
}

function Painel({ titulo, hint, children }: { titulo: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, marginBottom: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)" }}>{titulo}</strong>
        {hint && <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Barra({ rotulo, valor, pct }: { rotulo: string; valor: number; pct: number }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ color: "var(--text)" }}>{rotulo}</span>
        <span style={{ color: "var(--text-dim)" }}><strong style={{ color: "var(--text)" }}>{fmt(valor)}</strong> · {pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: "var(--primary)", borderRadius: 999 }} />
      </div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>{texto}</p>;
}

function Esqueleto() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px),1fr))" }}>
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="tf-skel" style={{ height: 92, borderRadius: 16, background: "var(--surface-2)" }} />)}
      </div>
      {Array.from({ length: 2 }, (_, i) => <div key={i} className="tf-skel" style={{ height: 170, borderRadius: 16, background: "var(--surface-2)" }} />)}
    </div>
  );
}
