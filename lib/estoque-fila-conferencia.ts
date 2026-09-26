// ── A fila do gerente: "quais caixas estão esperando conferência?" ───────────
//
// A MESMA pergunta é feita de dois lugares — o navegador
// (/api/estoque/conferencias/pendentes) e o tablet do galpão
// (/api/estoque/device/conferencias-pendentes) — e as duas rotas nasceram
// separadas. A do navegador foi consertada duas vezes; a do aparelho ficou pra
// trás com o desenho antigo, e o aparelho é justamente o principal ponto de
// conferência do galpão. Enquanto forem duas cópias, elas voltam a divergir.
//
// Os dois defeitos que o desenho antigo tinha, e que esta função não tem:
//
//  1. **O erro de `estoque_conferencias` era engolido.** `const { data: conf }
//     = await …` descarta o erro, e `data` vem `null` tanto quando não há
//     conferência nenhuma quanto quando a consulta FALHOU. Hoje, com o SQL
//     pendente sem rodar, a tabela não existe: o conjunto de "já conferidas"
//     ficava vazio e o tablet listava 100% das atividades concluídas como
//     "esperando o gestor" — cada toque voltando recusado. `qcDesligado` diz a
//     verdade em vez de inventar fila.
//
//  2. **O filtro do "já conferida" era feito em JavaScript DEPOIS do teto.**
//     Linhas presas (produto fora do catálogo, conferência que travou no meio)
//     nunca saem de `estoque_lancado = false` e comem a janela: acumuladas 100
//     delas, uma caixa real some da fila sem erro nenhum. Aqui a varredura
//     CONTINUA em janelas com cursor até juntar uma página de pendências de
//     verdade.
//
// O filtro por `resultado = 'certo'` é deliberado (mesmo do índice único
// parcial do banco): a REPROVAÇÃO devolve a atividade pra pessoa refazer, e
// quando ela conclui de novo a caixa TEM que reaparecer. Sem o filtro, a linha
// da reprovação excluiria a atividade da fila pra sempre — o refazer sumiria em
// silêncio.
//
// ── O filtro que esvaziava a fila (agosto/2026) ──────────────────────────────
//
// Esta varredura exigia `produto_nome not null`, porque quem a projetou assumiu
// que atividade de produção aponta pra um item do catálogo. Medido no banco de
// produção: 104 atividades concluídas, 103 SEM `produto_nome` — e a fila
// entregava ZERO. As 103 são produção de verdade ("Montar alavancas · 30/30 ·
// João Vitor", "Limpar folhas de alavanca · 150/150"), criadas com uma TAREFA
// em texto e uma CATEGORIA, que é como o galpão trabalha: quem lança a
// atividade não conhece o catálogo de 192 itens.
//
// O link com o catálogo deixou de ser PRÉ-REQUISITO e virou parte da
// conferência: a fila mostra o trabalho concluído, e é o gerente, na hora de
// APROVAR, quem diz em qual item aquilo entra (ver `destinoId` em
// lib/estoque-conferencia.ts). Reprovar continua sem precisar de destino
// nenhum — o material já saiu do estoque quando foi bipado.
import { schemaDesatualizado } from "@/lib/estoque-unidades-gerar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Quantas pendências uma página devolve, quando quem chama não diz outra coisa. */
export const PAGINA_PADRAO = 50;
/** Tamanho de cada varredura no banco. Maior que a página de propósito — ver acima. */
export const JANELA = 200;
/** Teto de varreduras por chamada, pra uma fila entupida não virar consulta infinita. */
export const PASSES = 6;

/**
 * A JANELA DA FILA, em dias. É a resposta ao acervo.
 *
 * No dia em que a fila voltou a enxergar a produção sem `produto_nome`, o
 * pendente virou 104 cartões de uma vez — três semanas de trabalho de cinco
 * pessoas. Isso não é fila, é ruído: o gerente abre, não sabe por onde começar
 * e fecha. E o contrário (marcar tudo como conferido pra "zerar") seria pior:
 * daria entrada em estoque que ninguém olhou, ou apagaria em silêncio o
 * trabalho de ontem.
 *
 * Sete dias porque é o que responde "o que ficou pendente enquanto eu não
 * estava" — cobre a semana inteira e a segunda-feira que olha pra sexta. Nos
 * dados de produção, sete dias são 21 caixas (todas produção real) contra 83 de
 * antes.
 *
 * O que fica pra trás NÃO some: é CONTADO (`acervo`) e a tela abre a lista
 * inteira num toque. Nada é decidido pelo sistema, só ordenado.
 */
