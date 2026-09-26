"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PanelConfig } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/types";
import type { Chamada, PessoaEquipe, ProximaFila } from "@/lib/painel-atividades";
import type { CriticoPainel } from "@/lib/logistica";
import type { SemanaDeEnvios } from "@/lib/painel-envios";
import { KioskShell } from "../KioskShell";
import { Icon } from "../slides/Icon";
import { PAREDE_MONO } from "../slides/parede";
import { cachedJson } from "../cache";
import { ritmoAtual } from "../ritmo";
import {
  BlocoQueAlterna, ChamadaAceite, FotoPessoa, GraficoEnvios, LegendaEnvios,
  fmt, useAgoraMs, useDingEmChamadaNova,
} from "./pecas";
import {
  AlertaLinha, BarraProgresso, CartaoSecao, EsperaSetor, FaixaStatus, Indicador, Pilula,
  SetorCabecalho, Vazio, frescor, type Tom,
} from "./parede";

/**
 * Painel de LOGÍSTICA — RETRATO (720×1280), porque a TV da expedição é
 * pendurada de pé. Numa TV deitada que o sistema não gira, o menu "M" tem o
 * "Girar tela" (ou `?girar=90` na URL).
 *
 * A leitura de cima pra baixo segue a ordem das perguntas de quem passa:
 *   1. STATUS    — a operação está em dia? (uma faixa, uma cor, uma frase);
 *   2. VOLUME    — quanto está no fluxo e quanto saiu hoje;
 *   3. PROBLEMAS — etiqueta parada, travado por falta, pedido crítico;
 *   4. PROGRESSO — do que podia sair hoje, quanto já saiu;
 *   5. SECUNDÁRIO — o pé se reveza: a semana, os críticos pela CAIXA, o que
 *      falta a produção entregar, as filas por categoria e a equipe.
 *
 * Por cima de tudo, a CHAMADA DE ACEITE: aqui ninguém tem tablet tocando,
 * então a TV toca (um ding curto) e aponta pro site — Minhas atividades — até
 * alguém aceitar.
 */

interface AtividadesPainel {
  disponivel: boolean;
  chamadas?: Chamada[];
  proximas?: ProximaFila[];
  equipe?: PessoaEquipe[];
}

export interface LogisticaResumo {
  atualizadoEm?: string;
  entrada?: number;
  logistica?: number;
  total?: number;
  enviadosHoje?: number;
  categorias?: { chave: string; rotulo: string; valor: number; anterior: number | null }[];
  faltaProducao?: { categoria: string; total: number; pedidos: number }[];
  criticos?: CriticoPainel[];
  semana?: SemanaDeEnvios;
  etiquetasPendentes?: number;
  prontosParaEnvio?: number;
  prontosFaltandoEstoque?: number;
}

const RITMO_CHAMADA_MS = 15_000;

