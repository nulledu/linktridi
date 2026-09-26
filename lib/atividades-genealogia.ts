// ── A história da peça: de onde veio, e onde foi parar ───────────────────────
//
// "Todas atividades vão ter histórico: fulano de tal fez chancela, usou tal
// material que ciclano fez, e por aí vai."
//
// O dado pra responder isso JÁ EXISTE, espalhado em três tabelas. O que faltava
// era encadear:
//
//   estoque_conferencias.unidade_id   → a caixa que NASCEU daquela atividade
//   estoque_conferencias.atividade_id → a atividade que a produziu
//   estoque_unidades.baixa_atividade_id → a atividade que CONSUMIU aquela caixa
//   estoque_unidades.criado_por       → quem fez a caixa
//   atividades.para_nome              → quem fez a atividade
//
// Duas perguntas, uma corrente só percorrida nos dois sentidos:
//
//   PRA TRÁS  ("de onde veio"): caixa pronta → conferência que a criou →
//             atividade → o que aquela atividade consumiu → repete.
//             É a direção que se pergunta com a peça NA MÃO, e por isso a
//             porta de entrada da tela.
//
//   PRA FRENTE ("onde foi parar"): caixa de material ruim → atividade que a
//             consumiu → o que aquela atividade produziu → repete.
//             É a que salva o dia: descobriu-se que o lote de PS veio ruim,
//             e a pergunta é o que já saiu do galpão feito com ele.
//
// ── O CUSTO ──────────────────────────────────────────────────────────────────
// Encadear convida a N+1: "pra cada unidade, buscar a conferência dela". Este
// projeto já caiu duas vezes por consumo, então a travessia é POR NÍVEL, nunca
// por nó: cada nível custa 3 consultas (conferências, atividades, unidades) —
// independente de haver 1 ou 200 caixas naquele nível. Com o teto de 4 níveis,
// uma tela custa no máximo 1 + 4×3 + 1 = 14 consultas, e o caso comum (2
// níveis) custa 8. O teste `atividades-genealogia.test.ts` PROVA isso contando
// as chamadas: dobrar as caixas não pode dobrar as consultas.
//
// ── DEGRADAÇÃO ───────────────────────────────────────────────────────────────
// `estoque_unidades.baixa_atividade_id` (§6 de supabase/estoque_pendente_tudo.sql)
// pode não existir no banco ainda. Sem ela a corrente perde UM elo — o do
// consumo — e a resposta certa é dizer isso (`semVinculo`), nunca desenhar uma
// árvore vazia que faria o galpão concluir "essa peça não usou material nenhum".
//
// Módulo com duas metades: a travessia (pura, contra a porta `FonteGenealogia`)
// e a implementação Supabase da porta. A separação é o que deixa o custo ser
// testável sem subir banco.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { pecasDaUnidade } from "@/lib/estoque-unidades";
import { schemaDesatualizado } from "@/lib/estoque-unidades-gerar";

export type Direcao = "tras" | "frente";

/** Fundo de poço da travessia. Quatro elos já contam a história inteira de uma
 *  chancela (folha limpa → alavanca → base → chancela) e seguram o custo. */
export const MAX_NIVEIS = 4;
/** Teto de linhas por consulta — a corrente é estreita; largura assim é bug. */
export const TETO_LINHAS = 400;

// ── O que vem do banco (cru) ─────────────────────────────────────────────────

export interface UnidadeRaw {
  id: string;
  codigo: string;
  item_id: string;
  status: string;
  quantidade?: number | null;
  criado_por: string | null;
  criado_em: string | null;
  /**
   * `undefined` (e não `null`) quer dizer COLUNA AUSENTE — o SQL do vínculo
   * ainda não rodou. `null` quer dizer "esta caixa não foi consumida por
   * atividade nenhuma", que é uma resposta legítima e completamente diferente.
   */
  baixa_atividade_id?: string | null;
  baixado_por?: string | null;
  baixado_em?: string | null;
}

