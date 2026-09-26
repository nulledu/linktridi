// ── Estoque · a fila de impressão, no banco ──────────────────────────────────
//
// As REGRAS da etiqueta livre moram em `estoque-impressao-livre.ts` e não
// tocam em banco nenhum — é o que deixa testá-las em milissegundos. Aqui é o
// outro lado: ler e escrever a fila, que é o que as três bocas precisam.
//
// As três bocas, e por que elas compartilham este arquivo em vez de cada rota
// escrever a sua consulta:
//
//   · a TELA do escritório, que enfileira, lista e cancela;
//   · o BOOTSTRAP do tablet, que leva os trabalhos junto do estado do mundo;
//   · a CONFIRMAÇÃO do tablet, que diz o que saiu no papel.
//
// A regra que não pode divergir entre elas é a VALIDADE: um trabalho velho não
// pode ser entregue pelo bootstrap e mostrado como "esperando" na tela. Duas
// consultas escritas em dois arquivos divergem no dia em que alguém ajusta uma;
// uma função só, não.
//
// Leitura DEGRADA (sem a tabela, a fila é vazia e a tela explica o que rodar);
// escrita FALHA ALTO com a frase do que falta. É a mesma assimetria de
// `estoque-etiqueta-config.ts`, e ela existe porque as duas mentiras têm custos
// diferentes: uma fila vazia é verdade enquanto a tabela não existe, mas um
// "mandei pro galpão" que não mandou faz a pessoa esperar papel que nunca vem.

import {
  inicioDaValidade, statusVisivel, tituloDoTrabalho, TETO_DA_FILA, TETO_POR_CICLO,
  type StatusTrabalho, type TrabalhoLivre,
} from "./estoque-impressao-livre";

// O Supabase não tem tipos gerados aqui; fronteira dinâmica isolada nesta
// camada, como em lib/estoque-etiqueta-config.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** A tabela ainda não existe: supabase/estoque_impressao_livre.sql não rodou. */
export function faltaAFila(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  if (erro.code === "42P01" || erro.code === "42703") return true;
  return /relation .* does not exist|column .* does not exist|Could not find the table|schema cache/i.test(erro.message ?? "");
}

// ── Os tablets que podem receber papel ───────────────────────────────────────

export interface TabletDestino {
  id: string;
  nome: string;
  /** Última vez que o aparelho deu sinal. `null` = nunca. */
  vistoEm: string | null;
}

/**
 * Os aparelhos ativos, com o último sinal de vida.
 *
 * `visto_em` viaja junto porque é a informação que muda a decisão ANTES do
 * clique: mandar imprimir num tablet desligado há três dias produz uma espera
 * silenciosa, e a pessoa aperta o botão mais duas vezes. A tela mostra "visto
 * há 3 dias" ao lado do nome; o resto se resolve sozinho.
 */
export async function listarTablets(db: Db, limite = 20): Promise<TabletDestino[]> {
  const { data, error } = await db
    .from("estoque_dispositivos")
    .select("id,nome,visto_em")
    .eq("ativo", true)
    .order("nome", { ascending: true })
    .limit(limite);
  if (error) return [];
  return ((data ?? []) as { id: string; nome: string | null; visto_em: string | null }[]).map((d) => ({
    id: String(d.id),
    nome: d.nome ?? "Tablet do galpão",
    vistoEm: d.visto_em ?? null,
  }));
}

// ── A fila ───────────────────────────────────────────────────────────────────

export interface TrabalhoNaFila {
  id: string;
  titulo: string;
  dispositivoId: string;
  copias: number;
  status: StatusTrabalho;
  detalhe: string | null;
  porNome: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
  conteudo: TrabalhoLivre;
}

const COLUNAS = "id,dispositivo_id,titulo,conteudo,copias,status,detalhe,criado_por_nome,criado_em,resolvido_em";

function daLinha(r: Record<string, unknown>, agora: Date): TrabalhoNaFila {
  const criadoEm = String(r.criado_em ?? new Date().toISOString());
  return {
    id: String(r.id),
    titulo: String(r.titulo ?? ""),
    dispositivoId: String(r.dispositivo_id ?? ""),
    copias: Number(r.copias ?? 1),
    status: statusVisivel(String(r.status ?? "fila"), criadoEm, agora),
    detalhe: (r.detalhe as string | null) ?? null,
    porNome: (r.criado_por_nome as string | null) ?? null,
    criadoEm,
    resolvidoEm: (r.resolvido_em as string | null) ?? null,
    conteudo: (r.conteudo ?? { linhas: [] }) as TrabalhoLivre,
  };
}

