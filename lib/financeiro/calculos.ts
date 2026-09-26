// ── Contas do Financeiro (funções puras) ─────────────────────────────────────
// Tudo aqui é entrada → saída, sem banco e sem React, porque é o que os testes
// de aceite do §22 precisam exercitar diretamente: "compra de R$ 9.000 em 3x
// gera exatamente 3 compromissos", "recorrência gera um por competência",
// "reprocessar não duplica".
//
// DATA AQUI É TEXTO 'AAAA-MM-DD', e a matemática é toda em UTC. `new Date("2026-08-15")`
// é meia-noite UTC, que no fuso de São Paulo é dia 14 às 21h — fazer a conta com
// o Date local faz todo vencimento dia 1º cair no mês anterior, e isso só
// aparece quando alguém pergunta por que a parcela sumiu do mês.
//
// A ÚNICA exceção à regra "tudo em UTC" é descobrir QUE DIA É HOJE. Aí o fuso
// é o da empresa, e só ele — ver `hojeISO`.

import {
  MESES_DA_PERIODICIDADE,
  type Compromisso, type CompromissoStatus, type Periodicidade, type Plano, type Recorrencia,
} from "./tipos";

// ── Datas ────────────────────────────────────────────────────────────────────

/** O fuso em que a empresa fecha o dia. O Brasil não tem horário de verão desde 2019. */
export const FUSO_DA_EMPRESA = "America/Sao_Paulo";

const PARTES_DO_DIA = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_DA_EMPRESA, year: "numeric", month: "2-digit", day: "2-digit",
});

/**
 * 'AAAA-MM-DD' de um instante, no fuso da empresa.
 *
 * `toISOString().slice(0, 10)` dava o dia da UTC — e a Vercel roda em UTC. Das
 * 21h às 23h59 em São Paulo a UTC já virou o dia seguinte, então "vence hoje"
 * apontava para amanhã, a conta de hoje aparecia "Atrasada" às 21h01, "Compras
 * do mês" pulava de mês na noite do dia 31 e o pagamento feito às 22h entrava
 * no extrato com a data de amanhã. O navegador da pessoa, também em UTC pelo
 * mesmo método, concordava com o erro — e por isso ele nunca apareceu em
 * teste: de manhã os dois calendários coincidem.
 */
