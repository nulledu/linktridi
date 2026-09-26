// ── Como as ordens estão sendo abertas ───────────────────────────────────────
//
// O livro `atividade_bipes` já era escrito — mas ninguém no sistema o LIA.
// Nenhuma tela, nenhuma rota: pra saber quantas ordens abriram sem bipar era
// preciso abrir o Supabase e escrever SQL à mão.
//
// Isso derruba a única coisa que a tabela existia pra garantir. A frase está no
// cabeçalho do próprio módulo que a escreve: "saída de emergência sem rastro
// vira o caminho normal em duas semanas". Rastro que ninguém consegue olhar é
// a mesma coisa que rastro nenhum — o dado fica lá, correto, e a bancada
// inteira migra pro "Não deu pra bipar" sem que apareça em lugar algum.
//
// Este módulo é PURO de propósito (nenhum import de banco), porque a TELA
// precisa dele: `lib/atividade-bipes.ts` puxa `estoque-consumo`, que puxa
// `createSupabaseAdminClient`, que puxa `next/headers` — um `"use client"` que
// importasse valor de lá quebraria o build inteiro. É a mesma armadilha que
// derrubou `/atividades/historico`, e a trava é
// `lib/__tests__/cliente-nao-importa-servidor.test.ts`.
//
// Os motivos da dispensa moram aqui pela mesma razão: eles são rótulo de tela E
// vocabulário de servidor. `lib/atividade-bipes.ts` os reexporta, então quem já
// os importava de lá (o pull do tablet, os testes) continua igual.

/**
 * Por que a pessoa começou SEM bipar.
 *
 * São botões, não um campo de texto: o tablet fica em pé na bancada e a pessoa
 * está de luva, com a mão suja de tinta. Campo de texto ali é motivo em branco
 * — foi a mesma lição do `DevolverDialog` do app, que também é só botão.
 *
 * "Esta atividade não usa material" não é uma desculpa: é a resposta certa pra
 * organizar bancada, conferir pedido e o resto do que não consome nada. Ela
 * está aqui pra o número dela ser VISÍVEL — se metade das dispensas for esta, a
 * conclusão é que o interruptor está ligado pra tarefa errada, e essa é uma
 * informação que só aparece se a pessoa puder dizer isso em vez de mentir
 * "etiqueta rasgada".
 */
export interface MotivoDispensa {
  key: string;
  label: string;
  /** Ícone Tabler, pra quem for desenhar isso na web. */
  icon: string;
}

export const MOTIVOS_DISPENSA: MotivoDispensa[] = [
  { key: "sem_etiqueta", label: "O material não tem etiqueta", icon: "tag-off" },
  { key: "etiqueta_ilegivel", label: "A etiqueta rasgou / não lê", icon: "barcode-off" },
  { key: "leitor_parado", label: "O leitor não está funcionando", icon: "plug-connected-x" },
  { key: "sem_material", label: "Esta atividade não usa material", icon: "circle-off" },
];

export function motivoDispensaValido(motivo: unknown): boolean {
  return typeof motivo === "string" && MOTIVOS_DISPENSA.some((m) => m.key === motivo);
}

/**
 * Rótulo legível de um motivo. Motivo desconhecido devolve o próprio texto (e
 * não "Outro"): uma versão mais nova do app pode mandar um motivo que este
 * servidor ainda não conhece, e engolir o que a pessoa escolheu pra mostrar um
 * genérico é perder a única informação da linha.
 */
export function rotuloDispensa(motivo: string): string {
  return MOTIVOS_DISPENSA.find((m) => m.key === motivo)?.label ?? motivo;
}

/** Como um bipe terminou. Os três primeiros vêm de `SituacaoBaixa`
 *  (lib/estoque-baixa.ts) sem tradução: é a MESMA palavra, de propósito —
 *  duas escadas de nomes pro mesmo desfecho é como elas divergem. */
export type SituacaoBipe = "baixada" | "desconhecida" | "ja_baixada" | "dispensado";

export const SITUACOES_BIPE: SituacaoBipe[] = ["baixada", "desconhecida", "ja_baixada", "dispensado"];

