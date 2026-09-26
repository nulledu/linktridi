// Período das consultas do TridiMarket.
//
// A API só aceitava "últimos N dias" (agora menos N×24h), o que NÃO expressa
// "hoje" nem "ontem": às 9h da manhã, "1 dia" pegava metade de ontem. Agora o
// intervalo é explícito — início e fim — e sempre alinhado ao DIA LOCAL de quem
// está olhando, não a uma janela deslizante de horas.

export type ChavePeriodo = "hoje" | "ontem" | "7d" | "14d" | "30d" | "90d" | "mes" | "mespassado" | "ano" | "maximo" | "custom";

export interface Periodo {
  chave: ChavePeriodo;
  de: string;    // ISO, instante inicial (00:00:00.000 do primeiro dia)
  ate: string;   // ISO, instante final (23:59:59.999 do último dia)
}

// Presets do seletor (coluna do modal). Ordem = como aparecem na tela. "90d" e
// "custom" NÃO ficam aqui: 90d saiu da lista (segue válido p/ filtros salvos) e
// custom é o calendário, não um botão.
export const PERIODOS: Array<{ chave: ChavePeriodo; label: string }> = [
  { chave: "hoje", label: "Hoje" },
  { chave: "ontem", label: "Ontem" },
  { chave: "7d", label: "Últimos 7 dias" },
  { chave: "14d", label: "Últimos 14 dias" },
  { chave: "30d", label: "Últimos 30 dias" },
  { chave: "mes", label: "Este mês" },
  { chave: "mespassado", label: "Mês passado" },
  { chave: "ano", label: "Ano" },
  { chave: "maximo", label: "Máximo" },
];

// Rótulo curto p/ a pastilha do cabeçalho (o botão que abre o modal).
const LABEL_CURTO: Partial<Record<ChavePeriodo, string>> = {
  "7d": "7 dias", "14d": "14 dias", "30d": "30 dias", "90d": "90 dias",
  mes: "Este mês", mespassado: "Mês passado", ano: "Ano", maximo: "Máximo",
};

const CHAVES: ReadonlySet<ChavePeriodo> = new Set(["hoje", "ontem", "7d", "14d", "30d", "90d", "mes", "mespassado", "ano", "maximo", "custom"]);
export const ehChavePeriodo = (x: unknown): x is ChavePeriodo => typeof x === "string" && CHAVES.has(x as ChavePeriodo);

export const PERIODO_PADRAO: ChavePeriodo = "hoje";

function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fimDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Monta o intervalo de uma chave. `agora` é injetável para os testes — sem
 * isso não dá para verificar "ontem" sem esperar o dia virar.
 */
export function montarPeriodo(chave: ChavePeriodo, agora: Date = new Date(), custom?: { de: string; ate: string }): Periodo {
  if (chave === "custom" && custom?.de && custom?.ate) {
    // Datas de <input type="date"> ("2026-07-24") são interpretadas como UTC
    // pelo construtor de Date; o T00:00 força o fuso LOCAL, senão o intervalo
    // escorrega um dia para quem está a oeste de Greenwich.
    const de = inicioDoDia(new Date(`${custom.de}T00:00:00`));
    const ate = fimDoDia(new Date(`${custom.ate}T00:00:00`));
    // Datas invertidas: troca em vez de devolver intervalo vazio.
    const [ini, fim] = de <= ate ? [de, ate] : [ate, de];
    return { chave, de: ini.toISOString(), ate: fim.toISOString() };
  }

  if (chave === "hoje") {
    return { chave, de: inicioDoDia(agora).toISOString(), ate: fimDoDia(agora).toISOString() };
  }
  if (chave === "ontem") {
    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    return { chave, de: inicioDoDia(ontem).toISOString(), ate: fimDoDia(ontem).toISOString() };
  }
  if (chave === "mes") {   // 1º dia do mês corrente → hoje
    const ini = new Date(agora.getFullYear(), agora.getMonth(), 1);
    return { chave, de: inicioDoDia(ini).toISOString(), ate: fimDoDia(agora).toISOString() };
  }
  if (chave === "mespassado") {   // mês anterior inteiro
    const ini = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth(), 0);   // dia 0 = último dia do mês anterior
    return { chave, de: inicioDoDia(ini).toISOString(), ate: fimDoDia(fim).toISOString() };
  }
  if (chave === "ano") {   // 1º de janeiro → hoje (ano corrente até agora)
    const ini = new Date(agora.getFullYear(), 0, 1);
    return { chave, de: inicioDoDia(ini).toISOString(), ate: fimDoDia(agora).toISOString() };
  }
  if (chave === "maximo") {   // tudo: piso fixo bem antes de qualquer dado → hoje
    const ini = new Date(2000, 0, 1);
    return { chave, de: inicioDoDia(ini).toISOString(), ate: fimDoDia(agora).toISOString() };
  }

  // 7d/14d/30d/90d incluem HOJE e os N-1 dias anteriores — "7 dias" é a semana
  // que termina agora, não sete dias que terminam ontem.
  const dias = chave === "7d" ? 7 : chave === "14d" ? 14 : chave === "30d" ? 30 : 90;
  const inicio = new Date(agora);
  inicio.setDate(inicio.getDate() - (dias - 1));
  return { chave, de: inicioDoDia(inicio).toISOString(), ate: fimDoDia(agora).toISOString() };
}

/** Quantos dias o período cobre (para rótulos e para o período anterior). */
export function diasDoPeriodo(p: Periodo): number {
  const ms = new Date(p.ate).getTime() - new Date(p.de).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/**
 * Janela ANTERIOR de mesma duração, terminando onde esta começa. É o que dá
 * sentido a "+12% vs anterior": comparar hoje com ontem, e 30 dias com os 30
 * dias que vieram antes.
 */
export function periodoAnterior(p: Periodo): Periodo {
  const de = new Date(p.de).getTime();
  const ate = new Date(p.ate).getTime();
  const duracao = ate - de;
  return {
    chave: p.chave,
    de: new Date(de - duracao - 1).toISOString(),
    ate: new Date(de - 1).toISOString(),
  };
}

export function rotuloPeriodo(p: Periodo): string {
  if (p.chave === "hoje") return "Hoje";
  if (p.chave === "ontem") return "Ontem";
  const curto = LABEL_CURTO[p.chave];
  if (p.chave !== "custom" && curto) return curto;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${fmt(p.de)} a ${fmt(p.ate)}`;
}

/** Query string das rotas /api/tridimarket/*. */
export function paramsDoPeriodo(p: Periodo): string {
  return `from=${encodeURIComponent(p.de)}&to=${encodeURIComponent(p.ate)}`;
}
