// ── Mandar trabalho pra máquina: a régua ─────────────────────────────────────
//
// O painel da parede (lib/painel-maquinas.ts) LÊ a fila; este arquivo é a regra
// de quem ESCREVE nela. Puro, sem banco: as mesmas validações valem na tela de
// controle e na rota, e se as duas divergissem a tela deixaria criar o que o
// servidor recusa.
//
// ── POR QUE NÃO EXISTE "ACEITAR" ────────────────────────────────────────────
//
// Atividade de PESSOA tem aceite porque pessoa escolhe e se compromete — o
// aceite é o contrato. Máquina não escolhe: a programação cai DIRETO na fila
// dela, e quem aperta os botões (iniciar, concluir) é o gestor ou o operador
// na tela de controle. Decisão do dono: "não teria como aceitar, teria que
// fazer direto mesmo".

export const STATUS_PROGRAMACAO = ["fila", "executando", "concluida", "cancelada"] as const;
export type StatusProgramacao = (typeof STATUS_PROGRAMACAO)[number];

export type AcaoDaProgramacao = "iniciar" | "concluir" | "cancelar";

/** Teto de minutos por programação: acima de 12h num laser é dado digitado errado. */
export const MINUTOS_MAXIMOS = 720;

/**
 * O que impede esta programação de ser criada, ou `null`.
 * Frases, não códigos: quem lê está montando a fila do dia.
 */
export function problemaDaNovaProgramacao(p: {
  maquinaId?: unknown; referencia?: unknown; minutos?: unknown;
}): string | null {
  if (!String(p.maquinaId ?? "").trim()) return "Escolha a máquina — a programação cai na fila DELA, não numa fila geral.";
  const ref = String(p.referencia ?? "").trim();
  if (!ref) return "Diga o que vai ser cortado (o pedido, o programa, a peça).";
  if (ref.length > 120) return "A referência ficou longa demais — até 120 caracteres.";
  const m = Math.trunc(Number(p.minutos) || 0);
  if (m <= 0) return "Diga quantos minutos o corte leva — é o que faz a barra da TV andar.";
  if (m > MINUTOS_MAXIMOS) {
    return `${m} minutos é mais de 12 horas numa máquina só. Se o serviço é esse mesmo, divida em partes — ` +
      "a barra de progresso de um trabalho de dias não diz nada pra quem olha a parede.";
  }
  return null;
}

/**
 * A transição que esta ação faz, ou uma FRASE de recusa.
 *
 * O mapa é curto de propósito:
 *   fila       → iniciar, concluir, cancelar
 *   executando → concluir, cancelar
 *   concluida / cancelada → nada (são estados finais)
 *
 * `fila → concluir` é PERMITIDO, e é decisão: o operador esquece de apertar
 * "iniciar" o dia inteiro — exigi-lo transformaria o esquecimento num trabalho
 * que nunca fecha. Concluir da fila carimba início e fim juntos.
 */
export function transicao(
  atual: string | null | undefined,
  acao: AcaoDaProgramacao,
): { ok: true; para: StatusProgramacao } | { ok: false; frase: string } {
  const de = String(atual ?? "fila");
  if (de === "concluida") return { ok: false, frase: "Este trabalho já foi concluído — não há o que mudar nele." };
  if (de === "cancelada") return { ok: false, frase: "Este trabalho foi cancelado. Se ele voltou, crie uma programação nova." };
  if (acao === "iniciar") {
    if (de === "executando") return { ok: false, frase: "Este trabalho já está rodando." };
    return { ok: true, para: "executando" };
  }
  if (acao === "concluir") return { ok: true, para: "concluida" };
  return { ok: true, para: "cancelada" };
}

/**
 * A frase de quando o banco recusa um SEGUNDO "executando" na mesma máquina
 * (índice único `maq_prog_uma_executando`). A corrida é real — duas pessoas na
 * tela de controle — e "duplicate key" não diz o que fazer.
 */
export const FRASE_JA_RODANDO =
  "Esta máquina já está rodando outro trabalho. Conclua (ou cancele) o atual antes de iniciar o próximo.";

/**
 * Posição de uma programação nova: o FIM da fila da máquina.
 *
 * `max + 1` sobre as posições vivas, nunca `count`: cancelar uma do meio
 * deixaria o count menor que a última posição e a nova nasceria EMPATADA com
 * uma existente — e duas posições iguais fazem a fila da TV embaralhar a cada
 * refresh, porque o desempate vira ordem de retorno do banco.
 */
export function proximaPosicao(posicoesVivas: Array<number | null | undefined>): number {
  let maior = 0;
  for (const p of posicoesVivas) {
    const n = Math.trunc(Number(p) || 0);
    if (n > maior) maior = n;
  }
  return maior + 1;
}