export function LogisticaPanel() {
  const [logi, setLogi] = useState<LogisticaResumo | null>(null);
  const [atv, setAtv] = useState<AtividadesPainel | null>(null);
  const [config, setConfig] = useState<PanelConfig>(DEFAULT_CONFIG);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  // Primeira tentativa voltou sem nada (nem cache): a tela diz "sem dados" em
  // vez de "sincronizando…" pra sempre.
  const [falhou, setFalhou] = useState(false);
  const agoraMs = useAgoraMs();

  const chamadas = useMemo(() => atv?.chamadas ?? [], [atv]);
  const chamadasRef = useRef(0);
  chamadasRef.current = chamadas.length;
  // Aqui o sino é da TV: na logística não há tablet tocando pelo aceite.
  useDingEmChamadaNova(chamadas, true);

  // O efeito do poll não depende da config (o `load` a grava e rearmar
  // buscava tudo duas vezes ao ligar). O intervalo novo vale no próximo ciclo.
  const intervaloRef = useRef(config.refreshIntervalMs);
  const reagendarRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [l, a, c] = await Promise.all([
        cachedJson<LogisticaResumo>("/api/logistica/painel", "logi-painel"),
        cachedJson<AtividadesPainel>("/api/atividades/painel?setor=logistica", "atv-logistica"),
        cachedJson<PanelConfig>("/api/config", "config"),
      ]);
      if (!active) return;
      if (c.data) {
        const nova = { ...DEFAULT_CONFIG, ...c.data };
        intervaloRef.current = nova.refreshIntervalMs;
        setConfig(nova);
      }
      if (l.data) { setLogi(l.data); setOffline(l.fromCache); setCachedAt(l.cachedAt); setFalhou(false); }
      else setFalhou(true);
      if (a.data) setAtv(a.data);
    }
    load();
    let id: ReturnType<typeof setTimeout>;
    const proximoMs = () => (chamadasRef.current > 0 ? RITMO_CHAMADA_MS : ritmoAtual(intervaloRef.current));
    const agendar = () => { id = setTimeout(tick, proximoMs()); };
    const tick = () => { if (!document.hidden) load(); agendar(); };
    agendar();
    reagendarRef.current = () => { clearTimeout(id); agendar(); };
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { active = false; reagendarRef.current = null; clearTimeout(id); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Intervalo da parede mudou: reagenda o PRÓXIMO ciclo, sem buscar agora.
  useEffect(() => { reagendarRef.current?.(); }, [config.refreshIntervalMs]);

  return (
    <KioskShell pele="claro" config={config} palco={{ w: 720, h: 1280 }} updatedAt={logi?.atualizadoEm} offline={offline} cachedAt={cachedAt}>
      {logi
        ? <CorpoLogistica logi={logi} equipe={atv?.equipe ?? []} offline={offline} cachedAt={cachedAt} agoraMs={agoraMs} />
        : <EsperaSetor erro={falhou} setor="logística" icone="truck-delivery" />}
      <ChamadaAceite chamadas={chamadas} setor="logistica" agoraMs={agoraMs} />
    </KioskShell>
  );
}

/** O estado da expedição numa frase, a partir dos três problemas. */
export function statusDaExpedicao(l: LogisticaResumo): { tom: Tom; icone: string; titulo: string; detalhe: string } {
  const criticos = l.criticos ?? [];
  const urgentes = criticos.filter((c) => c.urgente).length;
  const etiquetas = l.etiquetasPendentes ?? 0;
  const travados = l.prontosFaltandoEstoque ?? 0;
  const partes: string[] = [];
  if (criticos.length) partes.push(`${fmt(criticos.length)} ${criticos.length === 1 ? "pedido crítico" : "pedidos críticos"}`);
  if (etiquetas) partes.push(`${fmt(etiquetas)} ${etiquetas === 1 ? "etiqueta parada" : "etiquetas paradas"}`);
  if (travados) partes.push(`${fmt(travados)} ${travados === 1 ? "travado" : "travados"} por falta`);
  if (urgentes > 0) {
    return { tom: "perigo", icone: "flame", titulo: urgentes === 1 ? "Pedido urgente parado" : `${urgentes} pedidos urgentes parados`, detalhe: partes.join(" · ") };
  }
  if (partes.length) return { tom: "atencao", icone: "alert-triangle", titulo: "Expedição pede atenção", detalhe: partes.join(" · ") };
  return { tom: "ok", icone: "circle-check", titulo: "Expedição em dia", detalhe: "Nenhuma etiqueta parada, nada travado, nenhum pedido crítico." };
}

/**
 * O corpo da parede, PURO (sem busca) — o painel real e o banco de provas
 * (`/dev-painel-setor`) montam o mesmo desenho.
 */
