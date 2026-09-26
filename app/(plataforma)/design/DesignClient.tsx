"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DesignSnapshot, RankRow, DayPoint, TopPedido, DesignPedidoDetalhe } from "@/lib/design";
import { Icon } from "../Icon";
import { Botao, BotaoIcone } from "../ui/controles";
import { EsqueletoOuConteudo, Skeleton, SkeletonDashboard } from "../Skeleton";
import { Portal } from "../Portal";
import { Kpi, KpiDelta, Panel } from "../ui/primitives";
import { toast } from "../Toast";
import { PeriodPicker, periodQuery, DEFAULT_PERIOD, type PeriodState } from "../PeriodPicker";
import { AreaChart } from "../Chart";
import { grade } from "../ui/grade";
import { agendarComRecuo } from "../ui/usePoll";
import { Avatar as AvatarBase } from "../ui/Avatar";
import { PageHead } from "../ui/mobile";
import { Abas } from "../ui/Abas";
import { Alerta } from "../ui/Alerta";
import { Fila, useAbrirFechar, useOnda } from "../ui/micro";
import { MonoRoundedBarChart } from "../ui/monocharts/MonoRoundedBarChart";

const fmt = (n: number) => n.toLocaleString("pt-BR");

// Hub de Design: 3 papéis (Arte nova, Aprovação, Contorno/Vetor) + seletor de
// pessoa que destaca e resume um designer específico. Tudo ao vivo do ERP.
export function DesignClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [snap, setSnap] = useState<DesignSnapshot | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState("geral");
  const [person, setPerson] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    let active = true;
    setLoading(true);
    async function load() {
      try {
        const r = await fetch(`/api/design?${periodQuery(period)}`, { cache: "no-store" });
        const d = await r.json();
        if (!active) return;
        if (d?.updatedAt) { setSnap(d); setErr(false); } else setErr(true);
      } catch { /* mantém */ } finally { if (active) setLoading(false); }
    }
    load();
    // Aba em segundo plano não recarrega (ver CLAUDE.md, "o tick comum tem que
    // voltar VAZIO"); ao voltar pra aba, atualiza na hora.
    // 1min pra quem está mexendo; recua até 5min na tela aberta e esquecida
    // (o `document.hidden` não pega o monitor secundário — ver `usePoll.ts`).
    const parar = agendarComRecuo(load, 60_000, 300_000);
    return () => { active = false; parar(); };
  }, [period]);

  if (!snap) {
    if (err) return (
      <div>
        <PageHead title="Design" />
        <div className="glass" style={{ padding: 40, borderRadius: 22, textAlign: "center", color: "var(--text-dim)" }}>
          Não foi possível carregar os dados de design do ERP.
        </div>
      </div>
    );
    return <SkeletonDashboard title="Design" />;
  }

  const tabs = [
    { key: "geral", nome: "Geral", icon: "trophy" },
    { key: "vetor", nome: "Vetor", icon: "vector-bezier" },
    { key: "contorno", nome: "Contorno", icon: "arrows-maximize" },
    { key: "aprovacao", nome: "Aprovação", icon: "circle-check" },
    { key: "naoaprovadas", nome: "Não aprovadas", icon: "circle-x" },
  ];

  return (
    <div style={{ maxWidth: 1180 }}>

      {/* Fila da esteira de arte — ao vivo (independe do período) */}
      <FilaEsteira fila={snap.fila} />

      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        {loading && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-dim)" }}>
            <span className="spin" style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--primary)", display: "inline-block" }} />
            atualizando…
          </span>
        )}
      </div>

      {/* Seletor de pessoa */}
      <PeoplePicker snap={snap} person={person} onPick={setPerson} />
      {person && <PersonSummary snap={snap} id={person} />}

      {/* Cinco abas não cabem em 320px. Esta fileira não usava .tab-strip, então
          elas empilhavam em três linhas e empurravam o conteúdo para fora da
          primeira dobra; o `Abas` rola de lado e traz a atual para a vista. */}
      <div style={{ margin: "18px 0" }}>
        <Abas valor={tab} onMuda={setTab} ariaLabel="Etapas do Design"
          itens={tabs.map((t) => ({
            valor: t.key,
            rotulo: <><Icon name={t.icon} size={15} color="currentColor" /> {t.nome}</>,
          }))} />
      </div>

      {/* Rebaixar (e não esqueletar) durante o refetch é de propósito: o dado
          antigo continua legível enquanto o novo vem. Trocar por esqueleto
          apagaria a tela a cada minuto de poll. O tempo sai da escala — era um
          `.2s` solto, e número solto é como as duas escalas divergem. */}
      <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity var(--duration-quick) var(--ease-smooth-out)" }}>
        {tab === "geral" && <Geral snap={snap} highlight={person} />}
        {tab === "vetor" && <Vetor snap={snap} highlight={person} />}
        {tab === "contorno" && <Contorno snap={snap} highlight={person} />}
        {tab === "aprovacao" && <Aprovacao snap={snap} highlight={person} />}
        {tab === "naoaprovadas" && <NaoAprovadas snap={snap} highlight={person} isAdmin={isAdmin} />}
      </div>
    </div>
  );
}

