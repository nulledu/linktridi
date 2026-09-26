// ── Estoque · automação de reposição ─────────────────────────────────────────
//
// Liga o Estoque às Atividades: quando ligada, a automação varre o catálogo
// uma vez por dia e cria as atividades de produção que faltam (mesma regra
// de `verificarReabastecimento`, lib/requisicoes.ts). A pergunta difícil não
// é "o que varrer" — isso o motor já resolve — é QUANDO varrer sem virar
// mais um job agendado.
//
// Este projeto já foi suspenso duas vezes por orçamento de execução (ver a
// seção "Vercel: invocações e CPU" do CLAUDE.md): um cron batendo todo dia,
// mesmo em segundos, é invocação certa contra aquele teto. A saída aqui é
// "o primeiro que abre a tela dispara": `varrerSeNecessario` roda dentro do
// GET de /api/estoque/producao-dia, e só faz alguma coisa quando o dia virou
// E a automação está ligada. Nenhum agendamento, nenhuma invocação fora de
// alguém de fato olhar a tela.
import { verificarReabastecimento, type ResumoReabastece } from "@/lib/requisicoes";

// O Supabase não tem tipos gerados aqui; fronteira dinâmica isolada nesta
// camada, como em lib/estoque-colunas.ts e lib/ponto-turnos.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface EstoqueConfig {
  automacao_ativa: boolean;
  /** YYYY-MM-DD, ou null se nunca varreu. */
  ultima_varredura: string | null;
  /**
   * Exigir que a pessoa BIPE o material antes de a atividade abrir, no tablet
   * de atividades. Mora na mesma linha única da automação porque é o mesmo
   * tipo de coisa: um interruptor do galpão inteiro, mudado por gente, lido
   * por máquina.
   *
   * NASCE DESLIGADO, e não por cautela genérica: hoje ZERO itens do catálogo
   * estão etiquetados. Ligar isso antes de existir etiqueta faz toda a bancada
   * cair na saída de emergência a cada ordem — o trabalho continua, mas o livro
   * do primeiro mês não vale nada. Ligue quando o material já tiver etiqueta.
   */
  bipe_para_iniciar: boolean;
}

const PADRAO: EstoqueConfig = {
  automacao_ativa: false, ultima_varredura: null, bipe_para_iniciar: false,
};

// Mesmo reconhecimento de "tabela ainda não existe" de lib/ponto-turnos.ts —
// o SQL (supabase/estoque_automacao.sql) é rodado NA MÃO, então o código
// precisa continuar de pé enquanto ninguém rodou.
const semTabela = (msg?: string) => !!msg && /relation .* does not exist|Could not find the table/i.test(msg);
/** Coluna que ainda não existe (42703 / cache do PostgREST). Diferente de tabela
 *  ausente: aqui a linha EXISTE e só falta um campo, então o certo é reler sem
 *  ele — não devolver o padrão e apagar o que já estava configurado. */
const semColuna = (msg?: string) =>
  !!msg && /column .* does not exist|Could not find the .* column|schema cache/i.test(msg);

/**
 * Hoje, como `YYYY-MM-DD`, no fuso de São Paulo — nunca `Date`/`toISOString`
 * crus, que voltam UTC. A Vercel roda em UTC: às 21h de Brasília (00h UTC) o
 * dia já teria virado no servidor sem ter virado pra ninguém que está
 * olhando a tela, e a varredura dispararia umas 3h mais cedo do que deveria
 * (ou tarde, dependendo do lado da comparação) — exatamente o tipo de erro
 * de fuso que só aparece em produção.
 */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

/**
 * Lê a config. Tolerante: sem a tabela (SQL ainda não rodado), devolve o
 * padrão — automação desligada — em vez de derrubar a tela. Mesma disciplina
 * de `lerItensEstoque` em lib/estoque-colunas.ts: leitura degrada, não quebra.
 */
export async function lerConfig(db: Db): Promise<EstoqueConfig> {
  // Em degraus: `bipe_para_iniciar` chegou depois (supabase/
  // atividades_bipe_material.sql, §11), e pedir uma coluna que não existe
  // derruba o SELECT INTEIRO — a tela da Produção do dia perderia também o
  // interruptor da automação, que funciona há semanas, por causa de um campo
  // novo. Tenta com ele; sem ele, repete sem.
  let sel = await db.from("estoque_config")
    .select("automacao_ativa,ultima_varredura,bipe_para_iniciar").eq("id", true).maybeSingle();
  if (sel.error && semColuna(sel.error.message)) {
    sel = await db.from("estoque_config")
      .select("automacao_ativa,ultima_varredura").eq("id", true).maybeSingle();
  }
  const { data, error } = sel;
  if (error) {
    if (semTabela(error.message)) return { ...PADRAO };
    throw error;
  }
  if (!data) return { ...PADRAO };
  return {
    automacao_ativa: data.automacao_ativa === true,
    ultima_varredura: data.ultima_varredura ?? null,
    // Sem a coluna, `undefined === true` é false: a exigência fica DESLIGADA,
    // que é o lado seguro. Ligado por engano numa base sem etiqueta nenhuma
    // trancaria a bancada inteira atrás de um bipe impossível.
    bipe_para_iniciar: data.bipe_para_iniciar === true,
  };
}