export function CorpoLogistica({ logi, equipe, offline, cachedAt, agoraMs }: {
  logi: LogisticaResumo; equipe: PessoaEquipe[]; offline: boolean; cachedAt: string | null; agoraMs: number;
}) {
  const semana = logi.semana;
  const criticos = logi.criticos ?? [];
  const falta = logi.faltaProducao ?? [];
  const categorias = logi.categorias ?? [];
  const etiquetas = logi.etiquetasPendentes ?? 0;
  const prontos = logi.prontosParaEnvio ?? 0;
  const travados = logi.prontosFaltandoEstoque ?? 0;
  const enviados = logi.enviadosHoje ?? 0;
  const entrada = logi.entrada ?? 0;
  const emLogistica = logi.logistica ?? 0;
  const noFluxo = logi.total ?? entrada + emLogistica;
  const mediaDia = semana && semana.dias.length ? Math.round(semana.total / semana.dias.length) : null;
  const subiu = (semana?.variacaoPct ?? 0) >= 0;
  const status = statusDaExpedicao(logi);
  const fr = frescor({ atualizadoEm: logi.atualizadoEm, offline, cachedAt, agoraMs });
  const maisVelho = criticos.reduce((m, c) => Math.max(m, c.dias), 0);

  // Progresso do dia: do que podia sair hoje (já saiu + pronto + esperando
  // etiqueta), quanto saiu. Sem nada na régua, a barra não inventa 0%.
  const podiaSair = enviados + prontos + etiquetas;
  const fracao = podiaSair > 0 ? enviados / podiaSair : 0;

  const telas = [
    ...(semana && semana.dias.length > 0 ? [{
      chave: "semana",
      nó: (
        <CartaoSecao titulo="Envios da semana" icone="chart-bar" extra={<span style={{ marginRight: 58 }}>{semana.periodo}</span>} style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><LegendaEnvios /></div>
          <GraficoEnvios dias={semana.dias} mediaMovel={semana.mediaMovel} />
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 18, paddingTop: 10, borderTop: "1px solid var(--st-trilho)", fontSize: 15, fontWeight: 700, color: "var(--st-fraco)" }}>
            <span>Total <b className="st-num" style={{ fontSize: 22, color: "var(--st-texto)" }}>{fmt(semana.total)}</b></span>
            {/* Subir/cair é ESTADO: verde e âmbar da paleta semântica. */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: subiu ? "var(--st-ok)" : "var(--st-atencao)" }}>
              <Icon name={subiu ? "trending-up" : "trending-down"} size={18} color={subiu ? "var(--st-ok)" : "var(--st-atencao)"} />
              <b className="st-num" style={{ fontSize: 22 }}>{subiu ? "+" : ""}{semana.variacaoPct}%</b>
              <span style={{ color: "var(--st-fraco)" }}>vs. semana anterior</span>
            </span>
          </div>
        </CartaoSecao>
      ),
    }] : []),
    ...(criticos.length > 0 ? [{
      chave: "criticos",
      nó: (
        <CartaoSecao titulo="Pedidos críticos" icone="alert-triangle" tom="perigo"
          extra={<span style={{ marginRight: 58 }}>{fmt(criticos.length)}</span>} style={{ flex: 1 }}
          corpo={{ overflow: "hidden" }}>
          {criticos.slice(0, 6).map((c, i) => <CriticoLinha key={`${c.etapa}-${c.caixa ?? i}-${i}`} c={c} i={i} />)}
          {criticos.length > 6 && <MaisN n={criticos.length - 6} />}
        </CartaoSecao>
      ),
    }] : []),
    ...(falta.length > 0 ? [{
      chave: "falta",
      nó: (
        <CartaoSecao titulo="Esperando a produção" icone="package-import" tom="atencao"
          extra={<span style={{ marginRight: 58 }}>{fmt(falta.reduce((s, f) => s + f.total, 0))} peças</span>} style={{ flex: 1 }}
          corpo={{ overflow: "hidden" }}>
          {falta.slice(0, 6).map((f, i) => (
            <AlertaLinha key={f.categoria} i={i} tom="atencao" icone="package-import" texto={f.categoria}
              sub={`${fmt(f.pedidos)} ${f.pedidos === 1 ? "pedido" : "pedidos"} esperando`} valor={fmt(f.total)} />
          ))}
        </CartaoSecao>
      ),
    }] : []),
    ...(categorias.length > 0 ? [{
      chave: "categorias",
      nó: (
        <CartaoSecao titulo="Fila por categoria" icone="list-check" extra={<span style={{ marginRight: 58 }}>{fmt(noFluxo)} no fluxo</span>} style={{ flex: 1 }}
          corpo={{ overflow: "hidden" }}>
          <div className="st-g2">
            {categorias.slice(0, 10).map((c, i) => <CategoriaCelula key={c.chave} c={c} i={i} />)}
          </div>
        </CartaoSecao>
      ),
    }] : []),
    ...(equipe.length > 0 ? [{
      chave: "equipe",
      nó: (
        <CartaoSecao titulo="Equipe" icone="users" style={{ flex: 1 }}
          extra={<span style={{ marginRight: 58 }}>{equipe.filter((p) => p.presente).length} de {equipe.length} presentes</span>}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", overflow: "hidden" }}>
            {equipe.slice(0, 10).map((p, i) => <RostoEquipe key={p.id} p={p} i={i} />)}
          </div>
        </CartaoSecao>
      ),
    }] : []),
  ];

  return (
    <div className="st-painel" style={PAREDE_MONO}>
      <SetorCabecalho icone="truck-delivery" titulo="Logística" subtitulo="Expedição do dia"
        selos={<Pilula tom={fr.tom} icone={fr.tom === "ok" ? undefined : fr.icone}>{fr.texto}</Pilula>} />

      {/* 1) STATUS */}
      <FaixaStatus tom={status.tom} icone={status.icone} titulo={status.titulo} detalhe={status.detalhe} />

      {/* 2) VOLUME */}
      <div className="st-g2">
        <Indicador i={0} icone="building-warehouse" titulo="Pedidos no fluxo" valor={noFluxo} tamanho={64}
          nota={<>Entrada <b style={{ color: "var(--st-texto)" }}>{fmt(entrada)}</b> · Em logística <b style={{ color: "var(--st-texto)" }}>{fmt(emLogistica)}</b></>} />
        <Indicador i={1} icone="truck-delivery" titulo="Enviados hoje" valor={enviados} tamanho={64} tom="roxo"
          nota={mediaDia != null ? <>Média <b style={{ color: "var(--st-texto)" }}>{fmt(mediaDia)}</b>/dia na semana</> : undefined}
          notaIcone={mediaDia != null ? "trending-up" : undefined} />
      </div>

      {/* 3) PROBLEMAS — acendem só quando existem. */}
      <div className="st-g3">
        <Indicador i={2} icone="printer" titulo="Etiquetas pendentes" valor={etiquetas} tamanho={46}
          tom={etiquetas > 0 ? "perigo" : "neutro"} aceso={etiquetas > 0}
          nota={etiquetas > 0 ? "Aguardando impressão" : "Nada pra imprimir"} />
        <Indicador i={3} icone="package-import" titulo="Travados por falta" valor={travados} tamanho={46}
          tom={travados > 0 ? "atencao" : "neutro"} aceso={travados > 0}
          nota={travados > 0 ? "Falta item pra fechar" : "Nada travado"} />
        <Indicador i={4} icone="alert-triangle" titulo="Pedidos críticos" valor={criticos.length} tamanho={46}
          tom={criticos.length > 0 ? "perigo" : "neutro"} aceso={criticos.length > 0}
          nota={criticos.length > 0 ? `Mais antigo: ${maisVelho} ${maisVelho === 1 ? "dia" : "dias"}` : "Nenhum parado"} />
      </div>

      {/* 4) PROGRESSO */}
      <section className="st-card" style={{ display: "flex", flexDirection: "column", gap: 12, flex: "none" }}>
        <div className="st-rotulo">
          <Icon name="truck-loading" size={17} color="var(--st-fraco)" />
          <span>Saída do dia</span>
          <span className="st-rotulo-extra" style={{ color: "var(--st-texto)" }}>
            {podiaSair > 0 ? <><b className="st-num" style={{ fontSize: 20 }}>{Math.round(fracao * 100)}%</b> já saiu</> : "Sem pedidos prontos"}
          </span>
        </div>
        <BarraProgresso feito={fracao} emCurso={podiaSair > 0 ? prontos / podiaSair : 0} altura={16} />
        <div style={{ display: "flex", gap: 18, fontSize: 14.5, fontWeight: 700, color: "var(--st-fraco)", whiteSpace: "nowrap" }}>
          <Legenda cor="var(--st-roxo)" rotulo="Enviados" valor={enviados} />
          <Legenda cor="color-mix(in srgb, var(--st-roxo) 28%, var(--st-trilho))" rotulo="Prontos para envio" valor={prontos} />
          <Legenda cor="var(--st-trilho)" rotulo="Sem etiqueta" valor={etiquetas} />
        </div>
      </section>

      {/* 5) SECUNDÁRIO — se reveza. O que manda alguém levantar nunca sai. */}
      {telas.length > 0 ? (
        <BlocoQueAlterna telas={telas} pontos={{ top: 20, right: 18 }} />
      ) : (
        <section className="st-card" style={{ flex: 1, display: "flex" }}>
          <Vazio>Sem envios nem pedidos críticos para mostrar.</Vazio>
        </section>
      )}
    </div>
  );
}

