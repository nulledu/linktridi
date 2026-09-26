"use client";

import { useEffect, useState } from "react";
import type { PanelConfig } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/types";
import type { MaquinaPainel, ResumoMaquinas } from "@/lib/painel-maquinas";
import { duracaoCurta, horaSP, restanteLongo } from "@/lib/painel-maquinas";
import { corDoOEE, OEE_CLASSE_MUNDIAL, OEE_META, ROTULO_FAIXA, type ResultadoOEE } from "@/lib/oee";
import { KioskShell } from "../KioskShell";
import { LottieAnim } from "../slides/Lottie";
import { Icon } from "../slides/Icon";
import { cachedJson } from "../cache";
import { ritmoAtual } from "../ritmo";
import { fmt } from "./pecas";
import "./maquinas.css";

/**
 * Painel de MÁQUINAS — a parede de monitoramento do corredor dos lasers.
 *
 * A tela principal é um MONITOR: uma faixa com quantas máquinas estão em cada
 * estado e, embaixo, TODAS as máquinas de uma vez numa grade que cabe em 16:9
 * sem rolar. O estado se lê sem ler — cor + ícone + rótulo, sempre os três:
 *
 *   EM PRODUÇÃO (verde, play) · ATENÇÃO (âmbar, triângulo) · AGUARDANDO
 *   (ardósia, ampulheta) · PARADA (vermelho, X) · MANUTENÇÃO (azul, ferramenta)
 *
 * Cor de ESTADO é da paleta semântica da pele clara (`--p-ok/atencao/perigo`);
 * o roxo da parede fica só na identidade (título, porte). Nunca o contrário.
 *
 * Duas telas de apoio revezam com o monitor (que fica o dobro do tempo): o
 * SETOR (contagens do dia, OEE com os três pilares, fila por material) e as
 * FILAS (as próximas programações de cada máquina).
 *
 * Fonte: `/api/maquinas/painel` (pública). Enquanto `supabase/maquinas.sql`
 * não for rodado a rota responde `disponivel: false` e a tela diz o que fazer.
 */

const RITMO_MS = 30_000;
/** Quanto cada tela fica na parede: o monitor é a tela principal. */
const DURACAO_TELA_MS = [30_000, 15_000, 15_000] as const;
const TELAS = ["monitor", "setor", "filas"] as const;

/** A tinta do porte (mantida para quem ainda importa). */
export function corDoPorte(porte: string): string {
  return porte === "G" ? "var(--atencao)" : porte === "M" ? "var(--roxo)" : "var(--azul)";
}

