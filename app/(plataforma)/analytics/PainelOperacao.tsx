"use client";

/**
 * Analytics › Operação — a central de inteligência da fábrica.
 *
 * A ordem da tela É a hierarquia de leitura, e ela não muda por configuração:
 *
 *   resumo   → o que mudou          (fixo, igual pra todo mundo)
 *   insights → o que exige atenção  (fixo — manchete que cada um configura
 *                                    deixa de ser manchete)
 *   grade    → fluxo, gargalos, tendências, detalhamento (da pessoa)
 *
 * Uma busca só alimenta tudo: `/api/analytics/operacao` devolve o período E o
 * anterior já comparados. Cada widget calculando a própria comparação no
 * cliente seria uma requisição por peça na tela — a conta de invocação que já
 * pausou o projeto uma vez.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyticsOperacao } from "@/lib/analytics/tipos";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { Loading } from "../producao/parts";
import { Revalidando } from "./movimento";
import {
  Bloco, FaixaDeInsights, FluxoDaOperacao, GraficoAnalitico, OndeEstaParado, ResumoDaOperacao,
} from "./faixas";
import {
  AdicionarAnalise, AnalisesSalvas, GradeDeWidgets, gradePadrao, itemDe,
  type DefWidget, type ItemNaGrade, type VisaoSalva,
} from "./widgets";
import { PedidosDaEtapa } from "./PedidosDaEtapa";
import { useAbrirFechar } from "../ui/micro";

export const CATEGORIA = "operacao";

/**
 * O catálogo da Operação.
 *
 * `sub` é a PERGUNTA, não o tipo de gráfico: quem abre "Adicionar análise"
 * está procurando uma resposta, e "Gráfico de linha" não é uma.
 */
// A ORDEM importa: ela é a grade padrão de quem nunca mexeu em nada, e duas
// peças de meia largura precisam ficar vizinhas — intercaladas com as de
// largura cheia, cada uma nascia sozinha numa fileira com metade vazia.
export const CATALOGO_OPERACAO: DefWidget[] = [
  { id: "fluxo", nome: "Fluxo da operação", sub: "Onde o trabalho estreita entre o pedido e o envio?", icon: "route", largura: "cheia", unico: true },
  { id: "serie-fabricados", nome: "Fabricado × enviado", sub: "A produção está acompanhando a expedição?", icon: "chart-line", largura: "meia" },
  { id: "serie-enviados", nome: "Expedição por dia", sub: "O ritmo de envio está subindo ou caindo?", icon: "truck-loading", largura: "meia" },
  { id: "parados", nome: "Onde o trabalho está parado", sub: "Qual fila está travando a casa agora?", icon: "hourglass-high", largura: "cheia", unico: true },
];

