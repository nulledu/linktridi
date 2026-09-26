import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * O chão de fábrica na parede.
 *
 * A fonte é a tabela `atividades` — a mesma que o tablet do operador escreve.
 * Não é o ERP: o ERP sabe o que foi FATURADO, e a linha de produção precisa
 * saber o que está SENDO FEITO agora. São perguntas diferentes, e misturá-las
 * foi exatamente o erro que custou o dia de hoje no painel de faturamento.
 *
 * Três colunas fazem todo o trabalho e já existiam (`supabase/atividades_metricas.sql`):
 *   iniciada_at   — quando a pessoa deu início
 *   concluida_at  — quando entregou
 *   quantidade_feita / quantidade_alvo — o que saiu contra o que foi pedido
 *
 * O TMA nasce daí: média de `concluida_at − iniciada_at` das concluídas de
 * hoje. Sem `iniciada_at` a atividade não entra no TMA (em vez de entrar com
 * duração inventada a partir do `created_at`, que mediria o tempo que a ordem
 * ficou na fila — outra coisa com o mesmo nome).
 */

export interface OperadorPainel {
  id: string;
  nome: string;
  fotoUrl: string | null;
  /** Concluídas hoje e o que ainda está com a pessoa. */
  concluidas: number;
  emAndamento: number;
  pendentes: number;
  /** Peças feitas hoje (soma de `quantidade_feita` das concluídas). */
  pecas: number;
  /**
   * Feito ÷ pedido nas concluídas de hoje, em %. `null` quando nenhuma ordem
   * da pessoa tinha alvo — dividir por zero e mostrar "0%" faria parecer que
   * ela não produziu nada.
   */
  produtividade: number | null;
  /** Tempo médio de atendimento, em minutos. `null` sem concluída cronometrada. */
  tmaMin: number | null;
  /**
   * Minutos DENTRO de atividade — a soma das durações cronometradas do dia.
   * É o tempo em que a pessoa estava, comprovadamente, produzindo.
   */
  emAtividadeMin: number;
  /**
   * Minutos de presença, pelo PONTO (pares de batida do dia). `null` quando a
   * pessoa não tem ponto vinculado — e aí o ocioso também não existe, em vez de
   * nascer igual ao tempo em atividade e acusar alguém de nada.
   */
  trabalhadoMin: number | null;
  /**
   * Presença − atividade. É o número mais delicado da tela: ele NÃO é "tempo
   * perdido". Reunião, limpeza, espera de insumo e ordem que ninguém abriu no
   * tablet caem todos aqui. Fica exposto porque a diferença grande é a pergunta
   * certa a fazer — não a resposta.
   */
  ociosoMin: number | null;
}

/** Batida de ponto de uma pessoa, já resolvida para o colaborador. */
export interface BatidaPonto {
  colaboradorId: string;
  batidoEm: string;
}

/**
 * Minutos de presença a partir das batidas do dia.
 *
 * Pares por POSIÇÃO (1ª abre, 2ª fecha, 3ª abre…), a mesma regra do banco de
 * horas: é robusto a rótulo errado e a batida ímpar. Sobra ímpar = pessoa ainda
 * dentro do expediente; esse trecho aberto NÃO conta, senão o número cresceria
 * sozinho a cada segundo e a tela viraria um cronômetro.
 */
export function minutosDePresenca(batidasIso: string[]): number {
  const ordenadas = [...batidasIso].sort();
  let ms = 0;
  for (let i = 0; i + 1 < ordenadas.length; i += 2) {
    ms += new Date(ordenadas[i + 1]).getTime() - new Date(ordenadas[i]).getTime();
  }
  return Math.max(0, Math.round(ms / 60000));
}

