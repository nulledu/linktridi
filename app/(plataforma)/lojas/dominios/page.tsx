import { getProfileForAnyModule, getProfileForModule } from "@/lib/require-auth";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listDominios } from "@/lib/tridiflow-db";
import { fonteLojas } from "@/lib/lojas-fonte";
import { DominiosClient, type DominioCru, type LojaResumo } from "./DominiosClient";

export const dynamic = "force-dynamic";

/**
 * Quem usa cada endereço.
 *
 * Consulta à parte, e tolerante: a coluna `loja_id` só existe depois do
 * `supabase/lojas.sql`. Um `select` de coluna inexistente é erro seco — juntar
 * isso ao `listDominios` derrubaria a tela inteira num sistema onde o cadastro
 * de endereços já funciona.
 */
async function vinculos(): Promise<Record<string, string>> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("tridiflow_dominios").select("id, loja_id").not("loja_id", "is", null).limit(200);
    if (error) return {};
    const m: Record<string, string> = {};
    for (const d of data ?? []) if (d.loja_id) m[d.id] = d.loja_id;
    return m;
  } catch { return {}; }
}

export async function dadosDeDominios() {
  const [brutos, ligados, lojas] = await Promise.all([
    listDominios().catch(() => []),
    vinculos(),
    fonteLojas(),
  ]);

  const dominios: DominioCru[] = brutos.map((d) => ({
    id: d.id, host: d.host, verificado: d.verificado, lojaId: ligados[d.id] ?? null,
  }));
  const resumos: LojaResumo[] = (lojas.dados ?? []).map((l) => ({
    id: l.id, nome: l.nome, publicada: l.status === "publicada",
  }));
  return { dominios, lojas: resumos, podeEscrever: !!(await getProfileForAnyModule("lojas:dominios")) };
}

export default async function DominiosPage() {
  if (!(await getProfileForModule("lojas"))) notFound();
  const d = await dadosDeDominios();
  return <DominiosClient dominios={d.dominios} lojas={d.lojas} podeEscrever={d.podeEscrever} />;
}
