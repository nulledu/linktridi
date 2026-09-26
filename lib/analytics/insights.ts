// ── Insights da operação — as frases que a tela escreve sozinha ─────────────
//
// Função PURA: entra o dado já montado, sai a lista de frases. Ela mora fora
// do componente e fora da rota por um motivo só — é a parte do Analytics que
// mais fácil vira mentira, e mentira em frase curta convence mais do que
// número errado em gráfico. Sendo pura, cada regra tem teste
// (`lib/__tests__/analytics-insights.test.ts`).
//
// Três regras de redação que valem pra qualquer insight novo:
//
//  1. **Só aparece quando existe.** Nada de "a produção está estável" ocupando
//     um cartão — quem lê aprende a ignorar a faixa inteira se ela estiver
//     sempre cheia. Piso de relevância em toda regra.
//  2. **A frase diz o NÚMERO e a BASE.** "Produção abaixo do ritmo" sozinho
//     manda a pessoa procurar; "18% abaixo da média dos últimos dias" já é a
//     análise.
//  3. **Cada insight aponta pra uma seção da tela** (`alvo`). Insight sem
//     destino é enfeite: a pessoa lê, concorda e não tem o que fazer.

import type { AnalyticsOperacao, Insight, TomInsight } from "./tipos";

/** O que o motor precisa — um recorte do snapshot, pra poder ser testado sem
 *  montar o objeto inteiro. */
export type EntradaInsights = Pick<AnalyticsOperacao, "resumo" | "fluxo" | "parados" | "series">;

/** Pisos de relevância. Abaixo disto é ruído de fim de semana, não notícia. */
const PISO_PCT = 10;       // variação mínima pra virar frase
const PISO_VOLUME = 5;     // base mínima: 1→2 pedidos é +100% e não significa nada
const PISO_FILA = 10;      // fila mínima pra chamar de gargalo
const PISO_DIAS = 2;       // dias parados mínimos pra chamar de acúmulo

/** Ordem de leitura: o que exige ação vem antes do que só tranquiliza. */
const PESO: Record<TomInsight, number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };

const pct = (n: number) => `${Math.abs(Math.round(n))}%`;
const num = (n: number) => n.toLocaleString("pt-BR");
/** "2,8 dias" — a vírgula é a de ler, não a do CSS. */
const dias = (n: number) => `${n.toFixed(1).replace(".", ",")} ${n === 1 ? "dia" : "dias"}`;

