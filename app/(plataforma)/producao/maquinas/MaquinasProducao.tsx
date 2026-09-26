"use client";

import { useState } from "react";
import { Icon } from "../../Icon";
import { KpiIcone, Selo } from "../../ui/primitives";
import { CartaoPainel, VazioPainel } from "../../ui/CartaoPainel";
import { PainelLateral } from "../../ui/controles";
import { AnelProgresso, Progresso } from "../../ui/micro";
import { MonoRoundedBarChart } from "../../ui/monocharts/MonoRoundedBarChart";
import type { MaquinaControle } from "@/lib/maquina-fila";
import { duracao, type Quadro } from "@/lib/maquina-quadro";
import { ESTADO_MAQUINA, estadoMaquina, minutosDeUso, resumoMaquinas } from "@/lib/producao-hub";
import { dadoDe, useMaquinas, useQuadro } from "../dados";
import { EstadoLeitura } from "../VisaoProducao";
import { MaquinasControle } from "../MaquinasControle";

/**
 * Máquinas: o zoom dos dois cartões de máquina da Visão geral. Em cima, a
 * leitura (quem está ativa, parada, em manutenção, quanto produziu e quanto
 * rodou); cada linha abre o detalhe da máquina. Embaixo, "Operar" — a tela de
 * sempre, onde o operador marca em andamento/feita e o controle programa.
 */
