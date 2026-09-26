// ── Baixa de unidades etiquetadas por código ──────────────────────────────────
// Compartilhado entre PATCH /api/estoque/unidades (bipagem pela tela, ao vivo,
// por quem está logado) e POST /api/estoque/device/baixa (bipagem pelo leitor
// do galpão, muitas vezes em lote e offline). A MESMA regra — código bom não
// derruba o lote, conferir barato primeiro, motivo tem que existir em
// MOTIVOS_BAIXA — mora aqui uma vez só, pra os dois caminhos não poderem
// divergir (um deles ganhando uma exceção que o outro não tem, em silêncio).
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { MOTIVOS_BAIXA, pecasDaUnidade } from "@/lib/estoque-unidades";
import { schemaDesatualizado, ErroSchemaDesatualizado } from "@/lib/estoque-unidades-gerar";

export type SituacaoBaixa = "baixada" | "desconhecida" | "ja_baixada";
export interface ResultadoBaixaCodigo {
  codigo: string;
  situacao: SituacaoBaixa;
  item: string | null;
  /**
   * Peças que saíram com esta etiqueta. A etiqueta é a CAIXA: bipar uma caixa
   * lacrada de 50 folhas tira as 50 do estoque de uma vez — não existe baixa
   * parcial de caixa. 1 quando é etiqueta avulsa (ou quando o banco ainda não
   * tem a coluna da caixa).
   */
  pecas: number;
}

// Cap de um lote de baixa por chamada. Alguém colando uma lista gigante (ou um
// bug no leitor reenviando tudo junto) não deve virar uma varredura de
// milhares de linhas numa chamada só.
export const LOTE_MAXIMO_BAIXA = 200;

export class ErroMotivoInvalido extends Error { constructor() { super("motivo_invalido"); } }
export class ErroLoteBaixaGrande extends Error { constructor(public max: number) { super("lote_grande"); } }

export function motivoValido(motivo: string): boolean {
  return MOTIVOS_BAIXA.some((m) => m.key === motivo);
}

// Situação de UM código dado o que foi encontrado pra ele (ou nada). Pura —
// sem banco — pra poder testar a regra de decisão sem subir Supabase.
export function classificarSituacaoBaixa(achada: { status: string } | undefined): SituacaoBaixa {
  if (!achada) return "desconhecida";
  if (achada.status !== "em_estoque") return "ja_baixada";
  return "baixada";
}

export interface BaixarUnidadesInput {
  codigos: string[];
  motivo: string;
  obs?: string | null;
  baixadoPorId: string;
  baixadoPor: string;
  // Quando a baixa de fato ACONTECEU no aparelho — default agora(). O leitor
  // enfileira offline e reenvia quando a rede volta; se gravássemos sempre
  // now(), N baixas represadas na mesma rajada de sync carimbariam todas no
  // mesmo segundo do flush, iguais à armadilha já vivida no ponto (ver
  // lib/__tests__ e o comentário de fila offline em app/api/ponto/bater).
  ocorridoEm?: string | null;
  /**
   * De qual ATIVIDADE veio este consumo. É o começo do ciclo do galpão: a
   * pessoa pega a caixa lacrada de folhas limpas, BIPA, a caixa sai do estoque
   * inteira NESSE momento, e só então ela rompe o lacre e monta. Guardar a
   * atividade aqui é o que liga "esta caixa de folhas virou aquelas alavancas"
   * — e é o que faz a perda de uma reprovação se contabilizar sozinha, sem
   * ninguém lançar nada.
   *
   * Nulo/ausente na baixa avulsa (o galpão também dá baixa sem atividade).
   */
  atividadeId?: string | null;
}

/**
 * Dá baixa num lote de códigos. Nunca falha o lote inteiro por um código ruim
 * (etiqueta rasgada, digitação errada, código já baixado) — cada um resolve
 * pra sua própria `situacao`. Lança `ErroMotivoInvalido`/`ErroLoteBaixaGrande`/
 * `ErroSchemaDesatualizado` pra quem chama traduzir em HTTP.
 *
 * A baixa é da CAIXA INTEIRA: bipar a caixa lacrada de 50 folhas tira as 50 de
 * uma vez (`pecas` no resultado diz quantas foram). Não existe baixa parcial —
 * se sobrou meia caixa, o que existe é uma etiqueta nova pro resto, não um
 * desconto na antiga.
 */
