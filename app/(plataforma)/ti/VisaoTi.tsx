"use client";

// TI › Visão geral. Quatro números e a lista do que anda — a prioridade é
// entender o estado atual em segundos, não um dashboard de gráficos.
import { useRouter } from "next/navigation";
import { Kpi } from "../ui/primitives";
import { VazioPainel } from "../ui/CartaoPainel";
import { Progresso } from "../ui/micro";
import { Botao } from "../ui/controles";
import { Icon } from "../Icon";
import { useRoadmaps, dataBR } from "./dados";
import { SeloRoadmap } from "./parts";

export function VisaoTi() {
  const l = useRoadmaps();
  const router = useRouter();

  if (l.estado === "carregando") return <VazioPainel texto="Lendo os projetos de TI…" />;
  if (l.estado === "erro") return <VazioPainel texto="Não deu pra ler os roadmaps agora. Recarregue a página." />;

  const { roadmaps } = l.dado;
  const emAndamento = roadmaps.filter((r) => r.status === "em_andamento");
  const atrasados = roadmaps.filter((r) => r.atrasado && r.status !== "concluido");
  const concluidos = roadmaps.filter((r) => r.status === "concluido");
  const projetos = new Set(roadmaps.map((r) => r.projetoId)).size;
  const ir = (h: string) => () => router.push(h);

  if (!roadmaps.length) {
    return (
      <div className="ti-vazio">
        <Icon name="chart-dots" size={28} />
        <strong>Nenhum roadmap criado</strong>
        <span>Crie o primeiro roadmap para acompanhar a evolução dos projetos de tecnologia.</span>
        <Botao icone="plus" onClick={ir("/ti/roadmaps?novo=1")}>Criar roadmap</Botao>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ti-kpis">
        <Kpi label="Projetos" value={String(projetos)} color="var(--primary)" icon="device-laptop" onClick={ir("/ti/roadmaps")} />
        <Kpi label="Em andamento" value={String(emAndamento.length)} color="var(--info)" icon="chart-dots" onClick={ir("/ti/roadmaps?status=em_andamento")} />
        <Kpi label="Atrasados" value={String(atrasados.length)} color="var(--atencao)" icon="clock-hour-4" onClick={ir("/ti/roadmaps?filtro=atrasados")} />
        <Kpi label="Concluídos" value={String(concluidos.length)} color="var(--ok)" icon="circle-check" onClick={ir("/ti/roadmaps?status=concluido")} />
      </div>

      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 650, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)" }}>
          Em andamento
        </h3>
        {emAndamento.length === 0 && <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Nenhum roadmap em andamento agora.</p>}
        <div className="ti-grade">
          {emAndamento.map((r) => (
            <button key={r.id} type="button" className="ti-cartao" onClick={ir(`/ti/roadmaps/${r.id}`)}>
              <div className="ti-cartao-topo">
                <div>
                  <h3>{r.projetoNome || r.titulo}</h3>
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
      </section>
    </div>
  );
}