// ── Fila da esteira de arte (ao vivo) — quantas artes estão em cada etapa AGORA.
function FilaEsteira({ fila }: { fila: DesignSnapshot["fila"] }) {
  if (!fila?.length) return null;
  const total = fila.reduce((s, e) => s + e.count, 0);
  return (
    <div className="glass glass-spec" style={{ borderRadius: 20, padding: "16px 18px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="layout-grid" size={17} color="var(--text)" />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Fila da esteira</span>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>artes agora em cada etapa</span>
        </div>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{fmt(total)} no total</span>
      </div>
      {/* Cascata: a esteira é o que muda sozinho a cada poll, e ver as etapas
          chegarem em ordem é o que diz "isto é ao vivo" sem escrever "ao vivo". */}
      <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
        {fila.map((e) => (
          <div key={e.id} className="mt-eleva" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${e.cor} 16%, transparent)` }}>
              <Icon name={e.icon} size={19} color={e.cor} />
            </span>
            <div style={{ minWidth: 0 }}>
              {/* `NumeroVivo` não entra aqui: a etapa muda de 3 para 4 e uma
                  contagem animada num salto de uma unidade só chama atenção
                  pra si mesma. O que precisa de movimento é a CHEGADA da
                  fileira, e disso cuida a `Fila`. */}
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: e.count > 0 ? "var(--text)" : "var(--text-dim)" }}>{fmt(e.count)}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.nome}</div>
            </div>
          </div>
        ))}
      </Fila>
    </div>
  );
}

// ── Seletor de pessoa (avatares) ──
function PeoplePicker({ snap, person, onPick }: { snap: DesignSnapshot; person: string | null; onPick: (id: string | null) => void }) {
  const onda = useOnda();
  return (
    <Fila style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {/* `mt-anel` + a onda no PRESSIONAR: escolher uma pessoa repinta a tela
          inteira (KPIs, rankings, chips), e sem retorno imediato o toque parece
          não ter chegado. Nada de `minHeight` inline aqui — estilo inline vence
          media query, e mataria a regra `pointer: coarse` que já engorda todo
          `<button>` pra 44px no tablet e no celular. */}
      <button onClick={() => onPick(null)} onPointerDown={onda} className="glass glass-spec mt-anel"
        style={{ padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", color: !person ? "var(--on-primary, #fff)" : "var(--text)", background: !person ? "var(--primary-acao, var(--primary))" : undefined }}>
        Equipe toda
      </button>
      {snap.pessoas.map((p) => {
        const on = person === p.id;
        return (
          <button key={p.id} onClick={() => onPick(on ? null : p.id)} onPointerDown={onda} className="glass glass-spec mt-anel"
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 12px 5px 5px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", color: on ? "var(--on-primary, #fff)" : "var(--text)", background: on ? "var(--primary-acao, var(--primary))" : undefined }}>
            <Avatar foto={p.foto} nome={p.nome} size={24} />
            {p.nome}
          </button>
        );
      })}
    </Fila>
  );
}

// Card-resumo do designer selecionado (números entre os papéis).
function PersonSummary({ snap, id }: { snap: DesignSnapshot; id: string }) {
  const p = snap.pessoas.find((x) => x.id === id);
  const find = (rows: RankRow[]) => rows.find((r) => r.id === id);
  const aprov = find(snap.aprovacao.ranking)?.value ?? 0;
  const reprov = find(snap.aprovacao.rejeicoes)?.value ?? 0;
  const vet = find(snap.vetor.ranking);
  const cont = find(snap.contorno.ranking)?.value ?? 0;
  const taxa = aprov + reprov > 0 ? Math.round((aprov / (aprov + reprov)) * 100) : 0;

  return (
    <div className="glass glass-spec mt-eleva" style={{ marginTop: 14, padding: 18, borderRadius: 18, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar foto={p?.foto ?? null} nome={p?.nome ?? "?"} size={48} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{p?.nome}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Resumo do mês</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 22, marginLeft: "auto", flexWrap: "wrap" }}>
        <Mini label="Aprovados" value={aprov} color="var(--ok)" />
        <Mini label="Reprovados" value={reprov} color="var(--perigo)" />
        <Mini label="Taxa aprov." value={`${taxa}%`} color="var(--primary-texto)" />
        <Mini label="Vetor" value={vet?.value ?? 0} sub={vet?.meta ? `meta ${fmt(vet.meta)}` : undefined} color="var(--indigo)" />
        <Mini label="Contorno" value={cont} color="var(--atencao)" />
      </div>
    </div>
  );
}

function Mini({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="stat" style={{ fontSize: 26, color }}>{typeof value === "number" ? fmt(value) : value}</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

// ── Aba Geral — quem fez mais coisas (vetor + contorno + aprovações somados) ──
function Geral({ snap, highlight }: { snap: DesignSnapshot; highlight: string | null }) {
  const g = snap.geral;
  const rows = g.ranking;
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <>
      <Fila style={{ display: "grid", gridTemplateColumns: grade(250, 3, 12), gap: 12, marginBottom: 16 }}>
        <Kpi label="Coisas feitas no período" value={g.total} color="var(--primary-texto)" size="lg" glow />
        <Kpi label="Pessoas ativas" value={rows.length} color="var(--indigo)" size="lg" glow />
        <Kpi label="Média por pessoa" value={rows.length ? Math.round(g.total / rows.length) : 0} color="var(--ok)" size="lg" glow />
      </Fila>
      <Panel title="Quem fez mais coisas" subtitle="Vetor + contorno + aprovações, somados no período" indice={1}>
        {rows.length === 0 ? (
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Sem atividade no período.</p>
        ) : (
          <Fila style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {rows.map((r, i) => {
              const on = highlight === r.id;
              const partes = [
                { l: "Vetor", v: r.vetor, c: "var(--roxo)" },
                { l: "Contorno", v: r.contorno, c: "var(--atencao)" },
                { l: "Aprovados", v: r.aprovados, c: "var(--ok)" },
                { l: "Reprovados", v: r.reprovados, c: "var(--perigo)" },
              ].filter((p) => p.v > 0);
              return (
                // A opacidade do "apagado" TRANSICIONA: escolher uma pessoa no
                // seletor apagava as outras de estalo, e o corte seco lê como a
                // lista tendo sido trocada, não filtrada.
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, opacity: highlight && !on ? 0.45 : 1, transition: "opacity var(--duration-quick) var(--ease-smooth-out)" }}>
                  <span style={{ width: 22, fontSize: 13, fontWeight: 800, color: i === 0 ? "var(--amarelo)" : "var(--text-dim)" }}>#{i + 1}</span>
                  <Avatar foto={r.foto} nome={r.nome} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: on ? 800 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</span>
                      <span className="stat" style={{ fontSize: 15, fontWeight: 800, color: "var(--primary-texto, var(--primary))", flex: "none" }}>{fmt(r.total)}</span>
                    </div>
                    {/* Barra empilhada por tipo (proporcional ao líder). */}
                    <div style={{ display: "flex", height: 8, borderRadius: 5, overflow: "hidden", background: "var(--surface)", marginBottom: 6 }}>
                      {/* A largura transiciona: ao trocar o período a barra
                          CRESCE até o novo valor em vez de já estar lá. É o
                          mesmo dado, e o percurso é o que mostra que mudou. */}
                      {partes.map((p) => <div key={p.l} title={`${p.l}: ${fmt(p.v)}`} style={{ width: `${(p.v / max) * 100}%`, background: p.c, transition: "width var(--duration-medium) var(--ease-smooth-out)" }} />)}
                    </div>
                    <div style={{ display: "flex", gap: 13, flexWrap: "wrap" }}>
                      {partes.map((p) => (
                        <span key={p.l} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-dim)" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 3, background: p.c }} />
                          {p.l} <b style={{ color: "var(--text)" }}>{fmt(p.v)}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </Fila>
        )}
      </Panel>
    </>
  );
}

// ── Aba Vetor (artes = vetores) ──
function Vetor({ snap, highlight }: { snap: DesignSnapshot; highlight: string | null }) {
  const v = snap.vetor;
  const metaPct = v.metaMes > 0 ? Math.min(100, Math.round((v.total / v.metaMes) * 100)) : null;
  return (
    <>
      <Fila style={{ display: "grid", gridTemplateColumns: grade(185, 4, 12), gap: 12, marginBottom: 16 }}>
        <KpiDelta label="Vetores feitos" value={v.total} delta={v.deltaPct} color="var(--roxo)" />
        <KpiDelta label="Média por dia" value={v.mediaDia} delta={0} color="var(--primary-texto)" />
        <Kpi label="Meta do mês" value={v.metaMes || "—"} color="var(--indigo)" size="lg" glow />
        <Kpi label="% da meta" value={metaPct == null ? "—" : `${metaPct}%`} color="var(--ok)" size="lg" glow />
      </Fila>
      {/* `indice` crescente nos painéis: eles já entram pelo `Revelar` de dentro
          do `Panel`, e é o índice que transforma "três painéis apareceram" em
          "a aba chegou". */}
      <div className="duo" style={{ marginBottom: 16 }}>
        <Panel title="Vetores por dia" subtitle="No período" indice={1}>
          <AreaSeries series={v.series} color="var(--roxo)" />
        </Panel>
        <Panel title="Vetores por hora" subtitle="Distribuição no período" indice={2}>
          <HourBars data={v.porHora} />
        </Panel>
      </div>
      <Panel title="Ranking de vetores por pessoa" subtitle="Com meta individual" indice={3}>
        <RankList rows={v.ranking} color="var(--roxo)" highlight={highlight} showMeta />
      </Panel>
    </>
  );
}

function DonutG({ a, b, aLabel, bLabel, aColor, bColor, center }: { a: number; b: number; aLabel: string; bLabel: string; aColor: string; bColor: string; center: string }) {
  const total = a + b || 1;
  const pct = Math.round((a / total) * 100);
  const R = 52, C = 2 * Math.PI * R, aLen = (a / total) * C;
  return (
    // `flexWrap` + `flex: none` no anel: a 320px o par rosca+legenda não cabe
    // lado a lado, e sem quebrar a rosca encolhia em largura mantendo a altura
    // (o `viewBox` preserva a proporção) — virava uma elipse achatada com a
    // legenda espremida. Quebrando, a legenda desce inteira embaixo.
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg width="132" height="132" viewBox="0 0 132 132" style={{ flex: "none" }}>
        <circle cx="66" cy="66" r={R} fill="none" stroke={bColor} strokeWidth="18" />
        {/* O arco CRESCE até a fatia nova quando o período muda. Sem a
            transição a rosca já nasce no valor final e a troca de período
            parece um redesenho, não uma medida diferente do mesmo painel. */}
        <circle cx="66" cy="66" r={R} fill="none" stroke={aColor} strokeWidth="18" strokeDasharray={`${aLen} ${C - aLen}`} strokeDashoffset={C / 4} transform="rotate(-90 66 66)" strokeLinecap="round"
          style={{ transition: "stroke-dasharray var(--duration-medium) var(--ease-smooth-out)" }} />
        <text x="66" y="62" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text)">{pct}%</text>
        <text x="66" y="80" textAnchor="middle" fontSize="10" fill="var(--text-dim)">{center}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <Legend color={aColor} label={aLabel} value={a} pct={pct} />
        <Legend color={bColor} label={bLabel} value={b} pct={100 - pct} />
      </div>
    </div>
  );
}


// ── Aba Contorno ──
function Contorno({ snap, highlight }: { snap: DesignSnapshot; highlight: string | null }) {
  const c = snap.contorno;
  return (
    <>
      <Fila style={{ display: "grid", gridTemplateColumns: grade(250, 3, 12), gap: 12, marginBottom: 16 }}>
        <KpiDelta label="Contornos feitos" value={c.total} delta={c.deltaPct} color="var(--atencao)" />
        <KpiDelta label="Média por dia" value={c.mediaDia} delta={0} color="var(--primary-texto)" />
        <Kpi label="Pessoas ativas" value={c.ranking.length} color="var(--indigo)" size="lg" glow />
      </Fila>
      <div className="duo" >
        <Panel title="Contornos por dia" subtitle="No período" indice={1}>
          <AreaSeries series={c.series} color="var(--atencao)" />
        </Panel>
        <Panel title="Contorno por pessoa" subtitle="No período" indice={2}>
          <RankList rows={c.ranking} color="var(--atencao)" highlight={highlight} />
        </Panel>
      </div>
    </>
  );
}

// ── Aba Aprovação ──
function Aprovacao({ snap, highlight }: { snap: DesignSnapshot; highlight: string | null }) {
  const a = snap.aprovacao;
  const ex = snap.aprovacaoExtra;
  return (
    <>
      <Fila style={{ display: "grid", gridTemplateColumns: grade(250, 3, 12), gap: 12, marginBottom: 16 }}>
        <KpiDelta label="Aprovados" value={a.aprovados} delta={ex.deltas.aprovadas} color="var(--ok)" />
        <KpiDelta label="Reprovados" value={a.reprovados} delta={ex.deltas.reprovadas} invert color="var(--perigo)" />
        <KpiDelta label="Taxa de aprovação" value={`${a.taxaAprov}%`} delta={ex.deltas.taxa} color="var(--primary-texto)" />
      </Fila>
      <div className="duo" style={{ gridTemplateColumns: "1fr 1.2fr", marginBottom: 16 }}>
        <Panel title="Artes Aprovadas (Geral)" subtitle="Aprovadas × reprovadas" indice={1}>
          <DonutG a={a.aprovados} b={a.reprovados} aLabel="Aprovadas" bLabel="Reprovadas" aColor="var(--ok)" bColor="var(--perigo)" center="taxa" />
        </Panel>
        <Panel title="Aprovados por dia" subtitle="No período" indice={2}>
          <AreaSeries series={a.series} color="var(--ok)" />
        </Panel>
      </div>
      <div className="duo duo-eq" >
        <Panel title="Ranking de aprovações" subtitle="Quem mais aprovou" indice={3}>
          <RankList rows={a.ranking} color="var(--ok)" highlight={highlight} />
        </Panel>
        <Panel title="Ciclos por designer" subtitle="Quem mais teve reprovações" indice={4}>
          <RankList rows={a.rejeicoes} color="var(--perigo)" highlight={highlight} />
        </Panel>
      </div>
    </>
  );
}

// ── Componentes base ──
function NaoAprovadas({ snap, highlight, isAdmin }: { snap: DesignSnapshot; highlight: string | null; isAdmin?: boolean }) {
  const na = snap.naoAprovadas;
  const v = snap.vetor;
  const motivos = na.erro + na.adicao;
  const pctErro = motivos > 0 ? Math.round((na.erro / motivos) * 100) : 0;
  const [openPed, setOpenPed] = useState<TopPedido | null>(null);
  const [openFiltro, setOpenFiltro] = useState(false);
  const onda = useOnda();
  // Os dois modais SAEM animados, e o estado que os abre some no mesmo quadro
  // do clique — quem segura o nó no ar até a saída terminar é o hook.
  const filtro = useAbrirFechar(openFiltro, "--modal-close-dur");
  const ped = useAbrirFechar(!!openPed, "--modal-close-dur");
  // O último pedido aberto continua desenhado enquanto a folha encolhe. Sem
  // isto o conteúdo do modal sumia no primeiro quadro do fechamento e o que
  // saía de cena era um cartão vazio.
  const ultimoPed = useRef<TopPedido | null>(null);
  if (openPed) ultimoPed.current = openPed;
  return (
    <>
      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <Botao icone="filter" onClick={() => setOpenFiltro(true)}>Filtro de itens</Botao>
        </div>
      )}
      {filtro.montado && <FiltroItensModal classe={filtro.classe} onClose={() => setOpenFiltro(false)} />}

      {/* KPIs não aprovadas */}
      <Fila style={{ display: "grid", gridTemplateColumns: grade(185, 4, 12), gap: 12, marginBottom: 16 }}>
        <Kpi label="Total não aprovadas" value={fmt(na.total)} color="var(--perigo)" size="lg" glow />
        <Kpi label="Média por dia" value={fmt(na.mediaDia)} color="var(--atencao)" size="lg" glow />
        <Kpi label="Erro na arte" value={fmt(na.erro)} color="var(--perigo)" size="lg" glow />
        <Kpi label="Adição na arte" value={fmt(na.adicao)} color="var(--roxo)" size="lg" glow />
      </Fila>

      <div className="duo" style={{ gridTemplateColumns: "1fr 1.2fr", marginBottom: 16 }}>
        <Panel title="Motivo das não aprovadas" indice={1} subtitle={motivos > 0 ? `Erro × adição · ${pctErro}% erro` : "sem registro de motivo no período"}>
          {motivos > 0
            ? <DonutG a={na.erro} b={na.adicao} aLabel="Erro na arte" bLabel="Adição na arte" aColor="var(--perigo)" bColor="var(--roxo)" center="erro" />
            : <p style={{ color: "var(--text-dim)", fontSize: 13.5, padding: "30px 0", textAlign: "center" }}>O registro de motivo (erro/adição) não tem dados neste período.</p>}
        </Panel>
        <Panel title="Não aprovadas por dia" subtitle="No período" indice={2}>
          <AreaSeries series={na.series} color="var(--perigo)" />
        </Panel>
      </div>

      <div className="duo duo-eq" style={{ marginBottom: 16 }}>
        <Panel title="Quem mais teve não aprovadas" subtitle="Por responsável" indice={3}>
          <RankList rows={na.porResponsavel} color="var(--perigo)" highlight={highlight} />
        </Panel>
        <Panel title="Vetores feitos (designer)" subtitle="Quantas artes cada um fez" indice={4}>
          <RankList rows={v.ranking} color="var(--roxo)" highlight={highlight} showMeta />
        </Panel>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Panel title="Não aprovadas por dia · quem fez" subtitle="Mais recente primeiro · o 1º chip de cada dia é quem mais teve" indice={5}>
          <DiaPessoasList dias={na.porDiaPessoa} highlight={highlight} />
        </Panel>
      </div>

      <Panel title="Pedidos que mais foram p/ não aprovadas" subtitle="Toque num pedido pra ver as artes e o motivo · use o ID pra buscar no ERP" indice={6}>
        {na.topPedidos.length === 0 ? <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Sem dados no período.</p> : (
          <Fila style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {na.topPedidos.map((p) => {
              const max = Math.max(...na.topPedidos.map((x) => x.vezes), 1);
              return (
                // `.mt-linha` no lugar do par `onMouseEnter`/`onMouseLeave` que
                // pintava o fundo por JS: hover em JS não existe no celular, e
                // ali a linha abre um modal sem nunca dizer que é um alvo. A
                // classe traz o realce no ponteiro E o afundar no toque; a onda
                // (`.mt-anel`) confirma o toque nos ~300ms até a folha subir.
                <div key={p.pedidoId} role="button" tabIndex={0} onClick={() => setOpenPed(p)}
                  onPointerDown={onda}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenPed(p); } }}
                  className="mt-linha mt-anel"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 11, cursor: "pointer", width: "100%" }}>
                  <span title={p.ref} style={{ fontSize: 13, fontWeight: 700, minWidth: 120, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{p.ref}</span>
                  <BotaoIcone icone="copy" titulo={`Copiar o ID ${p.ref}`} tamanho="sm" variante="secundario" style={{ flex: "none" }} onClick={(e) => { e.stopPropagation(); copiar(p.ref); }} />
                  <div style={{ flex: 1, height: 8, background: "var(--surface)", borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ width: `${(p.vezes / max) * 100}%`, height: "100%", background: "var(--perigo)", borderRadius: 5, transition: "width var(--duration-medium) var(--ease-smooth-out)" }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, minWidth: 40, textAlign: "right" }}>{p.vezes}x</span>
                  <Icon name="chevron-right" size={15} color="var(--text-dim)" />
                </div>
              );
            })}
          </Fila>
        )}
      </Panel>

      {ped.montado && ultimoPed.current && (
        <PedidoArteModal pedido={ultimoPed.current} classe={ped.classe} onClose={() => setOpenPed(null)} />
      )}
    </>
  );
}

// Copia texto p/ a área de transferência com feedback via toast.
function copiar(texto: string) {
  navigator.clipboard?.writeText(texto).then(() => toast.ok("ID copiado"), () => toast.erro("Não deu pra copiar"));
}

// ── Filtro (admin): quais tipos de item aparecem em "não aprovadas" ──
function FiltroItensModal({ onClose, classe }: { onClose: () => void; classe: string }) {
  const [todos, setTodos] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const onda = useOnda();

  useEffect(() => {
    let active = true;
    fetch("/api/design/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!active) return; setTodos(d.todos || []); setSel(new Set(d.tiposPersonalizaveis || [])); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function toggle(t: string) {
    setSel((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  }
  async function salvar() {
    setSaving(true);
    try {
      const r = await fetch("/api/design/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tiposPersonalizaveis: [...sel] }) });
      if (r.ok) { toast.ok("Filtro salvo"); onClose(); } else toast.erro("Não deu pra salvar");
    } catch { toast.erro("Não deu pra salvar"); }
    finally { setSaving(false); }
  }

  return (
    <Portal>
    {/* `.t-modal` + a classe do `useAbrirFechar` no VÉU e no cartão: a folha
        cresce do centro e volta a encolher pro MESMO centro — entra e sai pelo
        mesmo caminho. Era `animation: riseIn .24s ease both`, que só tinha
        entrada: ao fechar, o modal era cortado seco no desmonte. E `.24s` era
        número solto fora da escala de movimento. */}
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 20 }}>
      <div className={`apple-modal glass glass-spec sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)", maxHeight: "86dvh", overflowY: "auto", borderRadius: 22, padding: "clamp(16px, 5vw, 24px)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Filtro de itens</h2>
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.45 }}>Só os tipos marcados aparecem em “não aprovadas” — os que dá pra personalizar (e portanto reprovar). O resto (produto, tinta, decorativo…) fica de fora.</p>
          </div>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" style={{ flex: "none" }} onClick={onClose} />
        </div>
        {/* Esqueleto e conteúdo dividem a MESMA célula e trocam com desfoque
            cruzado (receita `.t-skel`). O ternário anterior trocava o nó de uma
            vez — é esse corte seco que faz o modal parecer que "piscou" quando
            a lista chega. `pulsar` desligado: o `<Skeleton>` já cintila sozinho
            e as duas respirações juntas viram tremulação. */}
        <EsqueletoOuConteudo
          pronto={!loading}
          pulsar={false}
          style={{ marginTop: 14 }}
          esqueleto={
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={42} r={11} />)}
            </div>
          }
        >
          <Fila style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {todos.map((t) => {
              const on = sel.has(t);
              return (
                <button key={t} onClick={() => toggle(t)} onPointerDown={onda} className="mt-anel"
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 11, border: "1px solid var(--border)", cursor: "pointer", textAlign: "left", background: on ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)", color: "var(--text)", transition: "background-color var(--duration-quick) var(--ease-smooth-out)" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, flex: "none", display: "grid", placeItems: "center", background: on ? "var(--primary)" : "var(--surface-2)", border: on ? "none" : "1px solid var(--border)" }}>
                    {on && <Icon name="circle-check" size={13} color="#fff" />}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t}</span>
                </button>
              );
            })}
          </Fila>
        </EsqueletoOuConteudo>
        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
          <Botao onClick={onClose}>Cancelar</Botao>
          {/* Esta é a única ESCRITA da tela. Entre o toque e o toast há uma ida
              ao servidor, e é nesse vazio que a pessoa toca de novo — a onda
              diz que o toque chegou. (Não existe aprovar/reprovar aqui: o
              Design desta tela é painel de números, não fila de aprovação.) */}
          <Botao variante="primario" onClick={salvar} carregando={saving} disabled={loading}>Salvar</Botao>
        </div>
      </div>
    </div>
    </Portal>
  );
}