export interface ResumoProducao {
  atualizadoEm: string;
  /** Dia que os números representam (`YYYY-MM-DD`, fuso SP). */
  dia: string;
  /**
   * `false` quando o dia mostrado NÃO é hoje.
   *
   * Às 6h da manhã, e em todo dia que ainda não começou, o dia corrente é uma
   * tela de zeros — que na parede se lê como "a fábrica parou", não como "o
   * turno não começou". Nesse caso a TV mostra o último dia COM movimento e diz
   * qual é. Ver `resumoProducaoDoDia`.
   */
  ehHoje: boolean;
  /** Peças concluídas hoje, somando todo mundo. */
  pecasHoje: number;
  /** A fila: o que está aberto agora. */
  emAndamento: number;
  pendentes: number;
  urgentes: number;
  impedidas: number;
  concluidasHoje: number;
  /** TMA da equipe inteira, em minutos. */
  tmaMin: number | null;
  /** Quantos operadores encostaram em alguma ordem hoje. */
  operadoresAtivos: number;
  operadores: OperadorPainel[];
}

/** Linha crua de `atividades` — só as colunas que o painel usa. */
export interface LinhaAtividade {
  para_id: string | null;
  para_nome: string | null;
  foto_url: string | null;
  status: string | null;
  urgente: boolean | null;
  impedida: boolean | null;
  quantidade_alvo: number | null;
  quantidade_feita: number | null;
  iniciada_at: string | null;
  concluida_at: string | null;
}

/** Duração em minutos entre dois carimbos. `null` se algum faltar ou for absurdo. */
function duracaoMin(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  // Teto de 12h: ordem que a pessoa esqueceu aberta na sexta e fechou na
  // segunda distorceria a média da equipe inteira. Fica de fora do TMA em vez
  // de virar um TMA de 3 dias que ninguém entende.
  const min = ms / 60000;
  return min <= 12 * 60 ? min : null;
}

/**
 * A conta, PURA — sem banco. É aqui que mora tudo que pode errar, então é aqui
 * que o teste bate.
 */
export function resumirProducao(
  linhas: LinhaAtividade[],
  agora = new Date(),
  dia = diaSP(agora),
  ehHoje = true,
  /** Minutos de presença por colaborador, vindos do ponto. */
  presencaPorPessoa: Record<string, number> = {},
  /**
   * Foto de CADASTRO (`employees.photo_url`) por colaborador. Tem prioridade
   * sobre `atividades.foto_url`, que é a foto de COMPROVAÇÃO do trabalho — na
   * parede o retrato da última peça aparecia como se fosse o rosto da pessoa.
   */
  fotoPorPessoa: Record<string, string> = {},
): ResumoProducao {
  const porPessoa = new Map<string, OperadorPainel & { alvo: number; feito: number; duracoes: number[] }>();
  const duracoesEquipe: number[] = [];
  let pecasHoje = 0, emAndamento = 0, pendentes = 0, urgentes = 0, impedidas = 0, concluidasHoje = 0;

  for (const l of linhas) {
    const id = l.para_id || "";
    const p = porPessoa.get(id) ?? {
      id, nome: l.para_nome || "Sem responsável", fotoUrl: fotoPorPessoa[id] ?? l.foto_url ?? null,
      concluidas: 0, emAndamento: 0, pendentes: 0, pecas: 0,
      produtividade: null, tmaMin: null,
      emAtividadeMin: 0, trabalhadoMin: null, ociosoMin: null,
      alvo: 0, feito: 0, duracoes: [] as number[],
    };
    if (!p.fotoUrl && l.foto_url) p.fotoUrl = l.foto_url;

    if (l.status === "concluida") {
      concluidasHoje++; p.concluidas++;
      const feito = Number(l.quantidade_feita) || 0;
      pecasHoje += feito; p.pecas += feito;
      p.feito += feito; p.alvo += Number(l.quantidade_alvo) || 0;
      const d = duracaoMin(l.iniciada_at, l.concluida_at);
      if (d != null) { p.duracoes.push(d); duracoesEquipe.push(d); }
    } else if (l.status === "em_andamento") {
      emAndamento++; p.emAndamento++;
    } else {
      pendentes++; p.pendentes++;
    }
    if (l.urgente && l.status !== "concluida") urgentes++;
    if (l.impedida && l.status !== "concluida") impedidas++;
    if (id) porPessoa.set(id, p);
  }

  const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

  const operadores = [...porPessoa.values()]
    .map((p) => {
      const emAtividadeMin = Math.round(p.duracoes.reduce((s, d) => s + d, 0));
      // Sem ponto vinculado não existe presença — e sem presença não existe
      // ocioso. `null` diz "não sei"; zero diria "a pessoa não parou", que é
      // uma afirmação sobre gente e precisa de dado, não de fallback.
      const trabalhadoMin = presencaPorPessoa[p.id] ?? null;
      return {
        id: p.id, nome: p.nome, fotoUrl: p.fotoUrl,
        concluidas: p.concluidas, emAndamento: p.emAndamento, pendentes: p.pendentes,
        pecas: p.pecas,
        produtividade: p.alvo > 0 ? Math.round((p.feito / p.alvo) * 100) : null,
        tmaMin: media(p.duracoes),
        emAtividadeMin,
        trabalhadoMin,
        ociosoMin: trabalhadoMin == null ? null : Math.max(0, trabalhadoMin - emAtividadeMin),
      };
    })
    // Quem produziu mais primeiro; depois quem tem mais ordem aberta. Na parede
    // a primeira linha é a que todo mundo lê.
    .sort((a, b) => b.pecas - a.pecas || b.concluidas - a.concluidas || a.nome.localeCompare(b.nome));

  return {
    atualizadoEm: agora.toISOString(),
    dia, ehHoje,
    pecasHoje, emAndamento, pendentes, urgentes, impedidas, concluidasHoje,
    tmaMin: media(duracoesEquipe),
    operadoresAtivos: operadores.filter((o) => o.concluidas > 0 || o.emAndamento > 0).length,
    operadores: operadores.slice(0, 12),
  };
}

