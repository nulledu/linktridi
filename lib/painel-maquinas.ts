/**
 * O setor de máquinas na parede: o que cada laser está cortando AGORA, quanto
 * já rodou hoje e o que vem na fila.
 *
 * Este arquivo é PURO de propósito — nenhum import de servidor. O painel é um
 * componente de cliente e usa estas funções direto; com o `createSupabaseAdminClient`
 * aqui dentro, o bundler arrastava `next/headers` para o navegador e a página
 * inteira morria com "This API is only available in Server Components".
 * Quem fala com o banco é `lib/painel-maquinas-db.ts`.
 *
 * Fonte: `maquinas` + `maquina_programacoes` (`supabase/maquinas.sql`). O
 * código é tolerante à ausência das tabelas — sem elas o painel diz "nenhuma
 * máquina cadastrada" em vez de quebrar a TV.
 *
 * A conta que importa é o PROGRESSO, e ela é de relógio, não de sensor: a
 * máquina não avisa quando terminou 67%. O que existe é `iniciada_at` e a
 * estimativa em minutos; o resto é regra de três. Por isso o progresso satura
 * em 99% enquanto a peça não é dada como concluída — 100% na parede se lê como
 * "acabou", e quem diz que acabou é o operador, não o cronômetro.
 */

import {
  calcularOEE, somarOEE, minutosDeTurnoDecorridos, minutosDoRelogio, TURNO_PADRAO,
  type EntradaOEE, type ResultadoOEE,
} from "@/lib/oee";

export type PorteMaquina = "P" | "M" | "G" | string;
/** produzindo = tem trabalho rodando; aguardando = fila parada; parada = manutenção. */
export type EstadoMaquina = "produzindo" | "aguardando" | "parada";

export interface ProgramacaoNaFila {
  id: string;
  referencia: string;
  material: string | null;
  minutosEstimados: number;
}

export interface TrabalhoAtual {
  referencia: string;
  material: string | null;
  /** ISO do início real (ou do previsto, quando ainda não começou). */
  inicio: string | null;
  /** ISO da previsão de término. */
  previsaoTermino: string | null;
  /** 0–99 enquanto roda. Nunca 100: quem fecha é o operador. */
  progressoPct: number;
  minutosRestantes: number;
}

export interface MaquinaPainel {
  id: string;
  nome: string;
  porte: PorteMaquina;
  materiais: string | null;
  estado: EstadoMaquina;
  /** Minutos rodados hoje (concluídas do dia + o que está em execução). */
  minutosHoje: number;
  /** O que está na máquina agora. `null` quando parada ou sem fila. */
  atual: TrabalhoAtual | null;
  /** Motivo da parada, quando `estado === "parada"`. */
  paradaMotivo: string | null;
  /** ISO da previsão de retorno de uma máquina parada. */
  paradaPrevisao: string | null;
  proximas: ProgramacaoNaFila[];
  /** OEE do dia desta máquina. Ver `lib/oee.ts`. */
  oee: ResultadoOEE;
}

export interface ResumoMaquinas {
  atualizadoEm: string;
  /** Soma das horas rodadas hoje, todas as máquinas (em minutos). */
  minutosTrabalhados: number;
  /** Soma do que ainda falta rodar: fila + o restante do que está na máquina. */
  minutosPendentes: number;
  programacoesFeitas: number;
  programacoesPendentes: number;
  /** Contagem de programações pendentes por material. */
  porMaterial: { material: string; programacoes: number }[];
  /**
   * OEE do SETOR — refeito com a soma dos tempos, não a média dos OEEs (ver
   * `somarOEE`).
   */
  oee: ResultadoOEE;
  maquinas: MaquinaPainel[];
}

/** Linha crua de `maquinas`. */
export interface LinhaMaquina {
  id: string;
  nome: string;
  porte: string | null;
  materiais: string | null;
  ativa: boolean | null;
  ordem: number | null;
  parada_motivo: string | null;
  parada_desde: string | null;
  parada_previsao: string | null;
  /** Janela planejada de produção ("08:00"). Ausente = turno padrão do galpão. */
  turno_inicio?: string | null;
  turno_fim?: string | null;
  /** Parada combinada (preventiva) — sai do tempo planejado, não é perda. */
  parada_planejada?: boolean | null;
}

/** Linha crua de `maquina_programacoes`. */
export interface LinhaProgramacao {
  id: string;
  maquina_id: string;
  referencia: string;
  material: string | null;
  minutos_estimados: number | null;
  posicao: number | null;
  status: string | null;
  iniciada_at: string | null;
  concluida_at: string | null;
  /** Apontamento de produção. `null` = ninguém contou (≠ contou zero). */
  pecas?: number | null;
  refugos?: number | null;
}

