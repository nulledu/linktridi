import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { poolCasaComPessoa, quemEParaOPool } from "@/lib/atividades";
import { podePegarDoPool } from "@/lib/device";

export const dynamic = "force-dynamic";

// POST { id } — colaborador "pega" uma ordem do pool do seu setor (versão web do
// device/claim). Update condicional evita corrida entre quem pega ao mesmo tempo.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { id?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const ler = (cols: string) => db.from("atividades").select(cols).eq("id", b.id!).maybeSingle();
  let { data: row, error: eRow } = await ler("id,setor,pool,status,para_id,faixa,categoria");
  if (eRow && /faixa|categoria/i.test(eRow.message ?? "")) ({ data: row } = await ler("id,setor,pool,status,para_id"));
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const a = row as unknown as { setor: string | null; pool: boolean | null; status: string; para_id: string | null; faixa?: string | null; categoria?: string | null };
  if (!a.pool || a.status !== "pendente" || a.para_id) return NextResponse.json({ error: "indisponivel" }, { status: 409 });

  // Setor OU departamento precisam casar com a ordem (mesmas chaves da listagem
  // — quem VÊ a ordem no pool consegue pegá-la; antes o departamento não
  // contava e a Logística via a ordem mas levava 403 ao pegar).
  const { chaves, especialidade } = await quemEParaOPool(me.id);
  if (!poolCasaComPessoa(a.setor, chaves))
    return NextResponse.json({ error: "fora_do_setor" }, { status: 403 });
  // A mesma régua do tablet: sem ela, pelo site qualquer pessoa do setor
  // pegava qualquer ordem — foi assim que peça de máquina foi parar com
  // quem é da Logística.
  if (!podePegarDoPool(especialidade, a))
    return NextResponse.json({ error: "fora_da_faixa" }, { status: 403 });

  const nome = me.name || me.username;
  const now = new Date().toISOString();
  // `aceita_at` também: pegar pelo site É o aceite (no tablet são dois toques,
  // claim + accept; aqui é um só). É esse carimbo que apaga a chamada na TV.
  const pegar = (patch: Record<string, unknown>) => db.from("atividades")
    .update(patch)
    .eq("id", b.id!).eq("status", "pendente").is("para_id", null)
    .select("*").maybeSingle();
  const base = { para_id: me.id, para_nome: nome, status: "em_andamento", iniciada_at: now, claimed_at: now };
  let { data: claimed, error } = await pegar({ ...base, aceita_at: now });
  // Banco sem a coluna `aceita_at` (SQL de ordens v2 não rodado): pega sem o
  // carimbo — mesma tolerância do accept do tablet.
  if (error && colunaAusente(error.message)) ({ data: claimed } = await pegar(base));
  if (!claimed) return NextResponse.json({ error: "ja_foi_pega" }, { status: 409 });
  return NextResponse.json({ atividade: claimed });
}

const colunaAusente = (msg: string | undefined) =>
  !!msg && /column .* does not exist|Could not find the .* column/i.test(msg);
