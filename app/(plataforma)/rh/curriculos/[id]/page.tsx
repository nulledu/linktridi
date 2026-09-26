import { notFound } from "next/navigation";
import { requireRh } from "@/lib/rh/gate";
import { detalheDoCandidato, lerEtapas, listarVagas } from "@/lib/rh/curriculos/dados";
import { CandidatoClient } from "./CandidatoClient";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RH → Currículos → o candidato. A tela de análise: respostas, currículo,
 * observações e a linha do tempo. O servidor já recorta pelas gavetas de quem
 * abriu — o que a pessoa não pode ver chega como `null`, e a tela diz isso.
 */
export default async function CandidatoPage({ params }: { params: Promise<{ id: string }> }) {
  const { poderes } = await requireRh("curriculos");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [candidato, vagas, etapas] = await Promise.all([detalheDoCandidato(id, poderes), listarVagas(), lerEtapas()]);
  if (!candidato) notFound();
  return <CandidatoClient inicial={candidato} vagas={vagas.dados} poderes={poderes} etapas={etapas.dados} />;
}