export async function baixarUnidades(input: BaixarUnidadesInput): Promise<ResultadoBaixaCodigo[]> {
  if (!motivoValido(input.motivo)) throw new ErroMotivoInvalido();
  if (input.codigos.length > LOTE_MAXIMO_BAIXA) throw new ErroLoteBaixaGrande(LOTE_MAXIMO_BAIXA);
  if (!input.codigos.length) return [];

  const db = createSupabaseAdminClient();

  // Confere barato primeiro: um SELECT só, sem join com estoque_itens (regra
  // do CLAUDE.md: embed é o que pesa — deixa o join de fora da conferência).
  //
  // `quantidade` é a coluna da CAIXA. Ela só existe depois do SQL da caixa, e
  // bipar é o que o galpão faz o dia inteiro: pedir uma coluna que ainda não
  // existe derrubaria a bipagem toda (42703). Por isso a leitura tem plano B —
  // sem a coluna, cada etiqueta vale 1, que é como era antes.
  const COLUNAS_CAIXA = "id,codigo,status,item_id,quantidade";
  const COLUNAS_SEM_CAIXA = "id,codigo,status,item_id";
  type UnidadeAchada = { id: string; codigo: string; status: string; item_id: string; quantidade?: number | null };

  let encontradas: unknown;
  const busca = await db.from("estoque_unidades").select(COLUNAS_CAIXA).in("codigo", input.codigos).limit(LOTE_MAXIMO_BAIXA);
  if (busca.error && schemaDesatualizado(busca.error)) {
    const semCaixa = await db.from("estoque_unidades").select(COLUNAS_SEM_CAIXA).in("codigo", input.codigos).limit(LOTE_MAXIMO_BAIXA);
    // Falhou de novo: aí é a TABELA que não existe, não a coluna.
    if (semCaixa.error) {
      if (schemaDesatualizado(semCaixa.error)) throw new ErroSchemaDesatualizado();
      throw new Error(semCaixa.error.message);
    }
    encontradas = semCaixa.data;
  } else if (busca.error) {
    throw new Error(busca.error.message);
  } else {
    encontradas = busca.data;
  }

  const porCodigo = new Map<string, UnidadeAchada>();
  for (const row of (encontradas ?? []) as UnidadeAchada[]) {
    porCodigo.set(row.codigo, row);
  }

  const idsParaBaixa: string[] = [];
  const itemIdsUsados = new Set<string>();
  const situacaoPorCodigo = new Map<string, SituacaoBaixa>();
  for (const codigo of input.codigos) {
    const achada = porCodigo.get(codigo);
    situacaoPorCodigo.set(codigo, classificarSituacaoBaixa(achada));
    if (achada && achada.status === "em_estoque") {
      idsParaBaixa.push(achada.id);
      itemIdsUsados.add(achada.item_id);
    }
  }

  // Nomes dos itens envolvidos — o join caro só entra aqui, uma vez pro lote
  // inteiro, nunca código a código.
  const nomePorItemId = new Map<string, string>();
  if (itemIdsUsados.size) {
    const { data: itens } = await db.from("estoque_itens").select("id,nome").in("id", [...itemIdsUsados]).limit(LOTE_MAXIMO_BAIXA);
    for (const it of (itens ?? []) as { id: string; nome: string }[]) nomePorItemId.set(it.id, it.nome);
  }

  if (idsParaBaixa.length) {
    const comum = {
      status: input.motivo, baixa_motivo: input.motivo, baixa_obs: input.obs ?? null,
      baixado_por_id: input.baixadoPorId, baixado_por: input.baixadoPor,
      baixado_em: input.ocorridoEm || new Date().toISOString(),
    };
    const escrever = async (payload: Record<string, unknown>) =>
      (await db.from("estoque_unidades").update(payload).in("id", idsParaBaixa)).error;

    // `baixa_atividade_id` só entra quando há atividade — e, como a coluna
    // ainda pode não existir no banco, a escrita tem plano B: a baixa em si é
    // mais importante que o vínculo. Perder o vínculo é uma informação a menos
    // no histórico; perder a baixa é a peça continuar contando como estoque.
    let eUpdate = await escrever(input.atividadeId ? { ...comum, baixa_atividade_id: input.atividadeId } : comum);
    if (eUpdate && input.atividadeId && schemaDesatualizado(eUpdate)) eUpdate = await escrever(comum);
    if (eUpdate) throw new Error(eUpdate.message);
  }

  return input.codigos.map((codigo) => {
    const achada = porCodigo.get(codigo);
    const situacao = situacaoPorCodigo.get(codigo) as SituacaoBaixa;
    return {
      codigo,
      situacao,
      item: achada ? nomePorItemId.get(achada.item_id) ?? null : null,
      // A caixa sai inteira: as peças da etiqueta, nunca uma fatia dela. Zero
      // quando NADA saiu agora (código desconhecido, ou já baixado antes) —
      // assim somar `pecas` do lote dá exatamente o que deixou a prateleira.
      pecas: achada && situacao === "baixada" ? pecasDaUnidade(achada) : 0,
    };
  });
}
