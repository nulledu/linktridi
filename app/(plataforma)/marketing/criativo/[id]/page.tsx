import { notFound } from "next/navigation";
import { requireModuleKeys } from "@/lib/require-auth";
import { estreiasNaMeta, getCriativo, historicoCriativo, listPrefixos } from "@/lib/marketing-criativos";
import { arquivosDe } from "@/lib/criativos/biblioteca";
import { desempenhoDoCodigo } from "@/lib/marketing-desempenho";
import { CriativoDetalhe } from "./CriativoDetalhe";
import { ehAdmin } from "@/lib/marketing-criativos-admin";

export const dynamic = "force-dynamic";

const BR = 3 * 3600 * 1000;
const hojeBR = () => new Date(Date.now() - BR).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export default async function CriativoPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, keys } = await requireModuleKeys("marketing");
  const { id } = await params;
  const criativo = await getCriativo(id);
  if (!criativo) notFound();
  const podeDesempenho = keys.includes("marketing:desempenho");
  const [historico, prefixos, arquivos, desempenho, estreias] = await Promise.all([
    historicoCriativo(id),
    listPrefixos(),
    arquivosDe(id),
    // Últimos 90 dias: criativo bom fica no ar bem mais que um mês.
    podeDesempenho ? desempenhoDoCodigo(criativo.codigo, somaDias(hojeBR(), -89), hojeBR()) : Promise.resolve(null),
    estreiasNaMeta([criativo]),
  ]);
  return (
    <CriativoDetalhe
      inicial={criativo}
      historicoInicial={historico}
      prefixos={prefixos.map((p) => p.prefixo)}
      eu={{ id: profile.id, nome: profile.name, admin: ehAdmin(profile) }}
      arquivos={arquivos}
      estreiaMeta={estreias[criativo.id] ?? null}
      podeEditar={keys.includes("marketing:criar")}
      desempenho={desempenho}
      podeDesempenho={podeDesempenho}
    />
  );
}
