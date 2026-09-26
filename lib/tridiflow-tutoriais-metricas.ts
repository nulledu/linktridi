import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { MetricaTutorial } from "@/lib/tridiflow-tutoriais";

export type { MetricaTutorial };

// Métricas da central: visualização por tutorial, o "isso ajudou?", o motivo
// do "não resolveu" e o toque no WhatsApp.
//
// Nada aqui derruba página: contar é acessório, e um erro de banco não pode
// custar o conteúdo a quem veio ler. Toda função engole a falha e segue.
//
// A tabela vive em supabase/tutorial_metricas.sql (agregada POR DIA). Contatos
// e motivos chegaram depois, em supabase/tutorial_metricas_motivos.sql, que
// roda à mão: até lá a função do banco recusa o campo novo (a contagem se
// perde, sem erro) e a leitura volta sem ele.

/** Lista FECHADA, espelho da que a função `incrementar_metrica_tutorial`
 *  aceita — o teste compara as duas. Campo fora dela é 400 na rota pública. */
export const CAMPOS_METRICA = [
  "vistas", "uteis", "inuteis", "contatos",
  "motivo_produto", "motivo_passo", "motivo_resultado", "motivo_outro",
] as const;
export type CampoMetrica = (typeof CAMPOS_METRICA)[number];

export const ehCampoMetrica = (c: unknown): c is CampoMetrica =>
  typeof c === "string" && (CAMPOS_METRICA as readonly string[]).includes(c);

const ausente = (m: string) => /relation .* does not exist|could not find|schema cache|function .* does not exist/i.test(m);

// Coluna nova que o banco ainda não tem (o SQL dos motivos não rodou). No
// select o PostgREST repassa o 42703 do Postgres; a mensagem cobre o caso de
// o código vir vazio. É conferida ANTES de `ausente`, que também casaria
// "could not find ... column" e devolveria lista vazia — sumindo com as
// vistas e os votos que o banco tem.
const colunaAusente = (e: { code?: string; message?: string }) =>
  e.code === "42703" || /column .* does not exist|could not find the .* column/i.test(e.message ?? "");

const COLS = "handle,vistas,uteis,inuteis,contatos,motivo_produto,motivo_passo,motivo_resultado,motivo_outro";
// O de antes da migração dos motivos. Fica mesmo depois de ela rodar em
// produção: um banco de desenvolvimento atrasado não pode perder as métricas
// que já tem.
const COLS_SEM_MOTIVOS = "handle,vistas,uteis,inuteis";

// O PostgREST devolve no MÁXIMO 1000 linhas por ida e NÃO avisa: o
// `.limit(5000)` de antes trazia 1000 e o resto sumia da soma. É uma linha por
// tutorial por dia com leitura — uma central de dez guias passa disso em
// três meses, e as leituras paravam de subir sem erro nenhum na tela.
//
// O teto segura uma central gigante de virar dezenas de idas na abertura do
// editor. Por isso a ordem vai do dia MAIS RECENTE pro mais antigo: batendo no
// teto, sai da conta o histórico velho e todo tutorial continua nela. Por
// handle, o corte levava inteiros os guias do fim do alfabeto (zero leitura na
// tela), e como a rota pública grava qualquer handle, lixo começando por dígito
// empurrava todos os tutoriais reais pra fora, pra sempre.
//
// A página é por POSIÇÃO (`.range`), não por chave: a primeira vista do dia de
// um guia caindo no meio da leitura repete uma linha na soma daquela abertura.
// É raro e some ao recarregar; somar no banco resolve isso e o teto de uma vez.
const PAGINA = 1000;
const TETO_LINHAS = 20_000;

// O `dia` da tabela é o de São Paulo (o SQL grava `now() at time zone
// 'America/Sao_Paulo'`). Cortar a janela pelo UTC empurrava o início um dia
// pra frente depois das 21h.
const DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

type ErroBanco = { code?: string; message?: string };
type Linha = {
  handle: string; vistas: number; uteis: number; inuteis: number;
  contatos?: number; motivo_produto?: number; motivo_passo?: number; motivo_resultado?: number; motivo_outro?: number;
};