export interface ConferenciaRaw {
  atividade_id: string;
  unidade_id: string | null;
  resultado: string;
  conferido_por_nome: string | null;
  conferido_em: string | null;
}

export interface AtividadeRaw {
  id: string;
  tarefa: string;
  categoria: string | null;
  para_id: string | null;
  para_nome: string | null;
  produto_nome: string | null;
  iniciada_at: string | null;
  concluida_at: string | null;
}

/**
 * A porta pro banco. Toda consulta é EM LOTE de propósito: não existe assinatura
 * aqui que aceite um id só, justamente pra não haver como escrever o N+1.
 */
export interface FonteGenealogia {
  unidadesPorCodigo(codigos: string[]): Promise<UnidadeRaw[]>;
  unidadesPorId(ids: string[]): Promise<UnidadeRaw[]>;
  /** Unidades cuja BAIXA aponta pra estas atividades. `null` = coluna ausente. */
  unidadesConsumidasPor(atividadeIds: string[]): Promise<UnidadeRaw[] | null>;
  conferenciasPorUnidade(unidadeIds: string[]): Promise<ConferenciaRaw[]>;
  conferenciasPorAtividade(atividadeIds: string[]): Promise<ConferenciaRaw[]>;
  atividades(ids: string[]): Promise<AtividadeRaw[]>;
  nomesDeItens(ids: string[]): Promise<Map<string, string>>;
}

// ── O que a tela recebe ──────────────────────────────────────────────────────

export interface UnidadeNo {
  id: string;
  codigo: string;
  item: string | null;
  pecas: number;
  status: string;
  /** Quem FEZ esta caixa (o "material que ciclano fez"). */
  criadoPor: string | null;
  criadoEm: string | null;
  /** Quem bipou a caixa pra dentro do trabalho. */
  baixadoPor: string | null;
  baixadoEm: string | null;
}

export interface AtividadeNo {
  id: string;
  tarefa: string;
  categoria: string | null;
  /** Quem fez o trabalho — o "fulano de tal fez chancela". */
  quem: string | null;
  quemId: string | null;
  produto: string | null;
  quando: string | null;
}

export interface EloRastro {
  atividade: AtividadeNo;
  /** Pra trás: o que ENTROU nela. Pra frente: o que SAIU dela. */
  unidades: UnidadeNo[];
  /** Alguma conferência desta atividade deu ERRADO. `undefined` = não consultado. */
  reprovada?: boolean;
}

export interface NivelRastro {
  profundidade: number;
  elos: EloRastro[];
}

export interface Rastro {
  direcao: Direcao;
  /** A caixa de onde a pergunta partiu. `null` = código não existe. */
  raiz: UnidadeNo | null;
  niveis: NivelRastro[];
  /** Bateu no teto de níveis — a corrente continua além do que está desenhado. */
  truncado: boolean;
  /** `baixa_atividade_id` ainda não existe no banco: falta UM elo, e a tela diz. */
  semVinculo: boolean;
  /** Quantas consultas esta resposta custou. Fica na resposta de propósito. */
  consultas: number;
}

// ── Conversões puras ─────────────────────────────────────────────────────────

export function montarUnidade(u: UnidadeRaw, nomes: Map<string, string>): UnidadeNo {
  return {
    id: u.id,
    codigo: u.codigo,
    item: nomes.get(u.item_id) ?? null,
    pecas: pecasDaUnidade(u),
    status: u.status,
    criadoPor: u.criado_por,
    criadoEm: u.criado_em,
    baixadoPor: u.baixado_por ?? null,
    baixadoEm: u.baixado_em ?? null,
  };
}

export function montarAtividade(a: AtividadeRaw): AtividadeNo {
  return {
    id: a.id,
    tarefa: a.tarefa,
    categoria: a.categoria,
    quem: a.para_nome,
    quemId: a.para_id,
    produto: a.produto_nome,
    quando: a.concluida_at ?? a.iniciada_at,
  };
}