export function MaquinasProducao() {
  const lm = useMaquinas();
  const quadro = dadoDe(useQuadro());
  const maquinas = dadoDe(lm)?.maquinas ?? [];
  const res = resumoMaquinas(maquinas);
  const [aberta, setAberta] = useState<MaquinaControle | null>(null);
  const uso = (m: MaquinaControle) => minutosDeUso(quadro?.raias.find((r) => r.maquinaId === m.id));

  return (
    <div className="pv-pilha">
      <div className="og-kpis kpi-row">
        <KpiIcone label="Máquinas ativas" value={lm.estado === "ok" ? `${res.ativas} de ${res.total}` : "—"} icon="settings" cor="var(--ok)" />
        <KpiIcone label="Em manutenção" value={lm.estado === "ok" ? res.manutencao : "—"} icon="tools" cor="var(--atencao)" />
        <KpiIcone label="Paradas" value={lm.estado === "ok" ? res.paradas : "—"} icon="player-pause" cor="var(--perigo)" />
        <KpiIcone label="Disponibilidade" value={res.disponibilidade == null ? "—" : `${Math.round(res.disponibilidade)}%`} icon="chart-line" />
      </div>

      <div className="og-duo og-duo-largo">
        <CartaoPainel icone="layout-columns" titulo="Quadro de máquinas" sub="Toque numa máquina para ver os detalhes">
          <EstadoLeitura l={lm} vazio={maquinas.length === 0}>
            <ul className="og-lista">
              {maquinas.map((m) => {
                const e = estadoMaquina(m);
                return (
                  <li key={m.id}>
                    <button type="button" className="og-alerta pv-linha-btn" onClick={() => setAberta(m)}>
                      <Icon name="settings" size={18} color="var(--primary)" style={{ flex: "none" }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="og-linha-tit">{m.nome}</span>
                        <span className="og-linha-sub">{m.feitasHoje} feitas hoje · {uso(m) > 0 ? `${duracao(uso(m))} de uso` : "sem uso hoje"} · OEE {Math.round(m.oee.oee)}%</span>
                      </span>
                      <Selo tom={ESTADO_MAQUINA[e].tom}>{ESTADO_MAQUINA[e].rotulo}</Selo>
                      <Icon name="chevron-right" size={16} color="var(--text-dim)" style={{ flex: "none" }} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </EstadoLeitura>
        </CartaoPainel>

        <CartaoPainel icone="player-play" titulo="Status em tempo real" sub="O que está na máquina agora">
          <EstadoLeitura l={lm} vazio={maquinas.length === 0}>
            <ul className="og-lista">
              {maquinas.map((m) => {
                const e = estadoMaquina(m);
                return (
                  <li key={m.id} className="og-proxima">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="og-linha-tit">{m.nome}</div>
                      <div className="og-linha-sub">
                        {m.paradaMotivo ?? (m.executando ? `${m.executando.referencia}${m.executando.material ? ` · ${m.executando.material}` : ""}` : m.fila[0] ? `Próxima: ${m.fila[0].referencia}` : "Sem fila")}
                      </div>
                    </div>
                    <Selo tom={ESTADO_MAQUINA[e].tom}>{ESTADO_MAQUINA[e].rotulo}</Selo>
                  </li>
                );
              })}
            </ul>
          </EstadoLeitura>
        </CartaoPainel>
      </div>

      {/* Só peças no eixo: programações feitas (unidades) ao lado de peças
          (centenas) viravam um toco invisível — unidades diferentes não
          dividem eixo. As programações estão no Quadro de máquinas acima. */}
      <CartaoPainel icone="chart-bar" titulo="Produção por máquina" sub="Peças apontadas hoje">
        {maquinas.length === 0 ? <VazioPainel texto={lm.estado === "carregando" ? "Carregando…" : "Sem máquinas."} /> : (
          <MonoRoundedBarChart semCartao eixoY altura={200} nomePrimario="Peças"
            pontos={maquinas.map((m) => ({ label: m.nome, primary: m.oee.pecas }))} />
        )}
      </CartaoPainel>

      <section id="operar" className="pv-operar">
        <h2 className="pv-secao"><Icon name="tools" size={18} color="var(--primary)" /> Operar máquinas</h2>
        <MaquinasControle />
      </section>

      {aberta && <DetalheMaquina m={aberta} quadro={quadro} onFechar={() => setAberta(null)} />}
    </div>
  );
}

function DetalheMaquina({ m, quadro, onFechar }: { m: MaquinaControle; quadro: Quadro | null; onFechar: () => void }) {
  const e = estadoMaquina(m);
  const raia = quadro?.raias.find((r) => r.maquinaId === m.id);
  const o = m.oee;
  return (
    <PainelLateral centrado icone="settings" titulo={m.nome} subtitulo={`Porte ${m.porte} · ${ESTADO_MAQUINA[e].rotulo}`} onFechar={onFechar}>
      <div className="pv-pilha">
        {m.paradaMotivo && <p className="og-limpo"><Icon name="alert-triangle" size={16} color="var(--atencao)" /> {m.paradaMotivo}</p>}
        <div className="pv-oee">
          <AnelProgresso valor={o.oee} max={100} rotulo="OEE do dia" tamanho={88} espessura={8}>
            <b className="mt-num" style={{ fontSize: 18 }}>{Math.round(o.oee)}%</b>
          </AnelProgresso>
          <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 10 }}>
            {([["Disponibilidade", o.disponibilidade], ["Desempenho", o.desempenho], ["Qualidade", o.qualidade]] as const).map(([r, v]) => (
              <div key={r}>
                <div className="pv-etapa-cab"><span className="og-linha-sub" style={{ marginTop: 0 }}>{r}</span><b className="mt-num">{Math.round(v)}%</b></div>
                <Progresso valor={v} max={100} rotulo={r} altura={5} />
              </div>
            ))}
          </div>
        </div>
        <div className="og-celulas">
          <KpiIcone size="sm" label="Feitas hoje" value={m.feitasHoje} icon="circle-check" cor="var(--ok)" />
          <KpiIcone size="sm" label="Peças" value={o.pecas} icon="box" />
          <KpiIcone size="sm" label="Refugos" value={o.refugos} icon="alert-triangle" cor="var(--atencao)" />
          <KpiIcone size="sm" label="Tempo de uso" value={minutosDeUso(raia) > 0 ? duracao(minutosDeUso(raia)) : "—"} icon="clock" />
          <KpiIcone size="sm" label="Minutos perdidos" value={Math.round(o.minutosPerdidos)} icon="hourglass-high" cor="var(--perigo)" />
        </div>
        <div>
          <h3 className="pv-secao" style={{ fontSize: 14 }}>Agora</h3>
          {m.executando ? (
            <p className="og-linha-tit">{m.executando.referencia} <span className="og-linha-sub" style={{ display: "inline" }}>· {duracao(m.executando.minutos)} estimados</span></p>
          ) : <p className="og-limpo">Nada rodando.</p>}
        </div>
        <div>
          <h3 className="pv-secao" style={{ fontSize: 14 }}>Fila ({m.fila.length})</h3>
          {m.fila.length === 0 ? <p className="og-limpo">Fila vazia.</p> : (
            <ul className="og-lista">
              {m.fila.map((p, i) => (
                <li key={p.id} className="og-proxima">
                  <span className="og-prazo">{i + 1}º</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="og-linha-tit">{p.referencia}</div>
                    {p.material && <div className="og-linha-sub">{p.material}</div>}
                  </div>
                  <span className="og-hora">{duracao(p.minutos)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PainelLateral>
  );
}