export function dataLocalISO(agora: Date): string {
  const p = Object.fromEntries(PARTES_DO_DIA.formatToParts(agora).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function hojeISO(agora: Date = new Date()): string {
  return dataLocalISO(agora);
}

/** 'AAAA-MM-DD' → [ano, mês (1-12), dia]. */
function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [a, m, d];
}

function paraISO(ano: number, mes: number, dia: number): string {
  return new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
}

/** Último dia do mês (28/29/30/31). */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Dia do mês que EXISTE. Vencimento "todo dia 31" em fevereiro vira dia 28 —
 * não some, e não escorrega para 3 de março. Sem isto, `new Date(2026,1,31)`
 * devolve 3 de março calado, e a conta aparece no mês errado.
 */
export function diaSeguro(ano: number, mes: number, dia: number): string {
  return paraISO(ano, mes, Math.min(Math.max(dia, 1), ultimoDiaDoMes(ano, mes)));
}

/**
 * O dia em que a recorrência cobra: o que a pessoa DIGITOU no "Dia do
 * vencimento", ou — na esmagadora maioria dos cadastros, em que ninguém mexe
 * nesse campo — o dia da própria data escolhida. Vencimento 05/10 repete todo
 * dia 5. O formulário nascia com o dia de HOJE nesse campo e ele vencia a
 * data escolhida (set/2026): cadastrado no dia 9, repetia todo dia 9.
 *
 * Fora da faixa vira a borda (dia 45 é dia 31; o `diaSeguro` do gerador ainda
 * corta no último dia que o mês tem). Zero e lixo não são dia: caem na data.
 */
export function diaDoVencimento(diaInformado: string | number | null | undefined, data: string): number {
  const n = Math.round(Number(diaInformado));
  if (diaInformado !== "" && diaInformado != null && Number.isFinite(n) && n >= 1) return Math.min(n, 31);
  const daData = Number(String(data ?? "").slice(8, 10));
  return Number.isFinite(daData) && daData >= 1 ? daData : 1;
}

/** Soma meses preservando o dia quando ele existe no mês de destino. */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = partes(iso);
  const total = (a * 12 + (m - 1)) + meses;
  return diaSeguro(Math.floor(total / 12), (total % 12) + 1, d);
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = partes(iso);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** 1º dia do mês — é assim que competência é gravada. */
export function competenciaDe(iso: string): string {
  const [a, m] = partes(iso);
  return paraISO(a, m, 1);
}

/** 'AAAA-MM' — a metade da chave de idempotência da recorrência. */
export function competenciaCurta(iso: string): string {
  return iso.slice(0, 7);
}

export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = partes(de);
  const [a2, m2, d2] = partes(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function dentroDaJanela(iso: string, de: string, ate: string): boolean {
  return iso >= de && iso <= ate;   // 'AAAA-MM-DD' ordena igual como texto
}

/**
 * Até onde o gerador de recorrências enxerga por padrão: o fim do MÊS
 * SEGUINTE. Só até hoje deixaria a agenda do mês que vem vazia — que é
 * justamente o que a pessoa abre a tela para ver. Ir mais longe encheria a
 * lista de contas que ainda podem mudar de valor.
 */
export function fimDoMesSeguinte(hoje: string = hojeISO()): string {
  const [ano, mes] = somarMeses(hoje, 1).split("-").map(Number);
  return diaSeguro(ano, mes, 31);   // `diaSeguro` corta no último dia que o mês tem
}

// ── Listas ───────────────────────────────────────────────────────────────────

/** Une listas por `id`, mantendo a primeira ocorrência de cada um. */
export function unirPorId<T extends { id: string }>(...listas: T[][]): T[] {
  const vistos = new Set<string>();
  const out: T[] = [];
  for (const lista of listas) {
    for (const item of lista) {
      if (vistos.has(item.id)) continue;
      vistos.add(item.id);
      out.push(item);
    }
  }
  return out;
}

// ── Dinheiro ─────────────────────────────────────────────────────────────────

export const centavos = (n: number): number => Math.round(n * 100) / 100;

export function moeda(n: number, opts: { compacto?: boolean } = {}): string {
  const v = Number.isFinite(n) ? n : 0;
  if (opts.compacto && Math.abs(v) >= 1000) {
    return `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v / 1000)} mil`;
  }
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function dataBR(iso: string | null | undefined, opts: { curta?: boolean } = {}): string {
  if (!iso) return "—";
  const [a, m, d] = partes(iso);
  return opts.curta ? `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`
                    : `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}

// ── Parcelamento (§7 e §22) ──────────────────────────────────────────────────

export interface Parcela { numero: number; vencimento: string; valor: number }

export interface PlanoDeCompra {
  valor_total: number;
  plano: Plano;
  parcelas?: number;
  prazo_dias?: number | null;
  data: string;                       // data da compra
  primeiro_vencimento?: string | null;
}

/**
 * Quebra a compra no plano de pagamento.
 *
 * A soma das parcelas é SEMPRE igual ao total: cada parcela é o total dividido
 * e arredondado, e a ÚLTIMA recebe a sobra. R$ 1.000 em 3x sai 333,33 + 333,33
 * + 333,34 — não 333,33 três vezes, que perderia um centavo por compra e faria
 * o dashboard divergir do extrato depois de algumas centenas de lançamentos.
 */
export function parcelasDaCompra(c: PlanoDeCompra): Parcela[] {
  const total = centavos(c.valor_total);
  const n = c.plano === "a_vista" || c.plano === "prazo" ? 1 : Math.max(1, Math.floor(c.parcelas ?? 1));

  const base =
    c.primeiro_vencimento ??
    (c.plano === "prazo" ? somarDias(c.data, c.prazo_dias ?? 30)
     : c.plano === "a_vista" ? c.data
     : somarMeses(c.data, 1));

  const fatia = centavos(total / n);
  const out: Parcela[] = [];
  for (let i = 0; i < n; i++) {
    const ultima = i === n - 1;
    out.push({
      numero: i + 1,
      vencimento: i === 0 ? base : somarMeses(base, i),
      valor: ultima ? centavos(total - fatia * (n - 1)) : fatia,
    });
  }
  return out;
}

/**
 * Chave de idempotência da parcela de uma compra (§16). Reprocessar a
 * confirmação devolve as MESMAS chaves, e o índice único do banco recusa a
 * segunda inserção — é isto que faz "clique duplo" e "retry de timeout"
 * terminarem com 3 compromissos, e não 6.
 */
export const chaveDaCompra = (compraId: string, numero: number) => `compra:${compraId}:${numero}`;

/** Chave da recorrência: uma por competência, para sempre. */
export const chaveDaRecorrencia = (recorrenciaId: string, competencia: string) =>
  `rec:${recorrenciaId}:${competenciaCurta(competencia)}`;

/** Chave da folha: uma por pessoa por competência. */
export const chaveDaFolha = (colaboradorId: string, competencia: string) =>
  `folha:${colaboradorId}:${competenciaCurta(competencia)}`;

// ── Recorrências (§10 e §22) ─────────────────────────────────────────────────

export interface RegraRecorrente {
  id: string;
  valor: number;
  periodicidade: Periodicidade;
  intervalo_meses?: number | null;
  dia_vencimento: number;
  inicio: string;
  fim?: string | null;
  proxima_competencia?: string | null;
  status: string;
  /**
   * O valor muda a cada volta (luz, água, cartão, comissão).
   *
   * `valor` continua existindo e vira ESTIMATIVA: é ela que aparece no "a
   * pagar" enquanto o número real não chega, porque uma previsão de caixa com
   * a conta de luz zerada engana para menos — e número que engana para menos é
   * pior que número nenhum.
   */
  valor_variavel?: boolean | null;
}

/**
 * Valores já combinados para meses específicos.
 *
 * `"2026-09-01" → 84250` (em centavos). Quem sabe que a próxima parcela do
 * contador é diferente lança o número antes, e a geração usa o combinado em
 * vez da estimativa.
 */
export type ValoresPorCompetencia = Record<string, number>;

export interface GeracaoRecorrente {
  competencia: string;      // 1º dia do mês
  vencimento: string;
  valor: number;
  idempotency_key: string;
  /**
   * O valor é palpite, não combinado.
   *
   * `true` quando a regra é de valor variável e ninguém informou o número
   * daquele mês. A agenda mostra a linha assim mesmo — a conta de luz existe
   * mesmo antes de a fatura chegar — mas marcada, para ninguém pagar um
   * palpite achando que conferiu.
   */
  estimado?: boolean;
}

/** Quantos meses andam entre uma geração e a próxima. */
export function passoEmMeses(r: Pick<RegraRecorrente, "periodicidade" | "intervalo_meses">): number {
  return r.periodicidade === "customizada"
    ? Math.max(1, r.intervalo_meses ?? 1)
    : MESES_DA_PERIODICIDADE[r.periodicidade];
}

/**
 * O que esta regra deve gerar até `ate` (inclusive).
 *
 * PAUSADA e ENCERRADA não geram nada — e de propósito não apagam o que já
 * existe (§10): pausar um contrato não faz a conta do mês passado desaparecer.
 *
 * O teto de 240 voltas não é medo de laço infinito: é o caso real de uma regra
 * antiga, parada há anos, que ao ser retomada tentaria despejar duas décadas de
 * compromissos de uma vez.
 */
export function geracoesPendentes(
  r: RegraRecorrente, ate: string, valores: ValoresPorCompetencia = {},
): GeracaoRecorrente[] {
  if (r.status !== "ativa") return [];
  const limite = r.fim && r.fim < ate ? r.fim : ate;
  let comp = competenciaDe(r.proxima_competencia ?? r.inicio);
  const out: GeracaoRecorrente[] = [];
  const passo = passoEmMeses(r);

  for (let volta = 0; volta < 240; volta++) {
    if (comp > competenciaDe(limite)) break;
    const [a, m] = comp.split("-").map(Number);
    const vencimento = diaSeguro(a, m, r.dia_vencimento);
    if (r.fim && vencimento > r.fim) break;
    if (vencimento >= r.inicio) {
      // O combinado para AQUELE mês vence a estimativa da regra. Sem regra de
      // valor variável, `valores` chega vazio e nada muda.
      const combinado = valores[comp];
      const temCombinado = typeof combinado === "number" && Number.isFinite(combinado);
      out.push({
        competencia: comp,
        vencimento,
        valor: centavos(temCombinado ? combinado : r.valor),
        idempotency_key: chaveDaRecorrencia(r.id, comp),
        // Só é palpite quando a regra AVISA que varia e ninguém informou.
        // Regra de valor fixo nunca é estimativa, mesmo sem `valores`.
        ...(r.valor_variavel && !temCombinado ? { estimado: true } : {}),
      });
    }
    comp = somarMeses(comp, passo);
  }
  return out;
}

/** Quanto esta regra "pesa" num mês — anual de R$ 1.200 pesa R$ 100 (§5). */
export function equivalenteMensal(r: Pick<RegraRecorrente, "valor" | "periodicidade" | "intervalo_meses">): number {
  return centavos(r.valor / passoEmMeses(r));
}

// ── Status derivado ──────────────────────────────────────────────────────────

/**
 * "Atrasado" NÃO é gravado: é lido do relógio. Guardar essa palavra no banco
 * obrigaria um job a passar todo dia meia-noite reescrevendo linhas — e no dia
 * em que ele falhasse, a tela mostraria "pendente" para uma conta vencida há
 * uma semana. Pago e cancelado nunca viram atrasado.
 */
export function statusEfetivo(
  c: Pick<Compromisso, "status" | "vencimento">,
  hoje: string = hojeISO(),
): CompromissoStatus {
  if (c.status === "pago" || c.status === "cancelado") return c.status;
  return c.vencimento < hoje ? "atrasado" : c.status;
}

export const emAberto = (s: CompromissoStatus): boolean =>
  s !== "pago" && s !== "cancelado";

/**
 * O bem ainda é da empresa?
 *
 * BAIXADO foi descartado e VENDIDO tem dono novo — nenhum dos dois entra no
 * "valor do patrimônio", pelo mesmo motivo que a compra cancelada não entra em
 * "compras do mês". Eles continuam na LISTA (o histórico é o que responde onde
 * foi parar a empilhadeira); só não somam.
 *
 * Mora aqui, e não dentro da tela, porque é regra de negócio: o relatório, a
 * exportação e qualquer total futuro precisam da mesma resposta.
 */
export const noPatrimonio = (status: string): boolean =>
  status !== "baixado" && status !== "vendido";

// ── Agregações da Visão Geral (§5) ───────────────────────────────────────────

export interface ResumoVisaoGeral {
  saldo_disponivel: number;
  a_pagar_7: number;
  a_pagar_30: number;
  recorrencias_mes: number;
  compras_mes: number;
  folha_mes: number;
  atrasado: number;
}

export interface EntradaResumo {
  contas: { saldo: number; ativa: boolean; inclui_no_saldo: boolean }[];
  compromissos: Pick<Compromisso, "status" | "vencimento" | "valor">[];
  recorrencias: Pick<RegraRecorrente, "valor" | "periodicidade" | "intervalo_meses" | "status">[];
  compras: { data: string; valor_total: number; status: string }[];
  colaboradores: { salario_base: number; beneficios: number; status: string }[];
  hoje?: string;
  /** A janela de "vence em breve". Vem da configuração da empresa; 7 é o padrão. */
  alertaDias?: number;
}

export function resumoVisaoGeral(e: EntradaResumo): ResumoVisaoGeral {
  const hoje = e.hoje ?? hojeISO();
  const [ano, mes] = hoje.split("-").map(Number);
  const inicioMes = diaSeguro(ano, mes, 1);
  const fimMes = paraISO(ano, mes, ultimoDiaDoMes(ano, mes));

  const abertos = e.compromissos
    .map((c) => ({ ...c, efetivo: statusEfetivo(c, hoje) }))
    .filter((c) => emAberto(c.efetivo));

  const naJanela = (dias: number) =>
    centavos(abertos
      .filter((c) => c.vencimento >= hoje && c.vencimento <= somarDias(hoje, dias))
      .reduce((s, c) => s + c.valor, 0));

  return {
    // Cartão de crédito fica fora: `inclui_no_saldo` é o que separa "dinheiro
    // que eu tenho" de "limite que eu posso gastar".
    saldo_disponivel: centavos(
      e.contas.filter((c) => c.ativa && c.inclui_no_saldo).reduce((s, c) => s + c.saldo, 0)),
    // O nome do campo ficou: é a janela CURTA, hoje configurável. Renomear
    // quebraria quem lê `a_pagar_7` sem ganhar nada.
    a_pagar_7: naJanela(e.alertaDias ?? 7),
    a_pagar_30: naJanela(30),
    recorrencias_mes: centavos(
      e.recorrencias.filter((r) => r.status === "ativa").reduce((s, r) => s + equivalenteMensal(r), 0)),
    compras_mes: centavos(
      e.compras
        .filter((c) => c.status !== "cancelada" && dentroDaJanela(c.data, inicioMes, fimMes))
        .reduce((s, c) => s + c.valor_total, 0)),
    folha_mes: centavos(
      e.colaboradores
        .filter((c) => c.status !== "desligado")
        .reduce((s, c) => s + c.salario_base + c.beneficios, 0)),
    atrasado: centavos(
      abertos.filter((c) => c.efetivo === "atrasado").reduce((s, c) => s + c.valor, 0)),
  };
}

// ── Barras "resumo por X" ────────────────────────────────────────────────────
// A barra é proporcional ao MAIOR item, não ao total: com 8 categorias e o
// total como base, todas as barrinhas ficam com 12% e o gráfico não diz nada.

export interface Fatia { id: string; label: string; cor: string; valor: number; proporcao: number }

export function fatias<T>(
  linhas: T[],
  chave: (t: T) => string,
  valor: (t: T) => number,
  rotulo: (id: string) => { label: string; cor: string },
  limite = 8,
): Fatia[] {
  const soma = new Map<string, number>();
  for (const l of linhas) {
    const k = chave(l) || "outros";
    soma.set(k, centavos((soma.get(k) ?? 0) + valor(l)));
  }
  const ordenado = [...soma.entries()].sort((a, b) => b[1] - a[1]).slice(0, limite);
  const maior = ordenado[0]?.[1] ?? 0;
  return ordenado.map(([id, v]) => ({
    id, valor: v, ...rotulo(id),
    proporcao: maior > 0 ? Math.max(v / maior, 0.02) : 0,
  }));
}

// ── Alertas (§18) ────────────────────────────────────────────────────────────

export type Alerta = {
  chave: string; titulo: string; detalhe: string; cor: string; icone: string; href?: string;
};

export interface EntradaAlertas {
  compromissos: Pick<Compromisso, "id" | "descricao" | "status" | "vencimento" | "valor">[];
  notasSemCompra: number;
  patrimonioGarantia: { descricao: string; garantia_ate: string | null }[];
  /** Regras ativas: a que tem `fim` nos próximos 30 dias está "renovando". */
  recorrencias?: Pick<Recorrencia, "descricao" | "status" | "fim">[];
  /** Compras confirmadas há mais de N dias e ainda sem nota fiscal. */
  comprasSemNota?: number;
  hoje?: string;
}

export function alertas(e: EntradaAlertas): Alerta[] {
  const hoje = e.hoje ?? hojeISO();
  const out: Alerta[] = [];
  const abertos = e.compromissos.filter((c) => emAberto(statusEfetivo(c, hoje)));

  const atrasados = abertos.filter((c) => c.vencimento < hoje);
  if (atrasados.length) {
    out.push({
      chave: "atrasado", icone: "alert-triangle", cor: "var(--perigo)",
      titulo: `${atrasados.length} ${atrasados.length === 1 ? "compromisso atrasado" : "compromissos atrasados"}`,
      detalhe: moeda(atrasados.reduce((s, c) => s + c.valor, 0)),
      href: "/financeiro/compromissos?status=atrasado",
    });
  }

  const hojeVence = abertos.filter((c) => c.vencimento === hoje);
  if (hojeVence.length) {
    out.push({
      chave: "hoje", icone: "clock", cor: "var(--atencao)",
      titulo: `${hojeVence.length} ${hojeVence.length === 1 ? "conta vence" : "contas vencem"} hoje`,
      detalhe: moeda(hojeVence.reduce((s, c) => s + c.valor, 0)),
      href: "/financeiro/compromissos",
    });
  }

  const em3 = abertos.filter((c) => c.vencimento > hoje && c.vencimento <= somarDias(hoje, 3));
  if (em3.length) {
    out.push({
      chave: "em3", icone: "calendar-event", cor: "var(--azul)",
      titulo: `${em3.length} ${em3.length === 1 ? "vence" : "vencem"} em até 3 dias`,
      detalhe: moeda(em3.reduce((s, c) => s + c.valor, 0)),
      href: "/financeiro/compromissos",
    });
  }

  if (e.notasSemCompra > 0) {
    out.push({
      chave: "nota_sem_compra", icone: "file-text", cor: "var(--roxo)",
      titulo: `${e.notasSemCompra} ${e.notasSemCompra === 1 ? "nota de compra sem vínculo" : "notas de compra sem vínculo"}`,
      detalhe: "Associe à compra correspondente.",
      href: "/financeiro/notas?vinculo=pendente",
    });
  }

  // §18 "Renovação": a regra ativa cujo contrato ACABA em até 30 dias. É o
  // momento de renegociar ou encerrar — depois do `fim` ela para de gerar
  // sozinha, e a primeira notícia seria o serviço cortado.
  const renovando = (e.recorrencias ?? []).filter(
    (r) => r.status === "ativa" && r.fim && r.fim >= hoje && r.fim <= somarDias(hoje, 30));
  if (renovando.length) {
    out.push({
      chave: "renovacao", icone: "refresh", cor: "var(--roxo)",
      titulo: `${renovando.length} ${renovando.length === 1 ? "recorrência vence" : "recorrências vencem"} em 30 dias`,
      detalhe: renovando.map((r) => r.descricao).slice(0, 2).join(", "),
      href: "/financeiro/cadastros/recorrencias",
    });
  }

  // §18 "Compra sem nota": confirmada, antiga, e nenhum documento apontando
  // para ela. O contador já vem com a tolerância aplicada (ver
  // `contarComprasSemNota`): compra de ontem ainda não é problema.
  if ((e.comprasSemNota ?? 0) > 0) {
    const n = e.comprasSemNota as number;
    out.push({
      chave: "compra_sem_nota", icone: "shopping-cart", cor: "var(--atencao)",
      titulo: `${n} ${n === 1 ? "compra confirmada sem nota" : "compras confirmadas sem nota"}`,
      detalhe: "Peça o documento ao fornecedor ou lance a nota.",
      href: "/financeiro/compras?nota=pendente",
    });
  }

  const garantia = e.patrimonioGarantia.filter(
    (p) => p.garantia_ate && p.garantia_ate >= hoje && p.garantia_ate <= somarDias(hoje, 30));
  if (garantia.length) {
    out.push({
      chave: "garantia", icone: "shield-check", cor: "var(--atencao)",
      titulo: `${garantia.length} ${garantia.length === 1 ? "garantia vence" : "garantias vencem"} em 30 dias`,
      detalhe: garantia.map((p) => p.descricao).slice(0, 2).join(", "),
      href: "/financeiro/patrimonio",
    });
  }

  return out;
}