/** Agrupa unidades pela atividade que as consumiu. Pura — é o "join" do nível. */
export function porAtividadeConsumidora(unidades: UnidadeRaw[]): Map<string, UnidadeRaw[]> {
  const m = new Map<string, UnidadeRaw[]>();
  for (const u of unidades) {
    const a = u.baixa_atividade_id;
    if (!a) continue;
    const atual = m.get(a);
    if (atual) atual.push(u); else m.set(a, [u]);
  }
  return m;
}

/** Agrupa conferências pela atividade. Pura. */
export function porAtividadeConferida(confs: ConferenciaRaw[]): Map<string, ConferenciaRaw[]> {
  const m = new Map<string, ConferenciaRaw[]>();
  for (const c of confs) {
    const atual = m.get(c.atividade_id);
    if (atual) atual.push(c); else m.set(c.atividade_id, [c]);
  }
  return m;
}

// ── A travessia ──────────────────────────────────────────────────────────────

export interface OpcoesRastro {
  codigo: string;
  direcao: Direcao;
  maxNiveis?: number;
}

/**
 * Percorre a corrente NÍVEL A NÍVEL. O invariante que o teste protege: o número
 * de consultas depende só de quantos NÍVEIS existem, nunca de quantas caixas
 * cabem em cada um.
 */
