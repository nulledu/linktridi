"use client";

// ── Histórico: a linha do tempo do dia ──────────────────────────────────────
//
// Pedido do dono (21/09/2026): o kanban por status (17/09) deu lugar a uma
// agenda do dia em blocos de uma hora — "o que aconteceu em cada horário?".
// A regra de onde cada atividade cai mora em lib/atividades-linha-do-tempo.ts
// (concluída → hora da conclusão; iniciada → início; senão, lançamento).
//
// Evolução (22/09/2026): a mesma estrutura, com a leitura operacional na
// frente — quem fez (avatar), o que era (thumbnail do item), quando começou,
// quando terminou, quanto levou e contra quanto era o previsto. A linguagem
// visual segue a do Tridify (TfKit): cor como APOIO (chip tingido, pontinho),
// slots reservados, numeral tabular, hierarquia tipográfica forte. Nenhuma
// regra de negócio nova: duração = concluída − iniciada, desvio = duração −
// tempo_estimado_min, e só aparecem quando os dois lados existem.
//
// O card mostra o essencial; o resto (cronologia, descrição, motivo, foto) e
// as ações que o kanban tinha — voltar pra pendente, concluir, cancelar com
// motivo, excluir — ficam no detalhe, aberto no clique. Nenhuma ação sumiu.
//
// Enviar atividade continua pelo MESMO pop-up da Visão geral
// (LancadorDeAtividade): não existe um segundo formulário de atribuição.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { confirmar, toast } from "../Toast";
import { Botao, BotaoIcone, PainelLateral } from "../ui/controles";
import { Modal } from "../ui/Modal";
import { Secao } from "../ui/Secao";
import { Avatar } from "../ui/Avatar";
import { GlassDate, GlassSelect } from "../GlassPicker";
import { LancadorDeAtividade } from "./LancadorDeAtividade";
import { CriarAtividade } from "./CriarAtividade";
import { hierarquiaLabel } from "@/lib/estoque-hierarquia";
import { entradasDaVisao, type EntradaDaVisao, type GrupoDaVisao } from "@/lib/atividades-lancador";
import { hojeSP, rotuloDoPrazo, somaDias, type ItemDaVisao, type LinhaDeModelo } from "@/lib/atividades-visao";
import { prioridadeDe, ROTULO_PRIORIDADE, type Atividade, type Colaborador } from "@/lib/atividades-catalog";
import {
  abertasDeAntes, estadoNoHistorico, linhaDoTempo, noFusoSP, rotuloDaHora,
  type EstadoNoHistorico, type MomentoDoDia,
} from "@/lib/atividades-linha-do-tempo";

/** Os estados que a tela distingue — os do sistema, sem inventar nenhum. */
export const ESTADOS: Record<EstadoNoHistorico, { titulo: string; cor: string; icone: string }> = {
  concluida: { titulo: "Concluída", cor: "var(--ok)", icone: "check" },
  em_andamento: { titulo: "Em andamento", cor: "var(--primary-texto)", icone: "player-play" },
  pendente: { titulo: "Pendente", cor: "var(--atencao)", icone: "clock" },
  atrasada: { titulo: "Atrasada", cor: "var(--perigo)", icone: "alert-triangle" },
  cancelada: { titulo: "Cancelada", cor: "var(--text-dim)", icone: "ban" },
};
const ORDEM_ESTADOS: EstadoNoHistorico[] = ["concluida", "em_andamento", "pendente", "atrasada", "cancelada"];

const VERBO: Record<MomentoDoDia, string> = { concluida: "Concluída", iniciada: "Iniciada", lancada: "Lançada" };

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Pedido que chega das outras abas: filtrar por uma busca, ou já abrir o
 *  pop-up de nova atividade. `n` muda a cada pedido — dois cliques iguais
 *  seguidos também valem. */
export type PedidoAoHistorico = { n: number; busca?: string; nova?: boolean };

