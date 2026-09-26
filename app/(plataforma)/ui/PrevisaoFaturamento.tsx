"use client";

/**
 * Previsão de faturamento — hoje, semana e mês, com faixa de 80%.
 *
 * Duas metades, como toda peça do kit que busca dado:
 *  - `PainelPrevisao` desenha (recebe o objeto pronto; é o que o /dev-micro monta);
 *  - `PrevisaoFaturamento` busca `/api/previsao-faturamento` e recua o poll.
 *
 * O número é o faturamento da EMPRESA — o mesmo do cartão ao lado no
 * Analytics e no Tridify. O motor está em `lib/previsao-faturamento.ts`.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PrevisaoPorProduto } from "./PrevisaoPorProduto";
import type { PrevisaoCompleta as Dados } from "@/lib/previsao-faturamento";
import { fmtBRL2 } from "@/lib/format";
import { Icon } from "../Icon";
import { Abas } from "./Abas";
import { BlocoAnalitico } from "./analitico";
import { Fila } from "./micro";
import { usePollComRecuo } from "./usePoll";
import { MonoLegenda, MonoLinha, corDaSerie, useSeriesLigadas, type SerieMono } from "./graficos";

const brl = (n: number) => fmtBRL2(n).replace(/,\d{2}$/, "");
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaCurto = (d: string) => `${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Celula({ icone, rotulo, f, realizado, base, gasto, pctGasto }: {
  icone: string; rotulo: string;
  f: { previsto: number; min: number; max: number };
  realizado: number;
  base: string;
  /** Gasto + imposto previsto no mesmo horizonte. */
  gasto: number;
  /** Gasto + imposto ÷ faturamento previsto, em %. */
  pctGasto: number | null;
}) {
  const pct = f.previsto > 0 ? Math.min(100, (realizado / f.previsto) * 100) : 0;
  return (
    <div className="an-metrica">
      <div className="an-metrica-topo">
        <span className="an-metrica-ladrilho"><Icon name={icone} size={14} color="var(--primary-texto, var(--primary))" /></span>
        <span className="an-metrica-rot">{rotulo}</span>
      </div>
      <span className="an-metrica-num">{brl(f.previsto)}</span>
      <span className="an-metrica-base">entre {brl(f.min)} e {brl(f.max)}</span>
      {/* Quanto do previsto já entrou — a barra é o "falta quanto". */}
      <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
        aria-label={`${Math.round(pct)}% já realizado`}
        style={{ height: 6, borderRadius: 99, background: "var(--track, var(--border))", overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--graf-1, var(--primary))", borderRadius: 99 }} />
      </div>
      <span className="an-metrica-base">{brl(realizado)} realizado · {base}</span>
      {/* O gasto mora na MESMA célula do faturamento do horizonte: a pergunta
          é "quanto vou gastar pra faturar isso", não dois números soltos. */}
      <span className="an-metrica-base" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4 }}>
        <Icon name="speakerphone" size={12} color="var(--text-dim)" />
        gasto {brl(gasto)}{pctGasto != null && <> · <b style={{ color: "var(--text)" }}>{String(pctGasto).replace(".", ",")}%</b> do faturamento</>}
      </span>
    </div>
  );
}

type Modo = "hoje" | "proximos";

const SERIES_HOJE = ["Faturamento", "Faturamento previsto", "Gasto previsto"];
const SERIES_DIAS = ["Faturamento previsto", "Gasto previsto"];

type Slide = "total" | "produto";

