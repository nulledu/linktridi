// ── Folha MENSAL — o mês é a unidade, não o cadastro ────────────────────────
//
// O cadastro do colaborador guardava UM salário, e salário muda: o valor de
// março não é o de outubro, e uma folha que só conhece o número atual reescreve
// o passado toda vez que alguém ganha aumento. Aqui cada competência tem a sua
// linha (`fin_folha_mensal`), com salário, bônus, comissão, gratificação, vale,
// convênio, faltas e o PAGO daquele mês — congelados quando o mês fecha.
//
// Bônus, vale e afins "zeram todo mês" de graça: são colunas da linha do mês,
// e o mês novo nasce com a linha nova (só o salário é herdado, do mês anterior
// ou do cadastro).
//
// Este arquivo é só o que se calcula — função pura, coberta em
// `lib/__tests__/folha-mensal.test.ts`. Banco e rede moram na rota.

import { centavos } from "./calculos";

// ── Vínculo ──────────────────────────────────────────────────────────────────

export const VINCULOS = ["clt", "mei", "pf", "estagio"] as const;
export type Vinculo = (typeof VINCULOS)[number];

export const LABEL_VINCULO: Record<Vinculo, string> = {
  clt: "CLT", mei: "MEI", pf: "PF", estagio: "Estágio",
};

// ── A linha de um mês ────────────────────────────────────────────────────────

/** As quatro áreas que somam a comissão do mês — a "regrinha" de cada pessoa. */
export const COMISSAO_PARTES = [
  { campo: "comissao_vendas", label: "Vendas" },
  { campo: "comissao_trafego", label: "Tráfego" },
  { campo: "comissao_marketplace", label: "Marketplace" },
  { campo: "comissao_outros", label: "Outros" },
] as const;
export type ComissaoParte = (typeof COMISSAO_PARTES)[number]["campo"];

export interface FolhaDoMes {
  id: string | null;                 // null = mês ainda não materializado
  colaborador_id: string;
  competencia: string;               // 1º dia do mês trabalhado
  salario: number;
  bonus: number;
  /** A SOMA das quatro partes abaixo — no banco, mantida por gatilho. */
  comissao: number;
  comissao_vendas: number;
  comissao_trafego: number;
  comissao_marketplace: number;
  comissao_outros: number;
  gratificacao: number;
  beneficios: number;
  /** Quanto a pessoa deve ao convênio da farmácia neste mês. */
  convenio_farmacia: number;
  /** Consumo no mercadinho (TridiMarket) no mês trabalhado — desconto. */
  mercadinho: number;
  /** Adiantamento de salário retirado no mês — desconto. */
  vale: number;
  /** As DATAS das faltas injustificadas. Datas, não contagem: o DSR depende
   *  de em QUAL semana cada falta caiu. */
  faltas: string[];
  pago: boolean;
  pago_em: string | null;
  /** Entrada automática por ÁREA, neste mês. `null` = o padrão pela data
   *  (ver `entradaAutomatica`). Sem o SQL novo, chegam sempre `null`. */
  auto_vendas: boolean | null;
  auto_trafego: boolean | null;
  auto_marketplace: boolean | null;
}

// ── Bônus × comissão na TELA ─────────────────────────────────────────────────

/**
 * "Venda em tráfego e marketplace é bônus, e não comissão" (dono, 01/09/2026).
 *
 * As partes continuam gravadas onde estão (`comissao_trafego`,
 * `comissao_marketplace`), porque é de lá que a sugestão do sistema chega e é
 * lá que a auditoria as encontra — mas a folha as MOSTRA e as SOMA como bônus.
 * Comissão, na tela, é só o que a pessoa vendeu (vendas) e o que foi digitado
 * como "outros". O líquido não muda: bônus e comissão são ganhos os dois.
 */
export function bonusDoMes(m: Pick<FolhaDoMes, "bonus" | "comissao_trafego" | "comissao_marketplace">): number {
  return centavos(m.bonus + m.comissao_trafego + m.comissao_marketplace);
}
export function comissaoDoMes(m: Pick<FolhaDoMes, "comissao_vendas" | "comissao_outros">): number {
  return centavos(m.comissao_vendas + m.comissao_outros);
}