/** Dia (`YYYY-MM-DD`) de um instante, no fuso de São Paulo. */
export function diaSP(quando: Date | string): string {
  const d = typeof quando === "string" ? new Date(quando) : quando;
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Minutos de presença de cada colaborador NO DIA, pelo ponto.
 *
 * Duas tabelas porque o vínculo é indireto: a atividade aponta para o
 * colaborador (`profiles`), e o ponto tem cadastro próprio (`ponto_pessoas`)
 * com `colaborador_id`. Quem não está no ponto simplesmente não aparece no
 * mapa — e o resumo trata isso como "não sei", não como zero.
 */
async function presencaDoDia(
  db: ReturnType<typeof createSupabaseAdminClient>,
  colaboradorIds: string[],
  dia: string,
): Promise<Record<string, number>> {
  if (colaboradorIds.length === 0) return {};
  const { data: pessoas } = await db
    .from("ponto_pessoas")
    .select("id,colaborador_id")
    .in("colaborador_id", colaboradorIds)
    .limit(200);
  const porPessoa = new Map<string, string>();
  for (const p of (pessoas ?? []) as { id: string; colaborador_id: string | null }[]) {
    if (p.colaborador_id) porPessoa.set(p.id, p.colaborador_id);
  }
  if (porPessoa.size === 0) return {};

  const inicio = `${dia}T00:00:00-03:00`;
  const fim = `${dia}T23:59:59-03:00`;
  const { data: regs } = await db
    .from("ponto_registros")
    .select("pessoa_id,batido_em")
    .in("pessoa_id", [...porPessoa.keys()])
    .gte("batido_em", inicio)
    .lte("batido_em", fim)
    .order("batido_em", { ascending: true })
    .limit(1000);

  const batidasPorColaborador = new Map<string, string[]>();
  for (const r of (regs ?? []) as { pessoa_id: string; batido_em: string }[]) {
    const colab = porPessoa.get(r.pessoa_id);
    if (!colab) continue;
    (batidasPorColaborador.get(colab) ?? batidasPorColaborador.set(colab, []).get(colab)!).push(r.batido_em);
  }
  const out: Record<string, number> = {};
  for (const [colab, batidas] of batidasPorColaborador) out[colab] = minutosDePresenca(batidas);
  return out;
}

/**
 * Foto de cadastro (`employees.photo_url`) de quem aparece na tela. É o rosto
 * da pessoa; `atividades.foto_url` é a comprovação do trabalho e só serve de
 * último recurso.
 */
async function fotosDeCadastro(
  db: ReturnType<typeof createSupabaseAdminClient>,
  colaboradorIds: string[],
): Promise<Record<string, string>> {
  if (colaboradorIds.length === 0) return {};
  const { data } = await db
    .from("employees")
    .select("id,photo_url")
    .in("id", colaboradorIds)
    .limit(200);
  const out: Record<string, string> = {};
  for (const e of (data ?? []) as { id: string; photo_url: string | null }[]) {
    if (e.photo_url) out[e.id] = e.photo_url;
  }
  return out;
}

/** Meia-noite de N dias atrás em SP, em ISO — janela da consulta. */
function desdeSP(agora: Date, diasAtras: number): string {
  const s = new Date(agora.getTime() - 3 * 3600 * 1000);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - diasAtras, 3, 0, 0)).toISOString();
}