export const DIAS_DA_FILA = 7;

/** O `desde` da fila padrão — exportado porque as duas rotas precisam do mesmo. */
export function corteDaFila(agora: Date = new Date(), dias: number = DIAS_DA_FILA): string {
  return new Date(agora.getTime() - dias * 86_400_000).toISOString();
}

export interface AtividadePendente {
  id: string;
  /**
   * O item do catálogo que a atividade já apontava. Quase sempre `null`: a
   * atividade nasce com uma TAREFA em texto, e quem confere é que escolhe o
   * destino na hora de aprovar.
   */
  produto_nome: string | null;
  /** "Montar alavancas" — o que a pessoa fez. É o título da caixa na fila. */
  tarefa: string | null;
  /** "150 folhas — suficiente p/ 30 alavancas". Ajuda a escolher o destino. */
  detalhe: string | null;
  categoria: string | null;
  quantidade_alvo: number;
  quantidade_feita: number;
  para_id: string;
  para_nome: string;
  concluida_at: string | null;
  /**
   * A FOTO DO TRABALHO PRONTO — tirada pela própria pessoa ao concluir.
   *
   * É a peça mais valiosa da conferência e ficou três meses sem ser lida por
   * ninguém: 101 das 107 atividades concluídas em produção têm foto. Ela
   * permite comparar o que foi fotografado na hora com a caixa que está na
   * frente do gerente agora — e essa comparação É a conferência.
   */
  foto_url: string | null;
  /** Quando a pessoa começou. Com `concluida_at`, é o tempo real do trabalho. */
  iniciada_at: string | null;
  /** Quanto se esperava que levasse. A referência do tempo real. */
  tempo_estimado_min: number | null;
}

export interface VarreduraPendentes {
  pendentes: AtividadePendente[];
  /**
   * Conferência JÁ gravada e o estoque não entrou: o ciclo travou no meio.
   * Não é pendência (conferir de novo devolve `atividade_ja_conferida`), é
   * alerta — e é o estado que, sem este número, é 100% invisível.
   */
  travadas: number;
  proximoCursor: string | null;
  /** A tabela `estoque_conferencias` não existe: o QC ainda não foi ligado. */
  qcDesligado: boolean;
}

export class ErroVarredura extends Error {
  constructor(public detalhe: string) { super("falha_na_varredura"); }
}

/**
 * Varre `atividades` até juntar uma página de caixas realmente pendentes.
 *
 * `cursor` é o `concluida_at` da última linha lida (paginação por data, não por
 * offset — offset repete linha quando alguém confere no meio da navegação).
 *
 * `desde` é a JANELA (ver `DIAS_DA_FILA`): a fila do dia a dia mostra a semana,
 * e quem pede o acervo passa `desde: null`.
 */