/**
 * A fila que a tela mostra: o mais novo primeiro, com teto.
 *
 * Mostra TUDO — inclusive o que já saiu no papel e o que expirou. É de propósito:
 * a pergunta que traz alguém aqui é "aquilo que eu mandei saiu?", e uma lista só
 * com o que está pendente responde essa pergunta com o silêncio, que é
 * exatamente o mesmo silêncio de quando nada foi enfileirado.
 */
export async function listarFila(db: Db, limite = TETO_DA_FILA, agora = new Date()): Promise<{ trabalhos: TrabalhoNaFila[]; faltaSql: boolean }> {
  const { data, error } = await db
    .from("estoque_impressao_trabalhos")
    .select(COLUNAS)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) return { trabalhos: [], faltaSql: faltaAFila(error) };
  return { trabalhos: ((data ?? []) as Record<string, unknown>[]).map((r) => daLinha(r, agora)), faltaSql: false };
}

/**
 * Quantos trabalhos deste aparelho ainda esperam. É o freio contra a fila
 * infinita: sem ele, um botão apertado dez vezes por impaciência vira dez tiras
 * quinze minutos depois, e um laço num script vira o rolo inteiro.
 */
export async function pendentesDoTablet(db: Db, dispositivoId: string, agora = new Date()): Promise<number> {
  const { count, error } = await db
    .from("estoque_impressao_trabalhos")
    .select("id", { count: "exact", head: true })
    .eq("dispositivo_id", dispositivoId)
    .eq("status", "fila")
    .gte("criado_em", inicioDaValidade(agora));
  return error ? 0 : (count ?? 0);
}

/** Teto de trabalhos esperando por aparelho ao mesmo tempo. */
export const TETO_PENDENTES = 10;

export type ResultadoEnfileirar =
  | { ok: true; id: string }
  | { ok: false; motivo: "sem_sql" | "fila_cheia" | string };

export async function enfileirar(db: Db, args: {
  dispositivoId: string;
  trabalho: TrabalhoLivre;
  porId: string | null;
  porNome: string | null;
}, agora = new Date()): Promise<ResultadoEnfileirar> {
  const pendentes = await pendentesDoTablet(db, args.dispositivoId, agora);
  if (pendentes >= TETO_PENDENTES) {
    return { ok: false, motivo: "fila_cheia" };
  }

  const { data, error } = await db
    .from("estoque_impressao_trabalhos")
    .insert({
      dispositivo_id: args.dispositivoId,
      titulo: tituloDoTrabalho(args.trabalho),
      conteudo: args.trabalho,
      copias: args.trabalho.copias,
      criado_por: args.porId,
      criado_por_nome: args.porNome,
    })
    .select("id")
    .single();

  if (error) return { ok: false, motivo: faltaAFila(error) ? "sem_sql" : (error.message ?? "erro") };
  return { ok: true, id: String((data as { id: string }).id) };
}

/**
 * Cancela um trabalho que ainda não saiu.
 *
 * `eq("status", "fila")` não é higiene: é a corrida real. O tablet pode estar
 * imprimindo neste segundo, e um cancelamento que reescrevesse um trabalho já
 * `impresso` apagaria da tela o registro do papel que existe fisicamente em
 * cima da mesa de alguém.
 */
