import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { competenciaDe, geracoesPendentes, passoEmMeses, somarMeses,
  type GeracaoRecorrente, type ValoresPorCompetencia } from "./calculos";
import { auditar, upsertIdempotente } from "./db";
import type { Autor, Resultado } from "./escrita";
import type { Recorrencia } from "./tipos";

const COMPETENCIA = /^\d{4}-\d{2}-01$/;

/** Calcula uma volta específica sem permitir datas fora da cadência da regra. */
export function geracaoDaCompetencia(
  r: Recorrencia, competencia: string, valores: ValoresPorCompetencia = {},
): GeracaoRecorrente | null {
  if (!COMPETENCIA.test(competencia)) return null;
  const fimDoMes = `${competencia.slice(0, 7)}-31`;
  return geracoesPendentes(r, fimDoMes, valores).find((g) => g.competencia === competencia) ?? null;
}

/**
 * O valor combinado para UM mês, se alguém informou.
 *
 * Tolerante à ausência da tabela: `financeiro_recorrencia_variavel.sql` é
 * rodado à mão, e um banco atrasado não pode impedir a geração de continuar
 * funcionando como sempre funcionou — sem combinado, vale a estimativa.
 */
async function valorCombinado(
  db: ReturnType<typeof createSupabaseAdminClient>, recorrenciaId: string, competencia: string,
): Promise<ValoresPorCompetencia> {
  try {
    const { data, error } = await db
      .from("fin_recorrencia_valores")
      .select("competencia,valor")
      .eq("recorrencia_id", recorrenciaId)
      .eq("competencia", competencia)
      .maybeSingle();
    if (error || !data) return {};
    const linha = data as { competencia: string; valor: number | string };
    const n = Number(linha.valor);
    return Number.isFinite(n) ? { [competencia]: n } : {};
  } catch {
    return {};
  }
}

/** Materializa exatamente uma ocorrência. A chave determinística fecha retries e cliques duplos. */
export async function materializarOcorrencia(
  empresaId: string,
  recorrenciaId: string,
  competencia: string,
  autor: Autor,
): Promise<Resultado<{ id: string | null; criado: boolean }>> {
  const db = createSupabaseAdminClient();
  const BASE = "id,empresa_id,descricao,categoria,valor,periodicidade,intervalo_meses,"
    + "dia_vencimento,conta_id,fornecedor_id,contato_id,inicio,fim,proxima_competencia,status";
  const ler = (cols: string) => db.from("fin_recorrencias").select(cols)
    .eq("id", recorrenciaId).eq("empresa_id", empresaId).maybeSingle();
  // Com a marca de valor variável primeiro, sem ela depois: o SQL que a cria é
  // rodado à mão, e sem ele a regra simplesmente segue de valor fixo.
  let { data, error } = await ler(`${BASE},valor_variavel`);
  if (error) ({ data, error } = await ler(BASE));
  if (error) return { ok: false, erro: error.message };
  if (!data) return { ok: false, erro: "Recorrência não encontrada nesta empresa." };

  const regra = data as unknown as Recorrencia;
  // O número que alguém informou para ESTE mês vence a estimativa da regra.
  const geracao = geracaoDaCompetencia(regra, competencia, await valorCombinado(db, recorrenciaId, competencia));
  if (!geracao) return { ok: false, erro: "Competência não pertence a esta recorrência." };

  const { data: existente, error: erroBusca } = await db
    .from("fin_compromissos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("idempotency_key", geracao.idempotency_key)
    .maybeSingle();
  if (erroBusca) return { ok: false, erro: erroBusca.message };
  if (existente) return { ok: true, jaEstava: true, dados: { id: existente.id, criado: false } };

  const { error: erroInsert } = await upsertIdempotente("fin_compromissos", [{
    empresa_id: empresaId,
    descricao: regra.descricao,
    categoria: regra.categoria ?? "outros",
    valor: geracao.valor,
    vencimento: geracao.vencimento,
    competencia: geracao.competencia,
    status: "pendente",
    origem: "recorrencia",
    origem_id: regra.id,
    conta_id: regra.conta_id,
    fornecedor_id: regra.fornecedor_id,
    contato_id: regra.contato_id,
    idempotency_key: geracao.idempotency_key,
    created_by: autor.id,
  }], "empresa_id,idempotency_key");
  if (erroInsert) return { ok: false, erro: erroInsert.message ?? "Não deu para lançar." };

  const proxima = competenciaDe(regra.proxima_competencia ?? regra.inicio);
  if (competencia === proxima) {
    await db.from("fin_recorrencias")
      .update({ proxima_competencia: somarMeses(competencia, passoEmMeses(regra)) })
      .eq("id", regra.id)
      .eq("proxima_competencia", regra.proxima_competencia);
  }

  const { data: criada } = await db.from("fin_compromissos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("idempotency_key", geracao.idempotency_key)
    .maybeSingle();

  await auditar({
    empresa_id: empresaId, entidade: "recorrencia", entidade_id: regra.id, acao: "materializar",
    user_id: autor.id, user_nome: autor.nome, dados: { competencia, compromisso_id: criada?.id ?? null },
  });
  return { ok: true, dados: { id: criada?.id ?? null, criado: true } };
}
