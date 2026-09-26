"use client";

// Analytics — métricas agregadas de todos os bots: KPIs, desempenho ao longo do
// tempo, por bot e atribuição por UTM. Visual claro (mockups).
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useIsEstreito } from "../../ui/useMediaQuery";
import { GlassSelect } from "../../GlassPicker";
import { DataList, type Coluna } from "../../ui/DataList";

interface Serie { data: string; sessoes: number; leads: number }
interface PorBot { botId: string; nome: string; sessoes: number; leads: number; taxa: number }
interface Utm { source: string; sessoes: number; leads: number }
interface Data { sessoes: number; concluidas: number; leads: number; taxa: number; serie: Serie[]; porBot: PorBot[]; utm: Utm[]; error?: string }

interface Etapa { etapa: string; titulo: string; abandonos: number }
interface Funil { sessoes: number; porEtapa: Etapa[]; grupos?: { id: string; titulo: string }[]; error?: string }

interface ProjetoVenda { botId: string; nome: string; vendas: number; receita: number; ticket: number; conversao: number }
interface Vendas { projetos: ProjetoVenda[]; janela: number; error?: string }

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmt = (n: number) => n.toLocaleString("pt-BR");
const corTaxa = (t: number) => (t >= 40 ? "var(--ok)" : t >= 25 ? "var(--atencao)" : "var(--perigo)");