export function MaquinasPanel() {
  const [dados, setDados] = useState<(ResumoMaquinas & { disponivel?: boolean }) | null>(null);
  const [config, setConfig] = useState<PanelConfig>(DEFAULT_CONFIG);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [tela, setTela] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      const [m, c] = await Promise.all([
        cachedJson<ResumoMaquinas & { disponivel?: boolean }>("/api/maquinas/painel", "maquinas-painel"),
        cachedJson<PanelConfig>("/api/config", "config"),
      ]);
      if (!active) return;
      if (c.data) setConfig({ ...DEFAULT_CONFIG, ...c.data });
      if (m.data) { setDados(m.data); setOffline(m.fromCache); setCachedAt(m.cachedAt); }
    }
    load();
    let id: ReturnType<typeof setTimeout>;
    const agendar = () => { id = setTimeout(tick, ritmoAtual(RITMO_MS)); };
    const tick = () => { if (!document.hidden) load(); agendar(); };
    agendar();
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { active = false; clearTimeout(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // Giro das telas: timer VISUAL, sem busca — cada tela com a sua duração.
  const temDados = !!dados && dados.maquinas.length > 0;
  useEffect(() => {
    if (!temDados) return;
    const id = setTimeout(() => setTela((t) => (t + 1) % TELAS.length), DURACAO_TELA_MS[tela % TELAS.length]);
    return () => clearTimeout(id);
  }, [tela, temDados]);

  if (!dados) {
    return (
      <KioskShell pele="claro" config={config}>
        <div className="mq-entra" style={{ textAlign: "center" }}>
          <LottieAnim name="loading" style={{ width: 200, height: 200, margin: "0 auto" }} />
          <p style={{ color: "var(--text-dim)", fontSize: 18, marginTop: 8 }}>Sincronizando máquinas…</p>
        </div>
      </KioskShell>
    );
  }

  if (dados.disponivel === false || dados.maquinas.length === 0) {
    return (
      <KioskShell pele="claro" config={config}>
        <div style={{ textAlign: "center", maxWidth: 640 }}>
          <Icon name="printer" size={72} color="var(--text-dim)" style={{ margin: "0 auto 16px" }} />
          <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 8 }}>Nenhuma máquina cadastrada</div>
          <p style={{ fontSize: 17, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Rode <b style={{ color: "var(--text)" }}>supabase/maquinas.sql</b> no Supabase para criar as
            máquinas e a fila de programações. A parede acende sozinha no ciclo seguinte.
          </p>
        </div>
      </KioskShell>
    );
  }

  return (
    <KioskShell pele="claro" config={config} updatedAt={dados.atualizadoEm} offline={offline} cachedAt={cachedAt}>
      <CorpoMaquinas dados={dados} offline={offline} grupo={tela} />
    </KioskShell>
  );
}

/* ── Estado de parede ─────────────────────────────────────────────────────── */

export type EstadoParede = "producao" | "atencao" | "aguardando" | "parada" | "manutencao";

/** Ordem da faixa de resumo, lida da esquerda: o que produz, depois o que pede ação. */
export const ORDEM_ESTADOS: EstadoParede[] = ["producao", "atencao", "aguardando", "parada", "manutencao"];

export const ESTADO_INFO: Record<EstadoParede, { rotulo: string; icone: string; cor: string }> = {
  producao:   { rotulo: "Em produção", icone: "player-play",    cor: "var(--mq-st-producao)" },
  atencao:    { rotulo: "Atenção",     icone: "alert-triangle", cor: "var(--mq-st-atencao)" },
  aguardando: { rotulo: "Aguardando",  icone: "hourglass-high", cor: "var(--mq-st-aguardando)" },
  parada:     { rotulo: "Parada",      icone: "circle-x",       cor: "var(--mq-st-parada)" },
  manutencao: { rotulo: "Manutenção",  icone: "tools",          cor: "var(--mq-st-manutencao)" },
};

/** Mesmo critério de `estadoMaquina` em `lib/producao-hub.ts`: o motivo anotado
 *  é a única fonte de "manutenção" — não existe coluna própria. */
const RE_MANUTENCAO = /manuten|conserto|reparo|t[eé]cnico|preventiv/i;

/**
 * O estado que a PAREDE mostra, derivado só do que a rota já entrega:
 * - `manutencao`: parada com motivo de manutenção/conserto/técnico;
 * - `parada`: qualquer outro motivo de parada;
 * - `atencao`: produzindo MAS passou da estimativa (restante 0) ou com refugo
 *   apontado derrubando a qualidade abaixo da meta — conservador de propósito:
 *   só acende com evidência medida, nunca por suposição;
 * - `aguardando`: sem programação rodando (com ou sem fila);
 * - `producao`: o resto.
 */
export function estadoDaParede(m: MaquinaPainel): EstadoParede {
  if (m.estado === "parada") return RE_MANUTENCAO.test(m.paradaMotivo ?? "") ? "manutencao" : "parada";
  if (m.estado === "aguardando") return "aguardando";
  if (estourou(m) || refugoAlto(m.oee)) return "atencao";
  return "producao";
}

const estourou = (m: MaquinaPainel) =>
  m.estado === "produzindo" && !!m.atual && m.atual.minutosRestantes <= 0;
const refugoAlto = (o: ResultadoOEE) =>
  o.qualidadeApontada && o.refugos > 0 && o.qualidade < OEE_META.qualidade - 5;

/** Os problemas da máquina, do mais grave pro menos. Vazio = sem ocorrência. */
function problemasDe(m: MaquinaPainel, est: EstadoParede): string[] {
  const out: string[] = [];
  if (est === "parada" || est === "manutencao") out.push(m.paradaMotivo || "Parada sem motivo anotado");
  if (estourou(m)) out.push("Passou do tempo estimado");
  if (m.oee.qualidadeApontada && m.oee.refugos > 0) out.push(`${fmt(m.oee.refugos)} refugo(s) hoje`);
  if (est !== "parada" && est !== "manutencao" && m.oee.disponibilidade < OEE_META.disponibilidade - 30 && m.oee.minutosPerdidos > 0)
    out.push(`${duracaoCurta(m.oee.minutosPerdidos)} sem produzir no turno`);
  if (est === "aguardando" && m.proximas.length === 0 && !m.atual) out.push("Fila vazia");
  return out;
}

const minutosDesde = (iso: string | null | undefined, refMs: number) =>
  iso ? Math.max(0, (refMs - Date.parse(iso)) / 60_000) : null;

/* ── Corpo ────────────────────────────────────────────────────────────────── */

/**
 * O corpo da tela, sem busca de dados — é o que o banco de provas
 * (`/dev-painel-maquinas`) desenha com fixtures. Uma cópia só: o que se vê na
 * prova é literalmente o que vai pra parede. `grupo` é o índice da tela
 * (0 monitor, 1 setor, 2 filas).
 */
export function CorpoMaquinas({ dados, offline, grupo = 0 }: {
  dados: ResumoMaquinas; offline: boolean; grupo?: number;
}) {
  if (dados.maquinas.length === 0) return null;
  const i = ((grupo % TELAS.length) + TELAS.length) % TELAS.length;
  const qual = TELAS[i];
  return (
    <div className="mq">
      {/* `key` refaz a entrada a cada troca: só opacidade, termina em `none`. */}
      <div key={qual} className="mq-tela mq-entra">
        {qual === "monitor" ? <Monitor dados={dados} offline={offline} />
          : qual === "setor" ? <Setor dados={dados} offline={offline} />
          : <Filas dados={dados} />}
      </div>
      <div className="mq-pontos" aria-hidden>
        {TELAS.map((t, k) => <span key={t} data-on={k === i ? "1" : undefined} />)}
      </div>
    </div>
  );
}

/** Colunas × linhas que cabem em 16:9 com cartão legível. */
function gradeDe(n: number): { cols: number; rows: number } {
  if (n <= 4) return { cols: Math.max(1, n), rows: 1 };
  if (n <= 8) return { cols: Math.ceil(n / 2), rows: 2 };
  if (n <= 12) return { cols: Math.ceil(n / 3), rows: 3 };
  return { cols: Math.ceil(n / 4), rows: 4 };
}

/* ── Tela 1: monitor ──────────────────────────────────────────────────────── */

function Monitor({ dados, offline }: { dados: ResumoMaquinas; offline: boolean }) {
  const refMs = Date.parse(dados.atualizadoEm) || Date.now();
  const estados = dados.maquinas.map(estadoDaParede);
  const conta = (e: EstadoParede) => estados.filter((x) => x === e).length;
  const { cols, rows } = gradeDe(dados.maquinas.length);
  const corOee = corDoOEE(dados.oee.faixa);

  return (
    <>
      <header className="mq-topo">
        <div className="mq-titulo">
          <span className="mq-titulo-placa"><Icon name="printer" size={24} color="var(--mq-roxo)" /></span>
          <div style={{ minWidth: 0 }}>
            <h1>Máquinas</h1>
            <div className="mq-titulo-sub">
              <span className="mq-bolinha" style={{ background: offline ? "var(--mq-st-atencao)" : "var(--mq-st-producao)" }} />
              {offline ? "Sem conexão · último dado salvo" : `${fmt(dados.maquinas.length)} no corredor`}
            </div>
          </div>
        </div>

        <div className="mq-faixa">
          {ORDEM_ESTADOS.map((e) => {
            const n = conta(e);
            const info = ESTADO_INFO[e];
            return (
              <div key={e} className="mq-faixa-item" data-zero={n === 0 ? "1" : undefined}
                style={{ ["--mq-est" as string]: info.cor }}>
                <span className="mq-faixa-placa"><Icon name={info.icone} size={22} color={info.cor} /></span>
                <b>{n}</b>
                <span className="mq-faixa-rot">{info.rotulo}</span>
              </div>
            );
          })}
        </div>

        <div className="mq-topo-num">
          <div><span>Horas hoje</span><b>{duracaoCurta(dados.minutosTrabalhados)}</b></div>
          <div><span>OEE</span><b style={{ color: corOee }}>{Math.round(dados.oee.oee)}%</b></div>
        </div>
      </header>

      <div className="mq-grade" style={{ ["--mq-cols" as string]: cols, ["--mq-rows" as string]: rows }}>
        {dados.maquinas.map((m, k) => <CartaoMonitor key={m.id} m={m} est={estados[k]} refMs={refMs} />)}
      </div>
    </>
  );
}

function CartaoMonitor({ m, est, refMs }: { m: MaquinaPainel; est: EstadoParede; refMs: number }) {
  const info = ESTADO_INFO[est];
  const parada = est === "parada" || est === "manutencao";
  const rodando = m.estado === "produzindo";
  const pct = rodando ? m.atual?.progressoPct ?? 0 : 0;
  const problemas = problemasDe(m, est);

  // Tempo no estado: o que a rota permite medir. Rodando = desde o início do
  // trabalho atual. Parada: a rota não entrega `parada_desde`, então mostra a
  // previsão de retorno (ou diz que não há). Aguardando: sem carimbo de quando
  // a máquina esvaziou — mostra o tempo estimado da próxima.
  let tempo: string;
  if (rodando) {
    const d = minutosDesde(m.atual?.inicio, refMs);
    tempo = d == null ? "rodando" : `há ${duracaoCurta(d)}`;
  } else if (parada) {
    const volta = horaSP(m.paradaPrevisao);
    tempo = volta ? `volta ${volta}` : "sem previsão";
  } else {
    tempo = m.atual ? `próx. ${duracaoCurta(m.atual.minutosRestantes)}` : "sem fila";
  }

  const termino = horaSP(m.atual?.previsaoTermino ?? null);
  const rodape = parada ? (horaSP(m.paradaPrevisao) ? `Retorno previsto ${horaSP(m.paradaPrevisao)}` : "Aguardando técnico")
    : !rodando ? (m.atual ? "Aguardando início" : "Nada programado")
    : estourou(m) ? `Previsto ${termino ?? "—"} · passou`
    : `${restanteLongo(m.atual?.minutosRestantes ?? 0)}${termino ? ` · ${termino}` : ""}`;

  const fila = m.proximas.length + (m.estado === "aguardando" && m.atual ? 1 : 0);
  const disp = Math.round(m.oee.disponibilidade);
  const corDisp = disp >= OEE_META.disponibilidade ? "var(--mq-st-producao)" : disp >= OEE_META.disponibilidade - 15 ? "var(--mq-st-atencao)" : "var(--mq-st-parada)";

  return (
    <article className="mq-cm" data-estado={est} style={{ ["--mq-est" as string]: info.cor }}>
      <div className="mq-cm-in">
        <header className="mq-cm-topo">
          <span className="mq-cm-nome">{m.nome}</span>
          <span className="mq-cm-porte" title={m.materiais ?? undefined}>{m.porte}</span>
          <span className="mq-cm-oee" style={{ color: corDoOEE(m.oee.faixa) }}>OEE {Math.round(m.oee.oee)}%</span>
        </header>

        <div className="mq-cm-estado">
          <span className="mq-cm-est-ic"><Icon name={info.icone} size={20} color="currentColor" /></span>
          <span className="mq-cm-est-rot">{info.rotulo}</span>
          <span className="mq-cm-est-tempo">{tempo}</span>
        </div>

        <div className="mq-cm-job">
          <div className="mq-cm-ref">
            {parada ? (m.paradaMotivo || "Parada") : (m.atual?.referencia ?? "Sem programação")}
          </div>
          <div className="mq-cm-mat">
            {parada ? (m.proximas[0] ? `Próxima: ${m.proximas[0].referencia}` : (m.materiais ?? "—"))
              : (m.atual?.material ?? m.materiais ?? "—")}
          </div>
        </div>

        <div className="mq-cm-prog">
          <div className="mq-cm-trilho"><div className="mq-cm-barra" style={{ width: `${pct}%` }} /></div>
          <div className="mq-cm-prog-lin">
            <b>{pct}%</b>
            <span>{rodape}</span>
          </div>
        </div>

        <div className="mq-cm-metricas">
          <div>
            <span>Produção</span>
            <b>{duracaoCurta(m.minutosHoje)}</b>
            <i>{m.oee.pecas > 0 ? `${fmt(m.oee.pecas)} peças` : "horas hoje"}</i>
          </div>
          <div>
            <span>Disponib.</span>
            <b style={{ color: corDisp }}>{disp}%</b>
            <i>meta {OEE_META.disponibilidade}%</i>
          </div>
          <div>
            <span>Fila</span>
            <b>{fila}</b>
            <i>{fila === 1 ? "programação" : "programações"}</i>
          </div>
        </div>

        <div className="mq-cm-prob" data-ok={problemas.length === 0 ? "1" : undefined}>
          <Icon name={problemas.length ? "alert-triangle" : "circle-check"} size={16} color="currentColor" />
          <span>{problemas.length ? problemas[0] : "Sem ocorrências"}</span>
          {problemas.length > 1 && <b>+{problemas.length - 1}</b>}
        </div>
      </div>
    </article>
  );
}

/* ── Tela 2: setor ────────────────────────────────────────────────────────── */

function Setor({ dados, offline }: { dados: ResumoMaquinas; offline: boolean }) {
  return (
    <div className="mq-setor">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="mq-titulo-placa"><Icon name="sparkles" size={24} color="var(--mq-roxo)" /></span>
        <h1 className="mq-h1">Produção laser · o dia</h1>
        <span className="mq-selo" style={{ ["--mq-est" as string]: offline ? "var(--mq-st-atencao)" : "var(--mq-st-producao)" }}>
          <span className="mq-bolinha" style={{ background: "var(--mq-est)" }} />
          {offline ? "Sem conexão" : "Online"}
        </span>
      </div>

      <div className="mq-kpis">
        <KpiMaquina icone="clock" rotulo="Horas trabalhadas" valor={duracaoCurta(dados.minutosTrabalhados)} nota="todas as máquinas" />
        <KpiMaquina icone="hourglass-high" rotulo="Horas pendentes" valor={duracaoCurta(dados.minutosPendentes)} />
        <KpiMaquina icone="list-check" rotulo="Programações feitas" valor={fmt(dados.programacoesFeitas)} />
        <KpiMaquina icone="calendar" rotulo="Programações pendentes" valor={fmt(dados.programacoesPendentes)} />
      </div>

      <BlocoOEE oee={dados.oee} />

      {dados.porMaterial.length > 0 && (
        <div className="mq-materiais">
          {dados.porMaterial.map((m, i) => (
            <div key={m.material} className="mq-material">
              <span className="mq-material-placa" style={{ background: `color-mix(in srgb, ${corDaFila(i)} 14%, var(--mq-cartao))` }}>
                <Icon name="box" size={22} color={corDaFila(i)} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="mq-material-rot">{m.material}</div>
                <div className="mq-material-num">{fmt(m.programacoes)} <span>prog.</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * O OEE do setor: Disponibilidade × Desempenho × Qualidade, com a meta de
 * referência (Nakajima: 90 × 95 × 99) embaixo de cada pilar — quem olha vê
 * QUAL pilar está segurando o resultado. Cor semântica, nunca a rampa.
 */
function BlocoOEE({ oee }: { oee: ResultadoOEE }) {
  const cor = corDoOEE(oee.faixa);
  return (
    <div className="mq-oee">
      <div>
        <div className="mq-oee-rot"><Icon name="target" size={20} color={cor} />OEE do setor hoje</div>
        <div className="mq-oee-num" style={{ color: cor }}><b>{Math.round(oee.oee)}</b><span>%</span></div>
        <div className="mq-oee-faixa" style={{ color: cor }}>{ROTULO_FAIXA[oee.faixa]}</div>
        <div className="mq-oee-conta">
          {Math.round(oee.disponibilidade)}% × {Math.round(oee.desempenho)}% × {Math.round(oee.qualidade)}%
          {" · "}classe mundial ≥ {OEE_CLASSE_MUNDIAL}%
        </div>
      </div>
      <div className="mq-pilares">
        <Pilar rotulo="Disponibilidade" valor={oee.disponibilidade} meta={OEE_META.disponibilidade}
          nota={`${duracaoCurta(oee.minutosPerdidos)} de turno sem produzir`} />
        <Pilar rotulo="Desempenho" valor={oee.desempenho} meta={OEE_META.desempenho}
          nota="ritmo contra o tempo programado" />
        <Pilar rotulo="Qualidade" valor={oee.qualidade} meta={OEE_META.qualidade}
          nota={oee.qualidadeApontada ? `${oee.refugos} refugo(s) em ${oee.pecas} peça(s)` : "sem apontamento de peças hoje"}
          suposta={!oee.qualidadeApontada} />
      </div>
    </div>
  );
}

function Pilar({ rotulo, valor, meta, nota, suposta }: {
  rotulo: string; valor: number; meta: number; nota: string; suposta?: boolean;
}) {
  // Cinza quando o número é suposição — qualidade sem apontamento não pode
  // parecer conquista.
  const cor = suposta ? "var(--mq-dim)" : valor >= meta ? "var(--mq-st-producao)" : valor >= meta - 15 ? "var(--mq-st-atencao)" : "var(--mq-st-parada)";
  return (
    <div>
      <div className="mq-pilar-rot">{rotulo}<b style={{ color: cor }}>{Math.round(valor)}%</b></div>
      <div className="mq-pilar-trilho">
        <div className="mq-pilar-barra" style={{ width: `${Math.max(0, Math.min(100, valor))}%`, background: cor }} />
      </div>
      <div className="mq-pilar-meta">{nota} · meta {meta}%</div>
    </div>
  );
}

/** A fila por material é uma SÉRIE: cor da rampa da empresa. */
const corDaFila = (i: number) => `var(--graf-${(i % 6) + 1}, var(--mq-roxo))`;

function KpiMaquina({ icone, rotulo, valor, nota }: { icone: string; rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="mq-kpi">
      <span className="mq-kpi-placa"><Icon name={icone} size={26} color="var(--mq-roxo)" /></span>
      <div style={{ minWidth: 0 }}>
        <div className="mq-kpi-rot">{rotulo}</div>
        <div className="mq-kpi-num">{valor}</div>
        {nota && <div className="mq-kpi-nota">{nota}</div>}
      </div>
    </div>
  );
}

/* ── Tela 3: filas ────────────────────────────────────────────────────────── */

function Filas({ dados }: { dados: ResumoMaquinas }) {
  const { cols, rows } = gradeDe(dados.maquinas.length);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
        <span className="mq-titulo-placa"><Icon name="list-check" size={24} color="var(--mq-roxo)" /></span>
        <h1 className="mq-h1">Próximas programações</h1>
      </div>
      <div className="mq-grade" style={{ ["--mq-cols" as string]: cols, ["--mq-rows" as string]: rows }}>
        {dados.maquinas.map((m) => {
          const est = estadoDaParede(m);
          const info = ESTADO_INFO[est];
          // Aguardando: a "atual" da rota é a próxima da fila — entra na lista.
          const lista = m.estado === "aguardando" && m.atual
            ? [{ id: `${m.id}-prox`, referencia: m.atual.referencia, material: m.atual.material, minutosEstimados: m.atual.minutosRestantes }, ...m.proximas].slice(0, 3)
            : m.proximas;
          return (
            <section key={m.id} className="mq-fila" style={{ ["--mq-est" as string]: info.cor }}>
              <header>
                <span className="mq-cm-nome">{m.nome}</span>
                <span className="mq-fila-est"><Icon name={info.icone} size={15} color="currentColor" />{info.rotulo}</span>
              </header>
              {lista.length === 0 ? <div className="mq-vazio">Nada na fila</div> : lista.map((p, k) => (
                <div key={p.id} className="mq-prox">
                  <span className="mq-prox-num">{String(k + 1).padStart(2, "0")}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mq-prox-ref">{p.referencia}</div>
                    <div className="mq-prox-mat">{p.material ?? "—"}</div>
                  </div>
                  <span className="mq-prox-dur">{duracaoLonga(p.minutosEstimados)}</span>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

/** "1h 45m" — o formato da coluna de duração da fila. */
function duracaoLonga(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, "0")}m`;
}
