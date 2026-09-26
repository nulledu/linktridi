"use client";

// TI › Roadmap (detalhe). Timeline horizontal no topo — clicar numa etapa abre
// o painel dela embaixo, com tarefas reais da Central vinculadas. Sem poll:
// recarrega depois de cada escrita.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../../../Icon";
import { GlassSelect } from "../../../GlassPicker";
import { VazioPainel } from "../../../ui/CartaoPainel";
import { Progresso } from "../../../ui/micro";
import { Secao } from "../../../ui/Secao";
import { LinhaDoTempo } from "../../../ui/LinhaDoTempo";
import { Botao, BotaoIcone, Campo, Campos, Acoes, PainelLateral, useAcao } from "../../../ui/controles";
import { toast, confirmar } from "../../../Toast";
import { dataBR } from "../../dados";
import { SeloRoadmap, SeloEtapa, statusDaLinha } from "../../parts";
import { STATUS_ETAPA, STATUS_ROADMAP, type TiEtapa, type TiRoadmap, type TiHistorico, type EtapaStatus, type RoadmapStatus } from "@/lib/ti-regras";
import type { Pessoa } from "../RoadmapsClient";

type Carga = { estado: "carregando" } | { estado: "erro" } | { estado: "ok"; roadmap: TiRoadmap; historico: TiHistorico[] };

const ACAO_LBL: Record<string, string> = {
  criou: "criou", status: "mudou o status", prazo: "mudou o prazo", responsavel: "trocou o responsável",
  etapa_criada: "criou a etapa", etapa_concluida: "concluiu a etapa", etapa_excluida: "excluiu a etapa",
  tarefa_vinculada: "vinculou a tarefa", editou: "editou",
};

