"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PanelConfig } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/types";
import type { ResumoProducao } from "@/lib/painel-producao";
import type { ResumoMaquinas } from "@/lib/painel-maquinas";
import type { Chamada, PessoaEquipe, ProximaFila } from "@/lib/painel-atividades";
import { KioskShell } from "../KioskShell";
import { Icon } from "../slides/Icon";
import { PAREDE_MONO } from "../slides/parede";
import { cachedJson } from "../cache";
import { ritmoAtual } from "../ritmo";
import { BlocoQueAlterna, ChamadaAceite, FilaParede, PessoaCard, fmt, useAgoraMs } from "./pecas";
import {
  AlertaLinha, BarraProgresso, CartaoSecao, EsperaSetor, FaixaStatus, Indicador, Pilula,
  Vazio, frescor, type Tom,
} from "./parede";

/**
 * Painel de PRODUÇÃO — a central de controle do chão de fábrica (16:9).
 *
 * Três andares, na ordem em que a parede é lida:
 *   PRINCIPAL  — o que está acontecendo agora: estado da produção numa frase,
 *                o progresso do dia (peças, concluídas × em curso × pendentes)
 *                e quem está trabalhando, com rosto;
 *   SECUNDÁRIO — o que pede atenção: urgentes, impedidas, máquina parada, e o
 *                que a expedição está esperando da produção;
 *   TERCIÁRIO  — contexto que se reveza num bloco só: a fila do pool e o
 *                resumo das máquinas.
 *
 * E a CHAMADA DE ACEITE por cima de tudo enquanto houver atividade que ninguém
 * aceitou (o aceite é no tablet).
 *
 * Fontes: `/api/producao/painel` (resumo do dia — rota PÚBLICA),
 * `/api/atividades/painel?setor=producao` (chamadas/fila/equipe),
 * `/api/logistica/painel` (o que a expedição espera) e `/api/maquinas/painel`
 * (resumo das máquinas — mesma chave de cache da parede de máquinas). Todas
 * com `cached()` no servidor; o ritmo é o `ritmoAtual` da parede.
 */

interface AtividadesPainel {
  disponivel: boolean;
  chamadas?: Chamada[];
  proximas?: ProximaFila[];
  equipe?: PessoaEquipe[];
}

interface LogisticaResumo {
  faltaProducao?: { categoria: string; total: number; pedidos: number }[];
}

export type ResumoProducaoParede = ResumoProducao & { disponivel?: boolean };
export type MaquinasParede = Pick<ResumoMaquinas, "maquinas" | "oee"> & { disponivel?: boolean };

// Ritmo acelerado enquanto há chamada na tela: o tempo entre "aceitou no
// tablet" e "a parede parou de gritar" é produto. 15 s ≥ o piso de 5 s do
// orçamento de execução, e só vale DURANTE uma chamada — estado de exceção.
const RITMO_CHAMADA_MS = 15_000;