export function gerarInsights(e: EntradaInsights, teto = 4): Insight[] {
  const out: Insight[] = [];
  const { resumo, fluxo, parados, series } = e;

  // ── Produção contra o PRÓPRIO ritmo ───────────────────────────────────────
  // A régua é a média diária do período, não o período anterior: "caiu 18% vs.
  // o mês passado" mistura mês curto com mês longo, e a pergunta do chão de
  // fábrica é "hoje estamos abaixo do que costumamos fazer?".
  const fab = series.fabricados;
  const ultimo = fab.pontos.at(-1);
  if (ultimo && fab.media >= PISO_VOLUME) {
    const desvio = ((ultimo.atual - fab.media) / fab.media) * 100;
    if (desvio <= -PISO_PCT) {
      out.push({
        id: "producao-abaixo", tom: "atencao", icon: "alert-circle",
        titulo: "Produção abaixo do ritmo",
        texto: `A produção está ${pct(desvio)} abaixo da média do período (${num(fab.media)}/dia).`,
        alvo: "series",
      });
    } else if (desvio >= PISO_PCT * 2) {
      out.push({
        id: "producao-acima", tom: "bom", icon: "trending-up",
        titulo: "Produção acelerou",
        texto: `${num(ultimo.atual)} fabricados no último dia, ${pct(desvio)} acima da média do período.`,
        alvo: "series",
      });
    }
  }

  // ── Expedição contra o período anterior ───────────────────────────────────
  const env = resumo.enviados;
  if (env.deltaPct != null && env.anterior >= PISO_VOLUME && Math.abs(env.deltaPct) >= PISO_PCT) {
    const subiu = env.deltaPct > 0;
    out.push({
      id: "expedicao", tom: subiu ? "bom" : "atencao", icon: subiu ? "send" : "trending-down",
      titulo: subiu ? "Expedição acelerou" : "Expedição desacelerou",
      texto: `${num(env.atual)} pedidos enviados, ${pct(env.deltaPct)} ${subiu ? "acima" : "abaixo"} do período anterior.`,
      alvo: "fluxo",
    });
  }

  // ── Gargalo: a fila mais cheia que também está ESPERANDO ──────────────────
  // Fila grande com espera curta é etapa de passagem (separação, por exemplo):
  // ela enche e esvazia no mesmo dia. O que dói é fila grande PARADA.
  const gargalo = parados
    .filter((p) => p.parados >= PISO_FILA && p.diasMedio >= PISO_DIAS)
    .sort((a, b) => b.parados * b.diasMedio - a.parados * a.diasMedio)[0];
  if (gargalo) {
    out.push({
      id: `gargalo-${gargalo.id}`, tom: gargalo.nivel === "alta" ? "ruim" : "atencao", icon: "alert-triangle",
      titulo: `Gargalo em ${gargalo.nome}`,
      texto: `${num(gargalo.parados)} pedidos aguardam esta etapa há ${dias(gargalo.diasMedio)} em média.`,
      alvo: "parados",
    });
  }

  // ── Prazo (tempo de ciclo) ────────────────────────────────────────────────
  // Aqui CAIR é bom, e é por isso que o tom não sai do sinal: uma regra que
  // pinta toda queda de vermelho transformaria a melhora do mês em alarme.
  const tm = resumo.tempoMedioDias;
  if (tm.deltaPct != null && tm.anterior > 0 && Math.abs(tm.deltaPct) >= PISO_PCT) {
    const melhorou = tm.deltaPct < 0;
    const delta = Math.abs(tm.atual - tm.anterior);
    out.push({
      id: "prazo", tom: melhorou ? "bom" : "atencao", icon: melhorou ? "circle-check" : "clock",
      titulo: melhorou ? "Prazo melhorou" : "Prazo piorou",
      texto: `O tempo médio entre a entrada e o envio ${melhorou ? "caiu" : "subiu"} ${dias(delta)} — agora ${dias(tm.atual)}.`,
      alvo: "resumo",
    });
  }

  // ── Atrasados vs. o pipeline ──────────────────────────────────────────────
  // O número absoluto não diz nada sozinho: 315 atrasados num pipeline de 400 é
  // uma operação parada; num de 5.000 é rotina. Por isso a frase é a FATIA.
  const emAberto = fluxo.reduce((s, f) => s + f.parados, 0);
  if (resumo.atrasados > 0 && emAberto > 0) {
    const fatia = (resumo.atrasados / emAberto) * 100;
    if (fatia >= 15) {
      out.push({
        id: "atrasados", tom: fatia >= 30 ? "ruim" : "atencao", icon: "alert-triangle",
        titulo: "Atrasos concentrados",
        texto: `${num(resumo.atrasados)} pedidos vencidos — ${pct(fatia)} de tudo que está em aberto.`,
        alvo: "parados",
      });
    }
  }

  // ── SLA de entrega ────────────────────────────────────────────────────────
  const sla = resumo.slaPct;
  if (sla.atual > 0 && sla.deltaPct != null && Math.abs(sla.atual - sla.anterior) >= 5) {
    const subiu = sla.atual > sla.anterior;
    out.push({
      id: "sla", tom: subiu ? "bom" : "atencao", icon: subiu ? "circle-check" : "alert-circle",
      titulo: subiu ? "SLA em recuperação" : "SLA em queda",
      texto: `${Math.round(sla.atual)}% dos envios saíram em até ${resumo.slaMetaDias} dias, contra ${Math.round(sla.anterior)}% no período anterior.`,
      alvo: "resumo",
    });
  }

  // ── Etapa fora do próprio ritmo ───────────────────────────────────────────
  const caiu = fluxo
    .filter((f) => f.deltaPct != null && f.total >= PISO_VOLUME && f.deltaPct <= -PISO_PCT * 1.5)
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))[0];
  if (caiu && !out.some((i) => i.id.startsWith("gargalo"))) {
    out.push({
      id: `etapa-${caiu.key}`, tom: "atencao", icon: "trending-down",
      titulo: `${caiu.nome} passou menos`,
      texto: `${num(caiu.total)} passagens no período, ${pct(caiu.deltaPct!)} abaixo do anterior.`,
      alvo: "fluxo",
    });
  }

  // Estabilidade só é notícia quando NÃO há mais nada a dizer: sem esta saída a
  // faixa sumia inteira em dia calmo e a tela parecia quebrada.
  if (out.length === 0) {
    return [{
      id: "estavel", tom: "neutro", icon: "activity",
      titulo: "Operação estável",
      texto: "Nenhum indicador saiu do próprio ritmo no período selecionado.",
      alvo: "fluxo",
    }];
  }

  return out.sort((a, b) => PESO[a.tom] - PESO[b.tom]).slice(0, teto);
}
