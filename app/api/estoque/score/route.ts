import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile, getProfileForModule } from "@/lib/require-auth";
import { scoreDe, rotuloDaTaxa } from "@/lib/estoque-qualidade";
import { schemaDesatualizado } from "@/lib/estoque-unidades-gerar";

export const dynamic = "force-dynamic";

const LIMITE = 500;

// GET /api/estoque/score?pessoa=<id>&desde=<iso-opcional> — agregado de
// qualidade de quem PRODUZIU (não de quem confere). Sessão web normal, não o
// leitor do galpão: esta rota alimenta uma tela de gestão/ficha da pessoa.
//
// Ver o PRÓPRIO score é sempre permitido — é o "como eu estou indo" de quem
// produz, mesma lógica de GET /api/atividades?mine=1. Ver o de OUTRA pessoa
// exige a mesma área que já protege produtividade do time em
// GET /api/colaboradores/[id]/metricas ("colaboradores").
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pessoa = req.nextUrl.searchParams.get("pessoa");
  if (!pessoa) return NextResponse.json({ error: "missing_pessoa" }, { status: 400 });

  if (pessoa !== me.id && !(await getProfileForModule("colaboradores"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const desde = req.nextUrl.searchParams.get("desde");
  const db = createSupabaseAdminClient();
  let query = db
    .from("estoque_conferencias")
    .select("resultado,defeitos")
    .eq("executor_id", pessoa)
    .order("conferido_em", { ascending: false })
    .limit(LIMITE);
  if (desde) query = query.gte("conferido_em", desde);

  const { data, error } = await query;
  // Sem a tabela (supabase/estoque_conferencias.sql ainda não rodou), o score
  // é "ninguém foi conferido ainda" — que é a verdade. Um 500 aqui pintaria de
  // vermelho a ficha de TODA pessoa só porque o QC ainda não foi ligado, e o
  // painel de qualidade já sabe desenhar o caso vazio (taxaAcerto: null).
  if (error && schemaDesatualizado(error)) {
    const vazio = scoreDe([]);
    return NextResponse.json({ score: { ...vazio, rotulo: rotuloDaTaxa(vazio.taxaAcerto) } });
  }
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  const linhas = (data ?? []) as { resultado: string; defeitos: string[] | null }[];
  const score = scoreDe(linhas.map((c) => ({
    resultado: c.resultado,
    defeitos: c.defeitos ?? [],
  })));

  return NextResponse.json({ score: { ...score, rotulo: rotuloDaTaxa(score.taxaAcerto) } });
}
