"use client";

// A segunda visão do mês: o calendário, de segunda a domingo, com os prints
// em miniatura dentro de cada dia. É onde a FREQUÊNCIA aparece — os dias sem
// story saltam aos olhos de um jeito que a lista por semana não mostra.
// Tocar num dia abre os stories dele embaixo.
//
// No celular a grade não encolhe abaixo de 44px por dia (alvo de toque): num
// telefone de 320px ela ROLA dentro do próprio bloco, nunca a página.

import { useMemo, useState } from "react";
import { Botao } from "../../ui/controles";
import { Fila } from "../../ui/micro";
import { INICIAIS_SEMANA, diaDaSemana, diasNoMes, nomeDoMes, partesSP, rotuloDia } from "@/lib/marketing-stories/calendario";
import { formatarConversao, formatarInteiro, resumir } from "@/lib/marketing-stories/metricas";
import type { Story } from "@/lib/marketing-stories/tipos";
import { CapaStory } from "./pecas";
import { EsqueletoQuadro, type RenderCard } from "./Quadro";

const pad = (n: number) => String(n).padStart(2, "0");
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function CalendarioStories({ mes, stories, hoje, carregando, podeCriar, renderCard, onNovoNoDia }: {
  mes: string;
  stories: Story[];
  /** `AAAA-MM-DD` de Brasília. */
  hoje: string;
  carregando: boolean;
  podeCriar: boolean;
  renderCard: RenderCard;
  onNovoNoDia: (data: string) => void;
}) {
  const total = diasNoMes(mes);
  const antes = diaDaSemana(mes, 1);
  const mesDeHoje = hoje.slice(0, 7);
  const hojeDia = mesDeHoje === mes ? Number(hoje.slice(8, 10)) : null;

  const porDia = useMemo(() => {
    const m = new Map<number, Story[]>();
    for (const s of stories) {
      const p = partesSP(s.publicadoEm);
      if (p.mes !== mes) continue;
      m.set(p.dia, [...(m.get(p.dia) ?? []), s]);
    }
    for (const l of m.values()) l.sort((a, b) => (a.publicadoEm < b.publicadoEm ? -1 : 1));
    return m;
  }, [stories, mes]);

  const [escolhido, setEscolhido] = useState<number | null>(null);
  const dia = escolhido ?? hojeDia ?? (porDia.size ? Math.min(...porDia.keys()) : null);

  // Frequência: só conta dias que JÁ passaram (amanhã sem story não é buraco).
  const ultimo = mes < mesDeHoje ? total : hojeDia ?? 0;
  let publicados = 0;
  let diasCom = 0;
  for (const [d, l] of porDia) {
    if (d > ultimo) continue;
    const n = l.filter((s) => s.status !== "planejado").length;
    publicados += n;
    if (n) diasCom++;
  }
  const diasSem = Math.max(0, ultimo - diasCom);

  if (carregando) return <EsqueletoQuadro n={7} />;

  const doDia = dia != null ? porDia.get(dia) ?? [] : [];
  const r = resumir(doDia);
  const dataDoDia = dia != null ? `${mes}-${pad(dia)}` : "";
  const diaFuturo = dia != null && (hojeDia != null ? dia > hojeDia : mes > mesDeHoje);

  return (
    <section className="sto-cal" aria-label={`Calendário de ${nomeDoMes(mes)}`}>
      <p className="sto-cal-freq">
        {ultimo === 0 ? "O mês ainda não começou — dá pra ir planejando." : (
          <>
            <strong>{publicados}</strong> {publicados === 1 ? "story" : "stories"} em <strong>{diasCom}</strong> de {ultimo} dias
            {" · "}<strong>{diasSem}</strong> {diasSem === 1 ? "dia" : "dias"} sem story
            {diasCom ? <> · média de <strong>{(publicados / diasCom).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong> por dia postado</> : null}
          </>
        )}
      </p>

      <div className="sto-cal-rolo">
        <div className="sto-cal-grade">
          {INICIAIS_SEMANA.map((d) => <div key={d} className="sto-cal-dsem" aria-hidden>{d}</div>)}
          {Array.from({ length: antes }, (_, i) => <div key={`v${i}`} className="sto-cal-fora" aria-hidden />)}
          {Array.from({ length: total }, (_, i) => {
            const d = i + 1;
            const lista = porDia.get(d) ?? [];
            const futuro = hojeDia != null ? d > hojeDia : mes > mesDeHoje;
            return (
              <button
                key={d} type="button" className="sto-cal-dia" onClick={() => setEscolhido(d)} aria-pressed={d === dia}
                aria-label={`${d} de ${nomeDoMes(mes).toLowerCase()}: ${lista.length ? `${lista.length} ${lista.length === 1 ? "story" : "stories"}` : "nenhum story"}`}
                data-hoje={d === hojeDia ? "1" : undefined} data-sel={d === dia ? "1" : undefined}
                data-vazio={lista.length ? undefined : "1"} data-futuro={futuro ? "1" : undefined}
                data-um={lista.length === 1 ? "1" : undefined}
              >
                <span className="sto-cal-num">{d}</span>
                {lista.length > 0 && (
                  <span className="sto-cal-thumbs" aria-hidden>
                    {lista.slice(0, 3).map((s) => <CapaStory key={s.id} s={s} className="sto-cal-thumb" />)}
                    {lista.length > 3 && <span className="sto-cal-mais">+{lista.length - 3}</span>}
                  </span>
                )}
                {lista.length > 0 && <span className="sto-cal-qtd" aria-hidden>{lista.length}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {dia != null && (
        <div className="sto-semana">
          <header className="sto-semana-cab">
            <h3 className="sto-semana-nome">{capitalizar(rotuloDia(dataDoDia))}</h3>
            {doDia.length > 0 && (
              <span className="sto-semana-nums">
                <span><strong>{doDia.length}</strong> {doDia.length === 1 ? "story" : "stories"}</span>
                <span><strong>{formatarInteiro(r.cliques)}</strong> cliques</span>
                <span><strong>{formatarInteiro(r.vendas)}</strong> vendas</span>
                <span><strong>{formatarConversao(r.conversao)}</strong></span>
              </span>
            )}
          </header>
          {doDia.length ? (
            <Fila className="sto-grade">{doDia.map((s) => renderCard(s))}</Fila>
          ) : (
            <div className="sto-semana-vazia">
              <span>{diaFuturo ? "Nada planejado pra este dia." : "Nenhum story neste dia."}</span>
              {podeCriar && (
                <Botao tamanho="sm" variante="sutil" icone="plus" onClick={() => onNovoNoDia(dataDoDia)}>
                  {diaFuturo ? "Planejar" : "Adicionar"}
                </Botao>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