export function PainelOperacao({ period, aoAtualizar, retrato, itens, salvas, onMudarItens, onSalvar, onAplicar, onApagar }: {
  period: PeriodState;
  aoAtualizar: (s: string) => void;
  /** Retrato de prova (`/dev-analytics`): nenhuma requisição sai. */
  retrato?: AnalyticsOperacao | null;
  itens: ItemNaGrade[];
  salvas: VisaoSalva[];
  onMudarItens: (itens: ItemNaGrade[]) => void;
  onSalvar: (nome: string) => void;
  onAplicar: (v: VisaoSalva) => void;
  onApagar: (id: string) => void;
}) {
  const [buscado, setBuscado] = useState<AnalyticsOperacao | null>(null);
  const [err, setErr] = useState(false);
  // Trocar o período NÃO apaga a tela: o desenho anterior fica, esmaecido, até
  // o novo chegar. Devolver o esqueleto a cada clique fazia a página saltar de
  // altura e quem comparava dois períodos perdia a referência no caminho.
  const [buscando, setBuscando] = useState(false);
  const pronto = period.key !== "custom" || (!!period.from && !!period.to);

  useEffect(() => {
    if (retrato) return;
    if (!pronto) return;
    let vivo = true;
    setBuscando(true);
    fetch(`/api/analytics/operacao?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!vivo) return; if (d?.updatedAt) { setBuscado(d); setErr(false); } else setErr(true); })
      .catch(() => { if (vivo) setErr(true); })
      .finally(() => { if (vivo) setBuscando(false); });
    return () => { vivo = false; };
  }, [period, pronto, retrato]);

  const dado = retrato ?? buscado;
  useEffect(() => { if (dado) aoAtualizar(dado.updatedAt); }, [dado, aoAtualizar]);

  // ── Drill: abrir os pedidos de uma etapa ─────────────────────────────────
  const [drill, setDrill] = useState<{ etapas: number[]; nome: string } | null>(null);
  const ultimo = useRef<{ etapas: number[]; nome: string } | null>(null);
  if (drill) ultimo.current = drill;
  const drillVivo = useAbrirFechar(!!drill, "--modal-close-dur");
  const abrirEtapa = useCallback((etapas: number[], nome: string) => setDrill({ etapas, nome }), []);

  /** Rola até a faixa que o insight aponta — é o que faz "Ver análise" valer. */
  const irPara = useCallback((alvo: string) => {
    const el = document.getElementById(`an-${alvo}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Foco além da rolagem: quem navega por teclado não "vê" a rolagem, e sem
    // isto o Tab seguinte voltaria pro topo da página.
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }, []);

  if (!dado) return <Loading title="" err={err} />;

  // O `id` vai no <section> do bloco, não num invólucro: envolver a faixa num
  // <span> só pra carregar a âncora transformaria um bloco de grade num
  // elemento inline, e a largura passaria a sair do conteúdo.
  const render = (def: string) => {
    switch (def) {
      case "fluxo":
        return <FluxoDaOperacao id="an-fluxo" fluxo={dado.fluxo} aoAbrirEtapa={abrirEtapa} />;
      case "parados":
        return <OndeEstaParado id="an-parados" parados={dado.parados} aoAbrirEtapa={abrirEtapa} />;
      case "serie-fabricados":
        return <GraficoAnalitico id="an-series" titulo="Fabricado × enviado" serie={dado.series.fabricados} apoio={dado.series.enviados} periodoAnterior={dado.periodoAnteriorLabel} />;
      case "serie-enviados":
        return <GraficoAnalitico titulo="Expedição por dia" serie={dado.series.enviados} apoio={dado.series.fabricados} periodoAnterior={dado.periodoAnteriorLabel} />;
      default:
        return null;
    }
  };

  return (
    <Revalidando ativo={buscando}>
      <div style={{ display: "grid", gap: 14 }}>
        <ResumoDaOperacao id="an-resumo" resumo={dado.resumo} periodo={dado.periodLabel} />
        <FaixaDeInsights insights={dado.insights} aoAbrir={irPara} />

        {/* Grade da pessoa + trilho das análises salvas. Duas colunas de
            largura FIXA no lado, não 8/12 e 4/12: a grade interna já divide em
            doze, e grade dentro de grade faria "metade" significar metade de
            dois terços — a largura escolhida pararia de bater com o nome. */}
        <div className="an-corpo">
          <div style={{ minWidth: 0 }}>
            <GradeDeWidgets itens={itens} catalogo={CATALOGO_OPERACAO} render={render} onMudar={onMudarItens} />
          </div>
          <aside className="an-corpo-lado">
            <AnalisesSalvas salvas={salvas} categoria={CATEGORIA} itensAtuais={itens}
              onAplicar={onAplicar} onSalvar={onSalvar} onApagar={onApagar} />
          </aside>
        </div>
      </div>

      {drillVivo.montado && ultimo.current && (
        <PedidosDaEtapa etapas={ultimo.current.etapas} nome={ultimo.current.nome}
          classe={drillVivo.classe} onClose={() => setDrill(null)} />
      )}
    </Revalidando>
  );
}

/** Grade inicial da Operação, quando a pessoa ainda não mexeu em nada. */
export const gradeInicialOperacao = () => gradePadrao(CATALOGO_OPERACAO);
export { itemDe };
export type { ItemNaGrade, VisaoSalva, DefWidget };
export { Bloco, AdicionarAnalise };
