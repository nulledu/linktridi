"use client";

// ── Tridify · Funil configurável (§3) ────────────────────────────────────────
// Funil horizontal grande: escolhe QUAL funil analisar (geral, por categoria ou
// por tag), QUAIS etapas aparecem, e ao clicar numa etapa abre um painel lateral
// com as campanhas responsáveis (quem puxa pra baixo). Cada etapa mostra
// quantidade, conversão, perda e custo por etapa. Dados reais do overview.

import { tfSet } from "./ajustes-na-conta";
import { useEffect, useMemo, useState , useCallback} from "react";
import { useAtualizacao } from "./atualizacao";
import type { AdsOverview, Funil, CampaignRow } from "@/lib/meta-ads";
import type { VendasSnapshot } from "@/lib/trafego-vendas";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { FunilForma, TaxasDoFunil, pctFunil } from "../ui/funil";
import { Botao, BotaoIcone } from "../ui/controles";
import "./funil-pro.css";

interface EtapaDef { key: keyof Funil; nome: string; metricaCampanha: (c: CampaignRow) => number }
// metricaCampanha usa agora a MÉTRICA REAL de cada etapa por campanha (c.lpv,
// c.addCart, c.checkout, c.leads) — antes caía em clicks/purchases, então o
// drill-down não batia com o total da etapa mostrado no funil.
const ETAPAS: EtapaDef[] = [
  { key: "impressions", nome: "Impressões", metricaCampanha: (c) => c.impressions },
  { key: "reach", nome: "Alcance", metricaCampanha: (c) => c.reach },
  { key: "cliques", nome: "Cliques", metricaCampanha: (c) => c.clicks },
  { key: "lpv", nome: "Visitas (LP)", metricaCampanha: (c) => c.lpv ?? 0 },
  { key: "addCart", nome: "Carrinho", metricaCampanha: (c) => c.addCart ?? 0 },
  { key: "checkout", nome: "Checkout", metricaCampanha: (c) => c.checkout ?? 0 },
  { key: "leads", nome: "Leads", metricaCampanha: (c) => c.leads },
  { key: "purchases", nome: "Compras", metricaCampanha: (c) => c.purchases },
];
const ETAPA_BY = Object.fromEntries(ETAPAS.map((e) => [e.key, e])) as Record<string, EtapaDef>;
const PADRAO: (keyof Funil)[] = ["impressions", "cliques", "lpv", "checkout", "purchases"];

// Modelos NOMEADOS de funil (§3): cada um define quais etapas aparecem. Usa as
// etapas disponíveis no dado do Meta (sem "conversa"/"vídeo" próprios).
const MODELOS: { key: string; nome: string; etapas: (keyof Funil)[] }[] = [
  { key: "ecommerce", nome: "E-commerce", etapas: ["impressions", "cliques", "lpv", "addCart", "checkout", "purchases"] },
  { key: "whatsapp", nome: "WhatsApp", etapas: ["impressions", "cliques", "purchases"] },
  { key: "lead", nome: "Lead", etapas: ["impressions", "cliques", "lpv", "leads"] },
  { key: "vsl", nome: "VSL", etapas: ["impressions", "cliques", "lpv", "purchases"] },
  { key: "formulario", nome: "Formulário", etapas: ["impressions", "cliques", "lpv", "leads"] },
  { key: "lancamento", nome: "Lançamento", etapas: ["impressions", "reach", "cliques", "lpv", "purchases"] },
  { key: "marketplace", nome: "Marketplace", etapas: ["impressions", "cliques", "purchases"] },
];