export function AnalyticsClient() {
  const [d, setD] = useState<Data | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [dias, setDias] = useState(14);
  const [funilBot, setFunilBot] = useState("");
  const [funil, setFunil] = useState<Funil | null>(null);
  const [vendas, setVendas] = useState<Vendas | null>(null);

  useEffect(() => {
    setD(null); setErro(null);
    fetch(`/api/tridiflow/analytics-geral?dias=${dias}`, { cache: "no-store" }).then((r) => r.json())
      .then((x) => { if (x.error) setErro(x.error); else setD(x); }).catch(() => setErro("Sem conexão."));
    // Rota separada: cruza o ERP e responde mais devagar que o resto da tela.
    setVendas(null);
    fetch(`/api/tridiflow/vendas?dias=${dias}`, { cache: "no-store" }).then((r) => r.json())
      .then((x) => setVendas(x.error ? null : x)).catch(() => setVendas(null));
  }, [dias]);

  // Ao escolher um bot, busca o funil por etapa dele (reusa a API de resultados).
  useEffect(() => {
    if (!funilBot) { setFunil(null); return; }
    setFunil(null);
    fetch(`/api/tridiflow/analytics?botId=${funilBot}`, { cache: "no-store" }).then((r) => r.json())
      .then((x) => setFunil(x.error ? null : x)).catch(() => setFunil(null));
  }, [funilBot]);

  const maxSerie = useMemo(() => Math.max(1, ...(d?.serie ?? []).map((s) => s.sessoes)), [d]);
  // Numa tela estreita cada coluna do gráfico fica com ~12px: a data (dd/mm)
  // não cabe e as legendas viram borrão. Mostramos ~7 datas e escondemos o
  // resto (visibility, pra não desalinhar as barras).
  const estreito = useIsEstreito();
  const passoData = estreito ? Math.max(1, Math.ceil((d?.serie.length ?? 1) / 7)) : 1;
  const vendaDe = useMemo(() => new Map((vendas?.projetos ?? []).map((p) => [p.botId, p])), [vendas]);
  const totalVenda = useMemo(
    () => (vendas?.projetos ?? []).reduce((a, p) => ({ vendas: a.vendas + p.vendas, receita: a.receita + p.receita }), { vendas: 0, receita: 0 }),
    [vendas],
  );

  // Por bot: tabela no computador, cartão no celular (bot no título, receita
  // em evidência — é o número que responde se o funil serviu). Vendas e
  // receita chegam depois, por outra rota: até lá mostram "…" e não ordenam.
  const colunasPorBot = useMemo<Coluna<PorBot>[]>(() => {
    const vd = (b: PorBot) => vendaDe.get(b.botId);
    return [
      { chave: "bot", titulo: "Bot", papel: "titulo", ordenar: (b) => b.nome, render: (b) => <span style={{ fontWeight: 700 }}>{b.nome}</span> },
      { chave: "sessoes", titulo: "Sessões", alinhar: "right", ordenar: (b) => b.sessoes, render: (b) => fmt(b.sessoes) },
      { chave: "leads", titulo: "Leads", alinhar: "right", ordenar: (b) => b.leads, render: (b) => fmt(b.leads) },
      {
        chave: "taxa", titulo: "Conclusão", alinhar: "right", ordenar: (b) => b.taxa,
        render: (b) => <span style={{ fontWeight: 700, color: corTaxa(b.taxa) }}>{b.taxa}%</span>,
      },
      {
        chave: "vendas", titulo: "Vendas", alinhar: "right", ordenar: (b) => (vendas ? vd(b)?.vendas ?? 0 : null),
        render: (b) => <span style={{ fontWeight: 800, color: vd(b)?.vendas ? "var(--ok)" : "var(--text-dim)" }}>{!vendas ? "…" : fmt(vd(b)?.vendas ?? 0)}</span>,
      },
      {
        chave: "receita", titulo: "Receita", papel: "destaque", alinhar: "right", ordenar: (b) => (vendas ? vd(b)?.receita ?? 0 : null),
        render: (b) => <span style={{ fontWeight: 700, color: vd(b)?.receita ? "var(--ok)" : "var(--text-dim)" }}>{!vendas ? "…" : brl(vd(b)?.receita ?? 0)}</span>,
      },
    ];
  }, [vendas, vendaDe]);

  return (
    <div style={{ maxWidth: 1240 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Analytics & Conversão</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>Acompanhe o desempenho dos seus fluxos, conversões e fontes de tráfego.</p>
        </div>
        <GlassSelect value={String(dias)} onChange={(v) => setDias(Number(v))} style={{ width: "auto", minWidth: 170 }}
          options={[
            { value: "7", label: "Últimos 7 dias" },
            { value: "14", label: "Últimos 14 dias" },
            { value: "30", label: "Últimos 30 dias" },
          ]} />
      </div>

      {erro && <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22, color: "var(--text-dim)" }}>{erro}</div>}
      {!d && !erro && <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando…</p>}

      {d && (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 14 }}>
            <Kpi icone="eye" cor="var(--primary-texto)" label="Sessões iniciadas" valor={fmt(d.sessoes)} />
            <Kpi icone="user-check" cor="var(--atencao)" label="Leads gerados" valor={fmt(d.leads)} />
            <Kpi icone="target-arrow" cor="var(--ok)" label="Taxa de conclusão" valor={`${d.taxa}%`} />
            <Kpi icone="flag" cor="var(--cat-5)" label="Funis concluídos" valor={fmt(d.concluidas)} />
            {/* Venda fica na MESMA fileira: era o número que faltava pra
                responder se o funil serviu pra alguma coisa. */}
            <Kpi icone="shopping-cart" cor="var(--ok)" label="Vendas atribuídas" valor={vendas ? fmt(totalVenda.vendas) : "…"} />
            <Kpi icone="cash" cor="var(--ok)" label="Receita" valor={vendas ? brl(totalVenda.receita) : "…"} />
          </div>

          {/* Desempenho ao longo do tempo */}
          <Card titulo="Desempenho ao longo do tempo" style={{ marginTop: 16 }}>
            {d.serie.every((s) => s.sessoes === 0) ? (
              <Vazio texto="Sem sessões nos últimos 14 dias." />
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: estreito ? 3 : 6, height: 180, paddingTop: 10 }}>
                {d.serie.map((s, i) => (
                  <div key={s.data} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }} title={`${s.data}: ${s.sessoes} sessões · ${s.leads} leads`}>
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 150, gap: 2 }}>
                      <div style={{ width: "100%", height: `${(s.sessoes / maxSerie) * 100}%`, minHeight: s.sessoes ? 3 : 0, background: "linear-gradient(180deg,color-mix(in srgb, var(--primary) 72%, #fff),var(--primary))", borderRadius: "5px 5px 0 0" }} />
                      <div style={{ width: "100%", height: `${(s.leads / maxSerie) * 100}%`, minHeight: s.leads ? 3 : 0, background: "#34d399", borderRadius: "5px 5px 0 0" }} />
                    </div>
                    <span style={{ fontSize: 9.5, color: "var(--text-dim)", whiteSpace: "nowrap", visibility: i % passoData === 0 ? undefined : "hidden" }}>{s.data.slice(8, 10)}/{s.data.slice(5, 7)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "var(--text-dim)" }}>
              <Legenda cor="var(--primary-texto)" label="Sessões" /><Legenda cor="#34d399" label="Leads" />
            </div>
          </Card>

          {/* Flex com bases na mesma proporção do 1.4fr/1fr: no computador a
              divisão é idêntica à do grid; no estreito cada cartão pega a linha
              inteira em vez de espremer a tabela em 130px. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 16, alignItems: "flex-start" }}>
            {/* Por bot */}
            <Card titulo="Desempenho por bot" style={{ flex: "1.4 1 min(100%, 420px)", minWidth: 0 }}>
              {d.porBot.length === 0 ? <Vazio texto="Sem dados por bot ainda." /> : (
                <DataList
                  itens={d.porBot}
                  colunas={colunasPorBot}
                  chaveDe={(b) => b.botId}
                  rotulo="Desempenho por bot"
                  minWidth={520}
                  densa
                />
              )}
            </Card>

            {/* Atribuição UTM */}
            <Card titulo="Atribuição por origem (UTM)" style={{ flex: "1 1 min(100%, 300px)", minWidth: 0 }}>
              {d.utm.length === 0 ? <Vazio texto="Sem UTMs capturadas ainda." /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {d.utm.map((u) => {
                    const max = Math.max(1, ...d.utm.map((x) => x.sessoes));
                    return (
                      <div key={u.source}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: "var(--text)", textTransform: "capitalize" }}>{u.source}</span>
                          <span style={{ color: "var(--text-dim)" }}>{fmt(u.sessoes)} · {u.leads} leads</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 5, background: "var(--surface-2)", overflow: "hidden" }}>
                          <div style={{ width: `${(u.sessoes / max) * 100}%`, height: "100%", background: "var(--primary)", borderRadius: 5 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Funil de conversão por etapa (de um bot) */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, marginTop: 16, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Funil de conversão por etapa</span>
              <GlassSelect value={funilBot} onChange={setFunilBot} placeholder="Escolha um bot…"
                style={{ width: "auto", minWidth: 190, fontSize: 12.5 }}
                options={[{ value: "", label: "Escolha um bot…" }, ...d.porBot.map((b) => ({ value: b.botId, label: b.nome }))]} />
            </div>
            {!funilBot ? <Vazio texto="Escolha um bot pra ver onde as pessoas saem, etapa por etapa." />
              : !funil ? <Vazio texto="Carregando…" />
              : (() => {
                const grupos = funil.grupos ?? [];
                if (!grupos.length || funil.sessoes === 0) return <Vazio texto="Sem sessões nesse bot ainda." />;
                const abn = new Map(funil.porEtapa.map((e) => [e.etapa, e.abandonos]));
                let alc = funil.sessoes;
                const etapas = grupos.map((g, i) => { const ini = alc; const q = abn.get(g.id) ?? 0; alc = Math.max(0, alc - q); return { ...g, n: i + 1, usuarios: ini, queda: q, pct: funil.sessoes ? Math.round((ini / funil.sessoes) * 100) : 0 }; });
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {etapas.map((e) => (
                      // Rótulo (150px) + barra + queda não cabem numa linha de
                      // 320px: com wrap, a barra e a queda descem pra segunda
                      // linha. No computador tudo cabe e nada muda.
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ width: 22, height: 22, borderRadius: "50%", background: "color-mix(in srgb, var(--primary) 16%, transparent)", color: "var(--primary-texto, var(--primary))", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", flex: "none" }}>{e.n}</span>
                        <span style={{ flex: "0 1 150px", minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.titulo}>{e.titulo}</span>
                        <div style={{ flex: "1 1 160px", minWidth: 0, height: 24, borderRadius: 7, background: "var(--surface-2)", overflow: "hidden", position: "relative" }}>
                          <div style={{ width: `${Math.max(2, e.pct)}%`, height: "100%", background: "linear-gradient(90deg, color-mix(in srgb,var(--primary) 85%,transparent), var(--primary))", borderRadius: 7 }} />
                          <span style={{ position: "absolute", left: 10, top: 0, height: "100%", display: "flex", alignItems: "center", fontSize: 11.5, fontWeight: 800, color: e.pct > 12 ? "#fff" : "var(--text)" }}>{e.usuarios.toLocaleString("pt-BR")} · {e.pct}%</span>
                        </div>
                        <span style={{ width: 74, textAlign: "right", fontSize: 12, flex: "none", color: e.queda > 0 ? "var(--perigo)" : "var(--text-dim)", fontWeight: 700 }}>{e.queda > 0 ? `↓ ${e.queda}` : "—"}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icone, cor, label, valor }: { icone: string; cor: string; label: string; valor: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${cor} 14%, transparent)` }}><Icon name={icone} size={16} color={cor} /></span>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", marginTop: 8 }}>{valor}</div>
    </div>
  );
}
function Card({ titulo, children, style }: { titulo: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, boxShadow: "0 1px 2px rgba(16,24,40,.04)", ...style }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 12 }}>{titulo}</div>
      {children}
    </div>
  );
}
function Legenda({ cor, label }: { cor: string; label: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: cor }} />{label}</span>;
}
function Vazio({ texto }: { texto: string }) {
  return <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>{texto}</div>;
}
