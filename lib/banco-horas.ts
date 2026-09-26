// ── Banco de horas ───────────────────────────────────────────────────────────
// Calcula horas trabalhadas por dia a partir das batidas (entrada/almoço/retorno/
// saída) e o saldo contra uma meta diária. "Trabalho" = intervalos entre um
// INÍCIO (entrada/retorno) e o próximo FIM (almoço/saída). Fuso de São Paulo (UTC-3).
//
// ── Quem paga o quê ──────────────────────────────────────────────────────────
// COMPENSAR e PAGAR são duas contas diferentes, e cada uma tem o seu alcance:
//
// · COMPENSAR (hora com hora) atravessa o mês. Sair mais cedo NÃO vira dívida
//   enquanto houver hora a favor no banco: o déficit come o crédito ainda
//   válido, do mais antigo pro mais novo (o que expiraria primeiro). Só o que
//   sobrar depois de raspar o banco vira dívida de verdade — aí sim é hora que
//   a pessoa deve. É o que o banco de horas existe pra fazer; guardar 5h a
//   favor e ainda cobrar 1h de atraso do mesmo mês seguinte não é banco.
//
//   O alcance é o PRAZO DO CRÉDITO (3 meses): o déficit só alcança crédito que
//   ainda estava válido no dia dele. Crédito que já expirou não ressuscita.
//
// · PAGAR (hora com dinheiro) continua sendo POR MÊS. A folha é sempre "as
//   horas do mês tal", e pagar agosto não pode quitar julho por baixo do pano —
//   é a janela `periodoDe`/`periodoAte` do pagamento que garante isso.
//
// O ledger soma todos os meses (o total do banco) e ainda separa cada mês em
// `ledger.meses`: `geradoMin`/`devidoMin` são o BRUTO daquele mês (não mudam
// mais depois) e `creditoMin`/`debitoMin` são o que continua EM ABERTO nele —
// esse, sim, encolhe quando um mês seguinte compensa contra ele. É a diferença
// entre "julho gerou 5h" (histórico) e "julho ainda tem 4h a receber" (agora).
import { listRegistrosPaged, listPessoas, feriadosMapa, listJustificativasDesde, listAjustes, listPagamentos, type TipoBatida, type PontoRegistro, type Justificativa, type PontoAjuste, type PontoPagamento } from "@/lib/ponto";
import { dowDia, META_DIARIA_MIN_PADRAO, SABADO_META_PADRAO, minutosDoRelogio, type MapaFeriados } from "@/lib/jornada-calendario";
import { diaDaPessoa, SEM_FERIADOS, type ContextoDoDia } from "@/lib/jornada/dia";
import type { Afastamento, ClasseDia, Compensacao, DiaDaPessoa, MotivoDoDia, RefCompensacao } from "@/lib/jornada/tipos";
import { problemaDoDia, type ProblemaDoDia } from "@/lib/jornada/tipos";
import { reconciliarDia, type Reconciliacao } from "@/lib/jornada/reconcilia";
import { feriadosDoPonto } from "@/lib/jornada/feriados-ponto";
import { afastamentosOuVazio } from "@/lib/jornada/afastamentos";
import { compensacoesOuVazio } from "@/lib/jornada/compensacoes";
import { resumirJustificativas, type ResumoDoDia } from "@/lib/ponto-justificativas";

export { META_DIARIA_MIN_PADRAO, SABADO_META_PADRAO, minutosDoRelogio };

// Data em que o banco de horas COMEÇOU a contar. Antes disso: zerado pra todos.
export const INICIO_BANCO = "2026-07-15";   // conta a partir do dia 15 (antes = "pré", não entra no saldo)
// Prazos (regras da empresa).
export const PRAZO_DEBITO_MESES = 1;    // devendo → paga em 1 mês
export const PRAZO_CREDITO_MESES = 3;   // a favor → usa em 3 meses
// ── Tolerância (CLT art. 58 §1º) ─────────────────────────────────────────────
// Dois limites, e os DOIS precisam ser respeitados:
//   · 5 min em cada marcação (entrada, saída…)
//   · 10 min somados no dia
//
// A tolerância é uma CONDIÇÃO, não uma franquia. Dentro dos limites, as
// diferenças pequenas somem (nem débito, nem hora extra). Estourou qualquer um
// dos dois, conta o tempo REAL inteiro, desde o primeiro minuto — não só o que
// passou. Atraso de 12 min é débito de 12, não de 2.
//
// (Antes o sistema descontava a tolerância do déficit, tratando como franquia,
// e não tinha limite nenhum do lado do crédito: 3 min a mais já viravam banco.)
//
// Vale para os dois lados e para todo dia com expediente — inclusive sábado e
// meia jornada. FALTA (não bateu nada) não tem tolerância: deve o dia inteiro.
export const TOLERANCIA_DIA_MIN = 10;
export const TOLERANCIA_MARCACAO_MIN = 5;

// ── Piso da hora extra ───────────────────────────────────────────────────────
// Hora extra só existe passando de 10 min NO DIA. Abaixo disso não é hora
// extra — é o arredondamento normal de quem bate o ponto na mão.
//
// Do lado do CRÉDITO esse piso é ABSOLUTO: não tem a saída pela conferência de
// marcação que o débito tem. Era por ali que 8 min viravam banco de horas —
// chegar 8 min mais cedo estoura os 5 min da marcação de entrada, e o dia
// inteiro passava a contar mesmo somando menos de 10.
//
// Do lado do DÉBITO nada muda: lá a conferência marcação a marcação continua
// valendo (é ela que pega o almoço esticado e o atraso compensado no fim do dia).
export const EXTRA_MINIMO_MIN = 10;

// ── Teto de 2h por dia ───────────────────────────────────────────────────────
// Regra da casa: um dia da escala não gera mais que 2h de hora extra. Esticar
// 5h numa terça é conversa de gestão (ajuste manual do admin, que não passa por
// aqui), não banco de horas.
//
// Duas coisas de fora, e as duas de propósito:
//
//  · QUITAR DÍVIDA não tem teto. Quem deve horas e fica a mais está devolvendo
//    o que pegou — deve 3h e fica 4h, paga as 3h inteiras e ainda leva 1h de
//    extra. O teto vale só para a SOBRA (ver `construirLedger`), senão a pessoa
//    nunca conseguiria quitar trabalhando.
//  · FORA DA ESCALA não tem teto: domingo, feriado (pago ou trocado) e sábado
//    de quem não trabalha sábado — quem foi CHAMADO num dia que não é dele veio
//    só pra isso, e o dia inteiro conta.
//
// Não existe piso além do EXTRA_MINIMO_MIN de 10 min lá em cima: 11 min a mais
// num dia comum são 11 min de hora extra.
export const EXTRA_TETO_DIA_UTIL_MIN = 2 * 60;

/** Aplica o teto do dia da escala. Devolve o que vale e o que ficou de fora
 *  (o cortado é só pra tela explicar; não entra em conta nenhuma). */
export function limitarExtraDiaUtil(extraMin: number): { valeMin: number; cortadoMin: number } {
  if (extraMin <= EXTRA_TETO_DIA_UTIL_MIN) return { valeMin: extraMin, cortadoMin: 0 };
  return { valeMin: EXTRA_TETO_DIA_UTIL_MIN, cortadoMin: extraMin - EXTRA_TETO_DIA_UTIL_MIN };
}

export interface EntradaTolerancia {
  /** trab − meta do dia. Negativo = deve; positivo = extra. */
  saldoBruto: number;
  /** Primeira e última batida do dia ("HH:MM"), quando houver. */
  entradaReal?: string | null;
  saidaReal?: string | null;
  /** Horário previsto da pessoa ("HH:MM"). Sem isso, só o limite do dia vale. */
  entradaPrevista?: string | null;
  saidaPrevista?: string | null;
  /** Saída e volta do almoço batidas ("HH:MM"). */
  almocoRealInicio?: string | null;
  almocoRealFim?: string | null;
  /** Almoço previsto do turno. null = turno sem almoço. */
  almocoPrevistoInicio?: string | null;
  almocoPrevistoFim?: string | null;
}

