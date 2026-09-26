// ── Exportação em CSV ────────────────────────────────────────────────────────
// Função pura: recebe linhas, devolve texto. Sem React e sem banco, porque o
// que dá errado aqui dá errado em silêncio — o arquivo abre, parece certo, e o
// contador só descobre o problema no fechamento.
//
// Quatro decisões que o formato exige, e o motivo de cada uma:
//
// 1. SEPARADOR `;`. No Excel em português a vírgula é separador DECIMAL, então
//    um CSV com vírgula joga "R$ 1.234,56" em duas colunas. O `;` é o que o
//    Excel pt-BR espera.
// 2. BOM no começo. Sem ele o Excel abre em Latin-1 e todo acento vira `Ã§` —
//    "Manutenção" não é encontrável numa busca depois disso.
// 3. NÚMERO COM VÍRGULA e sem separador de milhar. Com ponto, o Excel pt-BR lê
//    3.000 como três mil... ou como 3, dependendo da configuração da máquina.
//    Sem milhar, ele lê como número em qualquer configuração.
// 4. FÓRMULA NEUTRALIZADA. Descrição e nome de fornecedor são digitados por
//    gente; um campo que comece com `=`, `+`, `-` ou `@` é executado como
//    fórmula ao abrir a planilha. É injeção de CSV, e o alvo é justamente quem
//    abre a exportação do financeiro.

export interface ColunaCSV<T> {
  cabecalho: string;
  valor: (linha: T) => string | number | null | undefined;
}

const PERIGOSOS = /^[=+\-@\t\r]/;

/** Escapa um campo para CSV, neutralizando fórmula. */
export function campoCSV(bruto: string | number | null | undefined): string {
  if (bruto == null) return "";
  let v = String(bruto);
  // A aspa simples é o truque padrão: o Excel mostra o texto e não executa.
  if (PERIGOSOS.test(v)) v = `'${v}`;
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Número no formato que o Excel pt-BR entende como número. */
export function numeroCSV(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. Vazio continua vazio, não vira "31/12/1969". */
export function dataCSV(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

export function montarCSV<T>(linhas: T[], colunas: ColunaCSV<T>[]): string {
  const cabecalho = colunas.map((c) => campoCSV(c.cabecalho)).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => campoCSV(c.valor(l))).join(";"));
  // `\r\n` é o fim de linha que o Excel espera; com `\n` puro algumas versões
  // no Windows colocam a planilha inteira numa célula só.
  return ["﻿" + cabecalho, ...corpo].join("\r\n");
}

/** Nome de arquivo previsível e ordenável: `financeiro-compromissos-tridi-2026-08-15.csv`. */
export function nomeDoArquivo(assunto: string, empresa: string, hoje: string): string {
  const limpo = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `financeiro-${limpo(assunto)}-${limpo(empresa)}-${hoje.slice(0, 10)}.csv`;
}