export async function rastrear(fonte: FonteGenealogia, opcoes: OpcoesRastro): Promise<Rastro> {
  const maxNiveis = Math.max(1, Math.min(MAX_NIVEIS, opcoes.maxNiveis ?? MAX_NIVEIS));
  const codigo = (opcoes.codigo || "").trim();
  let consultas = 0;
  let semVinculo = false;

  if (!codigo) return { direcao: opcoes.direcao, raiz: null, niveis: [], truncado: false, semVinculo, consultas };

  const raizes = await fonte.unidadesPorCodigo([codigo]);
  consultas++;
  const raiz = raizes[0];
  // O nome do item de TODAS as caixas do rastro é resolvido numa consulta só, no
  // fim. Resolver por nível seria mais um round-trip por nível, e por caixa
  // seria o N+1 clássico — o embed é o que pesa (CLAUDE.md).
  const itemIds = new Set<string>();
  if (!raiz) {
    return { direcao: opcoes.direcao, raiz: null, niveis: [], truncado: false, semVinculo, consultas };
  }
  itemIds.add(raiz.item_id);
  if (raiz.baixa_atividade_id === undefined) semVinculo = true;

  // Cada nível é montado com as linhas CRUAS; os nomes entram no fim.
  const niveisCrus: { profundidade: number; elos: { atividade: AtividadeRaw; unidades: UnidadeRaw[]; reprovada?: boolean }[] }[] = [];
  const unidadesVistas = new Set<string>([raiz.id]);
  const atividadesVistas = new Set<string>();
  let truncado = false;

  // Fronteira: pra trás são UNIDADES (procuro quem as criou); pra frente são as
  // ATIVIDADES que consumiram as unidades da fronteira anterior.
  let fronteiraUnidades: UnidadeRaw[] = [raiz];

  for (let profundidade = 0; profundidade < maxNiveis; profundidade++) {
    let atividadeIds: string[];

    if (opcoes.direcao === "tras") {
      // Quem PRODUZIU estas caixas? A conferência é o único lugar que sabe.
      const confs = await fonte.conferenciasPorUnidade(fronteiraUnidades.map((u) => u.id));
      consultas++;
      atividadeIds = [...new Set(confs.map((c) => c.atividade_id).filter(Boolean))]
        .filter((id) => !atividadesVistas.has(id));
    } else {
      // Quem CONSUMIU estas caixas? É o vínculo da baixa — o elo que some
      // quando o SQL não rodou.
      const semColuna = fronteiraUnidades.some((u) => u.baixa_atividade_id === undefined);
      if (semColuna) semVinculo = true;
      atividadeIds = [...new Set(fronteiraUnidades.map((u) => u.baixa_atividade_id).filter(Boolean) as string[])]
        .filter((id) => !atividadesVistas.has(id));
    }

    if (!atividadeIds.length) break;
    for (const id of atividadeIds) atividadesVistas.add(id);

    const ativs = await fonte.atividades(atividadeIds);
    consultas++;
    const porId = new Map(ativs.map((a) => [a.id, a]));

    let proximas: UnidadeRaw[] = [];
    const elos: { atividade: AtividadeRaw; unidades: UnidadeRaw[]; reprovada?: boolean }[] = [];

    if (opcoes.direcao === "tras") {
      const consumidas = await fonte.unidadesConsumidasPor(atividadeIds);
      consultas++;
      if (consumidas === null) {
        semVinculo = true;
        // Sem o vínculo o nível ainda tem valor: mostra QUEM fez e QUANDO, só
        // não mostra com o quê. Melhor meia corrente honesta que nenhuma.
        for (const id of atividadeIds) {
          const a = porId.get(id);
          if (a) elos.push({ atividade: a, unidades: [] });
        }
      } else {
        const grupos = porAtividadeConsumidora(consumidas);
        for (const id of atividadeIds) {
          const a = porId.get(id);
          if (!a) continue;
          const us = (grupos.get(id) ?? []).filter((u) => !unidadesVistas.has(u.id));
          for (const u of us) { unidadesVistas.add(u.id); itemIds.add(u.item_id); }
          elos.push({ atividade: a, unidades: us });
          proximas.push(...us);
        }
      }
    } else {
      const confs = await fonte.conferenciasPorAtividade(atividadeIds);
      consultas++;
      const porAtiv = porAtividadeConferida(confs);
      const nascidasIds = [...new Set(confs.map((c) => c.unidade_id).filter(Boolean) as string[])]
        .filter((id) => !unidadesVistas.has(id));
      const nascidas = nascidasIds.length ? await fonte.unidadesPorId(nascidasIds) : [];
      if (nascidasIds.length) consultas++;
      const porUnidadeId = new Map(nascidas.map((u) => [u.id, u]));
      for (const u of nascidas) { unidadesVistas.add(u.id); itemIds.add(u.item_id); }

      for (const id of atividadeIds) {
        const a = porId.get(id);
        if (!a) continue;
        const cs = porAtiv.get(id) ?? [];
        const us = cs.map((c) => (c.unidade_id ? porUnidadeId.get(c.unidade_id) : undefined))
          .filter(Boolean) as UnidadeRaw[];
        elos.push({ atividade: a, unidades: us, reprovada: cs.some((c) => c.resultado === "errado") });
        proximas.push(...us);
      }
    }

    if (!elos.length) break;
    niveisCrus.push({ profundidade, elos });

    // Pra frente a próxima fronteira precisa do vínculo de baixa das caixas que
    // NASCERAM — e ele já vem em `unidadesPorId`.
    fronteiraUnidades = proximas;
    if (!fronteiraUnidades.length) break;
    if (profundidade === maxNiveis - 1) truncado = true;
  }

  const nomes = itemIds.size ? await fonte.nomesDeItens([...itemIds]) : new Map<string, string>();
  if (itemIds.size) consultas++;

  return {
    direcao: opcoes.direcao,
    raiz: montarUnidade(raiz, nomes),
    niveis: niveisCrus.map((n) => ({
      profundidade: n.profundidade,
      elos: n.elos.map((e) => ({
        atividade: montarAtividade(e.atividade),
        unidades: e.unidades.map((u) => montarUnidade(u, nomes)),
        ...(e.reprovada === undefined ? {} : { reprovada: e.reprovada }),
      })),
    })),
    truncado,
    semVinculo,
    consultas,
  };
}

// ── A porta, implementada no Supabase ────────────────────────────────────────

const COLS_UNIDADE = "id,codigo,item_id,status,quantidade,criado_por,criado_em,baixado_por,baixado_em";
const COLS_UNIDADE_SEM_VINCULO = COLS_UNIDADE;
const COLS_UNIDADE_COM_VINCULO = `${COLS_UNIDADE},baixa_atividade_id`;
const COLS_CONFERENCIA = "atividade_id,unidade_id,resultado,conferido_por_nome,conferido_em";
const COLS_ATIVIDADE = "id,tarefa,categoria,para_id,para_nome,produto_nome,iniciada_at,concluida_at";