export function ProducaoPanel() {
  const [resumo, setResumo] = useState<ResumoProducaoParede | null>(null);
  const [atv, setAtv] = useState<AtividadesPainel | null>(null);
  const [logi, setLogi] = useState<LogisticaResumo | null>(null);
  const [maq, setMaq] = useState<MaquinasParede | null>(null);
  const [config, setConfig] = useState<PanelConfig>(DEFAULT_CONFIG);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const agoraMs = useAgoraMs();

  const chamadas = useMemo(() => atv?.chamadas ?? [], [atv]);
  // O agendador lê daqui (ref, não estado): com chamada na tela o poll
  // acelera no ciclo seguinte, sem rearmar o efeito inteiro.
  const chamadasRef = useRef(0);
  chamadasRef.current = chamadas.length;

  // O efeito do poll não depende da config (o `load` a grava e rearmar
  // buscava tudo duas vezes ao ligar). O intervalo novo vale no próximo ciclo.
  const intervaloRef = useRef(config.refreshIntervalMs);
  const reagendarRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [r, a, l, m, c] = await Promise.all([
        cachedJson<ResumoProducaoParede>("/api/producao/painel", "producao-painel"),
        cachedJson<AtividadesPainel>("/api/atividades/painel?setor=producao", "atv-producao"),
        cachedJson<LogisticaResumo>("/api/logistica/painel", "logi-painel"),
        cachedJson<MaquinasParede>("/api/maquinas/painel", "maquinas-painel"),
        cachedJson<PanelConfig>("/api/config", "config"),
      ]);
      if (!active) return;
      if (c.data) {
        const nova = { ...DEFAULT_CONFIG, ...c.data };
        intervaloRef.current = nova.refreshIntervalMs;
        setConfig(nova);
      }
      if (r.data) { setResumo(r.data); setOffline(r.fromCache); setCachedAt(r.cachedAt); setFalhou(false); }
      else setFalhou(true);
      if (a.data) setAtv(a.data);
      if (l.data) setLogi(l.data);
      if (m.data) setMaq(m.data);
    }
    load();
    // Mesmo desenho dos outros painéis: `setTimeout` reagendado (o ritmo muda
    // ao vivo), nunca `setInterval` cru. Na TV não existe "aba escondida" — a
    // defesa de custo é o `cached()` do servidor + `ritmoAtual`.
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

  const pronto = resumo && resumo.disponivel !== false;
  return (
    <KioskShell pele="claro" config={config} updatedAt={resumo?.atualizadoEm} offline={offline} cachedAt={cachedAt}>
      {pronto
        ? <CorpoProducao resumo={resumo} equipe={atv?.equipe ?? []} proximas={atv?.proximas ?? []}
            faltaProducao={logi?.faltaProducao ?? []} maquinas={maq} offline={offline} cachedAt={cachedAt} agoraMs={agoraMs} />
        : <EsperaSetor erro={falhou || resumo?.disponivel === false} setor="produção" icone="tools" />}
      <ChamadaAceite chamadas={chamadas} setor="producao" agoraMs={agoraMs} />
    </KioskShell>
  );
}

/** Contagem de máquinas por estado + as paradas (com motivo). */
function resumoDasMaquinas(m: MaquinasParede | null) {
  const lista = m?.maquinas ?? [];
  return {
    total: lista.length,
    produzindo: lista.filter((x) => x.estado === "produzindo").length,
    aguardando: lista.filter((x) => x.estado === "aguardando").length,
    paradas: lista.filter((x) => x.estado === "parada"),
    oee: lista.length ? m?.oee?.oee ?? null : null,
  };
}

/** O estado da produção numa frase. */
export function statusDaProducao(r: ResumoProducao, paradas: number, falta: number): { tom: Tom; icone: string; titulo: string; detalhe: string } {
  const partes: string[] = [];
  if (r.urgentes) partes.push(`${fmt(r.urgentes)} ${r.urgentes === 1 ? "urgente" : "urgentes"} na fila`);
  if (r.impedidas) partes.push(`${fmt(r.impedidas)} ${r.impedidas === 1 ? "impedida" : "impedidas"}`);
  if (paradas) partes.push(`${fmt(paradas)} ${paradas === 1 ? "máquina parada" : "máquinas paradas"}`);
  if (falta) partes.push(`expedição esperando ${fmt(falta)} ${falta === 1 ? "peça" : "peças"}`);
  if (r.urgentes > 0 || r.impedidas > 0) {
    return { tom: "perigo", icone: r.urgentes > 0 ? "flame" : "circle-x", titulo: "Produção pede ação", detalhe: partes.join(" · ") };
  }
  if (partes.length) return { tom: "atencao", icone: "alert-triangle", titulo: "Produção com atenção", detalhe: partes.join(" · ") };
  if (r.emAndamento > 0) {
    return { tom: "ok", icone: "player-play", titulo: "Produção rodando", detalhe: `${fmt(r.emAndamento)} em andamento · nada crítico agora` };
  }
  return { tom: "ok", icone: "circle-check", titulo: "Produção em dia", detalhe: r.pendentes > 0 ? `${fmt(r.pendentes)} na fila, esperando quem pegue` : "Fila vazia, nada crítico" };
}

