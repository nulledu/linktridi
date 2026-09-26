"use client";

// Dashboard do TridiFlow: KPIs, gráfico de conversas (14 dias), bots recentes.
// Visual claro (mockups). A gestão completa fica em "Meus Bots".
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { toast } from "../Toast";
import { DataList, type Coluna } from "../ui/DataList";
import { useIsEstreito } from "../ui/useMediaQuery";
import { Fila, NumeroVivo } from "../ui/micro";
import { Botao } from "../ui/controles";
import { EsqueletoOuConteudo, SkeletonRows } from "../Skeleton";
import { PilulaStatus } from "./_shared/ConfigMicro";

interface Stats { sessoes: number; concluidas: number; leads: number }
interface Bot { id: string; nome: string; slug: string; status: "rascunho" | "publicado"; updatedAt: string; stats?: Stats }
interface Serie { data: string; sessoes: number; leads: number }
interface Ag { sessoes: number; leads: number; taxa: number; serie: Serie[] }

const fmt = (n: number) => n.toLocaleString("pt-BR");
const corTaxa = (t: number | null) => (t == null ? "var(--text-dim)" : t >= 40 ? "var(--ok)" : t >= 25 ? "var(--atencao)" : "var(--perigo)");
const taxaDe = (s?: Stats) => (s && s.sessoes > 0 ? Math.round((s.concluidas / s.sessoes) * 100) : null);

export function DashboardClient() {
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [ag, setAg] = useState<Ag | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/tridiflow/bots", { cache: "no-store" }).then((r) => r.json()).then((d) => setBots(d.bots ?? [])).catch(() => setBots([]));
    fetch("/api/tridiflow/analytics-geral", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (!d.error) setAg(d); }).catch(() => {});
  }, []);

  async function criar() {
    setBusy(true);
    try {
      const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Novo bot" }) });
      const d = await r.json();
      if (!r.ok) { toast.erro(d.error || "Falha."); return; }
      window.location.href = `/tridiflow/${d.bot.id}`;
    } finally { setBusy(false); }
  }

  const ativos = (bots ?? []).filter((b) => b.status === "publicado").length;
  const recentes = useMemo(() => [...(bots ?? [])].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 6), [bots]);
  const maxSerie = Math.max(1, ...(ag?.serie ?? []).map((s) => s.sessoes));
  // Em tela estreita cada coluna fica com ~12px e as datas viram borrão:
  // mostramos ~7 e escondemos o resto sem tirar espaço (visibility).
  const estreito = useIsEstreito();
  const passoData = estreito ? Math.max(1, Math.ceil((ag?.serie.length ?? 1) / 7)) : 1;

  return (
    <div style={{ maxWidth: 1160 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Dashboard</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>Crie, gerencie e analise seus chatbots.</p>
        </div>
        <Botao variante="primario" icone="plus" onClick={criar} disabled={busy}>
          Criar novo bot
        </Botao>
      </div>

      {/* KPIs — os números contam até o valor quando chegam (e só na tela). */}
      <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 14 }}>
        <Kpi icone="message-chatbot" cor="var(--primary-texto)" label="Bots ativos" valor={<NumeroVivo valor={ativos} />} sub={`de ${bots?.length ?? 0}`} />
        <Kpi icone="eye" cor="var(--azul)" label="Conversas" valor={<NumeroVivo valor={ag?.sessoes ?? 0} />} sub="sessões iniciadas" />
        <Kpi icone="user-check" cor="var(--ok)" label="Leads" valor={<NumeroVivo valor={ag?.leads ?? 0} />} sub="dados coletados" />
        <Kpi icone="target-arrow" cor={corTaxa(ag?.taxa ?? null)} label="Taxa de conclusão" valor={ag ? <NumeroVivo valor={ag.taxa} formatar={(n) => `${Math.round(n)}%`} /> : "—"} sub="média" />
      </Fila>

      {/* Gráfico */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, marginTop: 16, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 12 }}>Conversas nos últimos 14 dias</div>
        {!ag || ag.serie.every((s) => s.sessoes === 0) ? (
          <div style={{ padding: "26px 0", textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>Sem sessões ainda. Publique um bot e cole o link no anúncio.</div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: estreito ? 3 : 6, height: 160 }}>
            {ag.serie.map((s, i) => (
              <div key={s.data} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }} title={`${s.data}: ${s.sessoes} sessões`}>
                <div style={{ width: "100%", height: 130, display: "flex", alignItems: "flex-end" }}>
                  <div className="tfm-barra" style={{ ["--i" as string]: i, width: "100%", height: `${(s.sessoes / maxSerie) * 100}%`, minHeight: s.sessoes ? 3 : 0, background: "linear-gradient(180deg,color-mix(in srgb, var(--primary) 72%, #fff),var(--primary))", borderRadius: "5px 5px 0 0" }} />
                </div>
                <span style={{ fontSize: 9.5, color: "var(--text-dim)", whiteSpace: "nowrap", visibility: i % passoData === 0 ? undefined : "hidden" }}>{s.data.slice(8, 10)}/{s.data.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bots recentes */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, marginTop: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Bots recentes</span>
          <Link href="/tridiflow/meus-bots" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--primary-texto, var(--primary))", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>Ver todos <Icon name="chevron-right" size={14} color="currentColor" /></Link>
        </div>
        <EsqueletoOuConteudo pronto={bots !== null} esqueleto={<div style={{ padding: 16 }}><SkeletonRows rows={4} /></div>}>
        {!bots ? null : recentes.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Crie seu primeiro bot</div>
            <Botao variante="primario" onClick={criar} style={{ marginTop: 12 }}>Criar bot</Botao>
          </div>
        ) : (
          <div style={{ padding: 12 }}>
            <DataList
              itens={recentes}
              colunas={COLUNAS_BOTS}
              chaveDe={(b) => b.id}
              onAbrir={(b) => router.push(`/tridiflow/${b.id}`)}
              rotulo="Bots recentes"
              minWidth={600}
            />
          </div>
        )}
        </EsqueletoOuConteudo>
      </div>
    </div>
  );
}