/**
 * Aplica a tolerância a UM dia trabalhado. Devolve o saldo que vale.
 *
 * Só é chamada para dia COM batida — falta não tem tolerância.
 *
 * Confere as QUATRO marcações quando há previsto cadastrado: entrada, saída do
 * almoço, volta do almoço e saída. É isso que pega quem estica o almoço — antes,
 * sem horário de almoço no cadastro, esticar 20 min só aparecia diluído no total
 * do dia (e sumia se a pessoa compensasse saindo mais tarde).
 *
 * Cada previsto ausente é simplesmente pulado: turno sem almoço não tem o que
 * conferir, e quem ainda não tem turno aplicado cai só no limite do dia.
 *
 * CRÉDITO tem regra própria: o piso de 10 min no dia é absoluto (EXTRA_MINIMO_MIN),
 * sem a saída pela conferência de marcação. Sobrar menos que isso não é hora
 * extra em nenhuma hipótese.
 */
/** Dívida do dia abaixo disto some (nem cobra, nem aparece como problema). */
export const DEVIDO_MINIMO_MIN = 5;

export function aplicarTolerancia(e: EntradaTolerancia): number {
  const saldo = e.saldoBruto;
  // Hora extra: só passando do piso do dia. Nada mais entra nessa conta.
  if (saldo > 0) return saldo > EXTRA_MINIMO_MIN ? saldo : 0;
  // Dívida pequena: menos de 5 min no dia não é cobrado nem vira pendência,
  // mesmo com uma marcação estourada (decisão do usuário, set/2026). Espelha o
  // piso do crédito — ninguém paga 3 minutos.
  if (saldo < 0 && -saldo < DEVIDO_MINIMO_MIN) return 0;
  // Fora do limite do dia já resolve: conta tudo.
  if (Math.abs(saldo) > TOLERANCIA_DIA_MIN) return saldo;

  // Dentro do limite do dia, ainda pode ter uma marcação estourada sozinha.
  const desvio = (real?: string | null, previsto?: string | null): number | null => {
    const r = minutosDoRelogio(real), p = minutosDoRelogio(previsto);
    return r == null || p == null ? null : Math.abs(r - p);
  };
  const marcacoes = [
    desvio(e.entradaReal, e.entradaPrevista),
    desvio(e.almocoRealInicio, e.almocoPrevistoInicio),
    desvio(e.almocoRealFim, e.almocoPrevistoFim),
    desvio(e.saidaReal, e.saidaPrevista),
  ];
  if (marcacoes.some((d) => (d ?? 0) > TOLERANCIA_MARCACAO_MIN)) return saldo;

  // Tudo dentro: a diferença pequena some (nem débito, nem extra).
  return 0;
}

const LABEL: Record<TipoBatida, string> = { entrada: "Entrada", almoco: "Almoço", retorno: "Retorno", saida: "Saída", intervalo_inicio: "Intervalo", intervalo_fim: "Volta do intervalo" };
export const tipoLabel = (t: TipoBatida) => LABEL[t] ?? t;

// trabalhado = fez a meta · parcial = fez menos · falta = dia útil sem bater (não
// justificado) · justificada = falta/parcial abonada · aberto = esqueceu de fechar ·
// andamento = HOJE, expediente ainda rolando (não soma nem subtrai) ·
// folga = fds de folga · feriado · futuro = ainda não veio · pre = antes do início.
// A classe mora em `lib/jornada/tipos.ts` (puro) porque as telas precisam dela
// e não podem importar este arquivo, que fala com o Supabase. "ferias",
// "atestado" e "compensada" existem pra tela NÃO chamar de falta um dia que tem
// motivo — era o defeito mais caro deste módulo: 30 dias de férias apareciam
// como 30 faltas e ~240h de dívida.
export type { ClasseDia } from "@/lib/jornada/tipos";
export interface BatidaDia { tipo: TipoBatida; hora: string; iso: string }   // hora HH:MM (SP)
export interface DiaBanco {
  dia: string;               // YYYY-MM-DD (SP)
  dow: number;               // 0=dom … 6=sáb
  batidas: BatidaDia[];
  trabalhadoMin: number;
  metaMin: number;
  saldoMin: number;          // já com abono + ajuste manual aplicados
  ajusteMin?: number;        // ajuste manual do dia (+/−), se houver
  classe: ClasseDia;
  justificada: boolean;      // tem justificativa nesse dia
  abonada: boolean;          // justificativa que perdoa o déficit
  motivo: string | null;
  // A hora extra desse dia é ESPECIAL (domingo ou feriado pago)? É o que separa
  // as horas que têm adicional na folha das que só voltam como folga.
  especial?: boolean;
  // "folga" = feriado de verdade · "troca" = feriado trocado por outro dia.
  feriado?: TipoFeriadoDia;
  // Deste dia, quanto foi só DEVOLVER hora devida. Não é hora extra: não vira
  // crédito, não entra na folha — é acerto de conta. O resto é que é extra.
  quitadoMin?: number;
  // Hora extra que passou do teto de 2h do dia. Só pra tela explicar o corte —
  // não entra em conta nenhuma.
  extraCortadoMin?: number;
  // Dia da escala da pessoa — é onde o teto de 2h vale. Domingo, feriado e dia
  // que não é dela ficam de fora.
  naEscala?: boolean;
  // Por que este dia não é comum (férias, atestado, feriado, folga trocada…).
  // É o que a tela lê pra rotular em vez de adivinhar pela classe.
  semJornada?: MotivoDoDia;
  // O par de compensação que toca este dia, quando há um aprovado.
  compensacao?: RefCompensacao;
  // Minutos que este dia EMPRESTOU à folga do par. Saem do saldo antes de
  // virar crédito: hora trocada não é hora extra, é hora que já foi gasta.
  reservadoMin?: number;
  // ── O recorte da justificativa (v2) ────────────────────────────────────────
  // Quanto do déficit a justificativa PERDOOU de fato. `abonada` diz se o dia
  // ficou quite; este número diz o tamanho do perdão — é a diferença entre
  // "atestado" e "atestado da manhã", que na tela antiga era a mesma coisa.
  abonadoMin?: number;
  // Minutos passados FORA a serviço da empresa. Já estão dentro de
  // `trabalhadoMin`: não é um balde à parte, é trabalho que não tem batida.
  foraMin?: number;
  // Pedidos do colaborador ainda sem decisão. Aparecem na tela e NÃO entram na
  // conta — é o que impede "justificar" de virar botão de apagar a dívida.
  justPendentes?: number;
  // As justificativas do dia, como vieram. A tela lista, edita e decide a
  // partir daqui em vez de buscar de novo por dia.
  justificativas?: Justificativa[];
  // Como as batidas foram lidas quando a sequência não era perfeita (retorno
  // faltando, toque duplo, batidas demais). Ausente = sequência limpa.
  reconciliacao?: Reconciliacao;
}
export type TipoFeriadoDia = "folga" | "troca";
// Item em aberto no banco (crédito a receber ou débito a pagar) + prazo.
export interface AbertoItem { dia: string; min: number; venceEm: string; vencido: boolean; especial?: boolean }
// Horas a favor que a empresa PAGOU em dinheiro: saem do banco de vez.
// `aplicadoMin` é o quanto de crédito o registro conseguiu consumir de fato —
// normalmente igual a `min`, menor só se o crédito daquele momento não cobria
// tudo (um dia justificado depois pode encolher o que existia).
export interface PagamentoItem { id: string; dia: string; min: number; aplicadoMin: number; aplicadoEspecialMin: number; observacao: string | null; autorNome: string | null; de: string | null; ate: string | null }
// ── O mês como unidade de conta ──────────────────────────────────────────────
// Um item por mês desde o início do banco. `gerado`/`devido` são o BRUTO do mês
// (antes da compensação interna); `credito`/`debito` são o que ficou ABERTO
// depois de compensar dentro do mês e de descontar o que foi pago em dinheiro.
// É esta linha que a tela mostra como "horas extras do mês" — e é ela que o
// pagamento por mês quita.
export interface MesBanco {
  mes: string;         // "YYYY-MM"
  geradoMin: number;   // extra bruto trabalhado a mais no mês
  devidoMin: number;   // déficit bruto do mês (positivo)
  creditoMin: number;  // extra do mês ainda em aberto (a receber ou compensar)
  debitoMin: number;   // dívida do mês ainda em aberto
  pagoMin: number;     // extra do mês já pago em dinheiro
  saldoMin: number;    // creditoMin − debitoMin
  corrente: boolean;   // é o mês que ainda está rolando (o número pode mudar)
  // Recorte ESPECIAL (domingo/feriado pago) do mesmo mês. Sempre ≤ o total —
  // é um pedaço dele, não uma soma à parte: `geradoMin` já inclui `geradoEspecialMin`.
  geradoEspecialMin: number;
  creditoEspecialMin: number;
  pagoEspecialMin: number;
}
export interface LedgerResumo {
  desde: string;             // INICIO_BANCO
  saldoMin: number;          // líquido corrido (crédito − débito)
  creditoMin: number;        // total a receber (horas a favor ainda válidas)
  debitoMin: number;         // total a pagar (positivo)
  creditos: AbertoItem[];    // vence = dia + 3 meses (expira se não usar)
  debitos: AbertoItem[];     // vence = dia + 1 mês (tem que pagar)
  creditoExpiraEm: string | null;   // próxima expiração de crédito
  debitoVenceEm: string | null;     // próximo vencimento de débito
  creditoExpiradoMin: number;       // crédito que já passou dos 3 meses
  debitoVencidoMin: number;         // débito que já passou do 1 mês
  creditoEspecialMin: number;       // do crédito em aberto, quanto é domingo/feriado pago
  pagoMin: number;                  // crédito já pago em dinheiro (saiu do banco)
  pagoEspecialMin: number;          // do pago, quanto era hora especial
  pagamentos: PagamentoItem[];      // histórico dos pagamentos (mais recente primeiro)
  faltasNaoJustificadas: { dia: string; min: number }[];   // dia inteiro sem bater e sem justificar
  meses: MesBanco[];                // um por mês, do mais antigo pro mais novo
}
export interface BancoResumo {
  pessoaId: string;
  nome: string;
  fotoUrl: string | null;
  jornadaMin: number;             // meta de trabalho por dia (min)
  entradaPrevista: string | null;
  saidaPrevista: string | null;
  // Almoço previsto: é o que deixa "lançar o turno" gravar o dia INTEIRO com
  // um clique. Sem ele o lançamento seria entrada→saída direto, e o intervalo
  // viraria hora trabalhada — a pessoa nasceria com +1h de crédito falso.
  almocoInicio: string | null;
  almocoFim: string | null;
  mes: string;                    // mês do primeiro dia do período (compatibilidade)
  de: string;                     // primeiro dia do período analisado
  ate: string;                    // último dia do período analisado
  trabalhadoMin: number;          // trabalhado NO PERÍODO
  metaMin: number;                // meta somada no período (dias úteis)
  saldoMin: number;               // = ledger.saldoMin (banco corrido)
  saldoMesMin: number;            // saldo só do período (informativo)
  diasTrabalhados: number;        // no período
  faltas: number;                 // faltas não justificadas NO PERÍODO
  problemas: number;              // dias do período com problemaDoDia() — o selo da lista
  diasComProblema: { dia: string; problema: ProblemaDoDia }[];   // quais (fica na lista: é pequeno)
  dias: DiaBanco[];               // calendário do período (vazio na lista da equipe)
  ledger: LedgerResumo;           // banco corrido desde o início
}