// ── O resumo ─────────────────────────────────────────────────────────────────

/** A linha crua do livro de que esta conta precisa — e só ela. */
export interface LinhaAbertura {
  atividade_id: string;
  situacao: SituacaoBipe | string;
  motivo: string | null;
}

export interface MotivoContado {
  motivo: string;
  rotulo: string;
  ordens: number;
}

export interface Aberturas {
  /**
   * A tabela ainda não existe no banco (§11 não rodado). Diferente de "zero
   * aberturas": aqui não dá pra saber, e a tela precisa dizer QUAL SQL falta em
   * vez de mostrar 0 e 0.
   */
  semLivro: boolean;
  /** `estoque_config.bipe_para_iniciar`. Desligado, ninguém PRECISA bipar — e
   *  zero dispensas não é elogio, é consequência. */
  exigido: boolean;
  /** Ordens que abriram com pelo menos uma etiqueta lida. */
  comBipe: number;
  /** Ordens que abriram sem etiqueta nenhuma — a saída de emergência. */
  semBipe: number;
  /** Só entre as `semBipe`, e ordenado pelo que mais acontece. */
  porMotivo: MotivoContado[];
  /**
   * Bateu no teto de linhas lidas: os números são das aberturas mais recentes
   * da janela, não da janela inteira.
   */
  truncado: boolean;
}

/**
 * A fração de ordens abertas pela saída. Acima disto a exigência deixou de
 * medir o galpão e passou a medir a si mesma — ou não há leitor nas mesas, ou
 * o material não está etiquetado, ou o interruptor está ligado pra tarefa que
 * não usa material nenhum. Nos três casos a resposta é mexer na configuração,
 * nunca cobrar a pessoa.
 */
export const FRACAO_DISPENSA_DEMAIS = 0.4;

/**
 * Conta por ORDEM, não por linha.
 *
 * Uma ordem que consumiu três caixas escreve três linhas; contar linha faria
 * "bipou" parecer três vezes mais comum do que é, e a comparação com a
 * dispensa (que escreve UMA linha) ficaria torta justamente no número que
 * importa. Uma ordem conta como "bipou" se QUALQUER linha dela não é dispensa —
 * bipar e ainda registrar um motivo é caso raro, mas quando acontece o trabalho
 * teve material, e é isso que a pergunta quer saber.
 */
export function resumirAberturas(
  linhas: LinhaAbertura[],
  contexto: { exigido: boolean; semLivro?: boolean; truncado?: boolean },
): Aberturas {
  const bipou = new Set<string>();
  const dispensou = new Map<string, string>();

  for (const l of linhas) {
    const id = String(l.atividade_id || "");
    if (!id) continue;
    if (l.situacao === "dispensado") {
      // O primeiro motivo visto vale: as linhas chegam da mais recente pra mais
      // antiga, e uma ordem com duas dispensas (reenvio da fila offline) é a
      // mesma abertura, não duas.
      if (!dispensou.has(id)) dispensou.set(id, String(l.motivo || "sem_motivo"));
    } else {
      bipou.add(id);
    }
  }

  const porMotivo = new Map<string, number>();
  let semBipe = 0;
  for (const [id, motivo] of dispensou) {
    if (bipou.has(id)) continue;
    semBipe += 1;
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);
  }

  return {
    semLivro: contexto.semLivro ?? false,
    exigido: contexto.exigido,
    comBipe: bipou.size,
    semBipe,
    porMotivo: [...porMotivo.entries()]
      .map(([motivo, ordens]) => ({ motivo, rotulo: rotuloDispensa(motivo), ordens }))
      .sort((a, b) => b.ordens - a.ordens || a.rotulo.localeCompare(b.rotulo)),
    truncado: contexto.truncado ?? false,
  };
}

/** Quanto das aberturas usou a saída. `null` quando não houve abertura nenhuma. */
export function fracaoSemBipe(a: Aberturas): number | null {
  const total = a.comBipe + a.semBipe;
  return total ? a.semBipe / total : null;
}