function Legenda({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
      <i style={{ width: 12, height: 12, borderRadius: 4, background: cor, flex: "none" }} />
      {rotulo} <b className="st-num" style={{ color: "var(--st-texto)", fontSize: 16 }}>{fmt(valor)}</b>
    </span>
  );
}

function MaisN({ n }: { n: number }) {
  return <div style={{ fontSize: 14, fontWeight: 700, color: "var(--st-fraco)", paddingLeft: 4 }}>+{fmt(n)} {n === 1 ? "outro" : "outros"}</div>;
}

/** Categoria da fila, com a variação desde o último retrato (fila subindo = ruim). */
function CategoriaCelula({ c, i }: { c: { rotulo: string; valor: number; anterior: number | null }; i: number }) {
  const delta = c.anterior != null ? c.valor - c.anterior : 0;
  const cor = delta > 0 ? "var(--st-perigo)" : "var(--st-ok)";
  return (
    <div className="st-linha" style={{ ["--st-i" as string]: i, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, background: "color-mix(in srgb, var(--st-roxo) 4%, var(--st-cartao))", minWidth: 0 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: "var(--st-fraco)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.rotulo}</span>
      {delta !== 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 13, fontWeight: 800, color: cor }}>
          <Icon name={delta > 0 ? "trending-up" : "trending-down"} size={15} color={cor} />{delta > 0 ? "+" : ""}{fmt(delta)}
        </span>
      )}
      <span className="st-num" style={{ fontSize: 24 }}>{fmt(c.valor)}</span>
    </div>
  );
}

