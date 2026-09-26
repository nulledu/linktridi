// ── Estoque · Qualidade da produção ──────────────────────────────────────────
// Regras PURAS por trás da conferência — sem banco, sem React — pra poder
// testar sem subir Supabase. Quem toca banco (grava a conferência, gera a
// caixa aprovada, fecha ou reabre a atividade) é lib/estoque-conferencia.ts;
// este arquivo define o catálogo fechado de resultados/defeitos e agrega um
// histórico de conferências num "score" de quem produziu.
//
// A conferência é BINÁRIA: o gerente olha a caixa e diz CERTO ou ERRADO.
// Cinco notas viravam "mediano" pra tudo que não era claramente bom nem
// claramente ruim — e "mediano" não diz o que fazer com a caixa. Certo entra
// no estoque; errado devolve a atividade pra pessoa refazer.

export interface ResultadoDef { key: string; label: string }

// As chaves batem, uma a uma, com o `check` de `estoque_conferencias.resultado`
// em supabase/estoque_conferencias.sql. Divergir aqui é INSERT recusado pelo
// banco na cara de quem confere.
export const RESULTADOS: ResultadoDef[] = [
  { key: "certo", label: "Certo" },
  { key: "errado", label: "Errado" },
];
export type ResultadoKey = "certo" | "errado";

export function resultadoValido(resultado: unknown): resultado is ResultadoKey {
  return typeof resultado === "string" && RESULTADOS.some((r) => r.key === resultado);
}

export interface DefeitoDef { key: string; label: string }

// Catálogo FECHADO de propósito — é o que faz `defeitosMaisComuns` significar
// alguma coisa. Defeito digitado livre não vira estatística: cada gestor
// escreveria diferente ("sujo", "sujeira", "peça suja") e a contagem nunca
// bateria, então "o que mais dá errado" nunca apareceria de verdade. Quem
// precisa detalhar usa `obs` (texto livre); `defeitos` é só o que entra na
// conta.
//
// Continuam os mesmos sete de antes, agora usados SÓ no errado: no certo não
// há defeito nenhum a marcar, por definição.
export const DEFEITOS: DefeitoDef[] = [
  { key: "peca_suja", label: "Peça suja" },
  { key: "avaria", label: "Avaria / quebrado" },
  { key: "medida_errada", label: "Medida errada" },
  { key: "acabamento_ruim", label: "Acabamento ruim" },
  { key: "montagem_incompleta", label: "Montagem incompleta" },
  { key: "peca_trocada", label: "Peça trocada" },
  { key: "faltou_quantidade", label: "Faltou quantidade" },
];
export type DefeitoKey = (typeof DEFEITOS)[number]["key"];

export function defeitoValido(defeito: unknown): defeito is DefeitoKey {
  return typeof defeito === "string" && DEFEITOS.some((d) => d.key === defeito);
}

/** O rótulo humano de um defeito. Chave desconhecida volta como ela mesma —
 *  melhor um texto cru do que uma linha em branco no aviso. */
export function rotuloDoDefeito(key: string): string {
  return DEFEITOS.find((d) => d.key === key)?.label ?? key;
}

/**
 * O corpo do aviso que vai pra quem PRODUZIU quando a caixa é reprovada.
 *
 * Reprovar era mudo: a atividade voltava pra `em_andamento` e reaparecia em
 * /minhas-atividades como uma tarefa comum, sem selo de recusa, sem os defeitos
 * marcados e sem a observação. A pessoa ia embora achando que tinha fechado e
 * voltava no dia seguinte com uma tarefa "em andamento" que jurava ter
 * concluído — sem saber o que corrigir. Os defeitos e a `obs` eram write-only
 * justamente pra quem mais precisava deles.
 *
 * Pura de propósito: a frase é o produto aqui, e frase se testa sem banco.
 */