export async function cancelarTrabalho(db: Db, id: string): Promise<{ ok: boolean; motivo?: "sem_sql" | "tarde_demais" | string }> {
  const { data, error } = await db
    .from("estoque_impressao_trabalhos")
    .update({ status: "cancelado", resolvido_em: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "fila")
    .select("id");

  if (error) return { ok: false, motivo: faltaAFila(error) ? "sem_sql" : (error.message ?? "erro") };
  if (!data || (data as unknown[]).length === 0) return { ok: false, motivo: "tarde_demais" };
  return { ok: true };
}

// ── O que desce pro tablet ───────────────────────────────────────────────────

export interface TrabalhoParaOTablet {
  id: string;
  copias: number;
  conteudo: TrabalhoLivre;
}

/**
 * Os trabalhos que este aparelho deve imprimir.
 *
 * Roda a cada ciclo do worker, de cada tablet, para sempre — então é a consulta
 * mais quente do módulo, e o ciclo COMUM devolve uma lista VAZIA. Ela é barata
 * por construção: índice parcial sobre `status = 'fila'`, colunas nomeadas,
 * teto de cinco, e o corte de validade dentro do próprio `where` (trabalho
 * velho nem chega a ser lido, quanto mais transmitido).
 *
 * Não marca nada como entregue. Marcar aqui significaria "entreguei" quando o
 * que aconteceu foi "respondi um HTTP" — e a resposta pode morrer no caminho,
 * deixando o trabalho carimbado como saído sem ter saído. Quem carimba é a
 * confirmação, depois do papel.
 */
export async function trabalhosParaOTablet(
  db: Db,
  dispositivoId: string,
  limite = TETO_POR_CICLO,
  agora = new Date(),
): Promise<TrabalhoParaOTablet[]> {
  const { data, error } = await db
    .from("estoque_impressao_trabalhos")
    .select("id,conteudo,copias")
    .eq("dispositivo_id", dispositivoId)
    .eq("status", "fila")
    .gte("criado_em", inicioDaValidade(agora))
    .order("criado_em", { ascending: true })
    .limit(limite);

  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    copias: Number(r.copias ?? 1),
    conteudo: (r.conteudo ?? { linhas: [] }) as TrabalhoLivre,
  }));
}

export interface ConfirmacaoDoTablet {
  id: string;
  ok: boolean;
  /** Quando não deu: a frase do aparelho, que vira o motivo na fila da tela. */
  detalhe?: string | null;
}

/**
 * O tablet contando o que aconteceu com cada trabalho.
 *
 * Idempotente por construção — e essa é a propriedade que importa, porque a
 * confirmação É reenviada: o aparelho guarda a confirmação numa fila local e
 * repete até o servidor responder. O `eq("status", "fila")` faz o segundo envio
 * não encontrar linha nenhuma, o que é o resultado certo: já estava contado.
 *
 * Repare no que ISTO NÃO É: não é a trava contra imprimir duas vezes. Essa mora
 * no aparelho (ele ignora trabalho cujo id ele já conhece), porque o papel sai
 * lá. O servidor não tem como impedir uma segunda impressão depois do fato — só
 * como não confundir a contabilidade.
 */
export async function confirmarTrabalhos(
  db: Db,
  dispositivoId: string,
  confirmacoes: ConfirmacaoDoTablet[],
): Promise<{ confirmados: number; faltaSql: boolean }> {
  let confirmados = 0;
  const agora = new Date().toISOString();

  // As confirmações OK são todas a MESMA escrita (status/detalhe iguais), então
  // sobem num único update com `.in()` — o tablet manda a fila acumulada de uma
  // vez e isto era 1 ida por trabalho. Só a falha continua individual, porque o
  // `detalhe` é de cada uma. As guardas (dispositivo dono + status "fila")
  // valem igual nos dois caminhos.
  const idsOk = confirmacoes.filter((c) => c.ok).map((c) => c.id);
  if (idsOk.length) {
    const { data, error } = await db
      .from("estoque_impressao_trabalhos")
      .update({ status: "impresso", detalhe: null, resolvido_em: agora })
      .in("id", idsOk)
      // O aparelho só confirma o que é DELE. Sem isto, um token de tablet
      // comprometido reescreveria a fila dos outros aparelhos do galpão.
      .eq("dispositivo_id", dispositivoId)
      .eq("status", "fila")
      .select("id");
    if (error) {
      if (faltaAFila(error)) return { confirmados, faltaSql: true };
    } else {
      confirmados += ((data ?? []) as unknown[]).length;
    }
  }

  for (const c of confirmacoes) {
    if (c.ok) continue;
    const { data, error } = await db
      .from("estoque_impressao_trabalhos")
      .update({
        status: "falhou",
        detalhe: c.detalhe ?? "o tablet não disse o motivo",
        resolvido_em: agora,
      })
      .eq("id", c.id)
      .eq("dispositivo_id", dispositivoId)
      .eq("status", "fila")
      .select("id");

    if (error) {
      if (faltaAFila(error)) return { confirmados, faltaSql: true };
      continue;
    }
    if (data && (data as unknown[]).length > 0) confirmados++;
  }

  return { confirmados, faltaSql: false };
}