/** Rosto + estado de uma pessoa da equipe, em coluna estreita. */
function RostoEquipe({ p, i }: { p: PessoaEquipe; i: number }) {
  const ausente = p.presente === false;
  const trabalhando = !!p.emAtividade;
  const estado = trabalhando ? "Em atividade" : ausente ? "Fora" : p.presente ? "Livre" : "—";
  const cor = trabalhando ? "var(--st-ok)" : ausente ? "var(--st-fraco)" : "var(--st-roxo)";
  return (
    <div className="st-linha" style={{ ["--st-i" as string]: i, width: 104, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
      <FotoPessoa nome={p.nome} url={p.fotoUrl} size={68} ausente={ausente} anelCor={trabalhando ? "var(--st-ok)" : undefined} />
      <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.15, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {p.nome.split(/\s+/)[0]}
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: cor, fontWeight: 700 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: cor }} />
        {estado}
      </div>
    </div>
  );
}

/** Linha de pedido crítico: caixa grande, pendências, dias parado. */
function CriticoLinha({ c, i }: { c: CriticoPainel; i: number }) {
  const tom: Tom = c.urgente || c.dias >= 10 ? "perigo" : "atencao";
  return (
    <AlertaLinha i={i} tom={tom} icone={c.urgente ? "flame" : "box"}
      texto={c.caixa ? `Caixa ${c.caixa}` : "Sem caixa"}
      sub={c.pendencias.length > 0 ? c.pendencias.join(" · ") : c.faltam > 0 ? `Faltam ${c.faltam} de ${c.itens} itens` : "Pronto pra avançar"}
      valor={<>{c.dias}<span style={{ fontSize: 14, fontWeight: 700, marginLeft: 4 }}>{c.dias === 1 ? "dia" : "dias"}</span></>} />
  );
}
