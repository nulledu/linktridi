import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  resumirMaquinas, COLS_MAQUINA, COLS_PROGRAMACAO, COLS_MAQUINA_OEE, COLS_PROGRAMACAO_OEE,
  type LinhaMaquina, type LinhaProgramacao, type ResumoMaquinas,
} from "@/lib/painel-maquinas";

/**
 * A leitura do painel de máquinas — o lado SERVIDOR.
 *
 * Mora separado da conta (`lib/painel-maquinas.ts`) porque o painel é um
 * componente de cliente: juntos, o import do Supabase ia parar no navegador.
 */

/**
 * Lê o painel de máquinas. Colunas nomeadas e `.limit()` — é uma consulta que
 * a TV puxa o dia inteiro; quem segura o ritmo é o `cached()` da rota.
 *
 * A janela das programações é: tudo que não está concluído, mais o que fechou
 * nos últimos 2 dias (para as horas de hoje). Sem a janela, a lista traria o
 * histórico inteiro da fábrica.
 */
/**
 * Coluna que ainda não existe: `supabase/maquinas_oee.sql` pode não ter sido
 * rodado. O Postgres devolve 42703 e o PostgREST às vezes só reclama no
 * `message` — a leitura repete com o conjunto BASE em vez de deixar a TV
 * apagada por causa do apontamento de peças.
 */
const colunaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || /column .* does not exist|schema cache/i.test(e.message ?? ""));

export async function resumoMaquinas(agora = new Date()): Promise<ResumoMaquinas | null> {
  try {
    const db = createSupabaseAdminClient();
    const desde = new Date(agora.getTime() - 2 * 86400000).toISOString();
    const lerMaquinas = (cols: string) =>
      db.from("maquinas").select(cols).eq("ativa", true).order("ordem").limit(60);
    const lerProgs = (cols: string) =>
      db.from("maquina_programacoes").select(cols)
        .or(`status.neq.concluida,concluida_at.gte.${desde}`)
        .order("posicao")
        .limit(600);

    let [{ data: maquinas, error: e1 }, { data: progs, error: e2 }] = await Promise.all([
      lerMaquinas(COLS_MAQUINA_OEE), lerProgs(COLS_PROGRAMACAO_OEE),
    ]);
    if (colunaAusente(e1)) ({ data: maquinas, error: e1 } = await lerMaquinas(COLS_MAQUINA));
    if (colunaAusente(e2)) ({ data: progs, error: e2 } = await lerProgs(COLS_PROGRAMACAO));
    // Tabela ausente (SQL ainda não rodado) devolve erro: a TV mostra o vazio
    // com instrução, e não um alarme vermelho a cada ciclo.
    if (e1 || e2 || !maquinas) return null;
    return resumirMaquinas(maquinas as LinhaMaquina[], (progs ?? []) as LinhaProgramacao[], agora);
  } catch {
    return null;
  }
}
