"use client";

import { useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { KpiIcone, Selo } from "../../ui/primitives";
import { CartaoPainel, VazioPainel } from "../../ui/CartaoPainel";
import { Abas } from "../../ui/Abas";
import { AnelProgresso } from "../../ui/micro";
import { MonoRoundedBarChart } from "../../ui/monocharts/MonoRoundedBarChart";
import { agendaProjetada, cumprimento, turnoDe, type ItemAgenda } from "@/lib/producao-hub";
import { duracao } from "@/lib/maquina-quadro";
import { useProduction, fmt } from "../parts";
import { dadoDe, useMaquinas } from "../dados";
import { EstadoLeitura, diaCurto, horaSP } from "../VisaoProducao";

type Escala = "dia" | "semana" | "mes";
const PERIODO: Record<Escala, string> = { dia: "hoje", semana: "7d", mes: "mes" };
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Programações: o planejamento. "Dia" é a agenda projetada das máquinas — o
 * banco guarda ORDEM e DURAÇÃO de cada programação, não horário marcado, então
 * o horário é previsão (ver `agendaProjetada`). "Semana" e "Mês" comparam o
 * que foi programado pra máquina com o que saiu fabricado, dia a dia.
 */
export function Programacoes() {
  const [escala, setEscala] = useState<Escala>("dia");
  const { snap } = useProduction(`period=${PERIODO[escala]}`);
  const lm = useMaquinas();
  const maquinas = dadoDe(lm)?.maquinas ?? [];
  const agenda = useMemo(() => agendaProjetada(maquinas), [maquinas]);
  const t = snap?.trends;

  const feitas = maquinas.reduce((s, m) => s + m.feitasHoje, 0);
  const previstas = feitas + agenda.length;
  const pausadas = maquinas.filter((m) => m.paradaMotivo);

  return (
    <div className="pv-pilha">
      <Abas valor={escala} onMuda={setEscala} ariaLabel="Escala da programação"
        itens={[{ valor: "dia", rotulo: "Dia" }, { valor: "semana", rotulo: "Semana" }, { valor: "mes", rotulo: "Mês" }]} />

      {escala === "dia" ? (
        <div className="og-grade">
          <CartaoPainel icone="clock" titulo="Linha do tempo" sub="Previsão pela fila e pela duração de cada programação">
            <EstadoLeitura l={lm} vazio={agenda.length === 0} textoVazio="Nenhuma programação para hoje.">
              <Linha agenda={agenda} />
            </EstadoLeitura>
          </CartaoPainel>

          <aside className="og-lado">
            <CartaoPainel icone="chart-line" titulo="Resumo do dia">
              <div className="pv-resumo-anel">
                <AnelProgresso valor={feitas} max={Math.max(1, previstas)} rotulo="Produção do dia" tamanho={120} espessura={10}>
                  <span style={{ display: "grid", justifyItems: "center" }}>
                    <b className="mt-num" style={{ fontSize: 22 }}>{previstas ? Math.round((feitas / previstas) * 100) : 0}%</b>
                    <span className="og-linha-sub" style={{ marginTop: 0 }}>feito</span>
                  </span>
                </AnelProgresso>
              </div>
              <ul className="og-lista">
                <Linha2 rotulo="Programadas no dia" valor={previstas} />
                <Linha2 rotulo="Concluídas" valor={feitas} />
                <Linha2 rotulo="Em andamento" valor={agenda.filter((a) => a.estado === "andamento").length} />
                <Linha2 rotulo="Pausadas" valor={agenda.filter((a) => a.estado === "pausado").length} />
                <Linha2 rotulo="Pedidos fabricados (ERP)" valor={t?.fabricados.today ?? null} />
                <Linha2 rotulo="Atrasados (ERP)" valor={snap?.pipeline.atrasados ?? null} />
              </ul>
              <p className="og-limpo">
                <Icon name={pausadas.length ? "alert-triangle" : "circle-check"} size={16} color={pausadas.length ? "var(--atencao)" : "var(--ok)"} />
                {pausadas.length ? `${pausadas.length} ${pausadas.length === 1 ? "máquina parada segura" : "máquinas paradas seguram"} a fila.` : "A produção está andando dentro do planejado."}
              </p>
            </CartaoPainel>

            <CartaoPainel icone="player-pause" titulo="Pausas">
              {pausadas.length === 0 ? <VazioPainel texto="Nenhuma máquina parada." /> : (
                <ul className="og-lista">
                  {pausadas.map((m) => (
                    <li key={m.id} className="og-proxima">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="og-linha-tit">{m.nome}</div>
                        <div className="og-linha-sub">{m.paradaMotivo}</div>
                      </div>
                      <Selo tom="atencao">{m.fila.length} na fila</Selo>
                    </li>
                  ))}
                </ul>
              )}
            </CartaoPainel>
          </aside>
        </div>
      ) : (
        <>
          <div className="og-kpis kpi-row">
            <KpiIcone label="Programado p/ máquina" value={t?.progMaquina.total ?? "—"} icon="calendar" />
            <KpiIcone label="Fabricado" value={t?.fabricados.total ?? "—"} icon="circle-check" cor="var(--ok)" />
            <KpiIcone label="Cumprimento" value={t ? `${cumprimento(t.progMaquina.total, t.fabricados.total) ?? "—"}${cumprimento(t.progMaquina.total, t.fabricados.total) == null ? "" : "%"}` : "—"} icon="chart-line" />
            <KpiIcone label="Média fabricada/dia" value={t ? Math.round(t.fabricados.avg) : "—"} icon="chart-bar" />
          </div>
          <CartaoPainel icone="chart-bar" titulo="Planejado × realizado" sub={snap?.periodLabel}>
            {!t ? <VazioPainel texto="Carregando…" /> : (
              <MonoRoundedBarChart semCartao eixoY altura={230} nomePrimario="Fabricado" nomeSecundario="Programado"
                pontos={t.fabricados.days.map((d, i) => ({ label: escala === "semana" ? diaCurto(d.day) : dm(d.day), primary: d.value, secondary: t.progMaquina.days[i]?.value ?? 0 }))} />
            )}
          </CartaoPainel>
          {t && (
            <CartaoPainel icone="list-details" titulo="Dia a dia">
              <ul className="og-lista">
                {[...t.fabricados.days].reverse().map((d) => {
                  const plan = t.progMaquina.days.find((x) => x.day === d.day)?.value ?? 0;
                  const c = cumprimento(plan, d.value);
                  return (
                    <li key={d.day} className="og-proxima">
                      <span className="og-prazo">{diaCurto(d.day)} {dm(d.day)}</span>
                      <span className="og-linha-sub" style={{ flex: 1, marginTop: 0 }}>{fmt(plan)} programados · {fmt(d.value)} fabricados</span>
                      <Selo tom={c == null ? "neutro" : c >= 90 ? "ok" : c >= 60 ? "atencao" : "perigo"}>{c == null ? "—" : `${c}%`}</Selo>
                    </li>
                  );
                })}
              </ul>
            </CartaoPainel>
          )}
        </>
      )}
    </div>
  );
}

function Linha({ agenda }: { agenda: ItemAgenda[] }) {
  let turno = "";
  return (
    <ol className="pv-tempo">
      {agenda.slice(0, 40).map((a) => {
        const t = turnoDe(a.inicio);
        const cab = t !== turno ? (turno = t) : null;
        return (
          <li key={a.id} className="pv-tempo-item" data-estado={a.estado}>
            {cab && <span className="pv-turno">{cab}</span>}
            <span className="pv-tempo-hora mt-num">{horaSP(a.inicio)}</span>
            <span className="pv-tempo-ponto" aria-hidden />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="og-linha-tit">{a.referencia}</div>
              <div className="og-linha-sub">{[a.maquina, a.material, `${duracao(a.minutos)} · até ${horaSP(a.fim)}`].filter(Boolean).join(" · ")}</div>
            </div>
            <Selo tom={a.estado === "andamento" ? "ok" : a.estado === "pausado" ? "atencao" : "destaque"}>
              {a.estado === "andamento" ? "Em andamento" : a.estado === "pausado" ? "Pausado" : "Programado"}
            </Selo>
          </li>
        );
      })}
    </ol>
  );
}

function Linha2({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  return (
    <li className="og-proxima" style={{ minHeight: 40 }}>
      <span className="og-linha-sub" style={{ flex: 1, marginTop: 0 }}>{rotulo}</span>
      <b className="mt-num">{valor == null ? "—" : fmt(valor)}</b>
    </li>
  );
}