// ── A visão da tela de controle ─────────────────────────────────────────────
//
// A TV (lib/painel-maquinas.ts) mostra um RECORTE: 3 próximas, e o "atual"
// pode ser só a próxima da fila fantasiada com 0%. Quem controla precisa da
// fila INTEIRA e de saber o id do que roda — senão o botão "concluir" não tem
// em quem apertar. Por isso a tela de controle não lê o shape da TV: monta o
// dela daqui, das mesmas linhas cruas.

import type { LinhaMaquina, LinhaProgramacao } from "./painel-maquinas";
import { apurarDia, diaSP, entradaOEE } from "./painel-maquinas";
import { calcularOEE, type ResultadoOEE } from "./oee";

export interface ProgramacaoControle {
  id: string;
  referencia: string;
  material: string | null;
  minutos: number;
  posicao: number;
}

export interface MaquinaControle {
  id: string;
  nome: string;
  porte: string;
  /** Motivo da parada — `null` quando a máquina está rodando normal. */
  paradaMotivo: string | null;
  /** O que está EM ANDAMENTO agora (status `executando`), com o id. */
  executando: (ProgramacaoControle & { iniciadaAt: string | null }) | null;
  /** A fila inteira, na ordem — não os 3 da TV. */
  fila: ProgramacaoControle[];
  /** Quantas fecharam HOJE — é o "marcado como feito" do dia. */
  feitasHoje: number;
  /** OEE do dia desta máquina (ver `lib/oee.ts`). */
  oee: ResultadoOEE;
  /** Quantas fecharam hoje SEM apontar peça — o que segura a qualidade. */
  semApontamentoHoje: number;
}

export function montarControle(
  maquinas: LinhaMaquina[],
  programacoes: LinhaProgramacao[],
  agora = new Date(),
): MaquinaControle[] {
  const hoje = diaSP(agora);
  const porMaquina = new Map<string, LinhaProgramacao[]>();
  for (const p of programacoes) {
    const lista = porMaquina.get(p.maquina_id) ?? [];
    lista.push(p);
    porMaquina.set(p.maquina_id, lista);
  }

  return maquinas.map((m) => {
    const minhas = porMaquina.get(m.id) ?? [];
    const executando = minhas.find((p) => p.status === "executando") ?? null;
    const fila = minhas
      .filter((p) => p.status === "fila")
      // Mesmo desempate da TV: `posicao` manda, o id segura a ordem quando
      // duas posições empatam — as duas telas não podem discordar da fila.
      .sort((a, b) => (Number(a.posicao) || 0) - (Number(b.posicao) || 0) || a.id.localeCompare(b.id));
    const aberta = (p: LinhaProgramacao): ProgramacaoControle => ({
      id: p.id,
      referencia: p.referencia,
      material: p.material,
      minutos: Math.max(0, Number(p.minutos_estimados) || 0),
      posicao: Number(p.posicao) || 0,
    });
    return {
      id: m.id,
      nome: m.nome,
      porte: (m.porte || "P").toUpperCase(),
      paradaMotivo: m.parada_motivo,
      executando: executando ? { ...aberta(executando), iniciadaAt: executando.iniciada_at } : null,
      fila: fila.map(aberta),
      oee: (() => {
        const dia = apurarDia(minhas, agora);
        const emCurso = executando?.iniciada_at
          ? Math.max(0, Math.round((agora.getTime() - new Date(executando.iniciada_at).getTime()) / 60000))
          : 0;
        return calcularOEE(entradaOEE(m, { ...dia, minutosHoje: dia.minutosHoje + emCurso }, agora));
      })(),
      semApontamentoHoje: minhas.filter(
        (p) => p.status === "concluida" && p.concluida_at && diaSP(p.concluida_at) === hoje && p.pecas == null,
      ).length,
      feitasHoje: minhas.filter(
        (p) => p.status === "concluida" && p.concluida_at && diaSP(p.concluida_at) === hoje,
      ).length,
    };
  });
}

/**
 * A máquina que recebe uma reposição automática sem máquina preferida: a de
 * MENOS minutos pendentes (fila + executando). Empate desempata pela ordem de
 * chegada da lista — que o chamador manda na ordem da parede (`ordem`), então
 * o empate cai na primeira da parede, estável entre varreduras.
 */
export function maquinaMenosCarregada(
  candidatas: Array<{ id: string; minutosPendentes: number }>,
): string | null {
  let escolhida: string | null = null;
  let menor = Infinity;
  for (const c of candidatas) {
    const m = Math.max(0, Number(c.minutosPendentes) || 0);
    if (m < menor) { menor = m; escolhida = c.id; }
  }
  return escolhida;
}
