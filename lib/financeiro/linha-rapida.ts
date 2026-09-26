import { diaSeguro, hojeISO, somarDias } from "./calculos";

/**
 * A linha rápida: "Aluguel 8.000 dia 10" vira descrição, valor e vencimento.
 *
 * É o que o app de Lembretes da Apple faz com "almoço amanhã às 13h": a pessoa
 * escreve do jeito que pensa, e o formulário se preenche. Cada campo continua
 * editável embaixo — a linha é um atalho, não uma prisão. Quando ela não
 * entende alguma coisa, essa coisa fica na descrição, onde a pessoa vê e corrige.
 *
 * O que ela entende, nesta ordem (a ordem importa: "dia 10" tem de sair do
 * texto ANTES de "10" ser lido como dinheiro):
 *  · DATA: hoje, amanhã, depois de amanhã, "dia 10", "10/09", "10/09/2026",
 *    "em 5 dias", "próximo mês" (mesmo dia), "segunda…domingo" (a próxima);
 *  · PARCELAS: "3x", "em 3x", "3 parcelas";
 *  · VALOR: "8.000", "8000", "8.000,50", "R$ 430", "430,90", "1,2 mil", "2k";
 *  · NOMES: o que sobrar é comparado com fornecedores e contas — o nome mais
 *    longo que couber inteiro vence, sem acento e sem caixa;
 *  · DESCRIÇÃO: o resto, com a primeira letra maiúscula.
 *
 * Nada aqui consulta a rede e nada grava: é uma função pura, coberta em
 * `lib/__tests__/linha-rapida.test.ts`.
 */

export interface OpcaoNome { id: string; nome: string }

export interface Interpretacao {
  descricao: string;
  /** Em reais, com centavos. `null` quando não há número que pareça dinheiro. */
  valor: number | null;
  /** ISO `AAAA-MM-DD`. `null` quando não há data na linha. */
  data: string | null;
  parcelas: number | null;
  fornecedor: OpcaoNome | null;
  conta: OpcaoNome | null;
  /** O que foi reconhecido, em palavras curtas, para a tela mostrar em chips. */
  entendido: string[];
}

const DIAS_DA_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

/** Sem acento, sem caixa, espaços colapsados — a mesma régua para os dois lados. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// O espaço depois do "R$" vem como U+00A0 do `toLocaleString`; um espaço comum
// no chip evita que ele quebre diferente do resto do texto.
const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");

function diaBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** "8.000,50" | "8000" | "430,9" | "1,2 mil" | "2k" → reais. */
function lerDinheiro(bruto: string, sufixo: string | undefined): number | null {
  let s = bruto.replace(/\s/g, "");
  // "8.000,50": ponto é milhar, vírgula é decimal. "8.5" sem vírgula é ambíguo:
  // ninguém escreve "oito reais e meio" como 8.5 no Brasil — trata como milhar
  // só quando o grupo depois do ponto tem exatamente 3 dígitos.
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d{1,2})$/.test(s)) s = s.replace(",", ".");
  else if (/^\d+(\.\d{1,2})?$/.test(s)) { /* já está em formato numérico */ }
  else return null;
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (sufixo && /^(k|mil)$/i.test(sufixo)) n *= 1000;
  return Math.round(n * 100) / 100;
}