/** Grava a config (liga/desliga o interruptor). `porId` fica só de auditoria
 *  — "quem ligou isso" é a primeira pergunta quando uma atividade aparece
 *  sem ninguém lembrar de ter pedido. */
export async function salvarConfig(
  db: Db,
  patch: Partial<Pick<EstoqueConfig, "automacao_ativa" | "ultima_varredura" | "bipe_para_iniciar">>,
  porId?: string | null,
): Promise<EstoqueConfig> {
  const row: Record<string, unknown> = { id: true, atualizado_em: new Date().toISOString() };
  if (patch.automacao_ativa !== undefined) row.automacao_ativa = patch.automacao_ativa;
  if (patch.ultima_varredura !== undefined) row.ultima_varredura = patch.ultima_varredura;
  if (patch.bipe_para_iniciar !== undefined) row.bipe_para_iniciar = patch.bipe_para_iniciar;
  if (porId !== undefined) row.atualizado_por = porId;
  const { error } = await db.from("estoque_config").upsert(row, { onConflict: "id" });
  if (error && !semTabela(error.message)) throw error;
  return lerConfig(db);
}

/**
 * Pura e testável: precisa varrer quando a automação está ligada e a última
 * varredura NÃO é hoje (inclui nunca ter varrido, `ultima_varredura: null`).
 *
 * Compara strings `YYYY-MM-DD`, nunca `Date` — duas datas convertidas pra
 * `Date` e comparadas por `getTime()`/`<` atravessam meia-noite de um jeito
 * que depende de QUAL fuso o `Date` assumiu ao nascer (UTC vs. local do
 * processo), e essa ambiguidade é precisamente o tipo de bug que não aparece
 * no teste rodado às 15h e aparece em produção às 23h.
 */
export function precisaVarrer(
  config: Pick<EstoqueConfig, "automacao_ativa" | "ultima_varredura">,
  hoje: string,
): boolean {
  return config.automacao_ativa && config.ultima_varredura !== hoje;
}

/**
 * Reivindica a varredura de `hoje` com um UPDATE condicional — um
 * compare-and-swap de verdade, não uma checagem otimista. O `where` só casa
 * linhas que AINDA não foram carimbadas com `hoje`; o Postgres serializa
 * UPDATEs concorrentes na mesma linha (lock de linha), então de duas
 * requisições chegando no mesmo segundo só uma vence: a que perde encontra 0
 * linhas (a vencedora já carimbou) e `select("id")` volta vazio.
 *
 * É isto — não um `if` em memória — que garante que dois "abrir a tela ao
 * mesmo tempo" não disparem `verificarReabastecimento()` duas vezes: os dois
 * processos podem rodar em instâncias serverless diferentes, sem memória
 * compartilhada, então qualquer trava só em JS não seguraria nada.
 */
async function reivindicarVarredura(db: Db, hoje: string, porId?: string | null): Promise<boolean> {
  const patch: Record<string, unknown> = { ultima_varredura: hoje, atualizado_em: new Date().toISOString() };
  if (porId !== undefined) patch.atualizado_por = porId;
  const { data, error } = await db.from("estoque_config")
    .update(patch)
    .eq("id", true)
    .eq("automacao_ativa", true)
    // `ultima_varredura` pode ser NULL (nunca varreu) — `.neq()` sozinho não
    // casa NULL (NULL <> x é NULL, não true), por isso o `.or()` cobre os
    // dois casos: nunca varreu, ou varreu um dia diferente de hoje.
    .or(`ultima_varredura.is.null,ultima_varredura.neq.${hoje}`)
    .select("id");
  if (error) {
    if (semTabela(error.message)) return false;
    throw error;
  }
  return !!(data && data.length);
}

export interface ResultadoVarredura {
  varreu: boolean;
  resumo: ResumoReabastece | null;
}

/**
 * Chamada pelo GET de /api/estoque/producao-dia — é o que faz a automação
 * ser automática sem cron. Ordem importa: primeiro reivindica (carimba) o
 * dia, DEPOIS roda `verificarReabastecimento()`. Se fosse ao contrário, duas
 * pessoas abrindo a tela no mesmo instante correriam a varredura inteira as
 * duas, e cada uma criaria sua cópia das mesmas atividades.
 *
 * Efeito colateral aceito: se `verificarReabastecimento()` falhar DEPOIS do
 * carimbo, a varredura não se repete sozinha no mesmo dia — mas o botão
 * "Gerar atividades" (POST, chamando `verificarReabastecimento()` direto)
 * continua disponível o dia inteiro, independente do carimbo.
 */
export async function varrerSeNecessario(
  db: Db,
  hoje: string = hojeSP(),
  porId?: string | null,
): Promise<ResultadoVarredura> {
  const config = await lerConfig(db);
  if (!precisaVarrer(config, hoje)) return { varreu: false, resumo: null };
  const reivindicou = await reivindicarVarredura(db, hoje, porId);
  if (!reivindicou) return { varreu: false, resumo: null }; // outra requisição chegou primeiro
  const resumo = await verificarReabastecimento();
  return { varreu: true, resumo };
}