const diaPorExtenso = (dia: string) => {
  const t = new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// ── Tempo: duração e desvio contra o previsto ───────────────────────────────
// Nada aqui inventa regra: duração só existe quando início E fim existem, e o
// desvio só quando alguém estimou. Fora disso o slot fica vazio, não "0 min".

const textoMin = (min: number) => {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
};

function duracaoMin(a: Atividade): number | null {
  if (a.status !== "concluida" || !a.iniciada_at || !a.concluida_at) return null;
  const ms = Date.parse(a.concluida_at) - Date.parse(a.iniciada_at);
  return Number.isFinite(ms) && ms >= 0 ? ms / 60000 : null;
}

/** +7 min de atraso / −5 min contra o previsto. Só quando os dois lados existem. */
function desvioDoPrevisto(a: Atividade): { texto: string; tom: "ok" | "atencao" } | null {
  const dur = duracaoMin(a);
  if (dur === null || !a.tempo_estimado_min) return null;
  const dif = Math.round(dur - a.tempo_estimado_min);
  if (Math.abs(dif) < 1) return { texto: "no previsto", tom: "ok" };
  return dif > 0
    ? { texto: `+${textoMin(dif)} do previsto`, tom: "atencao" }
    : { texto: `−${textoMin(-dif)} do previsto`, tom: "ok" };
}

export function Historico({
  lista: inicial, canceladas = [], colaboradores, itens, grupos = [], modelos, podeAtribuir, podeConfigurar = false, pedido,
}: {
  lista: Atividade[];
  /** As que o banco guarda com status `cancelada` — elas ficam FORA da lista
   *  de trabalho (lib/atividades.ts › foraDaCadeia) e só aparecem aqui. */
  canceladas?: Atividade[];
  colaboradores: Colaborador[];
  itens: ItemDaVisao[];
  grupos?: GrupoDaVisao[];
  modelos: LinhaDeModelo[];
  podeAtribuir: boolean;
  podeConfigurar?: boolean;
  pedido?: PedidoAoHistorico;
}) {
  const router = useRouter();
  const hoje = hojeSP();
  const [dia, setDia] = useState(hoje);
  const [mudadas, setMudadas] = useState<Record<string, Partial<Atividade>>>({});
  const [removidas, setRemovidas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [setor, setSetor] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"" | EstadoNoHistorico>("");
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState<EntradaDaVisao | null>(null);
  const [cancelando, setCancelando] = useState<Atividade | null>(null);

  // O pedido das outras abas. Depende só de `n`: repetir o mesmo clique conta.
  useEffect(() => {
    if (!pedido) return;
    if (pedido.busca !== undefined) setBusca(pedido.busca);
    if (pedido.nova) setEscolhendo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.n]);

  // A lista de trabalho e as canceladas vêm em dois pedidos (a consulta das
  // listas de trabalho corta `cancelada`). Aqui voltam a ser uma coisa só,
  // com as mudanças otimistas por cima.
  const lista = useMemo(() => {
    const vistos = new Set<string>();
    const todas = [...inicial, ...canceladas].filter((a) => {
      if (vistos.has(a.id) || removidas.has(a.id)) return false;
      vistos.add(a.id);
      return true;
    });
    return todas.map((a) => (mudadas[a.id] ? { ...a, ...mudadas[a.id] } : a));
  }, [inicial, canceladas, mudadas, removidas]);

  const porPessoa = useMemo(() => new Map(colaboradores.map((c) => [c.id, c])), [colaboradores]);

  const setorDe = useMemo(() => {
    const m = new Map(colaboradores.map((c) => [c.id, c.setor ?? null]));
    return (a: Atividade) => (a.para_id ? m.get(a.para_id) ?? null : null) ?? a.setor ?? null;
  }, [colaboradores]);

  // Thumbnail do card: a imagem do ITEM do estoque que a atividade produz (o
  // mesmo casamento por nome do pop-up), ou a foto que comprova a produção.
  const imagemDoItem = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of itens) if (i.imagem_url) m.set(norm(i.nome), i.imagem_url);
    return (a: Atividade) =>
      a.foto_url || (a.produto_nome ? m.get(norm(a.produto_nome)) : undefined) || m.get(norm(a.categoria)) || null;
  }, [itens]);

  const setores = useMemo(
    () => [...new Set(lista.map(setorDe).filter((s): s is string => !!s))].sort((x, y) => x.localeCompare(y, "pt-BR")),
    [lista, setorDe],
  );

  const filtradas = useMemo(() => {
    const q = norm(busca);
    return lista.filter((a) => (!pessoa || a.para_id === pessoa)
      && (!setor || setorDe(a) === setor)
      && (!estadoFiltro || estadoNoHistorico(a, hoje) === estadoFiltro)
      && (!q || norm(a.tarefa).includes(q) || norm(a.categoria).includes(q) || norm(a.para_nome).includes(q)));
  }, [lista, busca, pessoa, setor, estadoFiltro, setorDe, hoje]);

  const filtrando = !!(busca || pessoa || setor || estadoFiltro);

  const blocos = useMemo(() => linhaDoTempo(filtradas, dia), [filtradas, dia]);
  const deAntes = useMemo(() => (dia === hoje ? abertasDeAntes(filtradas, dia) : []), [filtradas, dia, hoje]);

  // Resumo do dia: contagem por estado + tempo somado das concluídas medidas.
  const resumo = useMemo(() => {
    const conta: Record<EstadoNoHistorico, number> = { concluida: 0, em_andamento: 0, pendente: 0, atrasada: 0, cancelada: 0 };
    let total = 0;
    let minutos = 0;
    let medidas = 0;
    for (const b of blocos) for (const e of b.itens) {
      conta[estadoNoHistorico(e.a, hoje)]++;
      total++;
      const d = duracaoMin(e.a);
      if (d !== null) { minutos += d; medidas++; }
    }
    return { conta, total, minutos, medidas };
  }, [blocos, hoje]);

  const horaAgora = dia === hoje ? noFusoSP(new Date().toISOString())?.hora ?? null : null;
  const detalhe = detalheId ? lista.find((a) => a.id === detalheId) ?? null : null;

  async function mover(a: Atividade, status: Atividade["status"]) {
    const antes = { status: a.status, impedida: a.impedida, concluida_at: a.concluida_at };
    setMudadas((m) => ({
      ...m,
      [a.id]: { ...m[a.id], status, ...(status === "pendente" ? { impedida: false, motivo_impedimento: null } : {}) },
    }));
    const r = await fetch("/api/atividades", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, status }),
    }).catch(() => null);
    if (!r || !r.ok) {
      setMudadas((m) => ({ ...m, [a.id]: { ...m[a.id], ...antes } }));
      toast.erro("Não foi possível mudar agora.");
      return;
    }
    router.refresh();
  }

  async function confirmarCancelamento(a: Atividade, motivo: string) {
    const antes = { status: a.status, motivo_impedimento: a.motivo_impedimento ?? null };
    setMudadas((m) => ({ ...m, [a.id]: { ...m[a.id], status: "cancelada", motivo_impedimento: motivo || "Cancelada" } }));
    setCancelando(null);
    const r = await fetch("/api/atividades", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, status: "cancelada", motivo: motivo || null }),
    }).catch(() => null);
    if (!r || !r.ok) {
      setMudadas((m) => ({ ...m, [a.id]: { ...m[a.id], ...antes } }));
      toast.erro("Não foi possível cancelar agora.");
      return;
    }
    toast.ok("Atividade cancelada.");
    router.refresh();
  }

  async function excluir(a: Atividade) {
    const vai = await confirmar(`Excluir "${a.tarefa}"?`, {
      detalhe: "Some do histórico pra sempre. Pra guardar o registro, prefira Cancelar.", perigo: true,
    });
    if (!vai) return;
    setDetalheId(null);
    setRemovidas((s) => new Set(s).add(a.id));
    const r = await fetch(`/api/atividades?id=${encodeURIComponent(a.id)}`, { method: "DELETE" }).catch(() => null);
    if (!r || !r.ok) {
      setRemovidas((s) => { const n = new Set(s); n.delete(a.id); return n; });
      toast.erro("Não foi possível excluir agora.");
      return;
    }
    router.refresh();
  }

  const campo: CSSProperties = { minHeight: "var(--tap)", minWidth: 0 };

  return (
    // `.tf-scope`: a camada premium do Tridify (superfície sólida, hairline,
    // escala tipográfica --tf-fs-*). Reusada, não copiada — o card daqui deve
    // ser IGUAL ao de lá, e igual só fica quem lê os mesmos tokens.
    <section className="tf-scope ha" style={{ display: "grid", gap: 14, minWidth: 0 }}>
      {/* ── Cabeçalho: título + navegação do dia ─────────────────────────── */}
      <div className="ha-topo">
        <div style={{ minWidth: 0 }}>
          <h2 className="ha-titulo">Histórico de Atividades</h2>
          <p className="ha-sub">
            {dia === hoje ? `Hoje · ${diaPorExtenso(dia).toLowerCase()}` : diaPorExtenso(dia)}
          </p>
        </div>
        <div className="ha-topo-acoes">
          <div role="group" aria-label="Dia" className="ha-dia">
            <BotaoIcone icone="chevron-left" titulo="Dia anterior" onClick={() => setDia((d) => somaDias(d, -1))} />
            <GlassDate value={dia} onChange={(v) => v && setDia(v.slice(0, 10))} clearable={false} aria-label="Escolher dia" style={{ width: 148 }} />
            <BotaoIcone icone="chevron-right" titulo="Próximo dia" onClick={() => setDia((d) => somaDias(d, 1))} />
            <Botao tamanho="sm" onClick={() => setDia(hoje)} disabled={dia === hoje}>Hoje</Botao>
          </div>
          {podeAtribuir && (
            <Botao variante="primario" icone="plus" onClick={() => setEscolhendo(true)}>Nova atividade</Botao>
          )}
        </div>
      </div>

      {/* ── Resumo do dia: contagens + tempo trabalhado. Chave de leitura dos
             cards, não dashboard — cada estado é também um filtro. ────────── */}
      <div aria-label="Resumo do dia" className="ha-resumo">
        <span className="ha-resumo-total">
          <strong>{resumo.total}</strong> {resumo.total === 1 ? "atividade" : "atividades"}
        </span>
        {ORDEM_ESTADOS.filter((e) => resumo.conta[e] > 0 || e !== "cancelada").map((e) => (
          <button key={e} type="button" className="ha-resumo-chip"
            data-on={estadoFiltro === e ? "1" : undefined}
            aria-pressed={estadoFiltro === e}
            onClick={() => setEstadoFiltro((v) => (v === e ? "" : e))}>
            <span aria-hidden className="ha-ponto" style={{ background: ESTADOS[e].cor }} />
            {ESTADOS[e].titulo} <b>{resumo.conta[e]}</b>
          </button>
        ))}
        {resumo.medidas > 0 && (
          <span className="ha-resumo-tempo" title={`Somado de ${resumo.medidas} ${resumo.medidas === 1 ? "atividade concluída com início e fim" : "atividades concluídas com início e fim"}`}>
            <Icon name="clock" size={13} color="var(--text-dim)" />
            {textoMin(resumo.minutos)} trabalhados
          </span>
        )}
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="ha-filtros">
        <div className="ha-busca">
          <span aria-hidden className="ha-busca-ic">
            <Icon name="search" size={16} color="var(--text-dim)" />
          </span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar atividade..." aria-label="Buscar no histórico" />
        </div>
        <GlassSelect value={pessoa} onChange={setPessoa} aria-label="Filtrar por colaborador" searchable
          options={[{ value: "", label: "Todos os colaboradores" }, ...colaboradores.map((c) => ({ value: c.id, label: c.nome }))]}
          style={{ ...campo, flex: "1 1 min(100%, 190px)" }} />
        {setores.length > 1 && (
          <GlassSelect value={setor} onChange={setSetor} aria-label="Filtrar por setor"
            options={[{ value: "", label: "Todos os setores" }, ...setores.map((s) => ({ value: s, label: s }))]}
            style={{ ...campo, flex: "1 1 min(100%, 160px)" }} />
        )}
        <GlassSelect value={estadoFiltro} onChange={(v) => setEstadoFiltro(v as "" | EstadoNoHistorico)} aria-label="Filtrar por status"
          options={[{ value: "", label: "Todos os status" }, ...ORDEM_ESTADOS.map((e) => ({ value: e, label: ESTADOS[e].titulo }))]}
          style={{ ...campo, flex: "1 1 min(100%, 160px)" }} />
      </div>

      {/* O que ficou aberto de outros dias fica recolhido: a leitura principal é
          a do dia, e com trinta pendências velhas a primeira hora ia parar
          fora da tela. */}
      {deAntes.length > 0 && (
        <Secao icone="history" titulo="Abertas de outros dias"
          resumo={`${deAntes.length} ${deAntes.length === 1 ? "lançada antes de hoje" : "lançadas antes de hoje"}`}>
          <div className="ha-grade" style={{ padding: "4px 16px 16px" }}>
            {deAntes.map((a) => (
              <CardAtividade key={a.id} a={a} hoje={hoje} onAbrir={() => setDetalheId(a.id)}
                pessoa={a.para_id ? porPessoa.get(a.para_id) : undefined} imagem={imagemDoItem(a)}
                tempo={`Lançada ${dataHora(a.created_at)}`} />
            ))}
          </div>
        </Secao>
      )}

      {/* ── A linha do tempo. `key={dia}` refaz a entrada em cascata ao trocar
             de data — o feedback de que a tela inteira mudou de assunto. ──── */}
      <div key={dia} className="ha-timeline" style={{ display: "grid", minWidth: 0 }}>
        {resumo.total === 0 && deAntes.length === 0 && (
          <div className="ha-vazio-dia">
            <span className="ha-vazio-ic" aria-hidden><Icon name="calendar-off" size={22} color="var(--text-dim)" /></span>
            <div>
              <strong>{filtrando ? "Nenhuma atividade encontrada." : "Nenhuma atividade registrada neste período."}</strong>
              <p>
                {filtrando
                  ? "Afrouxe a busca ou os filtros — o dia pode ter atividades que ficaram de fora do recorte."
                  : "Nada foi lançado, iniciado nem concluído neste dia."}
              </p>
            </div>
          </div>
        )}
        {blocos.map((b, i) => {
          const conta: Partial<Record<EstadoNoHistorico, number>> = {};
          for (const e of b.itens) {
            const est = estadoNoHistorico(e.a, hoje);
            conta[est] = (conta[est] ?? 0) + 1;
          }
          const partes = ORDEM_ESTADOS.filter((e) => conta[e]).map((e) => `${conta[e]} ${ESTADOS[e].titulo.toLowerCase()}`);
          return (
            <div key={b.hora} role="group" aria-label={`${rotuloDaHora(b.hora)} · ${b.itens.length}`}
              className="ha-bloco" data-agora={b.hora === horaAgora ? "1" : undefined}
              data-zebra={i % 2 === 1 ? "1" : undefined}
              style={{ "--fila": i } as CSSProperties}>
              <div className="ha-hora">
                <span className="ha-hora-ponto" aria-hidden />
                <strong>{rotuloDaHora(b.hora)}</strong>
                {b.hora === horaAgora && <span className="ha-agora">Agora</span>}
                {b.itens.length > 0 && (
                  <span className="ha-hora-resumo">
                    {b.itens.length === 1 ? "1 atividade" : `${b.itens.length} atividades`}
                    {partes.length > 1 ? ` · ${partes.join(" · ")}` : ""}
                  </span>
                )}
              </div>
              <div className="ha-grade">
                {b.itens.length === 0
                  ? <p className="ha-bloco-vazio">Nada neste horário.</p>
                  : b.itens.map((e) => (
                    <CardAtividade key={e.a.id} a={e.a} hoje={hoje} onAbrir={() => setDetalheId(e.a.id)}
                      pessoa={e.a.para_id ? porPessoa.get(e.a.para_id) : undefined} imagem={imagemDoItem(e.a)}
                      tempo={`${VERBO[e.momento]} ${e.hhmm}`} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {detalhe && (
        <DetalheAtividade a={detalhe} hoje={hoje} podeAtribuir={podeAtribuir}
          pessoa={detalhe.para_id ? porPessoa.get(detalhe.para_id) : undefined}
          setor={setorDe(detalhe)} imagem={imagemDoItem(detalhe)}
          onFechar={() => setDetalheId(null)}
          onMover={(s) => { mover(detalhe, s); }}
          onCancelar={() => { setCancelando(detalhe); setDetalheId(null); }}
          onExcluir={() => excluir(detalhe)} />
      )}
      {cancelando && (
        <PopCancelar a={cancelando} onFechar={() => setCancelando(null)}
          onConfirmar={(motivo) => confirmarCancelamento(cancelando, motivo)} />
      )}
      {escolhendo && (
        <EscolherItem itens={itens} grupos={grupos}
          onCriarDoZero={() => { setEscolhendo(false); setCriando(true); }}
          onFechar={() => setEscolhendo(false)}
          onEscolher={(e) => { setEscolhendo(false); setAberto(e); }} />
      )}
      {criando && <CriarAtividade colaboradores={colaboradores} onFechar={() => setCriando(false)} />}
      {aberto && (
        <LancadorDeAtividade key={aberto.id}
          item={aberto.tipo === "item" ? aberto.item : undefined}
          grupo={aberto.tipo === "grupo" ? { nome: aberto.nome, itens: aberto.itens } : undefined}
          lista={lista} modelos={modelos} colaboradores={colaboradores}
          podeAtribuir={podeAtribuir} podeConfigurar={podeConfigurar}
          onFechar={() => setAberto(null)} onAbrirQuadro={() => setAberto(null)} />
      )}

      <style>{CSS}</style>
    </section>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
// Hierarquia: tarefa em cima (o QUE), pessoa embaixo (QUEM), tempo à direita
// (QUANDO/QUANTO). Cor de estado como apoio — chip tingido e pontinho, nunca
// barra lateral (regra "Substituídos" do DEVKIT). Slots de tempo reservados:
// card sem duração ocupa o mesmo pé de um card completo.

const corta: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

function Etiqueta({ estado }: { estado: EstadoNoHistorico }) {
  const e = ESTADOS[estado];
  return (
    <span className="ha-chip" style={{ color: e.cor, background: `color-mix(in srgb, ${e.cor} 12%, transparent)` }}>
      <Icon name={e.icone} size={12} color={e.cor} /> {e.titulo}
    </span>
  );
}

/**
 * Card no desenho do Tridify (TfKit): micro-rótulo maiúsculo, valor em realce
 * tabular, chip de ícone com tinta a 12%, hairline, SLOTS RESERVADOS — a faixa
 * de tempo tem sempre as quatro células (Planejado / Início / Conclusão /
 * Duração), com "—" onde o dado não existe, pra fileira inteira alinhar.
 * Tudo que a atividade sabe está NO card: quem (avatar+nome), o quê
 * (thumb+nome+descrição), estado, prioridade, horários, duração, desvio,
 * setor e categoria. O detalhe fica pra cronologia e as ações.
 */
function CardAtividade({ a, hoje, tempo, pessoa, imagem, onAbrir }: {
  a: Atividade; hoje: string; tempo: string; pessoa?: Colaborador; imagem: string | null; onAbrir: () => void;
}) {
  const estado = estadoNoHistorico(a, hoje);
  const prio = prioridadeDe(a);
  const dur = duracaoMin(a);
  const desvio = desvioDoPrevisto(a);
  const motivo = estado === "cancelada"
    ? a.motivo_impedimento || (a.impedida ? "Recusada por quem ia fazer" : null)
    : null;
  const nome = responsavel(a);
  const hhmm = (iso: string | null) => (iso ? noFusoSP(iso)?.hhmm ?? "—" : "—");

  return (
    <button type="button" onClick={onAbrir} className="ha-card" aria-label={`${a.tarefa} · ${ESTADOS[estado].titulo}`}
      data-andando={estado === "em_andamento" ? "1" : undefined}
      data-cancelada={estado === "cancelada" ? "1" : undefined}>
      {/* Topo: estado + prioridade à esquerda, o momento no dia à direita */}
      <div className="ha-card-topo">
        <Etiqueta estado={estado} />
        {prio === "alta" && (
          <span className="ha-chip" style={{ color: "var(--perigo)", background: "color-mix(in srgb, var(--perigo) 10%, transparent)" }}>
            <Icon name="flame" size={12} color="var(--perigo)" /> Alta
          </span>
        )}
        <span className="ha-quando">{tempo}</span>
      </div>

      {/* Meio: a foto do colaborador AO LADO do nome da atividade (pedido de
          22/09), com o nome da pessoa embaixo — o rodapé de pessoa saiu, é o
          que compacta o card. Thumb da peça, quando existe, na ponta direita. */}
      <div className="ha-card-meio">
        <Avatar url={pessoa?.fotoUrl} nome={nome} size={26} formato="redondo" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ha-tarefa">{a.tarefa}</div>
          <div className="ha-pessoa-nome">{nome}</div>
        </div>
        {imagem && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagem} alt="" aria-hidden className="ha-thumb" loading="lazy" />
        )}
      </div>

      {/* Slot SEMPRE presente (regra do TfKit): motivo do cancelamento >
          descrição > vazio. É o que deixa toda a fileira do mesmo pé. */}
      <div className="ha-apoio" data-perigo={motivo ? "1" : undefined} data-vazio={motivo || a.detalhe ? undefined : "1"}>
        {motivo || a.detalhe || " "}
      </div>

      {/* Faixa de tempo em DUAS linhas fixas (pedido de 22/09): o realizado em
          cima (Início · Concluído), o plano embaixo (Planejado · Duração). */}
      <div className="ha-tempo-faixa">
        <span><i>Início</i><b>{hhmm(a.iniciada_at)}</b></span>
        <span><i>Concluído</i><b>{a.status === "concluida" ? hhmm(a.concluida_at) : "—"}</b></span>
        <span><i>Planejado</i><b>{a.tempo_estimado_min ? textoMin(a.tempo_estimado_min) : "—"}</b></span>
        <span>
          <i>Duração</i>
          <b>
            {dur !== null ? textoMin(dur) : "—"}
            {desvio && desvio.texto !== "no previsto" && (
              <em data-tom={desvio.tom}>{desvio.texto.split(" do previsto")[0]}</em>
            )}
          </b>
        </span>
      </div>

      {/* Quantidade feita × pedida numa linha própria — slot sempre presente. */}
      <div className="ha-qtd">
        <i>Feitas</i>
        <b>{a.quantidade_alvo > 1 ? `${a.quantidade_feita} / ${a.quantidade_alvo}` : "—"}</b>
      </div>
    </button>
  );
}

const responsavel = (a: Atividade) => a.para_nome ?? (a.pool ? `Tablet · ${a.setor ?? "pool"}` : "Sem dono");

const dataHora = (iso: string | null) => {
  if (!iso) return "—";
  const f = noFusoSP(iso);
  return f ? `${f.dia.slice(8, 10)}/${f.dia.slice(5, 7)} ${f.hhmm}` : "—";
};

// ── Detalhe ─────────────────────────────────────────────────────────────────
// O que não cabe no card: cronologia do que aconteceu, o tempo contra o
// previsto, e as ações que o kanban tinha em cada cartão.

function DetalheAtividade({ a, hoje, podeAtribuir, pessoa, setor, imagem, onFechar, onMover, onCancelar, onExcluir }: {
  a: Atividade; hoje: string; podeAtribuir: boolean; pessoa?: Colaborador; setor: string | null; imagem: string | null;
  onFechar: () => void;
  onMover: (s: Atividade["status"]) => void; onCancelar: () => void; onExcluir: () => void;
}) {
  const estado = estadoNoHistorico(a, hoje);
  const prazo = rotuloDoPrazo(a.prazo, hoje);
  const dur = duracaoMin(a);
  const desvio = desvioDoPrevisto(a);
  const nome = responsavel(a);

  const cronologia: { icone: string; rotulo: string; quando: string | null; extra?: string }[] = [
    { icone: "send", rotulo: "Lançada", quando: a.created_at, extra: `por ${a.por_nome}` },
    { icone: "player-play", rotulo: "Iniciada", quando: a.iniciada_at },
    { icone: "check", rotulo: "Concluída", quando: a.status === "concluida" ? a.concluida_at : null },
  ];

  const linhas: [string, ReactNode][] = [
    ["Status", <Etiqueta key="s" estado={estado} />],
    ["Prazo", prazo ? prazo.texto : "—"],
    ["Prioridade", ROTULO_PRIORIDADE[prioridadeDe(a)]],
    ["Categoria", a.categoria],
  ];
  if (setor) linhas.push(["Setor", setor]);
  if (a.quantidade_alvo > 1) linhas.push(["Quantidade", `${a.quantidade_feita} de ${a.quantidade_alvo}`]);
  if (a.produto_nome) linhas.push(["Produto", a.produto_nome]);

  return (
    <Modal onFechar={onFechar} icone={ESTADOS[estado].icone} tamanho="md"
      titulo={a.tarefa} subtitulo={a.categoria}
      rodape={podeAtribuir ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
          {estado === "cancelada"
            ? <Botao variante="perigo" icone="trash" onClick={onExcluir}>Excluir</Botao>
            : <Botao variante="perigo" icone="ban" onClick={onCancelar}>Cancelar</Botao>}
          <span style={{ flex: 1 }} />
          {a.status !== "pendente" && <Botao variante="secundario" icone="chevron-left" onClick={() => { onMover("pendente"); onFechar(); }}>Pendente</Botao>}
          {a.status !== "em_andamento" && a.status !== "concluida" && <Botao variante="secundario" icone="player-play" onClick={() => { onMover("em_andamento"); onFechar(); }}>Em andamento</Botao>}
          {a.status !== "concluida" && <Botao variante="primario" icone="check" onClick={() => { onMover("concluida"); onFechar(); }}>Concluir</Botao>}
        </div>
      ) : undefined}>
      <div className="ha" style={{ display: "grid", gap: 16, minWidth: 0 }}>
        {/* Quem faz — com a cara da pessoa, não só o nome. */}
        <div>
          <RotuloSecao>Responsável</RotuloSecao>
          <div className="ha-det-pessoa">
          <Avatar url={pessoa?.fotoUrl} nome={nome} size={44} formato="redondo" />
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 14.5, display: "block", ...corta }}>{nome}</strong>
            {(setor || pessoa?.departamento) && (
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
                {[setor, pessoa?.departamento].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          {imagem && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagem} alt="" aria-hidden className="ha-det-thumb" />
          )}
          </div>
        </div>

        {/* Cronologia: o fio do que aconteceu, na ordem. Passo sem data fica
            apagado — o slot existe, o dado é que não. */}
        <div>
          <RotuloSecao>Cronologia</RotuloSecao>
          <ol className="ha-crono">
            {cronologia.map((p) => (
              <li key={p.rotulo} data-vazio={p.quando ? undefined : "1"}>
                <span className="ha-crono-ic" aria-hidden><Icon name={p.icone} size={13} color={p.quando ? "var(--primary-texto)" : "var(--text-dim)"} /></span>
                <span className="ha-crono-rot">{p.rotulo}</span>
                <span className="ha-crono-quando">
                  {p.quando ? dataHora(p.quando) : "—"}
                  {p.quando && p.extra ? <span className="ha-crono-extra"> · {p.extra}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Tempo: previsto × realizado, lado a lado. */}
        <div>
          <RotuloSecao>Tempo</RotuloSecao>
          <div className="ha-tempo">
            <TempoCela rotulo="Previsto" valor={a.tempo_estimado_min ? textoMin(a.tempo_estimado_min) : "—"} />
            <TempoCela rotulo="Início" valor={a.iniciada_at ? noFusoSP(a.iniciada_at)?.hhmm ?? "—" : "—"} />
            <TempoCela rotulo="Conclusão" valor={a.status === "concluida" && a.concluida_at ? noFusoSP(a.concluida_at)?.hhmm ?? "—" : "—"} />
            <TempoCela rotulo="Duração" valor={dur !== null ? textoMin(dur) : "—"}
              nota={desvio ? { texto: desvio.texto, tom: desvio.tom } : undefined} />
          </div>
        </div>

        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: "12px 16px" }}>
          {linhas.map(([k, v]) => (
            <div key={k} style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <dt className="ha-rotulo">{k}</dt>
              <dd style={{ margin: 0, fontSize: 14, overflowWrap: "anywhere" }}>{v}</dd>
            </div>
          ))}
        </dl>

        {a.detalhe && <Texto titulo="Descrição">{a.detalhe}</Texto>}
        {(a.motivo_impedimento || a.impedida) && (
          <Texto titulo="Observação" cor="var(--perigo)">{a.motivo_impedimento || "Recusada por quem ia fazer"}</Texto>
        )}
        {a.foto_url && (
          <div style={{ display: "grid", gap: 6 }}>
            <RotuloSecao>Foto</RotuloSecao>
            <a href={a.foto_url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.foto_url} alt={`Foto de ${a.tarefa}`} style={{ maxWidth: "100%", maxHeight: 240, borderRadius: "var(--r-sm)", display: "block" }} />
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RotuloSecao({ children }: { children: ReactNode }) {
  return <span className="ha-rotulo" style={{ display: "block", marginBottom: 8 }}>{children}</span>;
}

function TempoCela({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: { texto: string; tom: "ok" | "atencao" } }) {
  return (
    <div className="ha-tempo-cela">
      <span className="ha-rotulo">{rotulo}</span>
      <strong>{valor}</strong>
      {nota && <span className="ha-tempo-nota" data-tom={nota.tom}>{nota.texto}</span>}
    </div>
  );
}

function Texto({ titulo, cor, children }: { titulo: string; cor?: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <RotuloSecao>{titulo}</RotuloSecao>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: cor ?? "var(--text)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</p>
    </div>
  );
}

// ── Pop-up: cancelar com motivo ─────────────────────────────────────────────
// O motivo é o que separa "cancelada" de "sumiu": quem abre o histórico semana que
// vem precisa saber por que aquela peça não foi feita.

function PopCancelar({ a, onFechar, onConfirmar }: {
  a: Atividade; onFechar: () => void; onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <PainelLateral centrado largura={480} onFechar={onFechar} soFechaNoX
      titulo="Cancelar atividade" subtitulo={a.tarefa}
      rodape={(
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", width: "100%" }}>
          <Botao variante="sutil" onClick={onFechar}>Voltar</Botao>
          <Botao variante="perigo" icone="ban" onClick={() => onConfirmar(motivo.trim())}>Cancelar atividade</Botao>
        </div>
      )}>
      <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.45 }}>
          Ela sai da fila de quem faz e fica no histórico como Cancelada, com o motivo. Nada é apagado.
        </p>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>Motivo</span>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
            placeholder="Ex.: pedido cancelado pelo cliente"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", font: "inherit", fontSize: 14, resize: "vertical" }} />
        </label>
      </div>
    </PainelLateral>
  );
}

// ── Pop-up: escolher o item antes de enviar ─────────────────────────────────
// A Visão geral entra no pop-up pelo cartão do item. Aqui não há cartão, então
// o primeiro passo é a lista dos mesmos itens — daí em diante é o mesmo
// LancadorDeAtividade, com as mesmas regras de quem pode receber.

export function EscolherItem({ itens, grupos, onFechar, onEscolher, onCriarDoZero }: {
  itens: ItemDaVisao[]; grupos: GrupoDaVisao[];
  onFechar: () => void; onEscolher: (e: EntradaDaVisao) => void;
  /** Atividade que não é de item nenhum ("Limpar a máquina"). */
  onCriarDoZero?: () => void;
}) {
  const [busca, setBusca] = useState("");
  const entradas = useMemo(() => entradasDaVisao(itens, grupos), [itens, grupos]);
  const visiveis = useMemo(() => {
    const q = norm(busca);
    return q ? entradas.filter((e) => norm(e.nome).includes(q)) : entradas;
  }, [entradas, busca]);

  return (
    <PainelLateral centrado largura={560} onFechar={onFechar}
      titulo="Nova atividade" subtitulo="Crie uma atividade do zero, ou escolha o item — as atividades dele aparecem no passo seguinte.">
      <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
        {onCriarDoZero && (
          <Botao variante="primario" icone="plus" bloco onClick={onCriarDoZero}>Criar atividade do zero</Botao>
        )}
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item..." aria-label="Buscar item"
          style={{ width: "100%", boxSizing: "border-box", minHeight: "var(--tap)", padding: "9px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14 }} />
        {entradas.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>
            Nenhum item na Visão geral ainda. Escolha os produtos por lá e eles aparecem aqui.
          </p>
        )}
        {entradas.length > 0 && visiveis.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>Nada com esse nome.</p>
        )}
        <div style={{ display: "grid", gap: 6 }}>
          {visiveis.map((e) => (
            <button key={e.id} type="button" onClick={() => onEscolher(e)}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: "var(--tap)", padding: "10px 12px",
                borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
                textAlign: "left", font: "inherit", cursor: "pointer", minWidth: 0,
              }}>
              <span aria-hidden style={{ flex: "none", width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: "var(--r-sm)", background: "color-mix(in srgb, var(--primary) 11%, transparent)" }}>
                <Icon name={e.tipo === "grupo" ? "folder" : "box"} size={17} color="var(--primary-texto)" />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 700, ...corta }}>{e.nome}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", ...corta }}>
                  {e.tipo === "grupo"
                    ? `${e.itens.length} ${e.itens.length === 1 ? "item" : "itens"}`
                    : hierarquiaLabel(e.item.hierarquia)}
                </span>
              </span>
              <Icon name="chevron-right" size={16} color="var(--text-dim)" />
            </button>
          ))}
        </div>
      </div>
    </PainelLateral>
  );
}

// ── Estilo ──────────────────────────────────────────────────────────────────
// Tudo em token semântico e escala de movimento da fundação. Cor de estado é
// apoio (chip tingido a 12%, pontinho de 8px) — nunca barra lateral. Trilho da
// timeline no desktop, cabeçalho de bloco no celular: mesma DOM, só CSS.

const CSS = `
.ha-topo {
  display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap;
  justify-content: space-between; min-width: 0;
}
.ha-titulo { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.01em; }
.ha-sub { margin: 2px 0 0; font-size: 13px; color: var(--text-dim); }
.ha-topo-acoes { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; min-width: 0; }
.ha-dia {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  padding: 3px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface);
}

/* ── Resumo do dia ── */
.ha-resumo {
  display: flex; gap: 6px 8px; flex-wrap: wrap; align-items: center;
  font-size: 12.5px; color: var(--text-dim); min-width: 0;
}
.ha-resumo-total { font-size: 13px; margin-right: 4px; }
.ha-resumo-total strong { font-size: 15px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
.ha-resumo-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text-dim); font: inherit; font-size: 12.5px; font-weight: 600;
  transition: background var(--duration-fast, 150ms) var(--ease-out, ease),
              border-color var(--duration-fast, 150ms) var(--ease-out, ease);
}
.ha-resumo-chip b { color: var(--text); font-weight: 800; font-variant-numeric: tabular-nums; }
.ha-resumo-chip:hover { background: var(--surface-2); }
.ha-resumo-chip[data-on="1"] {
  border-color: color-mix(in srgb, var(--primary) 45%, transparent);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--text);
}
.ha-ponto { width: 8px; height: 8px; border-radius: 999px; flex: none; }
.ha-resumo-tempo {
  display: inline-flex; align-items: center; gap: 5px; margin-left: auto;
  font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums;
}

/* ── Filtros ── */
.ha-filtros { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; min-width: 0; }
.ha-busca { position: relative; flex: 1 1 min(100%, 220px); min-width: 0; }
.ha-busca-ic { position: absolute; left: 12px; top: 0; bottom: 0; display: grid; place-items: center; pointer-events: none; }
.ha-busca input {
  width: 100%; box-sizing: border-box; min-height: var(--tap);
  padding: 9px 12px 9px 36px; border-radius: var(--r-sm);
  border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 14px;
}

/* ── Timeline ── */
/* Carrossel (pedido de 22/09): uma fileira só; excedeu a largura, rola DENTRO
   do bloco com encaixe — nunca a página. Cards de largura fixa pra fileira
   ter ritmo; stretch mantém todos do mesmo pé. */
.ha-grade {
  display: grid; gap: 9px; align-items: stretch; min-width: 0;
  grid-auto-flow: column; grid-auto-columns: min(100%, 270px);
  overflow-x: auto; overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  /* padding uniforme: é a moldura da zebra — igual com e sem fundo, pra
     nenhum card mudar de lugar quando a listra alterna. */
  padding: 8px; border-radius: var(--tf-r-md, 12px);
}
.ha-grade > * { scroll-snap-align: start; }
.ha-bloco {
  display: grid; gap: 6px 18px; grid-template-columns: 148px minmax(0, 1fr);
  padding: 10px 0; min-width: 0; position: relative;
}
/* Zebra estilo planilha (pedido de 22/09), SÓ na esteira dos cards: pintar o
   bloco inteiro atravessava o trilho e a coluna das horas e parecia um
   retângulo solto. Tinta do texto a 3,5% funciona nos DOIS temas. */
.ha-bloco[data-zebra="1"] .ha-grade { background: color-mix(in srgb, var(--text) 3.5%, transparent); }
/* O trilho: um fio contínuo atrás da coluna das horas, com um ponto por bloco.
   Termina em transform NENHUM lugar — é tudo estático, sem contexto novo. */
.ha-bloco::before {
  content: ""; position: absolute; left: 5px; top: 0; bottom: 0; width: 1px;
  background: var(--border);
}
.ha-bloco:first-child::before { top: 18px; }
.ha-bloco:last-child::before { bottom: auto; height: 18px; }
.ha-hora { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding-top: 2px; position: relative; min-width: 0; }
.ha-hora > strong {
  font-size: 13.5px; font-weight: 800; font-variant-numeric: tabular-nums;
  color: var(--text); white-space: nowrap; letter-spacing: -0.01em;
}
.ha-hora-ponto {
  position: absolute; top: 6px;
  width: 7px; height: 7px; border-radius: 999px;
  background: var(--border); box-shadow: 0 0 0 3px var(--bg);
}
.ha-bloco[data-agora="1"] .ha-hora-ponto { background: var(--primary-texto); }
.ha-bloco[data-agora="1"] .ha-hora > strong { color: var(--primary-texto); }
.ha-agora {
  font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px;
  color: var(--primary-texto); background: color-mix(in srgb, var(--primary) 13%, transparent);
  text-transform: uppercase; letter-spacing: 0.5px;
}
.ha-hora-resumo { font-size: 11.5px; color: var(--text-dim); line-height: 1.45; overflow-wrap: anywhere; }
.ha-bloco-vazio { margin: 0; font-size: 12.5px; color: var(--text-dim); padding: 3px 0; }

/* A hora vem de um trilho, não de uma pilha de caixas: os blocos respiram pelo
   espaçamento, e a régua é o fio à esquerda. O deslocamento da coluna das
   horas (padding no ponto) posiciona o ponto SOBRE o fio. */
.ha-bloco { padding-left: 22px; }
.ha-hora-ponto { left: -20.5px; }

/* Entrada em cascata ao trocar de dia (key={dia} remonta a lista). Termina em
   transform: none — nunca translateY(0). */
@keyframes ha-entra { from { opacity: 0; transform: translateY(var(--distance-sm, 6px)); } to { opacity: 1; transform: none; } }
.ha-timeline .ha-bloco {
  animation: ha-entra var(--duration-normal, 250ms) var(--ease-out, ease) both;
  animation-delay: calc(min(var(--fila, 0), 8) * 28ms);
}
@media (prefers-reduced-motion: reduce) { .ha-timeline .ha-bloco { animation: none; } }

/* ── Card (gramática do TfKit: hairline, superfície sólida do escopo,
      micro-rótulo 800 maiúsculo, valor em realce tabular) ── */
.ha-card {
  display: grid; gap: 6px; padding: 10px 11px; min-width: 0; min-height: var(--tap);
  height: 100%; box-sizing: border-box; align-content: start;
  text-align: left; font: inherit; color: var(--text); cursor: pointer;
  border: 1px solid var(--tf-line, var(--border)); border-radius: var(--tf-r-md, 12px);
  background: var(--surface);
  transition: border-color var(--duration-fast, 150ms) var(--ease-out, ease),
              box-shadow var(--duration-fast, 150ms) var(--ease-out, ease),
              background var(--duration-fast, 150ms) var(--ease-out, ease);
}
.ha-card:hover {
  background: var(--surface-3, var(--surface-2));
  border-color: color-mix(in srgb, var(--text) 18%, transparent);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--text) 7%, transparent);
}
/* O hover global do .tf-scope clareia todo botão; num card grande o brilho
   inteiro é pesado — a resposta aqui é a superfície elevada, como nas linhas
   de tabela da Tridify. */
.tf-scope .ha-card:not(:disabled):hover { filter: none; }

/* Faixa de tempo: quatro células fixas, slots sempre presentes. */
.ha-tempo-faixa {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 8px;
  padding: 6px 9px; border-radius: var(--tf-r-sm, 9px);
  background: var(--surface-2); border: 1px solid var(--tf-line-soft, transparent);
}
.ha-tempo-faixa > span { display: grid; gap: 1px; min-width: 0; }
.ha-tempo-faixa i {
  font-style: normal; font-size: var(--tf-fs-micro, 11px); font-weight: 800;
  color: var(--text-dim); text-transform: uppercase; letter-spacing: .03em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ha-tempo-faixa b {
  font-size: 12.5px; font-weight: 700;
  font-variant-numeric: tabular-nums; white-space: nowrap;
  /* wrap, não overflow hidden: apertou, o "+2 min" desce de linha inteiro —
     cortado ele vira "+2…", que é pior que não mostrar. */
  display: flex; align-items: baseline; gap: 2px 5px; min-width: 0; flex-wrap: wrap;
}
.ha-tempo-faixa em {
  font-style: normal; font-size: var(--tf-fs-micro, 11px); font-weight: 800;
}
.ha-tempo-faixa em[data-tom="ok"] { color: var(--ok); }
.ha-tempo-faixa em[data-tom="atencao"] { color: var(--atencao); }

.ha-card[data-cancelada="1"] { opacity: 0.75; }
.ha-card[data-cancelada="1"] .ha-tarefa { text-decoration: line-through; text-decoration-color: var(--text-dim); }

/* Em andamento: um fio vivo, sem pintar o card. O pulso respeita reduce. */
.ha-card[data-andando="1"] { border-color: color-mix(in srgb, var(--primary) 38%, var(--border)); }
@keyframes ha-pulsa { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.ha-card[data-andando="1"] .ha-card-topo > .ha-chip:first-child svg { animation: ha-pulsa 1.8s var(--ease-in-out, ease-in-out) infinite; }
@media (prefers-reduced-motion: reduce) { .ha-card[data-andando="1"] .ha-card-topo > .ha-chip:first-child svg { animation: none; } }

.ha-card-topo { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ha-chip {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap;
}
.ha-quando {
  margin-left: auto; font-size: 11.5px; color: var(--text-dim);
  font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ha-card-meio { display: flex; gap: 8px; align-items: flex-start; min-width: 0; }
.ha-thumb {
  flex: none; width: 34px; height: 34px; object-fit: cover;
  border-radius: var(--r-sm); background: var(--surface-2);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent);
}
.ha-tarefa {
  font-size: 13.5px; font-weight: 700; line-height: 1.3; letter-spacing: var(--tf-track-titulo, -0.015em);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: anywhere;
  /* Slot de DUAS linhas sempre (regra do TfKit): título curto não deixa a
     faixa de tempo subir — é isso que alinha o miolo entre um card e outro. */
  min-height: calc(2 * 1.3em);
}
.ha-apoio {
  margin-top: 2px; font-size: var(--tf-fs-rotulo, 12px); color: var(--text-dim); line-height: 1.4;
  min-height: 17px;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: anywhere;
}
.ha-apoio[data-perigo="1"] { color: var(--perigo); }

.ha-pessoa-nome {
  margin-top: 1px; font-size: var(--tf-fs-detalhe, 11.5px); color: var(--text-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ha-qtd {
  display: flex; align-items: baseline; gap: 8px; min-width: 0;
  padding: 0 2px;
}
.ha-qtd i {
  font-style: normal; font-size: var(--tf-fs-micro, 11px); font-weight: 800;
  color: var(--text-dim); text-transform: uppercase; letter-spacing: .03em;
}
.ha-qtd b { font-size: var(--tf-fs-corpo, 12.5px); font-weight: 700; font-variant-numeric: tabular-nums; }

/* ── Vazio do dia ── */
.ha-vazio-dia {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 22px; border-radius: var(--r-md);
  border: 1px dashed var(--border); background: var(--surface); margin-bottom: 4px;
}
.ha-vazio-ic {
  flex: none; width: 40px; height: 40px; display: grid; place-items: center;
  border-radius: var(--r-sm); background: var(--surface-2);
}
.ha-vazio-dia strong { font-size: 14.5px; font-weight: 800; }
.ha-vazio-dia p { margin: 5px 0 0; font-size: 12.5px; color: var(--text-dim); line-height: 1.55; }

/* ── Detalhe ── */
.ha-rotulo {
  font-size: 11.5px; font-weight: 700; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.4px;
}
.ha-det-pessoa {
  display: flex; align-items: center; gap: 12px; min-width: 0;
  padding: 12px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--surface-2);
}
.ha-det-thumb {
  flex: none; margin-left: auto; width: 52px; height: 52px; object-fit: cover;
  border-radius: var(--r-sm);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent);
}
.ha-crono { list-style: none; margin: 0; padding: 0; display: grid; }
.ha-crono li {
  display: flex; align-items: center; gap: 10px; min-width: 0;
  padding: 7px 0; position: relative;
}
.ha-crono li + li { border-top: 1px dashed var(--border); }
.ha-crono li[data-vazio="1"] { opacity: 0.55; }
.ha-crono-ic {
  flex: none; width: 26px; height: 26px; display: grid; place-items: center;
  border-radius: 999px; background: color-mix(in srgb, var(--primary) 10%, transparent);
}
.ha-crono li[data-vazio="1"] .ha-crono-ic { background: var(--surface-2); }
.ha-crono-rot { font-size: 13px; font-weight: 700; flex: 1; }
.ha-crono-quando { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text); }
.ha-crono-extra { color: var(--text-dim); font-size: 12px; }
.ha-tempo { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 108px), 1fr)); }
.ha-tempo-cela {
  display: grid; gap: 3px; padding: 10px 12px; min-width: 0;
  border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface-2);
}
.ha-tempo-cela strong { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.ha-tempo-nota { font-size: 11.5px; font-weight: 700; }
.ha-tempo-nota[data-tom="ok"] { color: var(--ok); }
.ha-tempo-nota[data-tom="atencao"] { color: var(--atencao); }

/* ── Celular: o trilho sai, a hora vira cabeçalho do bloco ── */
@media (max-width: 700px) {
  .ha-bloco { grid-template-columns: minmax(0, 1fr); padding-left: 0; gap: 8px; border-top: 1px solid var(--border); }
  .ha-bloco::before { display: none; }
  .ha-hora { flex-direction: row; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 0; }
  .ha-hora-ponto { display: none; }
  .ha-hora-resumo { flex-basis: 100%; }
  .ha-resumo-tempo { margin-left: 0; flex-basis: 100%; }
  .ha-topo-acoes { width: 100%; }
  .ha-topo-acoes > :last-child { margin-left: auto; }
}
`;
