"use client";

// TI › Roadmaps: a lista com filtros + o fluxo de criação. O detalhe (timeline)
// mora em /ti/roadmaps/[id].
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { GlassSelect } from "../../GlassPicker";
import { VazioPainel } from "../../ui/CartaoPainel";
import { Progresso } from "../../ui/micro";
import { Botao, Campo, Campos, Acoes, PainelLateral, useAcao, Chip } from "../../ui/controles";
import { toast } from "../../Toast";
import { useRoadmaps, dataBR } from "../dados";
import { SeloRoadmap } from "../parts";
import { STATUS_ROADMAP, type RoadmapStatus } from "@/lib/ti-regras";

export interface Pessoa { id: string; nome: string }

export function RoadmapsClient({ pessoas, inicial }: {
  pessoas: Pessoa[];
  inicial: { status?: string; filtro?: string; novo?: string };
}) {
  const l = useRoadmaps();
  const router = useRouter();
  const [status, setStatus] = useState(inicial.status ?? "");
  const [projeto, setProjeto] = useState("");
  const [resp, setResp] = useState("");
  const [soAtrasados, setSoAtrasados] = useState(inicial.filtro === "atrasados");
  const [criando, setCriando] = useState(inicial.novo === "1");

  const filtrados = useMemo(() => {
    if (l.estado !== "ok") return [];
    return l.dado.roadmaps.filter((r) =>
      (!status || r.status === status) &&
      (!projeto || r.projetoId === projeto) &&
      (!resp || r.responsavelId === resp) &&
      (!soAtrasados || (r.atrasado && r.status !== "concluido")),
    );
  }, [l, status, projeto, resp, soAtrasados]);

  if (l.estado === "carregando") return <VazioPainel texto="Lendo os roadmaps…" />;
  if (l.estado === "erro") return <VazioPainel texto="Não deu pra ler os roadmaps agora. Recarregue a página." />;
  const { roadmaps, projetos } = l.dado;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <GlassSelect aria-label="Filtrar por status" value={status} onChange={setStatus} placeholder="Todos os status"
          options={[{ value: "", label: "Todos os status" }, ...Object.entries(STATUS_ROADMAP).map(([value, label]) => ({ value, label }))]} />
        <GlassSelect aria-label="Filtrar por projeto" value={projeto} onChange={setProjeto} placeholder="Todos os projetos" searchable
          options={[{ value: "", label: "Todos os projetos" }, ...projetos.map((p) => ({ value: p.id, label: p.nome }))]} />
        <GlassSelect aria-label="Filtrar por responsável" value={resp} onChange={setResp} placeholder="Qualquer responsável" searchable
          options={[{ value: "", label: "Qualquer responsável" }, ...pessoas.map((p) => ({ value: p.id, label: p.nome }))]} />
        <Chip ativo={soAtrasados} onClick={() => setSoAtrasados((v) => !v)}>Atrasados</Chip>
        <span style={{ marginLeft: "auto" }}>
          <Botao icone="plus" onClick={() => setCriando(true)}>Novo roadmap</Botao>
        </span>
      </div>

      {roadmaps.length === 0 ? (
        <div className="ti-vazio">
          <Icon name="chart-dots" size={28} />
          <strong>Nenhum roadmap criado</strong>
          <span>Crie o primeiro roadmap para começar a acompanhar a evolução dos seus projetos.</span>
          <Botao icone="plus" onClick={() => setCriando(true)}>Criar roadmap</Botao>
        </div>
      ) : filtrados.length === 0 ? (
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Nenhum roadmap com esses filtros.</p>
      ) : (
        <div className="ti-grade">
          {filtrados.map((r) => (
            <button key={r.id} type="button" className="ti-cartao" onClick={() => router.push(`/ti/roadmaps/${r.id}`)}>
              <div className="ti-cartao-topo">
                <div>
                  <h3>{r.projetoNome}</h3>
                  <div className="ti-proj">{r.titulo}</div>
                </div>
                <SeloRoadmap status={r.status} atrasado={r.atrasado} />
              </div>
              <Progresso valor={r.progresso} max={100} rotulo={`Progresso de ${r.titulo}`} />
              <div className="ti-cartao-pe">
                <span>{r.progresso}% · {r.etapas.length} {r.etapas.length === 1 ? "etapa" : "etapas"}</span>
                <span>{r.responsavelNome ?? "Sem responsável"}{r.prazo ? ` · até ${dataBR(r.prazo)}` : ""}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {criando && (
        <NovoRoadmap pessoas={pessoas} projetos={projetos}
          onFechar={() => setCriando(false)}
          onCriou={(id) => { setCriando(false); toast("Roadmap criado."); router.push(`/ti/roadmaps/${id}`); }} />
      )}
    </div>
  );
}

function NovoRoadmap({ pessoas, projetos, onFechar, onCriou }: {
  pessoas: Pessoa[]; projetos: { id: string; nome: string }[];
  onFechar: () => void; onCriou: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [projetoId, setProjetoId] = useState("");
  const [projetoNome, setProjetoNome] = useState("");
  const [inicio, setInicio] = useState("");
  const [prazo, setPrazo] = useState("");
  const [respId, setRespId] = useState("");
  const [erro, setErro] = useState<{ titulo?: string; projeto?: string }>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sinal, setSinal] = useState(0);

  const salvar = useAcao(async () => {
    setErroGeral(null);
    const e: typeof erro = {};
    if (!titulo.trim()) e.titulo = "Dê um nome ao roadmap.";
    if (!projetoId && !projetoNome.trim()) e.projeto = "Escolha um projeto ou crie um novo.";
    setErro(e); setSinal((s) => s + 1);
    if (Object.keys(e).length) return false;
    const res = await fetch("/api/ti/roadmaps", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: titulo.trim(), descricao, projetoId: projetoId || undefined, projetoNome: projetoNome.trim() || undefined,
        inicio: inicio || undefined, prazo: prazo || undefined,
        responsavelId: respId || undefined, responsavelNome: pessoas.find((p) => p.id === respId)?.nome,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErroGeral(j.error === "forbidden" ? "Você não tem a chave “Criar roadmap e projeto”." : "Não deu pra criar. Tente de novo.");
      return false;
    }
    onCriou(j.id as string);
    return true;
  });

  return (
    <PainelLateral centrado soFechaNoX titulo="Novo roadmap" icone="chart-dots" onFechar={onFechar}
      rodape={<Acoes>
        <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
        <Botao estado={salvar.estado} onClick={() => void salvar.rodar()}>Criar</Botao>
      </Acoes>}>
      <Campos>
        <Campo label="Projeto" erro={erro.projeto} sinal={sinal} largo
          dica={projetoId ? undefined : "Escolha um projeto existente ou digite o nome de um novo."}>
          <GlassSelect aria-label="Projeto" value={projetoId} onChange={(v) => { setProjetoId(v); if (v) setProjetoNome(""); }}
            placeholder="Projeto existente…" searchable
            options={[{ value: "", label: "— criar projeto novo —" }, ...projetos.map((p) => ({ value: p.id, label: p.nome }))]} />
        </Campo>
        {!projetoId && (
          <Campo label="Nome do projeto novo" largo>
            {(id) => <input id={id} value={projetoNome} placeholder="Novo site" onChange={(e) => setProjetoNome(e.target.value)} />}
          </Campo>
        )}
        <Campo label="Nome do roadmap" erro={erro.titulo} sinal={sinal} largo>
          {(id) => <input id={id} value={titulo} placeholder="Desenvolvimento 2026" onChange={(e) => setTitulo(e.target.value)} />}
        </Campo>
        <Campo label="Descrição" largo>
          {(id) => <textarea id={id} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />}
        </Campo>
        <Campo label="Início">
          {(id) => <input id={id} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />}
        </Campo>
        <Campo label="Prazo">
          {(id) => <input id={id} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />}
        </Campo>
        <Campo label="Responsável" largo>
          <GlassSelect aria-label="Responsável" value={respId} onChange={setRespId} placeholder="Escolher…" searchable
            options={[{ value: "", label: "Sem responsável" }, ...pessoas.map((p) => ({ value: p.id, label: p.nome }))]} />
        </Campo>
      </Campos>
      {erroGeral && <p style={{ color: "var(--perigo)", fontSize: 13, marginTop: 10 }}>{erroGeral}</p>}
    </PainelLateral>
  );
}