export function FunilPro({ d, userId, period, vendasPreview }: { d: AdsOverview; userId: string; period: PeriodState; vendasPreview?: VendasSnapshot }) {
  const key = `trafego.funil.etapas.${userId}`;
  const [etapasSel, setEtapasSel] = useState<(keyof Funil)[]>(() => {
    try { const s = localStorage.getItem(key); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p; } } catch { /* */ }
    return PADRAO;
  });
  // Segmento (Geral / categoria / tag) — persistido por usuário (antes resetava
  // pra "Geral" a cada remontagem da aba).
  const segKey = `trafego.funil.segmento.${userId}`;
  const [modelo, setModelo] = useState<{ tipo: "geral" | "categoria" | "tag"; chave?: string }>(() => {
    try { const s = localStorage.getItem(segKey); if (s) return JSON.parse(s); } catch { /* */ }
    return { tipo: "geral" };
  });
  const mudarSegmento = (m: { tipo: "geral" | "categoria" | "tag"; chave?: string }) => { setModelo(m); try { tfSet(segKey, JSON.stringify(m)); } catch { /* */ } };
  const [drill, setDrill] = useState<keyof Funil | null>(null);
  const [config, setConfig] = useState(false);

  // Venda REAL (Yampi/ERP). O funil fechava no número do PIXEL — que é o que a
  // Meta ATRIBUI, não o que aconteceu. Falha silenciosa: sem o ERP o funil
  // continua funcionando no atribuído (rotulado como tal).
  const [vendas, setVendas] = useState<VendasSnapshot | null>(vendasPreview ?? null);
  const carregarVendas = useCallback(() => {
    if (vendasPreview) return;
    if (period.key === "custom" && (!period.from || !period.to)) return;
    let vivo = true;
    fetch(`/api/trafego/vendas?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) setVendas(j?.faturamento === undefined ? null : j); })
      .catch(() => { if (vivo) setVendas(null); });
    return () => { vivo = false; };
  }, [period, vendasPreview]);

  useEffect(() => carregarVendas(), [carregarVendas]);
  // O funil fecha na venda REAL do ERP — sem isto ela ficava na leitura antiga
  // enquanto o resto do funil (pixel) andava no "Atualizar".
  useAtualizacao(carregarVendas);
  // Modelo de funil escolhido (E-commerce/WhatsApp/…) — salvo como PADRÃO do usuário.
  const mKey = `trafego.funil.modelo.${userId}`;
  const [modeloFunil, setModeloFunil] = useState<string>(() => { try { return localStorage.getItem(mKey) || "custom"; } catch { return "custom"; } });
  function aplicarModelo(m: typeof MODELOS[number]) { salvarEtapas(m.etapas); setModeloFunil(m.key); try { tfSet(mKey, m.key); } catch { /* */ } }
  function marcarCustom() { setModeloFunil("custom"); try { tfSet(mKey, "custom"); } catch { /* */ } }

  const funilAtivo: Funil = useMemo(() => {
    if (modelo.tipo === "categoria") return d.funisPorCategoria.find((f) => f.chave === modelo.chave)?.funil ?? d.funil;
    if (modelo.tipo === "tag") return d.funisPorTag.find((f) => f.chave === modelo.chave)?.funil ?? d.funil;
    return d.funil;
  }, [modelo, d]);

  function salvarEtapas(next: (keyof Funil)[]) { setEtapasSel(next); try { tfSet(key, JSON.stringify(next)); } catch { /* */ } }
  function toggleEtapa(k: keyof Funil) {
    const has = etapasSel.includes(k);
    const next = has ? etapasSel.filter((x) => x !== k) : ETAPAS.filter((e) => etapasSel.includes(e.key) || e.key === k).map((e) => e.key);
    if (next.length >= 2) { salvarEtapas(next); marcarCustom(); }
  }

  // ── REAL × PIXEL ────────────────────────────────────────────────────────────
  // Topo/meio do funil (impressões→checkout) SÓ existe no Meta — não há
  // contrapartida no ERP. Mas COMPRAS e FATURAMENTO têm: é a venda que de fato
  // caiu nas origens de tráfego do ERP. Essa passa a mandar; o pixel vira
  // referência ao lado. Só no segmento GERAL: venda real não se divide por
  // tag/categoria de campanha, então nos segmentos seguimos no atribuído.
  const real = useMemo(() => {
    if (!vendas || modelo.tipo !== "geral") return null;
    // Toda origem de tráfego, não a plataforma Yampi: com o checkout da loja na
    // Vega (desde 24/07/26) medir por `yampiPagas*` deixava o fundo do funil
    // quase vazio enquanto a loja vendia normalmente.
    const compras = vendas.trafegoN || 0;
    const receita = vendas.trafegoValor || 0;
    if (compras <= 0 && receita <= 0) return null;
    return { compras, receita };
  }, [vendas, modelo.tipo]);

  // A etapa "Compras" passa a mostrar a venda REAL (guardando o valor do pixel
  // ao lado). As demais etapas continuam sendo o dado do Meta.
  const etapas = ETAPAS.filter((e) => etapasSel.includes(e.key)).map((e) => ({
    ...e,
    v: e.key === "purchases" && real ? real.compras : Number(funilAtivo[e.key]) || 0,
    pixel: e.key === "purchases" && real ? Number(funilAtivo.purchases) || 0 : null,
  }));
  const semDados = etapas.every((e) => e.v === 0);
  const convGlobal = (etapas[0]?.v || 0) > 0 ? ((etapas[etapas.length - 1]?.v || 0) / etapas[0].v) * 100 : null;
  const receitaFunil = real ? real.receita : funilAtivo.revenue;
  const roasFunil = funilAtivo.spend > 0 ? receitaFunil / funilAtivo.spend : null;
  const roasPixel = funilAtivo.spend > 0 ? funilAtivo.revenue / funilAtivo.spend : null;

  // Campanhas responsáveis pela etapa (drill-down).
  const responsaveis = useMemo(() => {
    if (!drill) return [];
    const ed = ETAPA_BY[drill];
    return [...d.campanhas].map((c) => ({ c, v: ed.metricaCampanha(c) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 10);
  }, [drill, d.campanhas]);

  // ── Diagnóstico: onde o funil mais perde e onde mais passa ──────────────────
  const transicoes = etapas.slice(1).map((e, idx) => {
    const prev = etapas[idx];
    const conv = prev.v > 0 ? (e.v / prev.v) * 100 : null;
    return { de: prev, para: e, conv, perda: conv == null ? null : 100 - conv };
  });
  const gargalo = transicoes.filter((t) => t.perda != null).sort((a, b) => b.perda! - a.perda!)[0] ?? null;
  // conv > 100 só acontece na fronteira pixel→venda real (o pixel rastreou menos
  // que a venda que caiu). Não é "a melhor passagem do funil" — é artefato de
  // fonte cruzada; fica de fora pra não virar o destaque.
  const melhor = transicoes.filter((t) => t.conv != null && t.conv <= 100).sort((a, b) => b.conv! - a.conv!)[0] ?? null;
  // Campanhas que ENTRAM na etapa do gargalo (onde a perda se concentra) — com a
  // própria conversão ali. Ordena pelas que trazem mais volume: é onde mexer rende.
  const gargEntraKey = gargalo?.de.key, gargSaiKey = gargalo?.para.key;
  const campanhasGargalo = useMemo(() => {
    if (!gargEntraKey || !gargSaiKey) return [];
    const de = ETAPA_BY[gargEntraKey], para = ETAPA_BY[gargSaiKey];
    return d.campanhas
      .map((c) => { const entra = de.metricaCampanha(c), sai = para.metricaCampanha(c); return { c, entra, sai, conv: entra > 0 ? (sai / entra) * 100 : null }; })
      .filter((x) => x.entra > 0).sort((a, b) => b.entra - a.entra).slice(0, 5);
  }, [gargEntraKey, gargSaiKey, d.campanhas]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Modelo de funil (nomeado) — define as etapas; salvo como padrão */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 2 }}>Modelo</span>
        {MODELOS.map((m) => (
          <button key={m.key} onClick={() => aplicarModelo(m)} style={{ padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700, border: modeloFunil === m.key ? "1px solid var(--primary)" : "1px solid var(--border)", background: modeloFunil === m.key ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)", color: modeloFunil === m.key ? "var(--text)" : "var(--text-dim)" }}>{m.nome}</button>
        ))}
        <button onClick={() => { setConfig(true); marcarCustom(); }} style={{ padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700, border: modeloFunil === "custom" ? "1px solid var(--primary)" : "1px solid var(--border)", background: modeloFunil === "custom" ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)", color: modeloFunil === "custom" ? "var(--text)" : "var(--text-dim)" }}>Personalizado</button>
      </div>
      {/* Controles: fonte do funil (geral/categoria/tag) + configurar etapas */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", gap: 2, background: "var(--seg-track)", padding: 3, borderRadius: 11, border: "1px solid var(--border)" }}>
          <BtnModelo on={modelo.tipo === "geral"} onClick={() => mudarSegmento({ tipo: "geral" })}>Geral</BtnModelo>
          {d.categoriasAgg?.length > 0 && d.funisPorCategoria.slice(0, 4).map((f) => (
            <BtnModelo key={f.chave} on={modelo.tipo === "categoria" && modelo.chave === f.chave} onClick={() => mudarSegmento({ tipo: "categoria", chave: f.chave })}>{f.chave}</BtnModelo>
          ))}
          {d.funisPorTag.slice(0, 3).map((f) => (
            <BtnModelo key={f.chave} on={modelo.tipo === "tag" && modelo.chave === f.chave} onClick={() => mudarSegmento({ tipo: "tag", chave: f.chave })}>{f.chave}</BtnModelo>
          ))}
        </div>
        <Botao variante="secundario" icone="settings" onClick={() => setConfig((v) => !v)} style={{ marginLeft: "auto" }}>Etapas</Botao>
      </div>

      {config && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "var(--surface)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Quais etapas aparecem no funil</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {ETAPAS.map((e) => { const on = etapasSel.includes(e.key); return (
              <button key={e.key} onClick={() => toggleEtapa(e.key)} style={{ padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700, border: on ? "1px solid var(--primary)" : "1px solid var(--border)", background: on ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface-2, transparent)", color: on ? "var(--text)" : "var(--text-dim)" }}>{e.nome}</button>
            ); })}
          </div>
        </div>
      )}

      {/* Resumo: faturamento, ROAS e conversão global topo→fundo (antes o funil
          só mostrava perda entre etapas vizinhas e ignorava a receita). */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <MiniStat label={real ? "Faturamento real" : "Faturamento (Meta)"} value={fmtBRL2(receitaFunil)} cor="var(--tf-pos)"
          sub={real ? `venda real do tráfego — pixel: ${fmtBRL2(funilAtivo.revenue)}` : "atribuído pelo pixel"} />
        <MiniStat label="Investido" value={fmtBRL2(funilAtivo.spend)} />
        <MiniStat label={real ? "ROAS real" : "ROAS (pixel)"} value={roasFunil == null ? "—" : `${roasFunil.toFixed(2)}×`}
          sub={real && roasPixel != null ? `pixel: ${roasPixel.toFixed(2)}×` : undefined} />
        <MiniStat label="Conversão topo→fundo" value={convGlobal == null ? "—" : `${convGlobal.toFixed(2)}%`} sub={etapas.length >= 2 ? `${etapas[0].nome} → ${etapas[etapas.length - 1].nome}${real ? " (venda real)" : ""}` : undefined} />
      </div>

      {/* Funil horizontal (ou estado vazio, quando o segmento não tem entrega) */}
      {semDados ? (
        <div className="tf-panel" style={{ padding: 34, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
          Sem dados deste funil no período/segmento selecionado. Troque o segmento, o modelo ou o período.
        </div>
      ) : (
      // Funil + "Taxas de conversão" lado a lado; abaixo de 900px a fundação
      // (.duo-lista) empilha a coluna embaixo do funil.
      <div className="duo duo-lista">
      <div className="tf-panel" style={{ padding: 20 }}>
        <FunilForma rotulo="Funil do período" ativa={drill} onEtapa={(k) => setDrill(k as keyof Funil)}
          etapas={etapas.map((e, i) => {
            const prev = i > 0 ? etapas[i - 1].v : null;
            const conv = prev && prev > 0 ? (e.v / prev) * 100 : null;
            const perda = conv != null ? 100 - conv : null;
            // A etapa de Compras vem da venda REAL e a anterior é do pixel. Como
            // o pixel sub-rastreia (iOS/adblock), a venda real pode passar do
            // checkout rastreado — aí a "perda" daria NEGATIVA. Isso não é
            // perda: é o pixel subestimando. Mostra assim, em vez de "-42%".
            return {
              chave: e.key, nome: e.nome, valor: e.v,
              taxa: conv == null ? undefined : pctFunil(conv),
              taxaTom: conv == null ? undefined : conv > 100 ? "bom" : (perda ?? 0) > 70 ? "ruim" : (perda ?? 0) > 40 ? "atencao" : "neutro",
            };
          })} />
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 10, textAlign: "center" }}>Toque numa etapa pra ver as campanhas responsáveis.</div>
      </div>
      <div className="tf-panel" style={{ padding: 20 }}>
        <TaxasDoFunil passagens={transicoes.filter((t) => t.conv != null).map((t) => ({
          de: t.de.nome, para: t.para.nome, taxa: pctFunil(t.conv!),
          tom: t.conv! > 100 ? "bom" : (t.perda ?? 0) > 70 ? "ruim" : (t.perda ?? 0) > 40 ? "atencao" : "neutro",
        }))} />
      </div>
      </div>
      )}

      {/* De onde vem cada número — o funil mistura duas fontes de propósito. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
        <Icon name="info-circle" size={14} color="var(--text-dim)" />
        {real ? (
          <span>
            <b style={{ color: "var(--text)" }}>Compras e faturamento = venda REAL</b> (todas as origens de tráfego do ERP).
            As etapas de topo (impressões, cliques, visitas, carrinho, checkout) só existem no Meta — e o que o pixel
            atribuiu fica de referência: o pixel contou <b style={{ color: "var(--text)" }}>{fmtNum(Number(funilAtivo.purchases) || 0)}</b> compras.
          </span>
        ) : modelo.tipo !== "geral" ? (
          <span>Neste segmento os números são os <b style={{ color: "var(--text)" }}>atribuídos pelo pixel</b> — a venda real do ERP não se divide por tag/categoria de campanha. Use o segmento <b style={{ color: "var(--text)" }}>Geral</b> pra ver a venda real.</span>
        ) : (
          <span>Números <b style={{ color: "var(--text)" }}>atribuídos pelo pixel</b> da Meta (a venda real do ERP não carregou neste período).</span>
        )}
      </div>

      {/* Diagnóstico do funil — preenche a página com análise, não só números.
          Só aparece quando há entrega e ao menos uma transição entre etapas. */}
      {!semDados && gargalo && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
          {/* Maior gargalo — manchete (perda) → legenda (de → para) → barras das duas etapas */}
          <div className="tf-panel fp-diag">
            <div className="fp-cab"><Icon name="trending-down" size={14} color="var(--tf-neg)" />Maior gargalo</div>
            <div>
              <div className="stat fp-num">−{gargalo.perda!.toFixed(0)}%</div>
              <div className="fp-legenda">{gargalo.de.nome} → {gargalo.para.nome}</div>
            </div>
            <div className="fp-barras">
              {[gargalo.de, gargalo.para].map((e, i) => (
                <div key={e.key} className="fp-lin">
                  <span className="fp-lin-nome">{e.nome}</span>
                  <span className="stat fp-lin-val" style={{ color: "var(--text)" }}>{fmtNum(e.v)}</span>
                  <div className="fp-trilho"><span style={{ width: `${gargalo.de.v > 0 ? Math.min(100, (e.v / gargalo.de.v) * 100) : 0}%`, background: i === 0 ? "var(--text-dim)" : "var(--tf-neg)" }} /></div>
                </div>
              ))}
            </div>
            <div className="fp-frase">A cada 100 que chegam em {gargalo.de.nome.toLowerCase()}, só {(100 - gargalo.perda!).toFixed(0)} seguem. Comece por aqui.</div>
            {melhor && melhor !== gargalo && (
              <div className="fp-rodape">Melhor passagem: <strong style={{ color: "var(--tf-pos)" }}>{melhor.de.nome} → {melhor.para.nome}</strong> · {melhor.conv!.toFixed(0)}%</div>
            )}
            <Botao variante="secundario" tamanho="sm" icone="list-check" onClick={() => setDrill(gargalo.para.key)} style={{ alignSelf: "flex-start" }}>Ver campanhas nesta etapa</Botao>
          </div>

          {/* Onde mexer primeiro — lista ranqueada: nome + conversão, barra de volume, ação curta */}
          <div className="tf-panel fp-diag">
            <div>
              <div className="fp-cab"><Icon name="target-arrow" size={14} color="var(--text-dim)" />Onde mexer primeiro</div>
              <div className="fp-frase" style={{ marginTop: 4 }}>Maior volume em {gargalo.de.nome.toLowerCase()} · % que vira {gargalo.para.nome.toLowerCase()}</div>
            </div>
            <div className="fp-lista">
              {campanhasGargalo.length === 0 && <div className="fp-frase">Sem dados por campanha nesta etapa.</div>}
              {(() => {
                const topo = campanhasGargalo[0]?.entra || 1;
                const media = 100 - gargalo.perda!;
                return campanhasGargalo.map(({ c, entra, sai, conv }, idx) => {
                  const cor = conv == null ? "var(--text-dim)" : conv < 30 ? "var(--tf-neg)" : conv < 60 ? "var(--tf-warn)" : "var(--tf-pos)";
                  const acao = conv == null ? "sem conversão medida" : conv < media ? "abaixo da média — revisar" : "acima da média — manter";
                  return (
                    <div key={c.id} className="fp-rank">
                      <span className="fp-rank-n">{idx + 1}</span>
                      <div className="fp-lin">
                        <span className="fp-lin-nome" title={c.name}>{c.name}</span>
                        <span className="stat fp-lin-val" style={{ color: cor }}>{conv == null ? "—" : `${conv.toFixed(0)}%`}</span>
                        <div className="fp-trilho"><span style={{ width: `${(entra / topo) * 100}%`, background: "var(--graf-1, var(--primary))" }} /></div>
                        <span className="fp-apoio">{fmtNum(entra)} → {fmtNum(sai)}{c.roas != null ? ` · ROAS ${c.roas.toFixed(2)}×` : ""} · <span style={{ color: conv != null && conv < media ? "var(--tf-neg)" : "var(--text-dim)" }}>{acao}</span></span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Painel lateral (drawer) de drill-down */}
      {drill && (
        <div onClick={() => setDrill(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,8,16,.5)", display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 92vw)", height: "100%", background: "var(--surface)", borderLeft: "1px solid var(--border)", overflowY: "auto", padding: 22, boxShadow: "-20px 0 50px -20px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700 }}>Campanhas na etapa</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "var(--text)" }}>{ETAPA_BY[drill].nome}</div>
              </div>
              <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={() => setDrill(null)} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>Quem mais contribui nesta etapa — comece a análise por cima da lista.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {responsaveis.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Sem dados por campanha nesta etapa.</div>}
              {responsaveis.map(({ c, v }, idx) => (
                <div key={c.id} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, alignItems: "center", padding: "9px 11px", borderRadius: 11, border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)" }}>{idx + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{c.account} · ROAS {c.roas == null ? "—" : `${c.roas.toFixed(2)}×`}</div>
                  </div>
                  <span className="stat" style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>{fmtNum(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, sub, cor }: { label: string; value: string; sub?: string; cor?: string }) {
  return (
    <div className="tf-panel" style={{ padding: "11px 15px", flex: "1 1 150px", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700 }}>{label}</div>
      <div className="stat" style={{ fontSize: 20, fontWeight: 800, color: cor || "var(--text)", marginTop: 2, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function BtnModelo({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: on ? "var(--primary-acao, var(--primary))" : "transparent", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)", whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{children}</button>;
}
