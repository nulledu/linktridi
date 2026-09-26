// ── Bônus recorrente · a materialização ──────────────────────────────────────
// A REGRA (quais cópias faltam) é pura, em `folha-mensal.ts`. Aqui é só ler as
// origens e as cópias que já existem, e gravar o que falta. Idempotente pelo
// índice único (origem_id, competencia): rodar de novo não duplica.
//
// Quem chama: o cron diário (mês corrente e seguinte), a página de
// Colaboradores (antes de listar os lançamentos) e o GET da folha mensal ao
// trocar de mês. Sem o SQL novo, as colunas não existem e a função devolve
// zero em silêncio — o bloco do mês continua abrindo.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { copiasQueFaltam, type OrigemRecorrente } from "./folha-mensal";
import { upsertIdempotente } from "./db";

const db = () => createSupabaseAdminClient();

export async function materializarBonusRecorrente(
  empresas: string | string[],
  competencia: string,
): Promise<{ criados: number; pendente: boolean }> {
  const escopo = Array.isArray(empresas) ? empresas : [empresas];
  if (!escopo.length) return { criados: 0, pendente: false };
  const alvo = competencia.slice(0, 10);

  const { data: origensRaw, error: erroOrigens } = await db()
    .from("fin_folha_lancamentos")
    .select("id,empresa_id,colaborador_id,competencia,valor,descricao,encerrado_em,pulados")
    .in("empresa_id", escopo)
    .eq("tipo", "bonus")
    .eq("recorrente", true)
    .is("origem_id", null)
    .lt("competencia", alvo)
    .limit(500);
  // Coluna ausente = SQL ainda não rodado. Nada a materializar.
  if (erroOrigens) return { criados: 0, pendente: true };
  const origens = (origensRaw ?? []) as (OrigemRecorrente & { empresa_id: string })[];
  if (!origens.length) return { criados: 0, pendente: false };

  const { data: existentes } = await db()
    .from("fin_folha_lancamentos")
    .select("origem_id,competencia")
    .in("origem_id", origens.map((o) => o.id))
    .eq("competencia", alvo)
    .limit(500);

  const faltam = copiasQueFaltam(
    origens.map((o) => ({ ...o, pulados: Array.isArray(o.pulados) ? o.pulados.map(String) : [] })),
    ((existentes ?? []) as { origem_id: string | null; competencia: string }[]).map((e) => ({ ...e, competencia: String(e.competencia) })),
    alvo,
  );
  if (!faltam.length) return { criados: 0, pendente: false };

  const empresaDe = new Map(origens.map((o) => [o.id, o.empresa_id]));
  const { error } = await upsertIdempotente(
    "fin_folha_lancamentos",
    faltam.map((o) => ({
      empresa_id: empresaDe.get(o.id),
      colaborador_id: o.colaborador_id,
      competencia: alvo,
      tipo: "bonus",
      valor: o.valor,
      descricao: o.descricao,
      origem_id: o.id,
    })),
    "origem_id,competencia",
  );
  if (error) return { criados: 0, pendente: false };
  return { criados: faltam.length, pendente: false };
}