export async function varrerPendentesDeConferencia(
  db: Db,
  opts: { cursor?: string | null; pagina?: number; desde?: string | null } = {},
): Promise<VarreduraPendentes> {
  const pagina = Math.max(1, Math.trunc(opts.pagina ?? PAGINA_PADRAO));
  const pendentes: AtividadePendente[] = [];
  const vistos = new Set<string>();
  let travadas = 0;
  let cursor = opts.cursor ?? null;
  let esgotou = false;

  for (let passe = 0; passe < PASSES && pendentes.length < pagina && !esgotou; passe++) {
    // As três colunas de CONTEXTO (`foto_url`, `iniciada_at`,
    // `tempo_estimado_min`) vêm na varredura em vez de numa segunda consulta
    // pela página. A varredura pode ler até 1200 linhas pra encher 50, mas no
    // caso real ela para na primeira janela (sete dias são ~21 pendências), e
    // as três somam ~120 bytes por linha — uma URL curta e dois números. Uma
    // consulta a mais custaria uma invocação a mais em TODA carga da fila, e é
    // invocação que pausou o projeto na Vercel, não payload.
    let q = db
      .from("atividades")
      .select(
        "id,produto_nome,tarefa,detalhe,categoria,quantidade_alvo,quantidade_feita," +
          "para_id,para_nome,concluida_at,foto_url,iniciada_at,tempo_estimado_min",
      )
      .eq("status", "concluida")
      // O carimbo de "esta já foi conferida", escrito só pela conferência. É
      // ele que protege a atividade de 27/07 que o auto-lançamento antigo já
      // somou no estoque: ela nunca reaparece aqui, então não há como somar
      // duas vezes.
      .eq("estoque_lancado", false)
      // `nullsFirst: false` explícito: o padrão do Postgres em DESC é NULLS
      // FIRST, e uma atividade concluída sem `concluida_at` (anomalia de dado)
      // encabeçaria a fila e ainda quebraria o cursor, que é justamente esse
      // campo. Com nulls no fim, o cursor sempre sai de uma linha com data.
      .order("concluida_at", { ascending: false, nullsFirst: false })
      .limit(JANELA);
    if (opts.desde) q = q.gte("concluida_at", opts.desde);
    if (cursor) q = q.lt("concluida_at", cursor);

    const { data, error } = await q;
    if (error) throw new ErroVarredura(error.message);
    const linhas = (data ?? []) as AtividadePendente[];
    if (linhas.length < JANELA) esgotou = true;
    if (!linhas.length) break;

    const ids = linhas.map((a) => a.id);
    const { data: conf, error: eConf } = await db
      .from("estoque_conferencias")
      .select("atividade_id")
      .eq("resultado", "certo")
      .in("atividade_id", ids)
      .limit(JANELA);
    // O QC não foi ligado (tabela inexistente): fila vazia e honesta. Sem isto
    // o conjunto ficaria vazio e TUDO voltaria como pendente — uma fila
    // inventada, em que cada tentativa de conferir falha.
    if (eConf && schemaDesatualizado(eConf)) {
      return { pendentes: [], travadas: 0, proximoCursor: null, qcDesligado: true };
    }
    if (eConf) throw new ErroVarredura(eConf.message);

    const jaConferidas = new Set(((conf ?? []) as { atividade_id: string }[]).map((c) => c.atividade_id));

    for (const a of linhas) {
      if (vistos.has(a.id)) continue;
      vistos.add(a.id);
      if (jaConferidas.has(a.id)) { travadas++; continue; }
      if (pendentes.length < pagina) pendentes.push(a);
    }

    const ultimaComData = [...linhas].reverse().find((a) => a.concluida_at);
    if (!ultimaComData) { esgotou = true; break; }
    cursor = ultimaComData.concluida_at;
  }

  return {
    pendentes,
    travadas,
    // Só oferece "carregar mais" se a varredura parou por ter enchido a página
    // (ou por bater no teto de passes), nunca quando o fim da tabela chegou.
    proximoCursor: esgotou || !cursor ? null : cursor,
    qcDesligado: false,
  };
}

/**
 * Quantas atividades concluídas ficaram ANTES da janela.
 *
 * O número que impede as duas falhas do acervo: sem ele, ou o gerente abre a
 * tela com 104 cartões (e não começa por nenhum), ou o trabalho de três semanas
 * atrás desaparece sem ninguém decidir nada. Aqui ele fica visível numa linha
 * só, e a lista inteira está a um toque.
 *
 * Conta por `count/head` — o corpo volta vazio, é só o número. E é uma
 * APROXIMAÇÃO por cima: uma atividade com conferência gravada cujo estoque
 * travou no meio (`travadas`) continua com `estoque_lancado = false` e entra
 * nesta conta. Cruzar isso com `estoque_conferencias` custaria a varredura
 * inteira do acervo pra ajustar um número que a tela usa como "tem mais coisa
 * ali atrás".
 */
export async function contarAcervoAnterior(db: Db, antesDe: string): Promise<number> {
  const { count, error } = await db
    .from("atividades")
    .select("id", { count: "exact", head: true })
    .eq("status", "concluida")
    .eq("estoque_lancado", false)
    .lt("concluida_at", antesDe);
  if (error) return 0; // contexto, não fila: um erro aqui não pode derrubar a tela
  return count ?? 0;
}