export function fonteSupabase(): FonteGenealogia {
  const db = createSupabaseAdminClient();

  /**
   * Lê unidades por uma coluna qualquer, pedindo `baixa_atividade_id` e — se a
   * coluna não existir — repetindo sem ela. As linhas voltam então SEM a
   * propriedade (`undefined`), que é como a travessia reconhece "coluna
   * ausente" e a diferencia de "não consumida" (`null`).
   */
  const lerUnidades = async (coluna: string, valores: string[]): Promise<UnidadeRaw[]> => {
    if (!valores.length) return [];
    const pedir = (cols: string) =>
      db.from("estoque_unidades").select(cols).in(coluna, valores).limit(TETO_LINHAS);
    const primeira = await pedir(COLS_UNIDADE_COM_VINCULO);
    if (primeira.error && schemaDesatualizado(primeira.error)) {
      const segunda = await pedir(COLS_UNIDADE_SEM_VINCULO);
      if (segunda.error) throw new Error(segunda.error.message);
      return (segunda.data ?? []) as unknown as UnidadeRaw[];
    }
    if (primeira.error) throw new Error(primeira.error.message);
    return (primeira.data ?? []) as unknown as UnidadeRaw[];
  };

  return {
    unidadesPorCodigo: (codigos) => lerUnidades("codigo", codigos),

    unidadesPorId: (ids) => lerUnidades("id", ids),

    async unidadesConsumidasPor(atividadeIds) {
      if (!atividadeIds.length) return [];
      const { data, error } = await db.from("estoque_unidades")
        .select(COLS_UNIDADE_COM_VINCULO)
        .in("baixa_atividade_id", atividadeIds)
        .limit(TETO_LINHAS);
      // Sem a coluna não há como perguntar: `null` é "não dá pra saber", que a
      // travessia traduz em `semVinculo` — nunca em "não consumiu nada".
      if (error && schemaDesatualizado(error)) return null;
      // Erro de verdade SOBE. Devolver lista vazia aqui seria dizer "esta peça
      // não usou material nenhum" quando a verdade é "o banco não respondeu" —
      // exatamente a mentira que esta tela inteira existe pra não contar.
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as UnidadeRaw[];
    },

    async conferenciasPorUnidade(unidadeIds) {
      if (!unidadeIds.length) return [];
      const { data, error } = await db.from("estoque_conferencias")
        .select(COLS_CONFERENCIA).in("unidade_id", unidadeIds).limit(TETO_LINHAS);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ConferenciaRaw[];
    },

    async conferenciasPorAtividade(atividadeIds) {
      if (!atividadeIds.length) return [];
      const { data, error } = await db.from("estoque_conferencias")
        .select(COLS_CONFERENCIA).in("atividade_id", atividadeIds).limit(TETO_LINHAS);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ConferenciaRaw[];
    },

    async atividades(ids) {
      if (!ids.length) return [];
      const { data, error } = await db.from("atividades")
        .select(COLS_ATIVIDADE).in("id", ids).limit(TETO_LINHAS);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AtividadeRaw[];
    },

    // A ÚNICA consulta cujo erro é engolido, e de propósito: sem o nome do item
    // a tela ainda mostra o CÓDIGO, que é o que está impresso na caixa e o que
    // a pessoa tem na mão. Derrubar a corrente inteira por causa de um rótulo
    // seria trocar uma resposta quase completa por nenhuma.
    async nomesDeItens(ids) {
      const m = new Map<string, string>();
      if (!ids.length) return m;
      const { data } = await db.from("estoque_itens").select("id,nome").in("id", ids).limit(TETO_LINHAS);
      for (const it of (data ?? []) as { id: string; nome: string }[]) m.set(it.id, it.nome);
      return m;
    },
  };
}