// ── Pop-up de artes do pedido não aprovado ──
function PedidoArteModal({ pedido, onClose, classe }: { pedido: TopPedido; onClose: () => void; classe: string }) {
  const [det, setDet] = useState<DesignPedidoDetalhe | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    setDet(null); setErr(false);
    fetch(`/api/design/pedido?id=${pedido.pedidoId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (active) { if (d?.itens) setDet(d); else setErr(true); } })
      .catch(() => { if (active) setErr(true); });
    return () => { active = false; };
  }, [pedido.pedidoId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const idLabel = det?.idProprio || pedido.idProprio || pedido.ref;

  return (
    <Portal>
    {/* Mesma folha da receita: cresce do centro e volta a encolher pro mesmo
        centro. O `mounted` local saiu — quem espera o cliente agora é o
        `Portal`, que é a peça da casa pra isso. */}
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 20 }}>
      <div className={`apple-modal glass glass-spec sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(880px, 100%)", maxHeight: "88dvh", overflowY: "auto", borderRadius: 24, padding: "clamp(16px, 5vw, 24px)" }}>
        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--perigo) 16%, transparent)" }}>
            <Icon name="circle-x" size={22} color="var(--perigo)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>Pedido não aprovado</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span title={idLabel} style={{ fontSize: 18, fontWeight: 800, wordBreak: "break-word" }}>{idLabel}</span>
              <Botao tamanho="sm" icone="copy" title="Copiar ID" onClick={() => copiar(idLabel)}>Copiar</Botao>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12.5, color: "var(--text-dim)", flexWrap: "wrap" }}>
              <span>Voltou <b style={{ color: "var(--perigo)" }}>{pedido.vezes}x</b></span>
              {det?.responsavel && <span>Responsável: <b style={{ color: "var(--text)" }}>{det.responsavel}</b></span>}
            </div>
          </div>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" style={{ flex: "none" }} onClick={onClose} />
        </div>

        {err && <Alerta tom="perigo">Não foi possível carregar as artes deste pedido.</Alerta>}

        {/* O esqueleto SAI por cima das artes com desfoque cruzado, em vez de
            ser trocado de nó. Aqui isso importa mais do que em qualquer outro
            lugar da tela: as imagens chegam do storage num tempo que ninguém
            controla, e o corte seco lia como "a folha recarregou". */}
        {!err && (
        <EsqueletoOuConteudo
          pronto={!!det}
          pulsar={false}
          esqueleto={
            <div>
              <Skeleton w={140} h={18} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))", gap: 12, marginTop: 14 }}>
                {[0, 1, 2].map((i) => <Skeleton key={i} h={130} r={12} />)}
              </div>
            </div>
          }
        >
        {det && det.itens.length === 0 && <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-dim)" }}>Este pedido não tem itens com arte.</div>}

        {det && det.itens.map((it, i) => (
          <div key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none", paddingTop: i > 0 ? 18 : 0, marginTop: i > 0 ? 18 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{it.nome}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: it.aprovado ? "color-mix(in srgb, var(--ok) 18%, transparent)" : "color-mix(in srgb, var(--perigo) 18%, transparent)", color: it.aprovado ? "var(--ok)" : "var(--perigo)" }}>
                {it.aprovado ? "Aprovada" : "Não aprovada"}
              </span>
            </div>

            {it.motivo && (
              <Alerta tom="perigo" style={{ marginBottom: 14 }}>
                <b>Motivo da reprovação: </b>{it.motivo}
              </Alerta>
            )}

            <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))", gap: 12 }}>
              <ArteBox label="Arte do cliente" urls={it.arteCliente} vazio="Sem arte enviada" />
              <ArteBox label="Vetorizada" urls={it.vetorizada ? [it.vetorizada] : []} vazio="Ainda não vetorizada" />
              {it.reprovadas.length > 0 && <ArteBox label="Reprovadas" urls={it.reprovadas} borda="var(--perigo)" />}
            </Fila>

            {it.arteTexto && <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 10 }}>Texto da arte: <b style={{ color: "var(--text)" }}>{it.arteTexto}</b></div>}
          </div>
        ))}
        </EsqueletoOuConteudo>
        )}
      </div>
    </div>
    </Portal>
  );
}

