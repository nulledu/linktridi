"use client";

// ── 3D · Visão geral ─────────────────────────────────────────────────────────
// Abrir e entender a operação em segundos: números do parque, o estado de
// cada máquina, o que roda hoje e o que vem depois. Tudo derivado do estado
// compartilhado — nada busca de novo aqui.

import { useMemo } from "react";
import { Icon } from "../Icon";
import { Kpi } from "../ui/primitives";
import { Momento } from "../ui/Momento";
import { hojeSP } from "@/lib/atividades-visao";
import {
  COR_STATUS_MAQUINA, ROTULO_STATUS_MAQUINA, statusDaMaquina,
  type Maquina3D, type Programacao3D, type StatusProgramacao,
} from "@/lib/impressao3d-const";
import { CardProgramacao, dataCurta } from "./pecas3d";

export function VisaoGeral3D({ maquinas, programacoes, onAbrir, onStatus, onIrPara }: {
  maquinas: Maquina3D[];
  programacoes: Programacao3D[];
  onAbrir: (p: Programacao3D) => void;
  onStatus: (p: Programacao3D, s: StatusProgramacao) => void;
  onIrPara: (aba: string) => void;
}) {
  const hoje = hojeSP();

  const porMaquina = useMemo(() => {
    const m = new Map<string, Programacao3D[]>();
    for (const p of programacoes) {
      if (!p.maquinaId) continue;
      const l = m.get(p.maquinaId) ?? [];
      l.push(p);
      m.set(p.maquinaId, l);
    }
    return m;
  }, [programacoes]);

  const n = useMemo(() => {
    const status = maquinas.map((m) => statusDaMaquina(m, porMaquina.get(m.id) ?? []));
    return {
      disponiveis: status.filter((s) => s === "disponivel").length,
      imprimindo: programacoes.filter((p) => p.status === "imprimindo").length,
      manutencao: status.filter((s) => s === "manutencao" || s === "offline").length,
      naFila: programacoes.filter((p) => p.status === "a_fazer" || p.status === "programado" || p.status === "pausado").length,
      concluidasHoje: programacoes.filter((p) => p.status === "concluido" && (p.concluidoEm || "").slice(0, 10) === hoje).length,
    };
  }, [maquinas, porMaquina, programacoes, hoje]);

  const deHoje = useMemo(
    () => programacoes
      .filter((p) => p.data === hoje && p.status !== "cancelado")
      .sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99")),
    [programacoes, hoje],
  );
  const proximas = useMemo(
    () => programacoes
      .filter((p) => p.status === "programado" && (!p.data || p.data > hoje))
      .sort((a, b) => `${a.data || "9999"}${a.hora || "99"}`.localeCompare(`${b.data || "9999"}${b.hora || "99"}`))
      .slice(0, 6),
    [programacoes, hoje],
  );

  const semNada = maquinas.length === 0 && programacoes.length === 0;
  if (semNada) {
    return (
      <Momento icone="printer" titulo="A operação ainda não começou"
        texto="Cadastre as impressoras e programe a primeira impressão a partir de um arquivo da biblioteca." />
    );
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div className="ct-grade kpi-row">
        <Kpi label="Impressoras livres" value={n.disponiveis} color="var(--ok)" icon="printer" onClick={() => onIrPara("maquinas")} />
        <Kpi label="Imprimindo agora" value={n.imprimindo} color="var(--graf-1)" icon="player-play" onClick={() => onIrPara("kanban")} />
        <Kpi label="Na fila" value={n.naFila} color="var(--info)" icon="clock" onClick={() => onIrPara("kanban")} />
        <Kpi label="Manutenção / offline" value={n.manutencao} color="var(--perigo)" icon="tools" onClick={() => onIrPara("maquinas")} />
        <Kpi label="Concluídas hoje" value={n.concluidasHoje} color="var(--ok)" icon="circle-check" onClick={() => onIrPara("historico")} />
      </div>

      {maquinas.length > 0 && (
        <section>
          <h2 style={{ fontSize: 14, marginBottom: 10 }}>Máquinas</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
            {maquinas.map((m) => {
              const progs = porMaquina.get(m.id) ?? [];
              const st = statusDaMaquina(m, progs);
              const atual = progs.find((p) => p.status === "imprimindo") ?? progs.find((p) => p.status === "pausado");
              return (
                <div key={m.id} className="mc-card" style={{ padding: 12, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Icon name="printer" size={15} color={COR_STATUS_MAQUINA[st]} />
                    <span style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.nome}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: COR_STATUS_MAQUINA[st], fontWeight: 600 }}>
                    {ROTULO_STATUS_MAQUINA[st]}
                    {atual && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}> — {atual.arquivoNome}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="duo-eq" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 16, alignItems: "start" }}>
        <section>
          <h2 style={{ fontSize: 14, marginBottom: 10 }}>Hoje · {dataCurta(hoje)}</h2>
          {deHoje.length === 0 ? (
            <Momento compacto icone="calendar" titulo="Nada programado pra hoje"
              texto="Programe uma impressão ou veja os próximos dias na aba Programação." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {deHoje.map((p) => <CardProgramacao key={p.id} p={p} compacto onAbrir={onAbrir} onStatus={onStatus} />)}
            </div>
          )}
        </section>
        <section>
          <h2 style={{ fontSize: 14, marginBottom: 10 }}>Próximas</h2>
          {proximas.length === 0 ? (
            <Momento compacto icone="clock" titulo="Fila futura vazia"
              texto="O que for programado pra frente aparece aqui." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {proximas.map((p) => <CardProgramacao key={p.id} p={p} compacto onAbrir={onAbrir} onStatus={onStatus} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