export function interpretarLinha(
  texto: string,
  opts: { hoje?: string; fornecedores?: OpcaoNome[]; contas?: OpcaoNome[] } = {},
): Interpretacao {
  const hoje = opts.hoje ?? hojeISO();
  const entendido: string[] = [];
  let resto = ` ${texto.replace(/\s+/g, " ").trim()} `;

  // ── 1. DATA ────────────────────────────────────────────────────────────────
  let data: string | null = null;
  const tirar = (re: RegExp, f: (m: RegExpMatchArray) => string | null) => {
    const m = resto.match(re);
    if (!m) return;
    const d = f(m);
    if (d) { data = d; resto = resto.replace(m[0], " "); }
  };
  const [anoHoje, mesHoje, diaHoje] = hoje.split("-").map(Number);

  tirar(/\sdepois de amanh[aã]\s/i, () => somarDias(hoje, 2));
  if (!data) tirar(/\samanh[aã]\s/i, () => somarDias(hoje, 1));
  if (!data) tirar(/\shoje\s/i, () => hoje);
  if (!data) tirar(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/, (m) => {
    const d = Number(m[1]); const mes = Number(m[2]);
    if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
    const ano = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : anoHoje;
    return diaSeguro(ano, mes, d);
  });
  if (!data) tirar(/\sem (\d{1,3}) dias?\s/i, (m) => somarDias(hoje, Number(m[1])));
  if (!data) tirar(/\s(?:pr[oó]ximo|proximo) m[eê]s\s/i, () => {
    const m = mesHoje === 12 ? 1 : mesHoje + 1;
    return diaSeguro(mesHoje === 12 ? anoHoje + 1 : anoHoje, m, diaHoje);
  });
  if (!data) tirar(/\s(?:todo\s+)?dia (\d{1,2})\s/i, (m) => {
    const d = Number(m[1]);
    if (d < 1 || d > 31) return null;
    // "dia 10" é o PRÓXIMO dia 10: se já passou neste mês, é o do mês que vem.
    const nesteMes = diaSeguro(anoHoje, mesHoje, d);
    if (nesteMes >= hoje) return nesteMes;
    const m2 = mesHoje === 12 ? 1 : mesHoje + 1;
    return diaSeguro(mesHoje === 12 ? anoHoje + 1 : anoHoje, m2, d);
  });
  if (!data) {
    const m = normalizar(resto).match(/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b/);
    if (m) {
      const alvo = DIAS_DA_SEMANA.indexOf(m[1]);
      const atual = new Date(`${hoje}T12:00:00`).getDay();
      const pulo = ((alvo - atual + 7) % 7) || 7;   // "segunda" numa segunda é a PRÓXIMA
      data = somarDias(hoje, pulo);
      resto = resto.replace(/\s(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(-feira)?\s/i, " ");
    }
  }
  if (data) entendido.push(`Vence ${diaBR(data)}`);

  // ── 2. PARCELAS ────────────────────────────────────────────────────────────
  let parcelas: number | null = null;
  {
    const m = resto.match(/\s(?:em )?(\d{1,2})\s?(?:x|parcelas?|vezes)\s/i);
    if (m && Number(m[1]) >= 2 && Number(m[1]) <= 48) {
      parcelas = Number(m[1]);
      resto = resto.replace(m[0], " ");
      entendido.push(`${parcelas}x`);
    }
  }

  // ── 3. VALOR ───────────────────────────────────────────────────────────────
  let valor: number | null = null;
  {
    // Com "R$" na frente vale qualquer número; sem, só o que PARECE dinheiro:
    // tem vírgula decimal, tem ponto de milhar, ou tem 3+ dígitos. "MDF 3mm"
    // não pode virar R$ 3,00 — e "3mm" nem casa, porque o sufixo cola no número.
    const re = /\s(?:R\$\s?)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}|\d+(?:\.\d{1,2})?)\s?(k|mil|reais)?\s/gi;
    let melhor: { texto: string; n: number } | null = null;
    for (const m of resto.matchAll(re)) {
      const temRS = /R\$/i.test(m[0]);
      const corpo = m[1];
      const pareceDinheiro = temRS || /,/.test(corpo) || /\./.test(corpo) || corpo.length >= 3 || !!m[2];
      if (!pareceDinheiro) continue;
      const n = lerDinheiro(corpo, m[2]);
      if (n == null || n <= 0) continue;
      // Com dois candidatos fica o MAIOR: "2 caixas 450" → 450.
      if (!melhor || n > melhor.n) melhor = { texto: m[0], n };
    }
    if (melhor) {
      valor = melhor.n;
      resto = resto.replace(melhor.texto, " ");
      entendido.push(moeda(valor));
    }
  }

  // ── 4. NOMES (fornecedor, conta) ──────────────────────────────────────────
  const casar = (lista: OpcaoNome[] | undefined): OpcaoNome | null => {
    if (!lista?.length) return null;
    const alvo = normalizar(resto);
    let melhor: OpcaoNome | null = null;
    for (const o of lista) {
      const n = normalizar(o.nome);
      if (n.length < 3) continue;
      // Palavra inteira: "Itaú" casa em "pagar Itaú", não em "Itaúba".
      const re = new RegExp(`(^| )${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`);
      if (re.test(alvo) && (!melhor || n.length > normalizar(melhor.nome).length)) melhor = o;
    }
    if (melhor) {
      const n = normalizar(melhor.nome);
      // Tira do texto ORIGINAL (com acento) pela posição no normalizado —
      // os dois têm o mesmo comprimento porque só se removem marcas diacríticas.
      const i = normalizar(resto).indexOf(n);
      const bruto = resto.replace(/\s+/g, " ").trim();
      const semNome = (bruto.slice(0, i) + bruto.slice(i + n.length)).replace(/\s+/g, " ").trim();
      resto = ` ${semNome} `;
    }
    return melhor;
  };
  const fornecedor = casar(opts.fornecedores);
  if (fornecedor) entendido.push(fornecedor.nome);
  const conta = casar(opts.contas);
  if (conta) entendido.push(`Conta ${conta.nome}`);

  // ── 5. DESCRIÇÃO ───────────────────────────────────────────────────────────
  // Sobras de preposição na ponta ("Aluguel do", "para Madeireira" → "para")
  // saem; o resto fica como a pessoa escreveu, com a primeira letra em caixa alta.
  let descricao = resto.replace(/\s+/g, " ").trim()
    .replace(/^(de|do|da|dos|das|para|pra|pro|no|na|em|ao|à|a|o)\s+/i, "")
    .replace(/\s+(de|do|da|dos|das|para|pra|pro|pelo|pela|por|com|via|no|na|em|ao|à|a|o|e)$/i, "")
    .trim();
  if (descricao) descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);

  return { descricao, valor, data, parcelas, fornecedor, conta, entendido };
}