// Um instante ISO (UTC) → partes no fuso de SP (dia e hora locais).
function sp(iso: string): { dia: string; hora: string } {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  const s = d.toISOString();
  return { dia: s.slice(0, 10), hora: s.slice(11, 16) };
}

// Intervalo ISO (UTC) do mês de SP. mes = "YYYY-MM".
export function mesRangeSp(mes: string): { from: string; to: string } {
  const [y, m] = mes.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0)).toISOString();   // SP 00:00 = 03:00 UTC
  const to = new Date(Date.UTC(y, m, 1, 3, 0, 0)).toISOString();
  return { from, to };
}
// Início do dia (YYYY-MM-DD SP) em ISO UTC.
function diaInicioIso(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0)).toISOString();
}

export function mesAtualSp(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
}
export function hojeSp(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Soma N meses a um dia YYYY-MM-DD (clampa o dia no fim do mês). Devolve YYYY-MM-DD.
export function addMesesDia(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  const dd = Math.min(d, ultimoDia);
  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
// Dias YYYY-MM-DD de `de` até `ate` (inclusive).
function diasEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  const [y, m, d] = de.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  const fim = (() => { const [yy, mm, dd] = ate.split("-").map(Number); return Date.UTC(yy, mm - 1, dd); })();
  while (cur.getTime() <= fim) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
function diasDoMesISO(mes: string): string[] {
  const [y, m] = mes.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
}

// ── Período de análise ───────────────────────────────────────────────────────
// A tela analisava só MÊS FECHADO, e a pergunta de quem paga a folha quase
// nunca é um mês do calendário ("de 16/07 a 15/08"). `Periodo` é o intervalo
// que define o calendário e os números da tela — o ledger corrido continua
// sendo desde o início do banco, independente do que está aberto.
export interface Periodo { de: string; ate: string }
/** Aceita "YYYY-MM" (mês inteiro) ou um intervalo já pronto. */
export function normalizaPeriodo(p: string | Periodo): Periodo {
  if (typeof p !== "string") return p.de <= p.ate ? p : { de: p.ate, ate: p.de };
  const dias = diasDoMesISO(p);
  return { de: dias[0], ate: dias[dias.length - 1] };
}

// Batidas → trabalho por dia (min) + se ficou "aberto" (esqueceu de fechar).
interface DiaTrabalho { batidas: BatidaDia[]; trab: number; aberto: boolean }
function trabalhoPorDia(registros: PontoRegistro[]): Map<string, DiaTrabalho> {
  const listaPorDia = new Map<string, BatidaDia[]>();
  for (const r of registros) {
    const { dia, hora } = sp(r.batidoEm);
    (listaPorDia.get(dia) ?? listaPorDia.set(dia, []).get(dia)!).push({ tipo: r.tipo, hora, iso: r.batidoEm });
  }
  const porDia = new Map<string, DiaTrabalho>();
  for (const [dia, lista] of listaPorDia) {
    lista.sort((a, b) => a.iso.localeCompare(b.iso));
    // Trabalho = pares por POSIÇÃO (1ª abre, 2ª fecha, 3ª abre…), não por rótulo.
    // Robusto a batidas ímpares e a rótulos errados (2 "entradas" seguidas etc.):
    // cada par (início, fim) conta; sobra ímpar = segmento em aberto (não conta).
    let ms = 0;
    for (let i = 0; i + 1 < lista.length; i += 2) {
      ms += new Date(lista[i + 1].iso).getTime() - new Date(lista[i].iso).getTime();
    }
    porDia.set(dia, { batidas: lista, trab: Math.max(0, Math.round(ms / 60000)), aberto: lista.length % 2 === 1 });
  }
  return porDia;
}

// Hora AGORA em SP ("HH:MM"). Fica fora do núcleo puro: os cálculos recebem o
// valor pronto, então dá pra testar o "expediente acabou" sem mexer no relógio.
export const horaSPAgora = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(11, 16);

// Classifica UM dia (puro): trabalho + meta + feriado + justificativas → DiaBanco.
//
// São VÁRIAS justificativas por dia, não uma: a pessoa sai 1h de manhã pro
// dentista e 1h à tarde pro banco — dois motivos, dois efeitos, um dia só.
// `resumirJustificativas` junta tudo num veredito antes de a conta começar.
function classificaDia(dia: string, w: DiaTrabalho | undefined, dp: DiaDaPessoa, justs: Justificativa[], hoje: string, saidaPrevista: string | null, agoraHHMM: string | null, entradaPrevista: string | null = null, almocoInicio: string | null = null, almocoFim: string | null = null, inicio: string = INICIO_BANCO): DiaBanco {
  const batidas = w?.batidas ?? [];
  // O dia lido INTEIRO contra a escala (`lib/jornada/reconcilia.ts`), não por
  // pares de posição: 07:00 → 12:00 → 17:00 é jornada fechada com o retorno
  // faltando, não "dia em aberto". Incompleta/revisar continuam neutras, e aí
  // o trabalho mostrado é o dos pares (o "até agora" do dia de hoje).
  const rec = batidas.length ? reconciliarDia(batidas, { entradaPrevista, almocoInicio, almocoFim, saidaPrevista, semAlmoco: dowDia(dia) === 6 || dp.jornadaMin === 0 }) : null;
  const aberto = rec ? rec.nivel === "incompleta" || rec.nivel === "revisar" : (w?.aberto ?? false);
  const trab = rec && !aberto ? rec.trabMin : (w?.trab ?? 0);
  const dow = dowDia(dia);
  // A jornada devida do dia vem do motor único (`diaDaPessoa`): escala, feriado,
  // férias, atestado e folga compensatória já entraram lá, na precedência certa.
  // Antes esta função decidia sozinha e só sabia de sábado e feriado.
  const metaDia = dp.jornadaMin;
  // Domingo e feriado PAGO valem adicional; feriado TROCADO não (a folga é que
  // devolve o dia). O rótulo viaja com o dia e é o ledger que soma os dois
  // baldes — a conta de horas em si não muda em nada.
  const especial = dp.extraEspecial;
  const fer = dp.feriado?.tipo ?? null;

  // O recorte precisa da ESCALA pra traduzir "das 08:00 às 13:00" em minutos de
  // jornada — numa escala 08–18 com almoço 12–13, essa janela vale 4h, não 5h.
  // Perdoar as 5h inventaria uma hora que a pessoa nunca deveu, e hora perdoada
  // a mais vira crédito, que vira dinheiro na folha.
  const R: ResumoDoDia = resumirJustificativas(justs, {
    entradaPrevista, saidaPrevista, almocoInicio, almocoFim, jornadaMin: metaDia,
  });
  // Minutos a serviço da empresa entram como TRABALHO — não são perdão, são
  // expediente sem batida (banco, cartório, cliente).
  const trabTotal = trab + R.trabalhadaMin;
  const marcas = {
    ...(R.trabalhadaMin ? { foraMin: R.trabalhadaMin } : {}),
    ...(R.pendentes ? { justPendentes: R.pendentes } : {}),
    ...(justs.length ? { justificativas: justs } : {}),
    ...(rec && (rec.nivel !== "consistente" || rec.duplicadas > 0) ? { reconciliacao: rec } : {}),
  };

  const base = (classe: ClasseDia, metaMin: number, saldoMin: number, extra?: Partial<DiaBanco>): DiaBanco =>
    ({ dia, dow, batidas, trabalhadoMin: trabTotal, metaMin, saldoMin, classe, justificada: R.temAprovada, abonada: false, motivo: justs.find((j) => j.motivo)?.motivo ?? null, especial, ...marcas, ...(fer ? { feriado: fer } : {}), ...(dp.motivo ? { semJornada: dp.motivo } : {}), ...(dp.compensacao ? { compensacao: dp.compensacao } : {}), ...extra });

  // Antes do início do banco: DESCONSIDERA totalmente — nem meta, nem saldo, nem
  // horas trabalhadas (senão as horas antigas ainda entravam no "Trab. mês").
  // `inicio` é o do banco OU o dia em que a pessoa entrou no Ponto, o que vier
  // depois: quem é cadastrado em setembro não nasce devendo julho e agosto.
  if (dia < inicio) return base("pre", 0, 0, { trabalhadoMin: 0 });
  if (dia > hoje) return base("futuro", 0, 0);
  if (metaDia === 0) {
    // Dia sem expediente — fim de semana, feriado, férias, atestado ou folga do
    // par. Trabalho aqui é EXTRA (crédito), e vale o mesmo piso de 10 min do dia
    // útil, senão uma batida solta de 3 min num domingo nasce como hora extra.
    //
    // A CLASSE sai do motivo, não da adivinhação: um dia de férias precisa se
    // chamar "férias" na tela, não "folga" — senão o painel continua mentindo
    // mesmo com a conta certa.
    const classe: ClasseDia = trabTotal > 0 ? "trabalhado"
      : dp.motivo === "ferias" ? "ferias"
      : dp.motivo === "atestado" ? "atestado"
      : dp.motivo === "feriado" ? "feriado"
      : dp.motivo === "folga_compensatoria" ? "compensada"
      : "folga";
    return base(classe, 0, aberto || trabTotal <= EXTRA_MINIMO_MIN ? 0 : trabTotal);
  }
  // HOJE com o expediente AINDA RODANDO → neutro: não soma nem subtrai. Antes, a
  // pessoa que bateu entrada+almoço (par de batidas) já aparecia devendo 4h ao
  // meio-dia, e quem ainda não tinha chegado às 9h contava FALTA do dia inteiro.
  // O saldo do dia só existe depois que o expediente acaba (saidaPrevista).
  // Sem saidaPrevista configurada não dá pra saber a hora do fim: o dia fecha
  // só na virada (passa a contar amanhã) — conservador de propósito.
  if (dia === hoje) {
    const fim = saidaPrevista ? saidaPrevista.slice(0, 5) : null;
    const acabou = fim != null && agoraHHMM != null && agoraHHMM >= fim;
    if (!acabou) return base("andamento", 0, 0);
  }
  if (aberto) return base("aberto", 0, 0);   // dia útil sem fechar → neutro

  // Tolerância (CLT art. 58 §1º) — vale pros DOIS lados, débito e crédito.
  // Dentro dos limites (5 min por marcação e 10 min no dia) a diferença some;
  // fora, conta o tempo real inteiro. Falta (trab=0) não tem tolerância: deve a
  // meta inteira, então nem passa por aqui.
  let rawSaldo = trab - metaDia;   // trab=0 → -meta (falta)
  if (trab > 0) {
    // Almoço pelo TIPO da batida (não pela posição): quem bate um intervalo
    // extra no meio do dia não desalinha a conferência.
    const doTipo = (t: TipoBatida) => batidas.find((b) => b.tipo === t)?.hora ?? null;
    // Sábado não tem almoço na regra da casa — não confere esse par lá.
    const ehSabado = dow === 6;
    rawSaldo = aplicarTolerancia({
      saldoBruto: rawSaldo,
      entradaReal: batidas[0]?.hora ?? null,
      saidaReal: batidas.length > 1 ? batidas[batidas.length - 1]?.hora ?? null : null,
      entradaPrevista, saidaPrevista,
      almocoRealInicio: ehSabado ? null : doTipo("almoco"),
      almocoRealFim: ehSabado ? null : doTipo("retorno"),
      almocoPrevistoInicio: ehSabado ? null : almocoInicio,
      almocoPrevistoFim: ehSabado ? null : almocoFim,
    });
  }
  // A hora fora a serviço da empresa entra DEPOIS da tolerância, de propósito:
  // a tolerância confere MARCAÇÃO (chegou 3 min tarde?), e esse tempo não tem
  // marcação nenhuma. Somá-lo antes faria a conferência de horários comparar um
  // relógio com um número digitado.
  rawSaldo += R.trabalhadaMin;
  // Daqui pra baixo é dia da ESCALA — onde o teto de 2h vale. O corte em si
  // não acontece aqui: depende de a pessoa estar devendo, e isso só o ledger
  // sabe (ver `construirLedger`). Aqui o dia só se identifica.
  const naEscala = { naEscala: true };

  if (R.abonaTudo || R.abonaMin > 0) {
    // ── O abono, agora com tamanho ───────────────────────────────────────────
    // Perdoa só o DÉFICIT, e no máximo o que a justificativa cobre. Excedente
    // continua excedente: abono não gera crédito — se gerasse, "atestado de 2h"
    // num dia cheio viraria 2h extras a receber.
    const falta = Math.max(0, -rawSaldo);
    const perdao = R.abonaTudo ? falta : Math.min(R.abonaMin, falta);
    const saldo = rawSaldo + perdao;
    // Sobrou dívida? Então o dia não está quite, e chamá-lo de "justificado"
    // esconderia as horas que ainda voltam pelo banco. É "parcial" quando
    // houve trabalho e "falta" quando não houve — mas `justificada` fica true
    // nos dois casos, porque o motivo existe e está registrado.
    const classe: ClasseDia = saldo < 0
      ? (trabTotal > 0 ? "parcial" : "falta")
      : trabTotal === 0 ? "justificada"
      : rawSaldo >= 0 ? "trabalhado" : "justificada";
    return base(classe, metaDia, saldo, { abonada: saldo >= 0, ...(perdao ? { abonadoMin: perdao } : {}), ...naEscala });
  }
  // Sem abono (com ou sem motivo): conta normal. Dentro da tolerância = cumprido.
  //
  // Folga ADIANTADA (compensação de jornada: folgou primeiro, repõe depois) não
  // é falta: a jornada continua devida de propósito, e é o trabalho futuro que
  // a quita. Chamar isso de falta faria o gestor cobrar um dia combinado.
  const classe: ClasseDia = trabTotal === 0
    ? (dp.motivo === "folga_compensatoria" ? "compensada" : "falta")
    : rawSaldo >= 0 ? "trabalhado" : "parcial";
  return base(classe, metaDia, rawSaldo, naEscala);
}

// ── Ledger por MÊS (FIFO dentro do mês) ──────────────────────────────────────
// Compensa crédito × débito por ordem de chegada, mas só DENTRO do mesmo mês
// (acordo mensal), e devolve o que sobrou aberto com prazos (débito: +1 mês;
// crédito: +3 meses), as faltas não justificadas e o placar de cada mês.
//
// Pagamento em dinheiro entra na MESMA fila, no dia em que foi pago: consome o
// crédito mais antigo da janela dele (o que venceria primeiro) e nunca vira
// débito — pagar horas que não existem mais não pode deixar a pessoa devendo.
// Por isso o pagamento é aplicado DEPOIS do saldo do próprio dia: quem
// trabalhou a mais hoje pode receber por hoje.
// `estagiario`: estágio não gera hora extra. O crédito que nasce do RELÓGIO é
// descartado (vira `extraCortadoMin`, pra tela explicar); quitar dívida e
// ajuste manual do admin continuam valendo — ver `banco-horas-estagiario.test.ts`.
function construirLedger(diasCronologicos: DiaBanco[], hoje: string, pagamentos: PontoPagamento[] = [], estagiario = false): LedgerResumo {
  const creditos: { dia: string; min: number; especial: boolean }[] = [];
  const debitos: { dia: string; min: number }[] = [];
  const faltasNaoJustificadas: { dia: string; min: number }[] = [];
  const mesDe = (dia: string) => dia.slice(0, 7);
  // Placar bruto de cada mês (o aberto sai das filas, no fim).
  const bruto = new Map<string, { gerado: number; geradoEspecial: number; devido: number; pago: number; pagoEspecial: number }>();
  const doMes = (mes: string) => {
    let a = bruto.get(mes);
    if (!a) { a = { gerado: 0, geradoEspecial: 0, devido: 0, pago: 0, pagoEspecial: 0 }; bruto.set(mes, a); }
    return a;
  };

  // Fila de pagamentos em ordem cronológica (empate no dia: pela hora do registro).
  // Um pagamento com janela só entra depois que a janela FECHA: pagar em 05/08
  // a folha de 01–31/08 e aplicar no dia 5 encontraria o crédito do dia 20 sem
  // existir ainda — e o pagamento sairia menor do que deveria.
  // E o contrário também: a folha de agosto é LANÇADA em setembro, mas paga o
  // retrato de 31/08. Aplicada no dia do lançamento, a dívida de setembro
  // comia o crédito de agosto antes — o pagamento achava zero e a pessoa que
  // devia 9h aparecia com saldo positivo (caso Bruno, set/2026). Com janela,
  // o pagamento entra SEMPRE no fechamento dela.
  const quando = (p: PontoPagamento) => p.periodoAte ?? p.dia;
  const pags = [...pagamentos].sort((a, b) => quando(a).localeCompare(quando(b)) || a.createdAt.localeCompare(b.createdAt));
  const aplicado = new Map<string, { total: number; especial: number }>();
  let pi = 0;
  // Tira `min` do crédito mais antigo. Devolve quanto conseguiu tirar.
  // Com janela (`de`/`ate`), só toca no crédito gerado DENTRO dela — é o que
  // permite pagar a folha de agosto sem quitar julho por baixo do pano. Sem
  // janela (pagamento antigo), é o FIFO puro de sempre. `creditos` já está em
  // ordem cronológica, então varrer pra frente continua sendo "o mais antigo
  // primeiro" dentro da janela.
  // Dinheiro quita a hora ESPECIAL primeiro (duas passadas na fila). Ela é
  // justamente a que não deveria virar folga: domingo e feriado pago têm
  // adicional na folha, e quem compensa com um dia de descanso perde o
  // adicional. Sobrando, o pagamento segue no crédito comum, do mais antigo.
  const quitar = (min: number, de: string | null, ate: string | null): { total: number; especial: number } => {
    let falta = min, esp = 0;
    for (const so of [true, false]) {
      for (let i = 0; i < creditos.length && falta > 0; ) {
        const c = creditos[i];
        if (c.especial !== so || (de && c.dia < de) || (ate && c.dia > ate)) { i++; continue; }
        const use = Math.min(falta, c.min);
        c.min -= use; falta -= use;
        if (c.especial) esp += use;
        const m = doMes(mesDe(c.dia));   // o pago é do mês que GEROU a hora
        m.pago += use;
        if (c.especial) m.pagoEspecial += use;
        if (c.min === 0) creditos.splice(i, 1); else i++;
      }
    }
    return { total: min - falta, especial: esp };
  };
  const pagarAte = (dia: string) => { while (pi < pags.length && quando(pags[pi]) <= dia) { const p = pags[pi++]; aplicado.set(p.id, quitar(p.minutos, p.periodoDe, p.periodoAte)); } };

  // Compensação DENTRO DO MÊS: varre a fila pulando o que é de outro mês. As
  // filas estão em ordem cronológica, então o primeiro item do mês encontrado é
  // o mais antigo dele — o FIFO continua valendo, só não atravessa a virada.
  const consumir = (fila: { dia: string; min: number; especial?: boolean }[], quanto: number, vale: (x: { dia: string }) => boolean): number => {
    let resta = quanto;
    // Duas passadas quando a fila tem hora especial: o dia que ficou devendo
    // come primeiro o crédito COMUM e só depois encosta no domingo/feriado.
    // Sem isso, sair 20 min mais cedo numa terça consumia hora com adicional —
    // a pessoa perdia dinheiro por causa de um atraso que vale bem menos.
    for (const so of [false, true]) {
      for (let i = 0; i < fila.length && resta > 0; ) {
        const x = fila[i];
        if (!!x.especial !== so || !vale(x)) { i++; continue; }
        const use = Math.min(resta, x.min);
        x.min -= use; resta -= use;
        if (x.min === 0) fila.splice(i, 1); else i++;
      }
    }
    return resta;
  };
  // O crédito ainda valia no dia do déficit? (prazo de 3 meses a partir do dia
  // em que a hora foi gerada). Hora que já expirou não volta pra cobrir nada.
  const valiaEm = (dia: string) => (c: { dia: string }) => addMesesDia(c.dia, PRAZO_CREDITO_MESES) >= dia;
  const qualquer = () => true;

  for (const d of diasCronologicos) {
    const mes = mesDe(d.dia);
    const acc = doMes(mes);   // o mês existe na lista mesmo sem nada acontecer nele
    // Falta JUSTIFICADA sem abono continua sendo dívida, mas não é pendência de
    // justificativa — ela já tem motivo registrado. Antes aparecia nos dois
    // lugares, e o gestor "justificava" um dia que já estava justificado.
    if (d.classe === "falta" && !d.justificada) faltasNaoJustificadas.push({ dia: d.dia, min: d.metaMin });
    const v = d.saldoMin;
    if (v > 0) {
      // ── Quitar dívida e fazer hora extra são DUAS contas ────────────────
      // 1) A hora a mais quita primeiro o que a pessoa devia — de qualquer mês,
      //    sem teto. Devolver o que se pegou não é hora extra: deve 3h e fica
      //    4h, as 3h voltam inteiras. Dívida não expira, fica esperando ser
      //    paga com trabalho ou desconto.
      // 2) Só a SOBRA é hora extra, e é nela que o teto de 2h do dia da escala
      //    se aplica. Cortar antes de quitar seria perverso: quem devesse mais
      //    que o teto nunca conseguiria zerar trabalhando.
      // O ajuste manual do admin nunca é cortado — é decisão de gestão, não
      // marcação de relógio —, então fica de fora do que passa pelo teto.
      const ajuste = Math.max(0, d.ajusteMin ?? 0);
      const sobra = consumir(debitos, v, qualquer);
      const quitado = v - sobra;
      const livre = Math.min(sobra, ajuste);           // parte da sobra que é ajuste
      // Estagiário: o teto do dia da escala vira teto ZERO. Nada do relógio
      // passa — só o `livre` (ajuste manual) sobrevive, logo abaixo.
      const lim = estagiario
        ? { valeMin: 0, cortadoMin: sobra - livre }
        : d.naEscala ? limitarExtraDiaUtil(sobra - livre) : { valeMin: sobra - livre, cortadoMin: 0 };
      const extra = lim.valeMin + livre;
      if (extra > 0) creditos.push({ dia: d.dia, min: extra, especial: !!d.especial });
      acc.gerado += quitado + extra;
      if (d.especial) acc.geradoEspecial += quitado + extra;
      // O dia passa a mostrar o que de fato valeu, e por quê.
      d.saldoMin = quitado + extra;
      if (quitado > 0) d.quitadoMin = quitado;
      if (lim.cortadoMin > 0) d.extraCortadoMin = lim.cortadoMin;
    } else if (v < 0) {
      acc.devido += -v;
      // Sair mais cedo come o banco ANTES de virar dívida — inclusive o crédito
      // dos meses anteriores, desde que ainda estivesse valendo hoje.
      const sobra = consumir(creditos, -v, valiaEm(d.dia));
      if (sobra > 0) debitos.push({ dia: d.dia, min: sobra });
    }
    pagarAte(d.dia);
  }
  pagarAte("9999-12-31");   // pagamento lançado adiante do último dia calculado

  const cred: AbertoItem[] = creditos.map((c) => { const venceEm = addMesesDia(c.dia, PRAZO_CREDITO_MESES); return { dia: c.dia, min: c.min, venceEm, vencido: hoje > venceEm, especial: c.especial }; });
  const deb: AbertoItem[] = debitos.map((c) => { const venceEm = addMesesDia(c.dia, PRAZO_DEBITO_MESES); return { dia: c.dia, min: c.min, venceEm, vencido: hoje > venceEm }; });
  const creditoMin = cred.reduce((s, x) => s + x.min, 0);
  const debitoMin = deb.reduce((s, x) => s + x.min, 0);

  // Placar por mês: bruto do mês + o que ficou aberto nele.
  const soma = (itens: AbertoItem[], mes: string, so?: boolean) =>
    itens.filter((x) => mesDe(x.dia) === mes && (so === undefined || !!x.especial === so)).reduce((s, x) => s + x.min, 0);
  const mesCorrente = hoje.slice(0, 7);
  const meses: MesBanco[] = [...bruto.keys()].sort().map((mes) => {
    const a = bruto.get(mes)!;
    const c = soma(cred, mes), db = soma(deb, mes);
    return {
      mes, geradoMin: a.gerado, devidoMin: a.devido, creditoMin: c, debitoMin: db, pagoMin: a.pago,
      saldoMin: c - db, corrente: mes === mesCorrente,
      geradoEspecialMin: a.geradoEspecial, creditoEspecialMin: soma(cred, mes, true), pagoEspecialMin: a.pagoEspecial,
    };
  });

  return {
    desde: INICIO_BANCO,
    saldoMin: creditoMin - debitoMin,
    creditoMin, debitoMin, creditos: cred, debitos: deb,
    creditoExpiraEm: cred[0]?.venceEm ?? null,
    debitoVenceEm: deb[0]?.venceEm ?? null,
    creditoExpiradoMin: cred.filter((x) => x.vencido).reduce((s, x) => s + x.min, 0),
    debitoVencidoMin: deb.filter((x) => x.vencido).reduce((s, x) => s + x.min, 0),
    creditoEspecialMin: cred.filter((x) => x.especial).reduce((s, x) => s + x.min, 0),
    pagoMin: [...aplicado.values()].reduce((s, x) => s + x.total, 0),
    pagoEspecialMin: [...aplicado.values()].reduce((s, x) => s + x.especial, 0),
    pagamentos: [...pags].reverse().map((p) => ({ id: p.id, dia: p.dia, min: p.minutos, aplicadoMin: aplicado.get(p.id)?.total ?? 0, aplicadoEspecialMin: aplicado.get(p.id)?.especial ?? 0, observacao: p.observacao, autorNome: p.autorNome, de: p.periodoDe, ate: p.periodoAte })),
    faltasNaoJustificadas,
    meses,
  };
}

// Primeiro dia que conta pra pessoa: o início do banco ou o dia (SP) em que ela
// foi cadastrada no Ponto, o que for mais tarde.
export function inicioDaPessoa(createdAt?: string | null): string {
  if (!createdAt) return INICIO_BANCO;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return INICIO_BANCO;
  const dia = new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
  return dia > INICIO_BANCO ? dia : INICIO_BANCO;
}

function metaDe(pessoa: { jornadaMin?: number | null }, metaDiariaMin: number): number {
  return pessoa.jornadaMin && pessoa.jornadaMin > 0 ? pessoa.jornadaMin : metaDiariaMin;
}

// Núcleo puro: registros de UMA pessoa (período + histórico) → resumo + ledger.
// `periodo` aceita "YYYY-MM" (o de sempre) ou um intervalo {de, ate}.
export function calcBanco(
  pessoa: { id: string; nome: string; fotoUrl: string | null; colaboradorId?: string | null; jornadaMin?: number | null; entradaPrevista?: string | null; saidaPrevista?: string | null; almocoInicio?: string | null; almocoFim?: string | null; trabalhaSabado?: boolean | null; sabadoMin?: number | null; estagiario?: boolean | null; createdAt?: string | null },
  registros: PontoRegistro[],
  periodo: string | Periodo, hoje: string, feriados: MapaFeriados,
  justificativas: Justificativa[] = [],
  metaDiariaMin = META_DIARIA_MIN_PADRAO,
  ajustes: PontoAjuste[] = [],
  agoraHHMM: string | null = horaSPAgora(),
  pagamentos: PontoPagamento[] = [],
  // Afastamentos (férias, atestado) e pares de compensação DESTA pessoa. Vazios
  // por padrão: todo chamador antigo continua funcionando exatamente como antes.
  extras: { afastamentos?: Afastamento[]; compensacoes?: Compensacao[]; detalheFeriado?: ContextoDoDia["detalheFeriado"] } = {},
): BancoResumo {
  const meta = metaDe(pessoa, metaDiariaMin);
  const inicio = inicioDaPessoa(pessoa.createdAt);
  const porDia = trabalhoPorDia(registros);
  // Várias por dia, não uma: o dentista de manhã e o banco à tarde são dois
  // registros diferentes no mesmo dia. O `unique (pessoa_id, dia)` que existia
  // no banco obrigava a escolher qual dos dois guardar.
  const justPorDia = new Map<string, Justificativa[]>();
  for (const j of justificativas) {
    const atual = justPorDia.get(j.dia);
    if (atual) atual.push(j); else justPorDia.set(j.dia, [j]);
  }
  // Ajuste manual por dia (soma dos ajustes do dia). Entra no saldo.
  const ajustePorDia = new Map<string, number>();
  for (const a of ajustes) ajustePorDia.set(a.dia, (ajustePorDia.get(a.dia) || 0) + a.minutos);

  // O contexto do motor único. `jornadaMin: meta` porque `metaDiariaMin` pode
  // vir por query e precisa vencer o cadastro da pessoa — era assim antes.
  const ctxDia: ContextoDoDia = {
    feriados,
    detalheFeriado: extras.detalheFeriado,
    afastamentos: extras.afastamentos ?? [],
    compensacoes: extras.compensacoes ?? [],
    metaPadrao: metaDiariaMin,
  };
  const pessoaDaJornada = { jornadaMin: meta, trabalhaSabado: pessoa.trabalhaSabado, sabadoMin: pessoa.sabadoMin };

  // Dias que não entram na conta — reservar minutos neles seria inventar dívida
  // num dia que o ledger nem olha.
  const contado = (c: ClasseDia) => c !== "pre" && c !== "futuro" && c !== "andamento" && c !== "aberto";

  const classify = (dia: string): DiaBanco => {
    const dp = diaDaPessoa(dia, pessoaDaJornada, ctxDia);
    const d = classificaDia(dia, porDia.get(dia), dp, justPorDia.get(dia) ?? [], hoje, pessoa.saidaPrevista ?? null, agoraHHMM, pessoa.entradaPrevista ?? null, pessoa.almocoInicio ?? null, pessoa.almocoFim ?? null, inicio);
    const aj = ajustePorDia.get(dia) || 0;
    if (aj) { d.saldoMin += aj; d.ajusteMin = aj; }
    // ── A reserva do par ─────────────────────────────────────────────────────
    // Os minutos trocados saem do saldo ANTES de o ledger vê-los: hora que já
    // foi gasta numa folga não é crédito, não entra na fila do FIFO, não pode
    // ser paga em dinheiro e não pode ser comida pelo déficit de outro mês. É
    // isso que faz o par somar zero sozinho e o histórico não mentir.
    //
    // Reserva o PROMETIDO, não o que couber: se o dia gerou menos do que o par
    // prometeu, a diferença vira débito aqui — a pessoa tirou uma folga maior
    // do que ganhou, e esconder isso deixaria o saldo errado pra sempre.
    //
    // Par ADIANTADO (folgou antes) não reserva: lá o dia de folga já nasceu
    // devendo, e o trabalho de hoje quita pelo motor de dívida que existe.
    const par = d.compensacao;
    if (par?.papel === "origem" && !par.adiantada && par.minutos > 0 && contado(d.classe)) {
      d.saldoMin -= par.minutos;
      d.reservadoMin = par.minutos;
    }
    return d;
  };

  const per = normalizaPeriodo(periodo);
  const mes = per.de.slice(0, 7);

  // Ledger corrido PRIMEIRO: do início do banco até hoje (independe do mês
  // aberto). É ele que decide quanto de cada dia foi quitação de dívida e
  // quanto foi hora extra — e escreve isso de volta em cada dia.
  const ledgerFim = hoje >= INICIO_BANCO ? hoje : INICIO_BANCO;
  const diasLedger = (hoje >= INICIO_BANCO ? diasEntre(INICIO_BANCO, ledgerFim) : []).map(classify);
  const ledger = construirLedger(diasLedger, hoje, pagamentos, !!pessoa.estagiario);
  ledger.desde = inicio;

  // Período selecionado (calendário e números da tela). Os dias que o ledger já
  // calculou são REUSADOS: classificar de novo devolveria o saldo cru, sem o
  // corte nem a quitação — a tela mostraria um número e o banco, outro.
  const doLedger = new Map(diasLedger.map((d) => [d.dia, d]));
  const dias: DiaBanco[] = [];
  let totalTrab = 0, totalMeta = 0, saldoMes = 0, diasTrab = 0, faltasMes = 0;
  const diasComProblema: { dia: string; problema: ProblemaDoDia }[] = [];
  for (const dia of diasEntre(per.de, per.ate)) {
    const d = doLedger.get(dia) ?? classify(dia);
    if (d.trabalhadoMin > 0) diasTrab++;
    if (d.classe === "falta") faltasMes++;
    // Hoje fica de fora: expediente rolando não é problema.
    const prob = d.dia < hoje ? problemaDoDia(d) : null;
    if (prob) diasComProblema.push({ dia: d.dia, problema: prob });
    totalTrab += d.trabalhadoMin; totalMeta += d.metaMin; saldoMes += d.saldoMin;
    dias.push(d);
  }

  return {
    pessoaId: pessoa.id, nome: pessoa.nome, fotoUrl: pessoa.fotoUrl,
    jornadaMin: meta, entradaPrevista: pessoa.entradaPrevista ?? null, saidaPrevista: pessoa.saidaPrevista ?? null,
    almocoInicio: pessoa.almocoInicio ?? null, almocoFim: pessoa.almocoFim ?? null,
    mes, de: per.de, ate: per.ate,
    trabalhadoMin: totalTrab, metaMin: totalMeta, saldoMin: ledger.saldoMin, saldoMesMin: saldoMes,
    diasTrabalhados: diasTrab, faltas: faltasMes, problemas: diasComProblema.length, diasComProblema, dias, ledger,
  };
}

// Banco de UMA pessoa (I/O). Busca batidas do período + histórico desde o início.
// ── O ledger corrido precisa dos feriados DE TODO O PERÍODO DELE ─────────────
// Quem chama busca os feriados do período ABERTO na tela ("setembro"), mas o
// ledger é recalculado desde o início do banco (julho). Sem o feriado de julho
// aquele dia virava dia útil, e como ninguém bateu ponto nele o dia caía como
// FALTA: dívida fantasma de uma jornada inteira, que comia o crédito e estragava
// o extra de todos os meses seguintes. Foi assim que "as horas extras do mês"
// apareceram menores do que eram.
//
// Por isso o mapa do período é COMPLETADO aqui com o do ledger. A prioridade é
// de quem chamou (a lista que a tela acabou de ler é a mais fresca) e o outro
// só preenche o que falta.
export function mesclarFeriados(prioritario: MapaFeriados, extra: MapaFeriados): MapaFeriados {
  return {
    has: (dia: string) => prioritario.has(dia) || extra.has(dia),
    get: (dia: string) => (prioritario.has(dia) ? prioritario.get?.(dia) : extra.get?.(dia)),
  };
}
/** A janela que o ledger corrido enxerga: do início do banco até hoje (ou até
 *  o fim do período, quando ele passa de hoje). */
export function janelaDoLedger(per: Periodo, hoje: string): Periodo {
  return {
    de: per.de < INICIO_BANCO ? per.de : INICIO_BANCO,
    ate: per.ate > hoje ? per.ate : hoje,
  };
}

/** Feriados que o ledger corrido enxerga. Tolerante — sem tabela, vazio.
 *
 *  Desde 09/2026 vem da fusão Calendário + `ponto_feriados` (ver
 *  `lib/jornada/feriados-ponto.ts`): antes o cálculo só enxergava o que alguém
 *  tinha marcado à mão, e 7 de Setembro — que estava no calendário do RH o ano
 *  inteiro — virava FALTA pra empresa toda. */
export async function feriadosDoLedger(per: Periodo, hoje: string): Promise<Map<string, TipoFeriadoDia>> {
  const j = janelaDoLedger(per, hoje);
  try { return (await feriadosDoPonto(j.de, j.ate)).mapa; }
  catch { return feriadosMapa(j); }   // fusão indisponível: o legado ainda vale
}

/** O contexto do período: feriados (mapa + nomes) e afastamentos de todo mundo.
 *  Uma função só, porque as três leituras têm exatamente a mesma janela e
 *  buscá-las separado seria três idas onde cabe uma rodada paralela. */
export async function contextoDaJornada(per: Periodo, hoje: string): Promise<{
  feriados: Map<string, TipoFeriadoDia>;
  detalheFeriado: ContextoDoDia["detalheFeriado"];
  afastamentos: Map<string, Afastamento[]>;
  compensacoes: Map<string, Compensacao[]>;
}> {
  const j = janelaDoLedger(per, hoje);
  const [fer, afast, comp] = await Promise.all([
    feriadosDoPonto(j.de, j.ate).catch(async () => ({ mapa: await feriadosMapa(j), detalhe: new Map() })),
    afastamentosOuVazio(j.de, j.ate),
    compensacoesOuVazio(j.de, j.ate),
  ]);
  return { feriados: fer.mapa, detalheFeriado: fer.detalhe, afastamentos: afast, compensacoes: comp };
}

export async function bancoDaPessoa(
  pessoa: { id: string; nome: string; fotoUrl: string | null; colaboradorId?: string | null; jornadaMin?: number | null; entradaPrevista?: string | null; saidaPrevista?: string | null; almocoInicio?: string | null; almocoFim?: string | null; trabalhaSabado?: boolean | null; sabadoMin?: number | null; estagiario?: boolean | null; createdAt?: string | null },
  periodo: string | Periodo, feriados: MapaFeriados, metaDiariaMin?: number,
  /** Corta o ledger NAQUELE dia (retrato da virada do mês) — ver `bancoDeTodos`. */
  ateDia?: string,
): Promise<BancoResumo> {
  const hojeReal = hojeSp();
  const hoje = ateDia && ateDia < hojeReal ? ateDia : hojeReal;
  const per = normalizaPeriodo(periodo);
  const inicioIso = diaInicioIso(INICIO_BANCO);
  const fimIso = new Date(Date.now() + 864e5).toISOString();
  const from = diaInicioIso(per.de) < inicioIso ? diaInicioIso(per.de) : inicioIso;
  // +1 dia porque `ate` é inclusivo e o `to` da busca é o começo do dia seguinte.
  const ateIso = diaInicioIso(per.ate);
  const depoisDoFim = new Date(Date.parse(ateIso) + 864e5).toISOString();
  const to = depoisDoFim > fimIso ? depoisDoFim : fimIso;
  const [regs, just, ajustes, pagamentos, ctx] = await Promise.all([
    listRegistrosPaged({ from, to, pessoaId: pessoa.id, leve: true }),
    listJustificativasDesde(pessoa.id, INICIO_BANCO < per.de ? INICIO_BANCO : per.de),
    listAjustes(pessoa.id, INICIO_BANCO),
    listPagamentos(pessoa.id, INICIO_BANCO),
    // Viaja junto com as outras leituras — não entra no caminho crítico.
    contextoDaJornada(per, hoje),
  ]);
  // Férias e atestado são do COLABORADOR (`profiles.id`), não da pessoa do
  // Ponto. Sem vínculo não há afastamento — e isso está certo: não dá pra
  // saber de quem seriam as férias.
  const col = pessoa.colaboradorId ?? null;
  const afast = col ? ctx.afastamentos.get(col) ?? [] : [];
  const comp = col ? ctx.compensacoes.get(col) ?? [] : [];
  return calcBanco(pessoa, regs, per, hoje, mesclarFeriados(feriados, ctx.feriados), just, metaDiariaMin, ajustes, hoje === hojeReal ? horaSPAgora() : "23:59", pagamentos, { afastamentos: afast, compensacoes: comp, detalheFeriado: ctx.detalheFeriado });
}

// Banco de TODO MUNDO (uma leitura; agrupa por pessoa). Saldo = ledger corrido.
/**
 * `ateDia` (opcional) corta o ledger corrido NAQUELA data em vez de hoje — é
 * o retrato do banco na virada do mês, que a folha usa: a competência de
 * agosto conta horas até 31/08, mesmo consultada em setembro. Para data no
 * futuro (ou ausente), vale hoje, como sempre. O "agora" vira fim de dia
 * quando o corte é no passado: 31/08 às 14h30 não existe — o dia já fechou.
 */
/**
 * `feriados` aceita a PROMESSA, não só o mapa pronto.
 *
 * Quem chama costuma buscá-lo logo antes (`await feriadosMapa(mes)`) e, feito
 * assim, ele vira uma ida INTEIRA na frente — as cinco leituras abaixo só
 * começam depois. Passando a promessa, o feriado viaja junto com elas e some
 * do caminho crítico. Quem já tem o mapa continua passando o mapa.
 */
export async function bancoDeTodos(periodo: string | Periodo, feriados: MapaFeriados | Promise<MapaFeriados>, metaDiariaMin?: number, ateDia?: string): Promise<BancoResumo[]> {
  const hojeReal = hojeSp();
  const hoje = ateDia && ateDia < hojeReal ? ateDia : hojeReal;
  const inicioIso = diaInicioIso(INICIO_BANCO);
  const fimIso = new Date(Date.now() + 864e5).toISOString();
  const [doPeriodo, pessoas, regs, just, ajustes, pagamentos, ctx] = await Promise.all([
    Promise.resolve(feriados),
    listPessoas(false),
    // `leve`: o ledger não usa nome, foto, selfie nem origem — e o embed
    // de `ponto_pessoas` era um join por linha em milhares de batidas.
    listRegistrosPaged({ from: inicioIso, to: fimIso, pessoaId: null, leve: true }),
    listJustificativasDesde(null, INICIO_BANCO),
    listAjustes(null, INICIO_BANCO),
    listPagamentos(null, INICIO_BANCO),
    contextoDaJornada(normalizaPeriodo(periodo), hoje),
  ]);
  // Sem isto, feriado de mês anterior vira falta em TODO MUNDO de uma vez.
  const mapaFeriados = mesclarFeriados(doPeriodo, ctx.feriados);
  const porPessoa = new Map<string, PontoRegistro[]>();
  for (const r of regs) (porPessoa.get(r.pessoaId) ?? porPessoa.set(r.pessoaId, []).get(r.pessoaId)!).push(r);
  const justPorPessoa = new Map<string, Justificativa[]>();
  for (const j of just) (justPorPessoa.get(j.pessoaId) ?? justPorPessoa.set(j.pessoaId, []).get(j.pessoaId)!).push(j);
  const ajustePorPessoa = new Map<string, PontoAjuste[]>();
  for (const a of ajustes) (ajustePorPessoa.get(a.pessoaId) ?? ajustePorPessoa.set(a.pessoaId, []).get(a.pessoaId)!).push(a);
  const pagoPorPessoa = new Map<string, PontoPagamento[]>();
  for (const p of pagamentos) (pagoPorPessoa.get(p.pessoaId) ?? pagoPorPessoa.set(p.pessoaId, []).get(p.pessoaId)!).push(p);
  const agora = hoje === hojeReal ? horaSPAgora() : "23:59";
  return pessoas
    .map((p) => {
      const afast = p.colaboradorId ? ctx.afastamentos.get(p.colaboradorId) ?? [] : [];
      const comp = p.colaboradorId ? ctx.compensacoes.get(p.colaboradorId) ?? [] : [];
      const b = calcBanco({ id: p.id, nome: p.nome, fotoUrl: p.fotoUrl, jornadaMin: p.jornadaMin, entradaPrevista: p.entradaPrevista, saidaPrevista: p.saidaPrevista, almocoInicio: p.almocoInicio, almocoFim: p.almocoFim, trabalhaSabado: p.trabalhaSabado, sabadoMin: p.sabadoMin, estagiario: p.estagiario, createdAt: p.createdAt }, porPessoa.get(p.id) ?? [], periodo, hoje, mapaFeriados, justPorPessoa.get(p.id) ?? [], metaDiariaMin, ajustePorPessoa.get(p.id) ?? [], agora, pagoPorPessoa.get(p.id) ?? [], { afastamentos: afast, compensacoes: comp, detalheFeriado: ctx.detalheFeriado });
      b.dias = [];                 // a lista não precisa do calendário — payload leve
      b.ledger.pagamentos = [];    // nem do histórico de pagamentos (só do total)
      return b;
    })
    .sort((a, b) => a.saldoMin - b.saldoMin);   // devedores primeiro
}

// Helper p/ a API: carrega os feriados do período num mapa dia → tipo.
// Aceita "YYYY-MM" ou um intervalo — um período de folha cruza meses, e
// buscar só o mês da ponta esquerda deixava metade dos feriados de fora.
// Mapa, e não Set, porque o TIPO do feriado decide se a hora de quem trabalhou
// nele é especial (adicional) ou comum (vira folga depois).
export async function feriadosDoMes(periodo: string | Periodo): Promise<Map<string, TipoFeriadoDia>> {
  const per = normalizaPeriodo(periodo);
  try { return (await feriadosDoPonto(per.de, per.ate)).mapa; }
  catch { return feriadosMapa(periodo); }
}

// h:mm com sinal (ex.: +12:30, −3:15). Para exibir saldo.
// ── "As horas extras DESTE mês", uma definição só ────────────────────────────
// Três lugares respondiam essa pergunta de três jeitos e davam números
// diferentes na mesma tela: o ponto mostrava `meses[].creditoMin`, a folha
// mostrava `saldoMesMin − pagas` e a BAIXA pagava o crédito aberto do mês.
// Quem estava certo era a baixa — e o painel podia dizer "3h a favor" e pagar
// zero, ou dizer "nada a pagar" com 2h em aberto (bastava a pessoa ter usado
// crédito de um mês pra cobrir atraso de outro, que é o banco funcionando).
//
// Esta é a resposta única: crédito daquele mês que continua EM ABERTO e ainda
// não expirou — já descontada a compensação e o que foi pago em dinheiro.
export function creditoAbertoDoMes(ledger: Pick<LedgerResumo, "creditos">, mes: string): number {
  return ledger.creditos
    .filter((c) => !c.vencido && c.dia.slice(0, 7) === mes)
    .reduce((soma, c) => soma + c.min, 0);
}

export function fmtSaldo(min: number): string {
  const s = min < 0 ? "−" : "+";
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
export function fmtHoras(min: number): string {
  const a = Math.max(0, min);
  return `${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
}
