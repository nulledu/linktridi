// ── O contexto do painel de presença ─────────────────────────────────────────
// Mora aqui, e não dentro de `lib/ponto.ts`, por uma razão mecânica:
// `feriados-ponto.ts` importa `listFeriados` de `lib/ponto.ts`, então
// `lib/ponto.ts` importar a fusão de volta fecharia um ciclo. Este arquivo
// pode importar os dois lados; quem chama é a rota.

import { listPessoas } from "@/lib/ponto";
import type { ContextoDoPainel } from "@/lib/ponto";
import { ROTULO_MOTIVO } from "./tipos";
import { diaDaPessoa } from "./dia";
import { feriadosDoPonto } from "./feriados-ponto";
import { afastamentosOuVazio } from "./afastamentos";
import { compensacoesOuVazio } from "./compensacoes";

/**
 * O que o painel de HOJE precisa saber além das batidas: quem não tem
 * expediente e por quê.
 *
 * Antes desta costura, quem estava de férias aparecia "Ausente" na lista todo
 * dia e entrava na contagem de ausentes — o número que o gestor olha de manhã.
 *
 * Tolerante de ponta a ponta: qualquer falha devolve um contexto vazio, e o
 * painel volta a se comportar exatamente como antes.
 */
export async function contextoDoPainel(dia: string): Promise<ContextoDoPainel> {
  try {
    const [pessoas, fer, afast, comp] = await Promise.all([
      listPessoas(false),
      feriadosDoPonto(dia, dia).catch(() => ({ mapa: new Map<string, "folga" | "troca">(), detalhe: new Map() })),
      afastamentosOuVazio(dia, dia),
      compensacoesOuVazio(dia, dia),
    ]);

    const motivoPorPessoa = new Map<string, string>();
    const semExpediente = new Set<string>();

    for (const p of pessoas) {
      // A ponte entre os módulos: férias e atestado são do COLABORADOR. Pessoa
      // do Ponto sem vínculo simplesmente não tem afastamento.
      const col = p.colaboradorId;
      const d = diaDaPessoa(dia, p, {
        feriados: fer.mapa,
        detalheFeriado: fer.detalhe,
        afastamentos: col ? afast.get(col) ?? [] : [],
        compensacoes: col ? comp.get(col) ?? [] : [],
      });
      if (!d.motivo) continue;
      // O feriado já é rotulado pelo nome dele, que diz mais que "Feriado".
      motivoPorPessoa.set(p.id, d.motivo === "feriado" ? (d.feriado?.nome ?? "Feriado") : ROTULO_MOTIVO[d.motivo].label);
      // Domingo e sábado fora da escala o `ehDiaUtil` já resolve; o que este
      // conjunto acrescenta é o que ele não sabe — férias, atestado e folga
      // trocada. Marcar só quando a jornada zerou: meio período compensado
      // continua sendo dia de trabalho.
      if (d.jornadaMin === 0) semExpediente.add(p.id);
    }

    return { feriados: fer.mapa, motivoPorPessoa, semExpediente };
  } catch {
    return {};
  }
}