// ── Quem pode ter comissão de VENDAS ─────────────────────────────────────────

/**
 * Só Design, Marketing e Comercial vendem (dono, 02/09/2026: "TI não pode ter
 * comissão em vendas").
 *
 * A planilha do ERP credita a comissão a quem ATENDEU o pagamento, e quem é
 * do suporte técnico às vezes fecha uma venda no lugar da vendedora — o nome
 * dele aparece na planilha e a folha sugeria comissão para o time errado.
 * Aqui a sugestão AUTOMÁTICA some para os outros setores; digitar à mão
 * continua valendo, porque exceção existe e a folha não é quem julga.
 */
export const SETORES_COM_COMISSAO_VENDAS = ["design", "marketing", "comercial"] as const;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** O setor entra pelo COMEÇO do nome: "Comercial · SP" e "Design gráfico"
 *  contam, "TI" e "Produção" não. Setor vazio não vende. */
export function podeComissaoDeVendas(setor: string | null | undefined): boolean {
  const s = semAcento(setor ?? "");
  if (!s) return false;
  return SETORES_COM_COMISSAO_VENDAS.some((base) => s === base || s.startsWith(`${base} `) || s.startsWith(`${base}·`) || s.startsWith(`${base}/`) || s.startsWith(`${base}-`));
}

// ── Entrada automática ───────────────────────────────────────────────────────

/** As áreas que o sistema sabe calcular sozinho — "outros" é sempre digitada. */
export const AUTO_PARTES = ["vendas", "trafego", "marketplace"] as const;
export type AutoParte = (typeof AUTO_PARTES)[number];

/**
 * Pedido literal do dono (01/09/2026): "começar a contabilizar tudo por
 * padrão como automático a partir do mês de setembro, deixando agosto e os
 * meses anteriores de 2026 com entrada manual". Antes desta data a folha foi
 * paga com número digitado, e uma sugestão que aparecesse agora em cima
 * daquele mês reescreveria o passado.
 */
export const AUTOMATICO_DESDE = "2026-09-01";

/** O mercadinho segue só a data (não tem interruptor por área): desconta
 *  sozinho de setembro/2026 em diante — "mercadinho também deve ser puxado
 *  por padrão" —, e nos meses anteriores continua a pedido. */
export function mercadinhoAutomatico(mes: Pick<FolhaDoMes, "competencia" | "pago" | "mercadinho">): boolean {
  return !mes.pago && mes.mercadinho === 0 && mes.competencia.slice(0, 10) >= AUTOMATICO_DESDE;
}

/** O interruptor gravado vence; sem ele, vale a data. */
export function entradaAutomatica(mes: Pick<FolhaDoMes, "competencia" | "auto_vendas" | "auto_trafego" | "auto_marketplace">, parte: AutoParte): boolean {
  const gravado = mes[`auto_${parte}`];
  if (gravado === true || gravado === false) return gravado;
  return mes.competencia.slice(0, 10) >= AUTOMATICO_DESDE;
}

// ── Bônus recorrente ─────────────────────────────────────────────────────────

export interface OrigemRecorrente {
  id: string;
  colaborador_id: string;
  competencia: string;
  valor: number;
  descricao: string | null;
  /** A partir desta competência a origem não gera mais. */
  encerrado_em: string | null;
  /** Meses em que a cópia foi tirada "só este mês". */
  pulados: string[];
}

/**
 * Quais cópias faltam para a competência `alvo` — a decisão pura, sem banco.
 *
 * Entra a origem que nasceu ANTES do alvo, ainda não foi encerrada até lá e
 * não foi pulada naquele mês; sai quem já tem cópia. Determinística e
 * idempotente: chamar com o resultado já gravado devolve lista vazia.
 */
export function copiasQueFaltam(
  origens: OrigemRecorrente[],
  existentes: { origem_id: string | null; competencia: string }[],
  alvo: string,
): OrigemRecorrente[] {
  const mes = alvo.slice(0, 7);
  const jaTem = new Set(existentes.filter((e) => e.origem_id && e.competencia.slice(0, 7) === mes).map((e) => e.origem_id as string));
  return origens.filter((o) =>
    o.competencia.slice(0, 7) < mes
    && (!o.encerrado_em || o.encerrado_em.slice(0, 7) > mes)
    && !o.pulados.some((p) => p.slice(0, 7) === mes)
    && !jaTem.has(o.id));
}