/**
 * O corpo da parede, PURO (sem busca) — o painel real e o banco de provas
 * (`/dev-painel-setor`) montam o mesmo desenho.
 */
export function CorpoProducao({ resumo, equipe: equipeBase, proximas, faltaProducao, maquinas, offline, cachedAt, agoraMs }: {
  resumo: ResumoProducao; equipe: PessoaEquipe[]; proximas: ProximaFila[];
  faltaProducao: { categoria: string; total: number; pedidos: number }[];
  maquinas: MaquinasParede | null; offline: boolean; cachedAt: string | null; agoraMs: number;
}) {
  // Equipe: base é a rota de atividades (foto de cadastro + presença + agora);
  // o TMA individual vem do resumo, casado por id.
  const tmaPorPessoa = new Map((resumo.operadores ?? []).map((o) => [o.id, o.tmaMin]));
  const equipe = equipeBase
    .map((p) => ({ ...p, extra: tmaPorPessoa.get(p.id) != null ? `TMA ${tmaPorPessoa.get(p.id)} min` : null }))
    // Quem está trabalhando primeiro, depois quem está livre, depois quem está fora.
    .sort((a, b) => peso(a) - peso(b));
  const trabalhando = equipe.filter((p) => p.emAtividade).length;
  const presentes = equipe.filter((p) => p.presente !== false).length;

  const falta = faltaProducao.slice(0, 3);
  const faltaPecas = faltaProducao.reduce((s, f) => s + f.total, 0);
  const mq = resumoDasMaquinas(maquinas);
  const status = statusDaProducao(resumo, mq.paradas.length, faltaPecas);
  const fr = frescor({ atualizadoEm: resumo.atualizadoEm, offline, cachedAt, agoraMs });

  // Progresso do dia: das ordens que existem hoje (concluídas + em curso +
  // pendentes), quantas já fecharam.
  const ordens = resumo.concluidasHoje + resumo.emAndamento + resumo.pendentes;
  const feito = ordens > 0 ? resumo.concluidasHoje / ordens : 0;
  const emCurso = ordens > 0 ? resumo.emAndamento / ordens : 0;

  const alertas: React.ReactNode[] = [];
  if (resumo.urgentes > 0) alertas.push(<AlertaLinha key="u" i={alertas.length} tom="perigo" icone="flame" texto="Urgentes na fila" sub="Passam na frente das outras" valor={fmt(resumo.urgentes)} />);
  if (resumo.impedidas > 0) alertas.push(<AlertaLinha key="i" i={alertas.length} tom="perigo" icone="circle-x" texto="Impedidas" sub="Falta material ou peça?" valor={fmt(resumo.impedidas)} />);
  if (mq.paradas.length > 0) {
    alertas.push(<AlertaLinha key="m" i={alertas.length} tom="atencao" icone="tools"
      texto={mq.paradas.length === 1 ? `${mq.paradas[0].nome} parada` : `${mq.paradas.length} máquinas paradas`}
      sub={mq.paradas.map((x) => x.paradaMotivo).filter(Boolean).join(" · ") || "Sem motivo informado"} valor={fmt(mq.paradas.length)} />);
  }
  for (const f of falta) {
    alertas.push(<AlertaLinha key={"f" + f.categoria} i={alertas.length} tom="atencao" icone="package-import"
      texto={f.categoria} sub={`Expedição esperando · ${fmt(f.pedidos)} ${f.pedidos === 1 ? "pedido" : "pedidos"}`} valor={fmt(f.total)} />);
  }
  const MAX_ALERTAS = 4;

  const terciario = [
    {
      chave: "fila",
      nó: (
        <CartaoSecao titulo="Próximas da fila" icone="list-check" style={{ flex: 1 }} corpo={{ overflow: "hidden" }}
          extra={<span style={{ marginRight: mq.total ? 58 : 0 }}>{fmt(resumo.pendentes)} pendentes</span>}>
          <FilaParede proximas={proximas} agoraMs={agoraMs} compacta />
        </CartaoSecao>
      ),
    },
    ...(mq.total > 0 ? [{
      chave: "maquinas",
      nó: (
        <CartaoSecao titulo="Máquinas" icone="tools" style={{ flex: 1 }} corpo={{ overflow: "hidden" }}
          extra={<span style={{ marginRight: 58 }}>{mq.oee != null ? `OEE ${Math.round(mq.oee)}%` : `${mq.total} no setor`}</span>}>
          <div className="st-g3">
            <MiniNumero rotulo="Produzindo" valor={mq.produzindo} tom="ok" />
            <MiniNumero rotulo="Aguardando" valor={mq.aguardando} tom="neutro" />
            <MiniNumero rotulo="Paradas" valor={mq.paradas.length} tom={mq.paradas.length ? "perigo" : "neutro"} />
          </div>
          {(maquinas?.maquinas ?? []).filter((x) => x.atual).slice(0, 2).map((x, i) => (
            <div key={x.id} className="st-linha" style={{ ["--st-i" as string]: i, display: "flex", alignItems: "center", gap: 10, fontSize: 14.5, fontWeight: 700, minWidth: 0 }}>
              <span style={{ flex: "none", color: "var(--st-texto)" }}>{x.nome}</span>
              <span style={{ flex: 1, minWidth: 0, color: "var(--st-fraco)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.atual!.referencia}</span>
              <span className="st-num" style={{ flex: "none", fontSize: 15, color: "var(--st-roxo)" }}>{x.atual!.progressoPct}%</span>
            </div>
          ))}
        </CartaoSecao>
      ),
    }] : []),
  ];

  return (
    <div className="st-painel" style={PAREDE_MONO}>
      {/* Cabeçalho + STATUS na mesma faixa: a primeira frase da parede. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none", minWidth: 0 }}>
        <span className="st-cab-marca"><Icon name="tools" size={28} color="#fff" /></span>
        <div style={{ minWidth: 0, flex: "none", maxWidth: 300 }}>
          <div className="st-cab-titulo">Produção</div>
          <div className="st-cab-sub" style={!resumo.ehHoje ? { color: "var(--st-atencao)", fontWeight: 700 } : undefined}>
            {resumo.ehHoje ? "Turno de hoje" : `Hoje sem movimento — mostrando ${resumo.dia.split("-").reverse().join("/")}`}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FaixaStatus tom={status.tom} icone={status.icone} titulo={status.titulo} detalhe={status.detalhe} />
        </div>
        <Pilula tom={fr.tom} icone={fr.tom === "ok" ? undefined : fr.icone}>{fr.texto}</Pilula>
      </div>

      {/* PRINCIPAL — o dia em números. */}
      <div className="st-prod-principal">
        <Indicador i={0} icone="box" titulo="Peças produzidas" valor={resumo.pecasHoje} tamanho={54} tom="roxo"
          nota={<>{ordens > 0 ? <><b style={{ color: "var(--st-texto)" }}>{fmt(resumo.concluidasHoje)}</b> de {fmt(ordens)} ordens fechadas</> : "Nenhuma ordem no dia"}{resumo.tmaMin != null && <> · TMA <b style={{ color: "var(--st-texto)" }}>{resumo.tmaMin} min</b></>}</>}>
          <BarraProgresso feito={feito} emCurso={emCurso} />
        </Indicador>
        <Indicador i={1} icone="player-play" titulo="Em andamento" valor={resumo.emAndamento} tamanho={48} tom="roxo"
          nota={`${fmt(trabalhando)} ${trabalhando === 1 ? "pessoa" : "pessoas"} trabalhando`} notaIcone="users" />
        <Indicador i={2} icone="hourglass-high" titulo="Pendentes" valor={resumo.pendentes} tamanho={48}
          nota={resumo.urgentes > 0 ? `${fmt(resumo.urgentes)} urgente${resumo.urgentes === 1 ? "" : "s"}` : "Nenhuma urgente"}
          notaIcone={resumo.urgentes > 0 ? "flame" : undefined} />
        <Indicador i={3} icone="circle-check" titulo="Concluídas" valor={resumo.concluidasHoje} tamanho={48} tom="ok"
          nota={ordens > 0 ? `${Math.round(feito * 100)}% do dia` : "—"} />
      </div>

      <div className="st-prod-corpo">
        {/* PRINCIPAL — quem está fazendo, com rosto. */}
        <CartaoSecao titulo="Equipe agora" icone="users"
          extra={<>{fmt(presentes)} presentes · {fmt(resumo.operadoresAtivos)} produziram hoje</>}
          corpo={{ overflow: "hidden" }}>
          {equipe.length === 0 ? (
            <Vazio icone="users" tom="neutro">Ninguém da produção com o dia aberto ainda.</Vazio>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, overflow: "hidden" }}>
                {equipe.slice(0, VISIVEIS).map((p, i) => <PessoaCard key={p.id} p={p} agoraMs={agoraMs} i={i} fotoSize={46} compacta />)}
              </div>
              {/* Quem não coube em cartão ainda aparece pelo nome, com o
                  estado em cor — ninguém some da parede. */}
              {equipe.length > VISIVEIS && (
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 14, fontSize: 14.5, fontWeight: 700, color: "var(--st-fraco)", whiteSpace: "nowrap", overflow: "hidden" }}>
                  <span style={{ flex: "none" }}>+{equipe.length - VISIVEIS}</span>
                  {equipe.slice(VISIVEIS).map((p) => (
                    <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: p.emAtividade ? "var(--st-ok)" : p.presente === false ? "var(--st-apagado)" : "var(--st-roxo)" }} />
                      {p.nome.split(/\s+/)[0]}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </CartaoSecao>

        {/* SECUNDÁRIO — o que pede atenção. */}
        <CartaoSecao titulo="Atenção" icone="alert-triangle" tom={alertas.length ? status.tom : undefined}
          extra={alertas.length > MAX_ALERTAS ? `+${alertas.length - MAX_ALERTAS}` : undefined}
          corpo={{ overflow: "hidden" }}>
          {alertas.length === 0
            ? <Vazio>Nada crítico agora.</Vazio>
            : alertas.slice(0, MAX_ALERTAS)}
        </CartaoSecao>

        {/* TERCIÁRIO — se reveza. */}
        <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <BlocoQueAlterna telas={terciario} pontos={{ top: 20, right: 18 }} />
        </div>
      </div>
    </div>
  );
}

/** Cartões de pessoa que cabem no palco de 720 de altura (4 linhas de uma linha só). */
const VISIVEIS = 4;

const peso = (p: PessoaEquipe) => (p.emAtividade ? 0 : p.presente === false ? 2 : 1);

function MiniNumero({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: Tom }) {
  const cor = tom === "ok" ? "var(--st-ok)" : tom === "perigo" ? "var(--st-perigo)" : "var(--st-texto)";
  return (
    <div style={{ padding: "10px 12px", borderRadius: 14, background: "color-mix(in srgb, var(--st-roxo) 4%, var(--st-cartao))", minWidth: 0 }}>
      <div className="st-num" style={{ fontSize: 30, color: cor }}>{fmt(valor)}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--st-fraco)", marginTop: 4 }}>{rotulo}</div>
    </div>
  );
}