export const COLS_MAQUINA = "id,nome,porte,materiais,ativa,ordem,parada_motivo,parada_desde,parada_previsao";
export const COLS_PROGRAMACAO = "id,maquina_id,referencia,material,minutos_estimados,posicao,status,iniciada_at,concluida_at";

// As colunas do OEE moram em `supabase/maquinas_oee.sql`, que pode não ter
// sido rodado ainda. Quem lê pede PRIMEIRO a versão completa e, se o Postgres
// reclamar da coluna, repete com a base — é o que mantém o painel de pé com o
// SQL pela metade (ver `lib/painel-maquinas-db.ts`).
export const COLS_MAQUINA_OEE = COLS_MAQUINA + ",turno_inicio,turno_fim,parada_planejada";
export const COLS_PROGRAMACAO_OEE = COLS_PROGRAMACAO + ",pecas,refugos";

const SP_MS = 3 * 3600 * 1000;
/** Dia (`YYYY-MM-DD`) de um instante, no fuso de São Paulo. */
export const diaSP = (quando: Date | string): string => {
  const d = typeof quando === "string" ? new Date(quando) : quando;
  return new Date(d.getTime() - SP_MS).toISOString().slice(0, 10);
};

const minutosEntre = (aIso: string, bMs: number) =>
  Math.max(0, Math.round((bMs - new Date(aIso).getTime()) / 60000));

/** "6h20" / "45min" — como a parede escreve duração. */
export function duracaoCurta(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60), resto = m % 60;
  return resto === 0 ? `${h}h` : `${h}h${String(resto).padStart(2, "0")}`;
}