// Caixa de arte: mostra uma ou mais imagens (PDF vira link). Reusa o lightbox global.
// `style` existe por causa da `Fila`: é por ele que chega o `--mt-i` do
// escalonamento — sem repassar, as três caixas entram todas no tempo zero.
function ArteBox({ label, urls, vazio, borda, style }: { label: string; urls: string[]; vazio?: string; borda?: string; style?: CSSProperties }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>{label}</div>
      {urls.length === 0 ? (
        <div style={{ height: 120, borderRadius: 12, border: "1px dashed var(--border)", display: "grid", placeItems: "center", fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 8 }}>{vazio || "—"}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {urls.map((u, i) => {
            const isPdf = /\.pdf(\?|$)/i.test(u);
            if (isPdf) {
              return (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="mt-eleva"
                  style={{ display: "flex", alignItems: "center", gap: 8, height: 60, padding: "0 12px", borderRadius: 12, border: `1px solid ${borda || "var(--border)"}`, background: "var(--surface)", textDecoration: "none", color: "var(--text)", fontSize: 12.5, fontWeight: 600 }}>
                  <Icon name="file-text" size={18} color={borda || "var(--text-dim)"} /> Abrir PDF
                </a>
              );
            }
            // Quadrado 1:1 com a imagem INTEIRA (contain) — nada de cortar a arte.
            return (
              // A arte abre em tamanho real numa aba nova: o quadrado é um
              // ALVO, e `.mt-eleva` é o que diz isso — sobe no ponteiro e
              // afunda no toque. Sem ele o quadrado parecia decoração e a
              // pessoa não descobria que dava pra ampliar.
              <a key={i} href={u} target="_blank" rel="noreferrer" title="Abrir em tamanho real" className="mt-eleva"
                style={{ display: "block", aspectRatio: "1 / 1", borderRadius: 12, border: `1px solid ${borda || "var(--border)"}`, background: "var(--surface-2)", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RankList({ rows, color, highlight, showMeta }: { rows: RankRow[]; color: string; highlight: string | null; showMeta?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const top = rows.slice(0, 8);
  if (!top.length) return <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Sem dados no período.</p>;
  return (
    <Fila style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {top.map((r, i) => {
        const on = highlight === r.id;
        const pct = showMeta && r.meta ? Math.min(100, Math.round((r.value / r.meta) * 100)) : null;
        return (
          // Apagar quem não é a pessoa escolhida TRANSICIONA — de estalo a lista
          // parecia trocada, e não filtrada.
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 11, opacity: highlight && !on ? 0.45 : 1, transition: "opacity var(--duration-quick) var(--ease-smooth-out)" }}>
            <span style={{ width: 18, fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>#{i + 1}</span>
            <Avatar foto={r.foto} nome={r.nome} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13.5, fontWeight: on ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</span>
                <span style={{ fontSize: 13.5, fontWeight: 800, color, flex: "none", marginLeft: 8 }}>
                  {fmt(r.value)}{showMeta && r.meta ? <span style={{ color: "var(--text-dim)", fontWeight: 600 }}> /{fmt(r.meta)}{pct !== null ? ` · ${pct}%` : ""}</span> : ""}
                </span>
              </div>
              <div style={{ height: 7, background: "var(--surface)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${(r.value / max) * 100}%`, height: "100%", background: color, borderRadius: 5, transition: "width var(--duration-medium) var(--ease-smooth-out)" }} />
              </div>
            </div>
          </div>
        );
      })}
    </Fila>
  );
}

// "Não aprovadas por dia · quem fez": uma linha por dia com o total e os chips
// de quem produziu aquelas reprovações (chip 1 = quem mais teve no dia).
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function diaLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  // UTC de propósito: com hora local o dia "vira" e o dia da semana sai errado.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DIAS_SEMANA[dt.getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function DiaPessoasList({ dias, highlight }: { dias: DesignSnapshot["naoAprovadas"]["porDiaPessoa"]; highlight: string | null }) {
  if (!dias.length) return <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Sem dados no período.</p>;
  return (
    // Rola DENTRO do bloco (`maxHeight` + `overflowY`), nunca na página.
    <Fila style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 400, overflowY: "auto" }}>
      {dias.map((d) => (
        <div key={d.day} style={{ display: "grid", gridTemplateColumns: "84px 46px minmax(0, 1fr)", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>{diaLabel(d.day)}</span>
          <span className="tf-num" style={{ fontSize: 15, fontWeight: 800, color: "var(--perigo)", textAlign: "right" }}>{fmt(d.total)}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {d.pessoas.map((p, i) => {
              const on = highlight === p.id;
              const lider = i === 0 && d.pessoas.length > 1;
              return (
                <span key={p.id} title={`${p.nome}: ${fmt(p.value)} não aprovada(s) em ${diaLabel(d.day)}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 3px", borderRadius: 999,
                    background: lider ? "color-mix(in srgb, var(--perigo) 13%, transparent)" : "var(--surface)",
                    border: `1px solid ${lider ? "color-mix(in srgb, var(--perigo) 32%, transparent)" : "var(--border)"}`,
                    opacity: highlight && !on ? 0.4 : 1,
                    transition: "opacity var(--duration-quick) var(--ease-smooth-out)",
                  }}>
                  <Avatar foto={p.foto} nome={p.nome} size={20} />
                  <span style={{ fontSize: 12.5, fontWeight: on || lider ? 800 : 600 }}>{p.nome}</span>
                  <span className="tf-num" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--perigo)" }}>{fmt(p.value)}</span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </Fila>
  );
}

// Delega pro Avatar único (ui/Avatar.tsx). A assinatura local fica pra não
// mexer nas dezenas de chamadas — o que muda é que existe UM comportamento.
function Avatar({ foto, nome, size }: { foto: string | null; nome: string; size: number }) {
  return <AvatarBase url={foto} nome={nome} size={size} formato="redondo" />;
}

function Legend({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flex: "none" }} />
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <span style={{ fontWeight: 800, marginLeft: 4 }}>{fmt(value)}</span>
      <span style={{ color: "var(--text-dim)", fontSize: 12 }}>({pct}%)</span>
    </div>
  );
}

// Distribuição por hora, nas barras-pílula do Monocharts. Antes era um SVG
// escrito à mão aqui — barra de canto `rx="4"`, sem grade, sem dica ao passar
// o dedo e sem a barra crescendo da base.
function HourBars({ data }: { data: DayPoint[] }) {
  // 06h–21h: fora do expediente as barras vinham zeradas e só roubavam largura
  // das horas que interessam.
  const pontos = data.slice(6, 22).map((d) => ({ rotulo: d.day, valor: d.value }));
  // A hora de pico ganha a cor de destaque — é a única leitura que alguém tira
  // desta distribuição, e antes era preciso comparar alturas a olho.
  let pico = 0;
  pontos.forEach((p, i) => { if (p.valor > pontos[pico].valor) pico = i; });
  return (
    <MonoRoundedBarChart
      semCartao
      pontos={pontos.map((p) => ({ label: p.rotulo, primary: p.valor }))}
      nomePrimario="Pedidos"
      altura={180}
      destaque={pontos.length ? pico : undefined}
    />
  );
}

function AreaSeries({ series, color }: { series: DayPoint[]; color: string }) {
  return <AreaChart series={series} color={color} />;
}