/**
 * Escolhe o dia que a parede mostra: HOJE quando já houve movimento, senão o
 * último dia que teve. Devolve as linhas daquele dia mais TODA a fila aberta —
 * ordem parada de anteontem continua sendo problema de hoje.
 */
export function escolherDia(
  linhas: LinhaAtividade[],
  agora = new Date(),
): { dia: string; ehHoje: boolean; linhas: LinhaAtividade[] } {
  const hoje = diaSP(agora);
  const abertas = linhas.filter((l) => l.status !== "concluida");
  const diasComMovimento = [...new Set(
    linhas.filter((l) => l.status === "concluida" && l.concluida_at).map((l) => diaSP(l.concluida_at as string)),
  )].sort();
  const alvo = diasComMovimento.includes(hoje)
    ? hoje
    : diasComMovimento[diasComMovimento.length - 1] ?? hoje;
  const doDia = linhas.filter(
    (l) => l.status === "concluida" && l.concluida_at && diaSP(l.concluida_at) === alvo,
  );
  return { dia: alvo, ehHoje: alvo === hoje, linhas: [...doDia, ...abertas] };
}

/**
 * Lê o dia da produção. Colunas nomeadas e `.limit()` — a regra do CLAUDE.md:
 * é uma consulta que a TV puxa 24 horas por dia.
 *
 * A janela é de 7 dias (mais tudo que está aberto): sem ela a lista traria o
 * histórico inteiro; com só "hoje", a tela nasce zerada todo começo de turno e
 * ainda perderia a fila de ontem que ninguém tocou — justamente a que precisa
 * aparecer. Quem escolhe o dia exibido é `escolherDia`.
 */
export async function resumoProducaoDoDia(agora = new Date()): Promise<ResumoProducao | null> {
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db
      .from("atividades")
      .select("para_id,para_nome,foto_url,status,urgente,impedida,quantidade_alvo,quantidade_feita,iniciada_at,concluida_at")
      .or(`status.neq.concluida,concluida_at.gte.${desdeSP(agora, 7)}`)
      .limit(500);
    if (error || !data) return null;
    const escolhido = escolherDia(data as LinhaAtividade[], agora);
    // O ponto entra só do dia EXIBIDO e só de quem aparece na tela: é uma
    // segunda consulta, e ela não pode crescer com o histórico.
    const ids = [...new Set((escolhido.linhas.map((l) => l.para_id).filter(Boolean) as string[]))];
    const [presenca, fotos] = await Promise.all([
      presencaDoDia(db, ids, escolhido.dia).catch(() => ({})),
      fotosDeCadastro(db, ids).catch(() => ({})),
    ]);
    return resumirProducao(escolhido.linhas, agora, escolhido.dia, escolhido.ehHoje, presenca, fotos);
  } catch {
    return null;
  }
}