export function RoadmapClient({ id, pessoas, podeEditar, podeExcluir }: {
  id: string; pessoas: Pessoa[]; podeEditar: boolean; podeExcluir: boolean;
}) {
  const [carga, setCarga] = useState<Carga>({ estado: "carregando" });
  const [etapaSel, setEtapaSel] = useState<string | null>(null);
  const [novaEtapa, setNovaEtapa] = useState(false);
  const [editandoEtapa, setEditandoEtapa] = useState<TiEtapa | null>(null);
  const [editandoRoadmap, setEditandoRoadmap] = useState(false);
  const [vinculando, setVinculando] = useState<TiEtapa | null>(null);
  const router = useRouter();

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/ti/roadmaps/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      setCarga({ estado: "ok", roadmap: j.roadmap, historico: j.historico ?? [] });
    } catch { setCarga({ estado: "erro" }); }
  }, [id]);
  useEffect(() => { void carregar(); }, [carregar]);

  const r = carga.estado === "ok" ? carga.roadmap : null;
  const etapa = useMemo(() => r?.etapas.find((e) => e.id === etapaSel) ?? null, [r, etapaSel]);

  if (carga.estado === "carregando") return <VazioPainel texto="Lendo o roadmap…" />;
  if (carga.estado === "erro" || !r) return <VazioPainel texto="Roadmap não encontrado — pode ter sido excluído." />;

  const excluirRoadmap = async () => {
    if (!(await confirmar(`Excluir o roadmap “${r.titulo}”?`, { detalhe: "Etapas, vínculos e histórico somem junto. Não dá pra desfazer.", perigo: true, acao: "Excluir" }))) return;
    const res = await fetch(`/api/ti/roadmaps/${id}`, { method: "DELETE" });
    if (!res.ok) { toast("Não deu pra excluir.", "erro"); return; }
    toast("Roadmap excluído.");
    router.push("/ti/roadmaps");
  };

  const moverEtapa = async (e: TiEtapa, dir: -1 | 1) => {
    const ids = r.etapas.map((x) => x.id);
    const i = ids.indexOf(e.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const res = await fetch(`/api/ti/roadmaps/${id}/etapas`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem: ids }),
    });
    if (!res.ok) { toast("Não deu pra reordenar.", "erro"); return; }
    void carregar();
  };

  return (
    <div className="ti-detalhe">
      <div className="ti-cab">
        <div>
          <Link href="/ti/roadmaps" style={{ fontSize: 12.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="arrow-left" size={14} /> Roadmaps
          </Link>
          <h2>{r.projetoNome}</h2>
          <div className="ti-sub">{r.titulo}{r.descricao ? ` — ${r.descricao}` : ""}</div>
          <div className="ti-metas" style={{ marginTop: 8 }}>
            <SeloRoadmap status={r.status} atrasado={r.atrasado} />
            <span>{r.progresso}% concluído</span>
            {r.responsavelNome && <span><Icon name="user" size={13} /> {r.responsavelNome}</span>}
            {(r.inicio || r.prazo) && <span><Icon name="calendar-event" size={13} /> {dataBR(r.inicio)} → {dataBR(r.prazo)}</span>}
          </div>
        </div>
        <Acoes>
          {podeEditar && <Botao variante="secundario" icone="pencil" onClick={() => setEditandoRoadmap(true)}>Editar</Botao>}
          {podeEditar && <Botao icone="plus" onClick={() => setNovaEtapa(true)}>Adicionar etapa</Botao>}
          {podeExcluir && <BotaoIcone icone="trash" titulo="Excluir roadmap" variante="perigo" onClick={() => void excluirRoadmap()} />}
        </Acoes>
      </div>

      <div style={{ maxWidth: 420 }}>
        <Progresso valor={r.progresso} max={100} rotulo="Progresso do roadmap" />
      </div>

      {r.etapas.length === 0 ? (
        <div className="ti-vazio">
          <Icon name="chart-dots" size={26} />
          <strong>Nenhuma etapa ainda</strong>
          <span>Adicione as etapas do projeto para a timeline nascer.</span>
          {podeEditar && <Botao icone="plus" onClick={() => setNovaEtapa(true)}>Adicionar etapa</Botao>}
        </div>
      ) : (
        <LinhaDoTempo
          selecionado={etapaSel}
          onSelecionar={(eid) => setEtapaSel((s) => (s === eid ? null : eid))}
          itens={r.etapas.map((e) => ({
            id: e.id, titulo: e.titulo, status: statusDaLinha(e),
            topo: e.inicio || e.prazo ? `${dataBR(e.inicio)} → ${dataBR(e.prazo)}` : undefined,
            baixo: `${e.progresso}%${e.responsavelNome ? ` · ${e.responsavelNome}` : ""}${e.tarefas.length ? ` · ${e.tarefas.filter((t) => t.status === "concluida").length}/${e.tarefas.length} tarefas` : ""}`,
          }))}
        />
      )}

      {etapa && (
        <PainelEtapa etapa={etapa} etapas={r.etapas} podeEditar={podeEditar} podeExcluir={podeExcluir}
          onEditar={() => setEditandoEtapa(etapa)} onVincular={() => setVinculando(etapa)}
          onMover={(dir) => void moverEtapa(etapa, dir)}
          onExcluir={async () => {
            if (!(await confirmar(`Excluir a etapa “${etapa.titulo}”?`, { detalhe: "Os vínculos com tarefas somem; as tarefas em si continuam na Central.", perigo: true, acao: "Excluir" }))) return;
            const res = await fetch(`/api/ti/etapas/${etapa.id}`, { method: "DELETE" });
            if (!res.ok) { toast("Não deu pra excluir a etapa.", "erro"); return; }
            setEtapaSel(null); toast("Etapa excluída."); void carregar();
          }}
          onStatus={async (status) => {
            const res = await fetch(`/api/ti/etapas/${etapa.id}`, {
              method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
            });
            if (!res.ok) { toast("Não deu pra mudar o status.", "erro"); return; }
            void carregar();
          }}
          onDesvincular={async (tarefaId) => {
            const res = await fetch(`/api/ti/etapas/${etapa.id}/tarefas`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tarefaId, acao: "desvincular" }),
            });
            if (!res.ok) { toast("Não deu pra desvincular.", "erro"); return; }
            void carregar();
          }} />
      )}

      {carga.estado === "ok" && carga.historico.length > 0 && (
        <Secao icone="history" titulo="Histórico" resumo="Quem mudou o quê, do mais recente pro mais antigo.">
          <div style={{ display: "grid", gap: 6, paddingTop: 6 }}>
            {carga.historico.map((h) => (
              <div key={h.id} style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ color: "var(--text)" }}>{h.autorNome ?? "Alguém"}</span>
                <span>{ACAO_LBL[h.acao] ?? h.acao}</span>
                {h.detalhe && <span>· {h.detalhe}</span>}
                <span style={{ marginLeft: "auto" }}>{new Date(h.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {(novaEtapa || editandoEtapa) && (
        <FormEtapa roadmapId={id} etapa={editandoEtapa} pessoas={pessoas}
          onFechar={() => { setNovaEtapa(false); setEditandoEtapa(null); }}
          onSalvou={() => { setNovaEtapa(false); setEditandoEtapa(null); toast("Etapa salva."); void carregar(); }} />
      )}
      {editandoRoadmap && (
        <FormRoadmap roadmap={r} pessoas={pessoas} onFechar={() => setEditandoRoadmap(false)}
          onSalvou={() => { setEditandoRoadmap(false); toast("Roadmap salvo."); void carregar(); }} />
      )}
      {vinculando && (
        <VincularTarefas etapa={vinculando} onFechar={() => setVinculando(null)}
          onMudou={() => void carregar()} />
      )}
    </div>
  );
}

// ── Painel da etapa selecionada ──────────────────────────────────────────────

function PainelEtapa({ etapa, etapas, podeEditar, podeExcluir, onEditar, onVincular, onMover, onExcluir, onStatus, onDesvincular }: {
  etapa: TiEtapa; etapas: TiEtapa[]; podeEditar: boolean; podeExcluir: boolean;
  onEditar: () => void; onVincular: () => void; onMover: (dir: -1 | 1) => void;
  onExcluir: () => void; onStatus: (s: EtapaStatus) => void; onDesvincular: (tarefaId: string) => void;
}) {
  const feitas = etapa.tarefas.filter((t) => t.status === "concluida").length;
  const dependencia = etapa.dependeDe ? etapas.find((e) => e.id === etapa.dependeDe) : null;
  const bloqueadaPorDependencia = !!dependencia && dependencia.status !== "concluida";
  const i = etapas.findIndex((e) => e.id === etapa.id);
  return (
    <section className="ti-etapa-painel" aria-label={`Etapa ${etapa.titulo}`}>
      <div className="ti-cab" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{etapa.titulo}</h3>
          <SeloEtapa status={etapa.status} atrasada={etapa.atrasada} />
        </div>
        <Acoes>
          {podeEditar && (
            <>
              <BotaoIcone icone="arrow-left" titulo="Mover pra trás" variante="sutil" disabled={i <= 0} onClick={() => onMover(-1)} />
              <BotaoIcone icone="arrow-right" titulo="Mover pra frente" variante="sutil" disabled={i >= etapas.length - 1} onClick={() => onMover(1)} />
              <Botao variante="secundario" icone="pencil" onClick={onEditar}>Editar</Botao>
              <Botao variante="secundario" icone="link" onClick={onVincular}>Vincular tarefas</Botao>
            </>
          )}
          {podeExcluir && <BotaoIcone icone="trash" titulo="Excluir etapa" variante="perigo" onClick={onExcluir} />}
        </Acoes>
      </div>

      {etapa.descricao && <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>{etapa.descricao}</p>}
      <div className="ti-metas">
        {etapa.responsavelNome && <span><Icon name="user" size={13} /> {etapa.responsavelNome}</span>}
        {(etapa.inicio || etapa.prazo) && <span><Icon name="calendar-event" size={13} /> {dataBR(etapa.inicio)} → {dataBR(etapa.prazo)}</span>}
        {etapa.concluidaEm && <span><Icon name="circle-check" size={13} /> concluída em {dataBR(etapa.concluidaEm)}</span>}
        {dependencia && (
          <span style={bloqueadaPorDependencia ? { color: "var(--atencao)" } : undefined}>
            <Icon name="git-compare" size={13} /> depende de “{dependencia.titulo}”{bloqueadaPorDependencia ? " (ainda não concluída)" : ""}
          </span>
        )}
      </div>

      {podeEditar && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Status:</span>
          <GlassSelect aria-label="Status da etapa" value={etapa.status} onChange={(v) => onStatus(v as EtapaStatus)}
            options={Object.entries(STATUS_ETAPA).map(([value, label]) => ({ value, label }))} />
        </div>
      )}

      <div style={{ maxWidth: 380 }}>
        <Progresso valor={etapa.progresso} max={100} rotulo={`Progresso de ${etapa.titulo}`} />
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
          {etapa.tarefas.length
            ? `${feitas} de ${etapa.tarefas.length} tarefas concluídas · ${etapa.progresso}%`
            : etapa.progressoManual != null
              ? `Progresso manual: ${etapa.progresso}%`
              : "Sem tarefas vinculadas — vincule tarefas da Central ou defina um progresso manual."}
        </div>
      </div>

      {etapa.tarefas.length > 0 && (
        <div>
          {etapa.tarefas.map((t) => (
            <div key={t.id} className="ti-tarefa-linha">
              <Icon name={t.status === "concluida" ? "circle-check" : "circle-dot"} size={16}
                color={t.status === "concluida" ? "var(--ok)" : "var(--muted)"} />
              <span style={t.status === "concluida" ? { textDecoration: "line-through", opacity: .7 } : undefined}>{t.titulo}</span>
              <span className="ti-t-meta">
                {t.responsavelNome && <span>{t.responsavelNome}</span>}
                {t.prazo && <span>{dataBR(t.prazo)}</span>}
                {podeEditar && <BotaoIcone icone="x" titulo="Desvincular tarefa" variante="sutil" onClick={() => onDesvincular(t.id)} />}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Formulários ──────────────────────────────────────────────────────────────

function FormEtapa({ roadmapId, etapa, pessoas, onFechar, onSalvou }: {
  roadmapId: string; etapa: TiEtapa | null; pessoas: Pessoa[]; onFechar: () => void; onSalvou: () => void;
}) {
  const [titulo, setTitulo] = useState(etapa?.titulo ?? "");
  const [descricao, setDescricao] = useState(etapa?.descricao ?? "");
  const [status, setStatus] = useState<string>(etapa?.status ?? "nao_iniciada");
  const [inicio, setInicio] = useState(etapa?.inicio?.slice(0, 10) ?? "");
  const [prazo, setPrazo] = useState(etapa?.prazo?.slice(0, 10) ?? "");
  const [respId, setRespId] = useState(etapa?.responsavelId ?? "");
  const [progressoManual, setProgressoManual] = useState(etapa?.progressoManual != null ? String(etapa.progressoManual) : "");
  const [observacoes, setObservacoes] = useState(etapa?.observacoes ?? "");
  const [erro, setErro] = useState<string | undefined>();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sinal, setSinal] = useState(0);

  const salvar = useAcao(async () => {
    setErroGeral(null);
    if (!titulo.trim()) { setErro("Dê um nome à etapa."); setSinal((s) => s + 1); return false; }
    setErro(undefined);
    const corpo = {
      titulo: titulo.trim(), descricao, status, inicio: inicio || "", prazo: prazo || "",
      responsavelId: respId || "", responsavelNome: pessoas.find((p) => p.id === respId)?.nome ?? "",
      progressoManual: progressoManual === "" ? "" : Math.max(0, Math.min(100, Number(progressoManual))),
      observacoes,
    };
    const res = etapa
      ? await fetch(`/api/ti/etapas/${etapa.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      : await fetch(`/api/ti/roadmaps/${roadmapId}/etapas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!res.ok) { setErroGeral("Não deu pra salvar. Tente de novo."); return false; }
    onSalvou();
    return true;
  });

  return (
    <PainelLateral centrado soFechaNoX titulo={etapa ? "Editar etapa" : "Adicionar etapa"} icone="chart-dots" onFechar={onFechar}
      rodape={<Acoes>
        <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
        <Botao estado={salvar.estado} onClick={() => void salvar.rodar()}>Salvar</Botao>
      </Acoes>}>
      <Campos>
        <Campo label="Nome" erro={erro} sinal={sinal} largo>
          {(id) => <input id={id} value={titulo} placeholder="Desenvolvimento" onChange={(e) => setTitulo(e.target.value)} />}
        </Campo>
        <Campo label="Descrição" largo>
          {(id) => <textarea id={id} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />}
        </Campo>
        <Campo label="Status">
          <GlassSelect aria-label="Status" value={status} onChange={setStatus}
            options={Object.entries(STATUS_ETAPA).map(([value, label]) => ({ value, label }))} />
        </Campo>
        <Campo label="Responsável">
          <GlassSelect aria-label="Responsável" value={respId} onChange={setRespId} placeholder="Escolher…" searchable
            options={[{ value: "", label: "Sem responsável" }, ...pessoas.map((p) => ({ value: p.id, label: p.nome }))]} />
        </Campo>
        <Campo label="Início">
          {(id) => <input id={id} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />}
        </Campo>
        <Campo label="Prazo">
          {(id) => <input id={id} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />}
        </Campo>
        <Campo label="Progresso manual (%)" dica="Só quando a etapa não é representável por tarefas. Com tarefas vinculadas, o cálculo real vence.">
          {(id) => <input id={id} type="number" min={0} max={100} value={progressoManual} onChange={(e) => setProgressoManual(e.target.value)} />}
        </Campo>
        <Campo label="Observações" largo>
          {(id) => <textarea id={id} rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />}
        </Campo>
      </Campos>
      {erroGeral && <p style={{ color: "var(--perigo)", fontSize: 13, marginTop: 10 }}>{erroGeral}</p>}
    </PainelLateral>
  );
}

function FormRoadmap({ roadmap, pessoas, onFechar, onSalvou }: {
  roadmap: TiRoadmap; pessoas: Pessoa[]; onFechar: () => void; onSalvou: () => void;
}) {
  const [titulo, setTitulo] = useState(roadmap.titulo);
  const [descricao, setDescricao] = useState(roadmap.descricao ?? "");
  const [status, setStatus] = useState<string>(roadmap.status);
  const [inicio, setInicio] = useState(roadmap.inicio?.slice(0, 10) ?? "");
  const [prazo, setPrazo] = useState(roadmap.prazo?.slice(0, 10) ?? "");
  const [respId, setRespId] = useState(roadmap.responsavelId ?? "");
  const [erro, setErro] = useState<string | undefined>();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sinal, setSinal] = useState(0);

  const salvar = useAcao(async () => {
    setErroGeral(null);
    if (!titulo.trim()) { setErro("Dê um nome ao roadmap."); setSinal((s) => s + 1); return false; }
    setErro(undefined);
    const res = await fetch(`/api/ti/roadmaps/${roadmap.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: titulo.trim(), descricao, status: status as RoadmapStatus, inicio: inicio || "", prazo: prazo || "",
        responsavelId: respId || "", responsavelNome: pessoas.find((p) => p.id === respId)?.nome ?? "",
      }),
    });
    if (!res.ok) { setErroGeral("Não deu pra salvar. Tente de novo."); return false; }
    onSalvou();
    return true;
  });

  return (
    <PainelLateral centrado soFechaNoX titulo="Editar roadmap" icone="pencil" onFechar={onFechar}
      rodape={<Acoes>
        <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
        <Botao estado={salvar.estado} onClick={() => void salvar.rodar()}>Salvar</Botao>
      </Acoes>}>
      <Campos>
        <Campo label="Nome" erro={erro} sinal={sinal} largo>
          {(id) => <input id={id} value={titulo} onChange={(e) => setTitulo(e.target.value)} />}
        </Campo>
        <Campo label="Descrição" largo>
          {(id) => <textarea id={id} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />}
        </Campo>
        <Campo label="Status">
          <GlassSelect aria-label="Status" value={status} onChange={setStatus}
            options={Object.entries(STATUS_ROADMAP).map(([value, label]) => ({ value, label }))} />
        </Campo>
        <Campo label="Responsável">
          <GlassSelect aria-label="Responsável" value={respId} onChange={setRespId} placeholder="Escolher…" searchable
            options={[{ value: "", label: "Sem responsável" }, ...pessoas.map((p) => ({ value: p.id, label: p.nome }))]} />
        </Campo>
        <Campo label="Início">
          {(id) => <input id={id} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />}
        </Campo>
        <Campo label="Prazo">
          {(id) => <input id={id} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />}
        </Campo>
      </Campos>
      {erroGeral && <p style={{ color: "var(--perigo)", fontSize: 13, marginTop: 10 }}>{erroGeral}</p>}
    </PainelLateral>
  );
}

// ── Vincular tarefas da Central ──────────────────────────────────────────────

function VincularTarefas({ etapa, onFechar, onMudou }: { etapa: TiEtapa; onFechar: () => void; onMudou: () => void }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<{ id: string; titulo: string; status: string; responsavelNome: string | null }[] | null>(null);
  const [erro, setErro] = useState(false);
  const vinculadas = useMemo(() => new Set(etapa.tarefas.map((t) => t.id)), [etapa]);

  // Busca sob demanda (Enter/clique) — nada de requisição por tecla.
  const buscar = useAcao(async () => {
    setErro(false);
    try {
      const res = await fetch(`/api/ti/etapas/${etapa.id}/tarefas?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setLista((await res.json()).tarefas ?? []);
      return true;
    } catch { setErro(true); return false; }
  });
  useEffect(() => { void buscar.rodar(); /* primeira leva, sem filtro */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alternar = async (tarefaId: string, jaVinculada: boolean) => {
    const res = await fetch(`/api/ti/etapas/${etapa.id}/tarefas`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tarefaId, acao: jaVinculada ? "desvincular" : "vincular" }),
    });
    if (!res.ok) { toast("Não deu pra mudar o vínculo.", "erro"); return; }
    onMudou();
  };

  return (
    <PainelLateral titulo={`Vincular tarefas — ${etapa.titulo}`} subtitulo="Tarefas da Central de Trabalho. O progresso da etapa passa a contar as concluídas." onFechar={onFechar}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={q} placeholder="Buscar tarefa…" style={{ flex: 1 }}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void buscar.rodar(); }} />
        <Botao variante="secundario" icone="search" estado={buscar.estado} onClick={() => void buscar.rodar()}>Buscar</Botao>
      </div>
      {erro && <p style={{ color: "var(--perigo)", fontSize: 13 }}>Não deu pra buscar. Tente de novo.</p>}
      {lista === null && !erro && <p style={{ color: "var(--muted)", fontSize: 13 }}>Buscando…</p>}
      {lista !== null && lista.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>Nenhuma tarefa encontrada. Crie na Central de Trabalho e volte aqui.</p>}
      {(lista ?? []).map((t) => {
        const ja = vinculadas.has(t.id);
        return (
          <div key={t.id} className="ti-tarefa-linha">
            <Icon name={t.status === "concluida" ? "circle-check" : "circle-dot"} size={16}
              color={t.status === "concluida" ? "var(--ok)" : "var(--muted)"} />
            <span>{t.titulo}</span>
            <span className="ti-t-meta">
              {t.responsavelNome && <span>{t.responsavelNome}</span>}
              <Botao variante={ja ? "sutil" : "secundario"} icone={ja ? "x" : "link"} onClick={() => void alternar(t.id, ja)}>
                {ja ? "Desvincular" : "Vincular"}
              </Botao>
            </span>
          </div>
        );
      })}
    </PainelLateral>
  );
}