export function PainelPrevisao({ dados, id, porProduto }: {
  dados: Dados; id?: string;
  /** Conteúdo do slide "Por produto". Padrão: busca a previsão por produto
   *  (só quando o slide abre). O /dev-micro passa um painel com dado pronto. */
  porProduto?: ReactNode;
}) {
  const [slide, setSlide] = useState<Slide>("total");
  const [modo, setModo] = useState<Modo>("hoje");
  const { dia, semana, mes, gastoPrev: g, pct, imposto } = dados;
  const horaAgora = Math.floor(dados.hora);
  const ritmo = dia.ritmo;
  const corRitmo = ritmo == null ? "var(--text-dim)" : ritmo >= 1 ? "var(--ok)" : "var(--perigo)";
  const nomes = modo === "hoje" ? SERIES_HOJE : SERIES_DIAS;
  const { desligadas, alternar, ligada } = useSeriesLigadas(nomes);
  const comImp = (n: number) => Math.round(n * imposto);
  const hh = (h: number) => `${String(h).padStart(2, "0")}h`;

  // Cor fixa por NOME: desligar uma linha não pode repintar as outras (a rampa
  // é por posição, e a posição muda quando uma série sai do array).
  const todas: SerieMono[] = modo === "hoje"
    ? [
        { nome: "Faturamento", cor: corDaSerie(0),
          pontos: dados.horas.filter((x) => x.h <= horaAgora && x.realizado != null).map((x) => ({ rotulo: hh(x.h), valor: x.realizado! })) },
        { nome: "Faturamento previsto", apoio: true, pontos: dados.horas.map((x) => ({ rotulo: hh(x.h), valor: x.esperado })) },
        { nome: "Gasto previsto", cor: corDaSerie(1), pontos: g.horas.map((x) => ({ rotulo: hh(x.h), valor: comImp(x.esperado) })) },
      ]
    : [
        { nome: "Faturamento previsto", cor: corDaSerie(0), pontos: dados.proximos.map((x) => ({ rotulo: x.d, valor: x.previsto })) },
        { nome: "Gasto previsto", cor: corDaSerie(1), pontos: g.proximos.map((x) => ({ rotulo: x.d, valor: comImp(x.previsto) })) },
      ];
  // Linha principal (não-apoio) primeiro: é ela que o MonoLinha usa de régua.
  const series = todas.filter((x) => ligada(x.nome)).sort((a, b) => Number(!!a.apoio) - Number(!!b.apoio));

  return (
    <BlocoAnalitico id={id} icone="trending-up" titulo="Previsão de faturamento e gasto"
      dica={`Faturamento da empresa previsto. Cada dia = tendência recente (suavização exponencial) × peso do dia da semana. Hoje é corrigido pelo que já entrou, comparado com quanto costuma ter entrado até esta hora. Semana e mês = realizado + hoje + dias que faltam. O gasto é o investimento em anúncio + imposto (${String(Math.round((imposto - 1) * 1000) / 10).replace(".", ",")}%), previsto pelo mesmo método; a porcentagem é gasto + imposto ÷ faturamento previsto. A faixa cobre 80% dos casos, medida pelo erro real do modelo nos últimos ${dados.diasDeHistorico} dias.`}
      direita={dados.mape != null ? (
        <span className="an-metrica-base" title="Erro médio da previsão de um dia no histórico">
          erro médio ±{String(dados.mape).replace(".", ",")}%
        </span>
      ) : undefined}>
      <Abas valor={slide} onMuda={setSlide} ariaLabel="O que prever"
        itens={[
          { valor: "total" as Slide, rotulo: "Total" },
          { valor: "produto" as Slide, rotulo: "Por produto" },
        ]} />
      {slide === "produto" ? (porProduto ?? <PrevisaoPorProduto />) : (<>
      <Fila className="an-resumo">
        <Celula icone="sun" rotulo="Hoje" f={dia} realizado={dia.realizado}
          base={`${Math.round(dia.fracaoEsperada * 100)}% do dia costuma estar vendido`}
          gasto={comImp(g.dia.previsto)} pctGasto={pct.dia} />
        <Celula icone="calendar-event" rotulo="Esta semana" f={semana} realizado={semana.realizado}
          base={semana.diasRestantes ? `${semana.diasRestantes} dia(s) pela frente` : "último dia"}
          gasto={comImp(g.semana.previsto)} pctGasto={pct.semana} />
        <Celula icone="calendar" rotulo="Este mês" f={mes} realizado={mes.realizado}
          base={mes.diasRestantes ? `${mes.diasRestantes} dia(s) pela frente` : "último dia"}
          gasto={comImp(g.mes.previsto)} pctGasto={pct.mes} />
      </Fila>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
        {ritmo != null && (
          <span className="an-metrica-delta" style={{ color: corRitmo }}>
            <Icon name={ritmo >= 1 ? "arrow-up" : "arrow-down"} size={13} color={corRitmo} />
            hoje em {Math.round(ritmo * 100)}% do ritmo esperado pra esta hora
          </span>
        )}
        {Math.abs(mes.linearIngenua - mes.previsto) > mes.previsto * 0.03 && (
          <span className="an-metrica-base">
            média simples daria {brl(mes.linearIngenua)} no mês — ignora o peso de cada dia da semana
          </span>
        )}
      </div>

      <Abas className="ui-abas--sub" valor={modo} onMuda={setModo} ariaLabel="Horizonte da previsão"
        itens={[
          { valor: "hoje" as Modo, rotulo: "Hoje, por hora" },
          { valor: "proximos" as Modo, rotulo: "Próximos 7 dias" },
        ]} />

      <MonoLinha series={series} altura={190} formatar={brl} rotuloDe={modo === "proximos" ? diaCurto : undefined} />
      <div className="mono-legenda" role="group" aria-label="Linhas do gráfico">
        <MonoLegenda itens={todas} desligadas={desligadas} aoAlternar={alternar} />
      </div>
      </>)}
    </BlocoAnalitico>
  );
}

/** Busca e desenha. O histórico é cacheado no servidor; o poll só refaz o "hoje". */
export function PrevisaoFaturamento({ id }: { id?: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  const ultimo = useRef<string>("");
  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/previsao-faturamento", { cache: "no-store" });
      if (!r.ok) { setErro(true); return false; }
      const d = (await r.json()) as Dados;
      const assinatura = `${d.dia.realizado}|${d.semana.realizado}|${d.mes.realizado}`;
      const mudou = assinatura !== ultimo.current;
      ultimo.current = assinatura;
      setDados(d); setErro(false);
      return mudou;
    } catch { setErro(true); return false; }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  usePollComRecuo(carregar, 5 * 60_000, 30 * 60_000);

  if (!dados) {
    return (
      <BlocoAnalitico id={id} icone="trending-up" titulo="Previsão de faturamento">
        <span className="an-metrica-base">{erro ? "Não deu pra calcular a previsão agora." : "Calculando a previsão…"}</span>
      </BlocoAnalitico>
    );
  }
  return <PainelPrevisao dados={dados} id={id} />;
}