export async function registrarMetricaTutorial(botId: string, handle: string, campo: CampoMetrica): Promise<void> {
  if (!botId || !handle) return;
  try {
    const db = createSupabaseAdminClient();
    // O supabase-js DEVOLVE o erro em vez de lançar. Sem a migração dos
    // motivos a função recusa o campo novo ("campo invalido") e a contagem se
    // perde aqui, calada — de propósito: quem votou não tem nada com isso.
    await db.rpc("incrementar_metrica_tutorial", { p_bot: botId, p_handle: handle.slice(0, 200), p_campo: campo });
  } catch { /* banco fora: a leitura da página vale mais */ }
}

async function lerLinhas(
  db: ReturnType<typeof createSupabaseAdminClient>, botId: string, desde: string | null, cols: string,
): Promise<{ linhas: Linha[]; erro: ErroBanco | null; truncado: boolean }> {
  const linhas: Linha[] = [];
  for (let ini = 0; ini < TETO_LINHAS; ini += PAGINA) {
    let q = db.from("tutorial_metricas").select(cols).eq("bot_id", botId);
    if (desde) q = q.gte("dia", desde);
    // Toda listagem tem `.limit()` (regra do repositório); o `.range()` só
    // escolhe qual página.
    const { data, error } = await q.order("dia", { ascending: false }).order("handle").limit(PAGINA).range(ini, ini + PAGINA - 1);
    if (error) return { linhas, erro: error as ErroBanco, truncado: false };
    const lote = (data ?? []) as Linha[];
    linhas.push(...lote);
    if (lote.length < PAGINA) return { linhas, erro: null, truncado: false };
  }
  // Saiu pelo teto com a última página cheia: pode haver mais, e "acabou" e
  // "cortou" não podem sair iguais daqui.
  return { linhas, erro: null, truncado: true };
}

function somar(linhas: Linha[], comMotivos: boolean): MetricaTutorial[] {
  const soma = new Map<string, MetricaTutorial>();
  for (const l of linhas) {
    let t = soma.get(l.handle);
    if (!t) {
      t = { handle: l.handle, vistas: 0, uteis: 0, inuteis: 0 };
      // Sem a migração os campos novos ficam AUSENTES, não zerados: "ainda
      // não medido" não pode aparecer na tela como "ninguém chamou".
      if (comMotivos) { t.contatos = 0; t.motivos = { produto: 0, passo: 0, resultado: 0, outro: 0 }; }
      soma.set(l.handle, t);
    }
    t.vistas += l.vistas; t.uteis += l.uteis; t.inuteis += l.inuteis;
    if (t.motivos) {
      t.contatos = (t.contatos ?? 0) + (l.contatos ?? 0);
      t.motivos.produto += l.motivo_produto ?? 0;
      t.motivos.passo += l.motivo_passo ?? 0;
      t.motivos.resultado += l.motivo_resultado ?? 0;
      t.motivos.outro += l.motivo_outro ?? 0;
    }
  }
  return [...soma.values()];
}

/** Soma por tutorial. `dias` limita a janela; 0 = desde sempre. */
export async function metricasDaCentral(botId: string, dias = 0): Promise<MetricaTutorial[]> {
  if (!botId) return [];
  try {
    const db = createSupabaseAdminClient();
    const desde = dias > 0 ? DIA_SP.format(new Date(Date.now() - dias * 86_400_000)) : null;
    let comMotivos = true;
    let r = await lerLinhas(db, botId, desde, COLS);
    if (r.erro && colunaAusente(r.erro)) {
      comMotivos = false;
      r = await lerLinhas(db, botId, desde, COLS_SEM_MOTIVOS);
    }
    if (r.erro) {
      if (ausente(r.erro.message ?? "")) return [];
      throw new Error(r.erro.message ?? "erro ao ler as métricas");
    }
    // O corte não vira erro (a tela ainda mostra o recente de cada tutorial),
    // mas vai pro log: senão "soma cortada" e "soma desde sempre" ficam idênticas.
    if (r.truncado) console.error(`[tutoriais] métricas da central ${botId}: parou no teto de ${TETO_LINHAS} linhas; a soma cobre só os dias mais recentes`);
    return somar(r.linhas, comMotivos);
  } catch (e) {
    // Lista vazia pra tela (o editor abre sem os números), mas no log: senão
    // "banco fora do ar" e "ninguém leu ainda" ficam idênticos.
    console.error("[tutoriais] métricas da central:", e instanceof Error ? e.message : e);
    return [];
  }
}