// ── Nome curto ───────────────────────────────────────────────────────────────

/**
 * Os dois primeiros nomes. "Maria Aparecida dos Santos Silva" vira "Maria
 * Aparecida" — a tabela é para RECONHECER a pessoa, não para citá-la em
 * cartório; o nome completo continua na ficha.
 *
 * Partícula (de/da/dos/e…) não conta como segundo nome: "João de Souza" tem de
 * virar "João de Souza"? Não — vira "João de Souza" cortado em "João de" seria
 * pior que o nome inteiro. Então a partícula ARRASTA o nome seguinte junto.
 */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(" ");
  const saida = [partes[0]];
  let i = 1;
  // O segundo "nome" pode ser partícula + nome ("de Souza" conta como um).
  while (i < partes.length && PARTICULAS.has(partes[i].toLowerCase())) {
    saida.push(partes[i]); i += 1;
  }
  if (i < partes.length) saida.push(partes[i]);
  return saida.join(" ");
}

// ── 5º dia útil (CLT art. 459 §1º) ───────────────────────────────────────────

/**
 * Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher — é dele que sai a
 * Sexta-feira Santa, o único feriado nacional MÓVEL que a lei garante
 * (Lei 9.093/95 + Lei 662/49). Carnaval e Corpus Christi são ponto
 * facultativo/feriado municipal, não entram.
 */
function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

const dois = (n: number) => String(n).padStart(2, "0");

/** Feriados NACIONAIS de um ano — fixos por lei + Sexta-feira Santa. */
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
  const out = new Set(fixos.map((f) => `${ano}-${f}`));
  // Sexta-feira Santa = Páscoa − 2 dias.
  const p = pascoa(ano);
  const sexta = new Date(Date.UTC(ano, p.mes - 1, p.dia - 2));
  out.add(`${sexta.getUTCFullYear()}-${dois(sexta.getUTCMonth() + 1)}-${dois(sexta.getUTCDate())}`);
  return out;
}

/**
 * O 5º dia útil do mês — a data-limite legal do pagamento (CLT art. 459 §1º:
 * o salário do mês trabalhado deve ser pago até o 5º dia útil do mês
 * SEGUINTE).
 *
 * SÁBADO CONTA como dia útil nesta contagem; domingo e feriado não. Não é
 * opinião: é o entendimento consolidado do Ministério do Trabalho (Precedente
 * Administrativo nº 92 da fiscalização), porque a Lei 605/49 só exclui o
 * domingo e os feriados do conceito. Contar seg–sex — o erro mais comum —
 * empurra a data um ou dois dias para depois e faz a folha "atrasar" sem
 * ninguém ter atrasado nada.
 *
 * `feriadosExtras` existe para o feriado municipal/estadual, que nenhuma
 * tabela nacional conhece.
 */
export function quintoDiaUtil(ano: number, mes: number, feriadosExtras: string[] = []): string {
  const feriados = feriadosNacionais(ano);
  for (const f of feriadosExtras) feriados.add(f);
  let uteis = 0;
  for (let dia = 1; dia <= 31; dia++) {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() !== mes - 1) break;   // estourou o mês
    const iso = `${ano}-${dois(mes)}-${dois(dia)}`;
    const domingo = d.getUTCDay() === 0;
    if (!domingo && !feriados.has(iso)) {
      uteis += 1;
      if (uteis === 5) return iso;
    }
  }
  // Inalcançável num calendário real; o throw protege contra mês inválido.
  throw new Error(`Mês sem 5 dias úteis: ${ano}-${mes}`);
}

/** Quando a competência `AAAA-MM-01` deve ser paga: 5º dia útil do mês seguinte. */
export function dataLimiteDePagamento(competencia: string, feriadosExtras: string[] = []): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const [anoSeg, mesSeg] = mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
  return quintoDiaUtil(anoSeg, mesSeg, feriadosExtras);
}

// ── Faltas e DSR (Lei 605/49, art. 6º) ───────────────────────────────────────