/** "1h 45m restantes" — o formato do rodapé da barra de progresso. */
export function restanteLongo(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m}m restantes`;
  const h = Math.floor(m / 60), resto = m % 60;
  return resto === 0 ? `${h}h restantes` : `${h}h ${String(resto).padStart(2, "0")}m restantes`;
}

/** "08:15" no fuso de São Paulo. */
export function horaSP(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() - SP_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Acumulado do dia de UMA máquina — a matéria-prima do OEE. */
export interface DiaDaMaquina {
  /** Minutos FECHADOS hoje (o que está rodando agora entra depois). */
  minutosHoje: number;
  /** Tempo padrão (estimado) das programações fechadas hoje. */
  padraoHoje: number;
  /** Tempo real dessas mesmas programações. */
  realHoje: number;
  pecasHoje: number;
  refugosHoje: number;
}

/**
 * Apura o dia de uma máquina. Os três pilares do OEE saem do MESMO laço: o
 * desempenho compara o tempo PADRÃO (a estimativa do programador) com o tempo
 * REAL das programações fechadas hoje, e a qualidade soma o apontamento delas.
 *
 * Uma peça que começou ontem e fechou hoje conta só o que rodou — é o que o
 * operador vê no relógio da parede.
 */
export function apurarDia(programacoes: LinhaProgramacao[], agora = new Date()): DiaDaMaquina {
  const hoje = diaSP(agora);
  const d: DiaDaMaquina = { minutosHoje: 0, padraoHoje: 0, realHoje: 0, pecasHoje: 0, refugosHoje: 0 };
  for (const p of programacoes) {
    if (p.status !== "concluida" || !p.concluida_at || diaSP(p.concluida_at) !== hoje) continue;
    const estimado = Math.max(0, Number(p.minutos_estimados) || 0);
    const real = p.iniciada_at ? minutosEntre(p.iniciada_at, new Date(p.concluida_at).getTime()) : estimado;
    d.minutosHoje += real;
    // Só entra no desempenho quem tem os DOIS carimbos: sem `iniciada_at` o
    // "real" É a estimativa, e a máquina apareceria com 100% de ritmo
    // justamente quando ninguém apertou "em andamento".
    if (p.iniciada_at) { d.padraoHoje += estimado; d.realHoje += real; }
    // `pecas` nulo é "ninguém contou"; zero é "contou zero". A qualidade só
    // existe pra quem apontou.
    if (p.pecas != null) {
      d.pecasHoje += Math.max(0, Number(p.pecas) || 0);
      d.refugosHoje += Math.max(0, Number(p.refugos) || 0);
    }
  }
  return d;
}

/**
 * Monta uma máquina a partir das programações dela. PURA — é aqui que mora
 * tudo que pode errar, e é aqui que o teste bate.
 */
export function montarMaquina(
  m: LinhaMaquina,
  programacoes: LinhaProgramacao[],
  agora = new Date(),
): MaquinaPainel {
  const agoraMs = agora.getTime();
  const hoje = diaSP(agora);
  const minutosDe = (p: LinhaProgramacao) => Math.max(0, Number(p.minutos_estimados) || 0);

  const executando = programacoes.find((p) => p.status === "executando") ?? null;
  const fila = programacoes
    .filter((p) => p.status === "fila")
    // `posicao` manda; o id desempata para a ordem não dançar entre ciclos
    // quando duas programações compartilham a mesma posição.
    .sort((a, b) => (Number(a.posicao) || 0) - (Number(b.posicao) || 0) || a.id.localeCompare(b.id));

  // Horas do dia: o que fechou HOJE (duração real quando há os dois carimbos,
  // senão a estimativa) mais o que está rodando agora, contado até este
  // instante. Uma peça que começou ontem e fechou hoje conta só o que rodou —
  // é o que o operador vê no relógio da parede.
  const dia = apurarDia(programacoes, agora);
  const minutosHoje = dia.minutosHoje + (executando?.iniciada_at ? minutosEntre(executando.iniciada_at, agoraMs) : 0);

  const parada = !!m.parada_motivo;
  const estado: EstadoMaquina = parada ? "parada" : executando ? "produzindo" : "aguardando";

  let atual: TrabalhoAtual | null = null;
  if (!parada && executando) {
    const estimado = minutosDe(executando) || 1;
    const decorrido = executando.iniciada_at ? minutosEntre(executando.iniciada_at, agoraMs) : 0;
    // Satura em 99: 100% na parede se lê como "acabou", e quem fecha a
    // programação é o operador. Estourar a estimativa não pode virar 140%.
    const progressoPct = Math.min(99, Math.round((decorrido / estimado) * 100));
    atual = {
      referencia: executando.referencia,
      material: executando.material,
      inicio: executando.iniciada_at,
      previsaoTermino: executando.iniciada_at
        ? new Date(new Date(executando.iniciada_at).getTime() + estimado * 60000).toISOString()
        : null,
      progressoPct,
      minutosRestantes: Math.max(0, estimado - decorrido),
    };
  } else if (!parada && fila.length > 0) {
    // Aguardando: a parede mostra a PRÓXIMA como "início previsto", com 0%.
    const prox = fila[0];
    atual = {
      referencia: prox.referencia,
      material: prox.material,
      inicio: null,
      previsaoTermino: null,
      progressoPct: 0,
      minutosRestantes: minutosDe(prox),
    };
  }

  const oee = calcularOEE(entradaOEE(m, { ...dia, minutosHoje }, agora));

  return {
    id: m.id,
    nome: m.nome,
    porte: (m.porte || "P").toUpperCase(),
    materiais: m.materiais,
    estado,
    minutosHoje,
    atual,
    paradaMotivo: m.parada_motivo,
    paradaPrevisao: m.parada_previsao,
    // Na máquina parada a fila continua sendo a fila — some o "atual", não o
    // que está esperando.
    proximas: fila.slice(executando || parada ? 0 : 1, (executando || parada ? 0 : 1) + 3).map((p) => ({
      id: p.id,
      referencia: p.referencia,
      material: p.material,
      minutosEstimados: minutosDe(p),
    })),
    oee,
  };
}

/**
 * Traduz a máquina + o dia dela na entrada do OEE.
 *
 * O denominador da disponibilidade é o TURNO JÁ DECORRIDO, não o turno
 * inteiro: às 10h a máquina não deve 8h de corte. Sem as colunas de turno
 * (`supabase/maquinas_oee.sql` não rodado) vale o turno padrão do galpão.
 */
export function entradaOEE(m: LinhaMaquina, dia: DiaDaMaquina, agora = new Date()): EntradaOEE {
  const emSP = new Date(agora.getTime() - SP_MS);
  const agoraMin = emSP.getUTCHours() * 60 + emSP.getUTCMinutes();
  const inicio = minutosDoRelogio(m.turno_inicio, TURNO_PADRAO.inicio);
  const fim = minutosDoRelogio(m.turno_fim, TURNO_PADRAO.fim);
  const minutosPlanejados = minutosDeTurnoDecorridos(agoraMin, inicio, fim);

  // Parada COMBINADA sai do planejado; quebra e espera de peça, não — essas
  // são exatamente a perda que a disponibilidade existe pra mostrar.
  let minutosParadaPlanejada = 0;
  if (m.parada_planejada && m.parada_motivo && m.parada_desde) {
    const desde = new Date(m.parada_desde).getTime();
    const inicioDoTurnoMs = agora.getTime() - Math.min(minutosPlanejados, 24 * 60) * 60000;
    minutosParadaPlanejada = Math.max(0, Math.round((agora.getTime() - Math.max(desde, inicioDoTurnoMs)) / 60000));
  }

  return {
    minutosPlanejados,
    minutosParadaPlanejada,
    minutosOperando: dia.minutosHoje,
    minutosPadraoProduzidos: dia.padraoHoje,
    minutosRealProduzidos: dia.realHoje,
    pecas: dia.pecasHoje,
    refugos: dia.refugosHoje,
  };
}

/** Monta o resumo inteiro. PURA. */
export function resumirMaquinas(
  maquinas: LinhaMaquina[],
  programacoes: LinhaProgramacao[],
  agora = new Date(),
): ResumoMaquinas {
  const porMaquina = new Map<string, LinhaProgramacao[]>();
  for (const p of programacoes) {
    const lista = porMaquina.get(p.maquina_id) ?? [];
    lista.push(p);
    porMaquina.set(p.maquina_id, lista);
  }

  const montadas = maquinas
    .filter((m) => m.ativa !== false)
    .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || a.nome.localeCompare(b.nome))
    .map((m) => montarMaquina(m, porMaquina.get(m.id) ?? [], agora));

  const minutosTrabalhados = montadas.reduce((s, m) => s + m.minutosHoje, 0);

  // O OEE do SETOR é a conta refeita sobre a SOMA dos tempos, nunca a média
  // dos OEEs: média de porcentagem dá o mesmo peso a uma máquina que rodou 8h
  // e a uma que rodou 20min, e a parede passa a mentir sempre que alguém liga
  // um laser pequeno no fim do dia.
  const oee = somarOEE(
    maquinas
      .filter((m) => m.ativa !== false)
      .map((m) => {
        const progs = porMaquina.get(m.id) ?? [];
        const dia = apurarDia(progs, agora);
        const exec = progs.find((p) => p.status === "executando");
        const emCurso = exec?.iniciada_at
          ? Math.max(0, Math.round((agora.getTime() - new Date(exec.iniciada_at).getTime()) / 60000))
          : 0;
        return entradaOEE(m, { ...dia, minutosHoje: dia.minutosHoje + emCurso }, agora);
      }),
  );

  // Pendente = o que ainda vai rodar: a fila inteira mais o resto do que está
  // na máquina. Não é "quanto falta hoje" — é o tamanho da dívida.
  const pendentes = programacoes.filter((p) => p.status === "fila");
  let minutosPendentes = pendentes.reduce((s, p) => s + (Number(p.minutos_estimados) || 0), 0);
  for (const m of montadas) {
    if (m.estado === "produzindo" && m.atual) minutosPendentes += m.atual.minutosRestantes;
  }

  const hoje = diaSP(agora);
  const programacoesFeitas = programacoes.filter(
    (p) => p.status === "concluida" && p.concluida_at && diaSP(p.concluida_at) === hoje,
  ).length;

  const contagem = new Map<string, number>();
  for (const p of pendentes) {
    const k = (p.material || "Sem material").trim();
    contagem.set(k, (contagem.get(k) || 0) + 1);
  }

  return {
    atualizadoEm: agora.toISOString(),
    minutosTrabalhados,
    minutosPendentes,
    programacoesFeitas,
    programacoesPendentes: pendentes.length,
    porMaterial: [...contagem.entries()]
      .map(([material, programacoes]) => ({ material, programacoes }))
      .sort((a, b) => b.programacoes - a.programacoes || a.material.localeCompare(b.material))
      .slice(0, 6),
    oee,
    maquinas: montadas,
  };
}

/** Agrupa por PORTE, na ordem P → M → G, do jeito que a parede desenha. */
export function agruparPorPorte(maquinas: MaquinaPainel[]): { porte: string; maquinas: MaquinaPainel[] }[] {
  const ordem = ["P", "M", "G"];
  const grupos = new Map<string, MaquinaPainel[]>();
  for (const m of maquinas) {
    const lista = grupos.get(m.porte) ?? [];
    lista.push(m);
    grupos.set(m.porte, lista);
  }
  return [...grupos.entries()]
    .sort((a, b) => {
      const ia = ordem.indexOf(a[0]), ib = ordem.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a[0].localeCompare(b[0]);
    })
    .map(([porte, maquinas]) => ({ porte, maquinas }));
}