export function textoDaReprovacao(defeitos: string[] | null | undefined, obs: string | null | undefined): string {
  const marcados = (defeitos ?? []).filter((d) => typeof d === "string" && d.trim().length > 0);
  const partes: string[] = [];
  partes.push(marcados.length
    ? `O que estava errado: ${marcados.map(rotuloDoDefeito).join(", ")}.`
    // Reprovar EXIGE motivo (defeito ou observação) na tela, mas o histórico
    // antigo e a fila do tablet podem trazer linha sem nenhum dos dois — e um
    // aviso vazio seria pior que nenhum.
    : "O gestor não marcou defeito nenhum.");
  const texto = (obs ?? "").trim();
  if (texto) partes.push(`Observação: ${texto}`);
  partes.push("A atividade voltou pra você refazer.");
  return partes.join(" ");
}

export interface ConferenciaParaScore {
  resultado: string;
  defeitos: string[];
}

export interface DefeitoContado { key: string; label: string; vezes: number }

export interface Score {
  /** Certos ÷ total, de 0 a 1. `null` quando não há conferência nenhuma. */
  taxaAcerto: number | null;
  total: number;
  certos: number;
  errados: number;
  /** Só defeitos que apareceram ao menos uma vez, do mais pro menos comum. */
  defeitosMaisComuns: DefeitoContado[];
}

/**
 * Agrega um histórico de conferências num "score" de quem PRODUZIU (não de
 * quem confere): a TAXA DE ACERTO, `certos / total`.
 *
 * Cada conferência pesa igual — uma caixa é uma caixa. A média ponderada por
 * quantidade que existia antes fazia sentido quando a conferência aprovava
 * "48 de 50 peças"; agora a caixa é aprovada ou reprovada inteira, e ponderar
 * pelo tamanho dela diria que errar uma caixa grande é pior do que errar uma
 * pequena — o que não é verdade: o erro é o mesmo trabalho refeito.
 *
 * `taxaAcerto` é `null` — nunca `0` — quando não há conferência nenhuma. Zero
 * significa "errou tudo"; a ficha de quem nunca foi conferido não pode dizer
 * isso. É a distinção que a tela usa pra escrever "Sem conferências" em vez de
 * pintar 0% de vermelho na ficha de quem acabou de entrar.
 */
export function scoreDe(conferencias: ConferenciaParaScore[]): Score {
  const porDefeito = new Map<string, number>();

  let certos = 0;
  let errados = 0;

  for (const c of conferencias) {
    if (c.resultado === "certo") certos++;
    else if (c.resultado === "errado") errados++;
    // Resultado desconhecido (linha de um formato antigo) não conta pra
    // nenhum dos dois lados — melhor um total menor que uma taxa mentirosa.

    for (const d of c.defeitos ?? []) porDefeito.set(d, (porDefeito.get(d) ?? 0) + 1);
  }

  const total = certos + errados;

  const defeitosMaisComuns: DefeitoContado[] = DEFEITOS
    .map((d) => ({ key: d.key, label: d.label, vezes: porDefeito.get(d.key) ?? 0 }))
    .filter((d) => d.vezes > 0)
    .sort((a, b) => b.vezes - a.vezes);

  return {
    taxaAcerto: total > 0 ? certos / total : null,
    total,
    certos,
    errados,
    defeitosMaisComuns,
  };
}

/**
 * Faixa legível pra taxa de acerto (0 a 1). Limiares fixos aqui — uma vez só —
 * pra "0,88" nunca ler "Bom" numa tela e "Excelente" noutra.
 */
export function rotuloDaTaxa(taxa: number | null): string {
  if (taxa === null) return "Sem conferências";
  if (taxa >= 0.95) return "Excelente";
  if (taxa >= 0.85) return "Bom";
  if (taxa >= 0.7) return "Mediano";
  if (taxa >= 0.5) return "Ruim";
  return "Péssimo";
}

// As cinco notas (`NOTAS`, `NotaDef`, `rotuloDoScore`) foram embora com as duas
// telas que as importavam — ConferirPainel.tsx e ConferirClient.tsx viraram
// certo/errado. Ficaram para trás como legado "só até as telas migrarem", e as
// telas migraram; um catálogo de notas exportado num arquivo cuja primeira
// linha diz que a conferência é binária é um convite a alguém reintroduzir
// "mediano" sem perceber que o `check` do banco recusa.
//
// Quem precisa de "certo ou errado" usa `RESULTADOS`; quem precisa da faixa
// legível usa `rotuloDaTaxa`.