/**
 * O que uma lista de faltas custa no mês.
 *
 * A regra que o dono descreveu É a lei: falta injustificada perde o dia E o
 * descanso semanal remunerado daquela semana (Lei 605/49, art. 6º — o DSR só é
 * devido a quem cumpriu integralmente a semana). O detalhe que separa o certo
 * do quase-certo: duas faltas na MESMA semana perdem dois dias e UM DSR, não
 * dois — o descanso da semana é um só, e não dá para perdê-lo duas vezes.
 * É por isso que a folha guarda as DATAS das faltas, nunca uma contagem: sem
 * saber a semana de cada uma, qualquer conta de DSR é chute.
 *
 * Semana = segunda a domingo (o DSR perdido é o domingo daquela semana).
 * Valor do dia = salário mensal ÷ 30 (mensalista, como manda a Lei 605/49,
 * art. 7º §2º).
 */
export function descontoPorFaltas(faltas: string[], salarioMes: number): {
  dias: number;
  semanasComFalta: number;
  /** dias × diária. */
  valorDias: number;
  /** semanas × diária — o DSR perdido. */
  valorDsr: number;
  total: number;
} {
  const datas = [...new Set(faltas.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)))];
  const diaria = salarioMes / 30;

  // A chave da semana é a SEGUNDA-FEIRA que a inicia: duas datas com a mesma
  // segunda estão na mesma semana e dividem o mesmo (único) DSR.
  const semanas = new Set<string>();
  for (const f of datas) {
    const d = new Date(`${f}T00:00:00Z`);
    const diaSemana = d.getUTCDay();            // 0 = domingo
    const atras = diaSemana === 0 ? 6 : diaSemana - 1;
    d.setUTCDate(d.getUTCDate() - atras);
    semanas.add(d.toISOString().slice(0, 10));
  }

  const valorDias = centavos(datas.length * diaria);
  const valorDsr = centavos(semanas.size * diaria);
  return {
    dias: datas.length,
    semanasComFalta: semanas.size,
    valorDias,
    valorDsr,
    total: centavos(valorDias + valorDsr),
  };
}

// ── O líquido do mês ─────────────────────────────────────────────────────────

/**
 * Quanto sai para a pessoa na competência.
 *
 * Soma o que ela GANHA (salário, bônus, comissão, gratificação, benefícios) e
 * subtrai o que ela JÁ LEVOU ou DEVE (vale, convênio da farmácia, mercadinho)
 * e as faltas com DSR. Nunca fica negativo: desconto maior que o salário vira
 * zero aqui e conversa de gente lá fora — a folha não cria dívida.
 */
export function liquidoDoMes(linha: Omit<FolhaDoMes, "id" | "colaborador_id" | "competencia" | "pago" | "pago_em" | ComissaoParte | `auto_${AutoParte}`>): {
  ganhos: number;
  descontos: number;
  faltas: ReturnType<typeof descontoPorFaltas>;
  liquido: number;
} {
  const faltas = descontoPorFaltas(linha.faltas, linha.salario);
  const ganhos = centavos(linha.salario + linha.bonus + linha.comissao + linha.gratificacao + linha.beneficios);
  const descontos = centavos(linha.vale + linha.convenio_farmacia + linha.mercadinho + faltas.total);
  return { ganhos, descontos, faltas, liquido: Math.max(0, centavos(ganhos - descontos)) };
}

// ── O que vem do ponto (só o formato — a conta é do sistema de ponto) ───────

export interface PontoDaPessoa {
  /** Horas extras do mês, em minutos. Negativo existe, mas a tela mostra N/A. */
  extrasMesMin: number;
  /** Banco de horas corrido, em minutos. */
  bancoMin: number;
  /** Horas deste mês JÁ marcadas como pagas (janela = o mês), em minutos. */
  pagasMesMin: number;
  /** Dias do mês SEM batida e SEM justificativa — os candidatos a falta. */
  faltasDoPonto: string[];
}

/** "+6h20" para a tela; negativo e zero viram N/A — pedido literal do dono. */
export function horasLegiveis(min: number): string | null {
  if (!Number.isFinite(min) || min <= 0) return null;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `+${h}h${String(m).padStart(2, "0")}` : `+${h}h`;
}