// `style` existe pro `Fila` carimbar o índice da entrada escalonada (--mt-i).
function Kpi({ icone, cor, label, valor, sub, style }: { icone: string; cor: string; label: string; valor: React.ReactNode; sub: string; style?: React.CSSProperties }) {
  return (
    <div style={{ ...style, minWidth: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${cor} 14%, transparent)` }}><Icon name={icone} size={16} color={cor} /></span>{label}
      </div>
      <div style={{ fontSize: 27, fontWeight: 800, color: "var(--text)", marginTop: 8 }}>{valor}</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{sub}</div>
    </div>
  );
}

// Bots recentes: tabela no computador, cartão no celular (nome no título,
// conversão em evidência). A linha inteira abre o bot; o nome continua sendo
// link pra quem quer abrir em outra aba. Data ordena pelo ISO, não pelo "dd/mm".
const COLUNAS_BOTS: Coluna<Bot>[] = [
  {
    chave: "nome", titulo: "Nome", papel: "titulo", ordenar: (b) => b.nome,
    render: (b) => <Link href={`/tridiflow/${b.id}`} style={{ color: "var(--text)", fontWeight: 700, textDecoration: "none" }}>{b.nome}</Link>,
  },
  {
    chave: "status", titulo: "Status", ordenar: (b) => b.status,
    render: (b) => b.status === "publicado"
      ? <PilulaStatus estado="ok" vivo>Ativo</PilulaStatus>
      : <PilulaStatus estado="neutro" icone="edit">Rascunho</PilulaStatus>,
  },
  { chave: "sessoes", titulo: "Sessões", alinhar: "right", ordenar: (b) => b.stats?.sessoes ?? 0, render: (b) => fmt(b.stats?.sessoes ?? 0) },
  { chave: "leads", titulo: "Leads", alinhar: "right", ordenar: (b) => b.stats?.leads ?? 0, render: (b) => fmt(b.stats?.leads ?? 0) },
  {
    chave: "conversao", titulo: "Conversão", papel: "destaque", alinhar: "right", ordenar: (b) => taxaDe(b.stats),
    render: (b) => { const t = taxaDe(b.stats); return <span style={{ fontWeight: 700, color: corTaxa(t) }}>{t == null ? "—" : `${t}%`}</span>; },
  },
  {
    chave: "atualizado", titulo: "Atualizado", alinhar: "right", ordenar: (b) => b.updatedAt,
    render: (b) => <span style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>{new Date(b.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>,
  },
];