export interface ItemDaFila {
  id: string;
  /** Item etiquetado (uma caixa = uma etiqueta) ou só um número no catálogo. */
  serializado: boolean;
  /**
   * O saldo e a unidade da contagem antiga. Vêm junto porque `serializado`
   * sozinho não diz mais o que a tela promete: desde a caixa lacrada, um item
   * ainda não etiquetado pode estar a um toque de virar etiquetado (saldo 0),
   * preso atrás de uma pilha que alguém precisa decidir como etiquetar
   * (saldo > 0), ou fora de cogitação por ser medido em quilo. Quem separa os
   * três é `estadoDeEtiqueta` (lib/estoque-etiquetavel.ts), e ela precisa
   * destes dois campos.
   */
  quantidade: number;
  unidade: string | null;
}

/**
 * O item de cada `produto_nome` da página, numa consulta só pro lote.
 *
 * Informativo: a conferência resolve o item de novo, por nome, na hora de
 * gravar. Serve pra tela dizer ANTES ("este produto não está no catálogo com
 * esse nome") em vez de deixar a pessoa preencher tudo e levar 404.
 *
 * A chave do mapa é o nome NORMALIZADO (sem caixa, sem espaço nas pontas), do
 * mesmo jeito que `registrarConferencia` compara — indexar pelo texto cru fazia
 * "Alavanca" na atividade e "alavanca" no catálogo parecerem produtos
 * diferentes, e a tela apagava o botão "Certo" de uma caixa perfeitamente
 * aprovável.
 */
export async function itensPorNome(db: Db, nomes: string[], teto: number): Promise<Map<string, ItemDaFila>> {
  const mapa = new Map<string, ItemDaFila>();
  const alvo = [...new Set(nomes.filter(Boolean))].slice(0, teto);
  if (!alvo.length) return mapa;
  const { data } = await db.from("estoque_itens").select("id,nome,serializado,quantidade,unidade").in("nome", alvo).limit(teto);
  for (const it of (data ?? []) as { id: string; nome: string; serializado: boolean | null; quantidade: number | null; unidade: string | null }[]) {
    mapa.set(chaveDeNome(it.nome), {
      id: it.id,
      serializado: it.serializado !== false,
      quantidade: Math.max(0, Number(it.quantidade) || 0),
      unidade: it.unidade ?? null,
    });
  }
  return mapa;
}

export function chaveDeNome(nome: string | null | undefined): string {
  return String(nome ?? "").trim().toLowerCase();
}

/**
 * A foto do ROSTO de quem fez, por `para_id`.
 *
 * A fila é uma lista de gente que se conhece pelo rosto, não pelo nome
 * completo: "Davi" e "Davi R." são a mesma leitura pra quem confere, e o rosto
 * não é. O galpão tem cinco pessoas produzindo, então uma página de 23 cartões
 * usa no máximo cinco URLs — o navegador (e o cache de disco do Coil, no
 * tablet) baixa cada uma UMA vez e reusa nos outros cartões.
 *
 * `employees.id` é o mesmo id de `profiles` (é assim que a importação do ERP
 * grava), então a chave do mapa é o `para_id` da atividade sem tradução
 * nenhuma.
 *
 * Erro aqui NÃO derruba a fila: o rosto é contexto. Sem ele a lista mostra as
 * iniciais, que é o que o `Avatar` já faz — conferir continua possível.
 */
export async function fotosDeExecutores(db: Db, ids: string[], teto: number): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const alvo = [...new Set(ids.filter(Boolean))].slice(0, teto);
  if (!alvo.length) return mapa;
  try {
    const { data, error } = await db.from("employees").select("id,photo_url").in("id", alvo).limit(teto);
    if (error) return mapa;
    for (const e of (data ?? []) as { id: string; photo_url: string | null }[]) {
      if (e.photo_url) mapa.set(e.id, e.photo_url);
    }
  } catch {
    // idem: a fila do galpão não para porque a tabela de pessoas tossiu.
  }
  return mapa;
}
