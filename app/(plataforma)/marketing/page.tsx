import { requireModuleKeys } from "@/lib/require-auth";
import { MarketingClient } from "./MarketingClient";
import { ehAdmin } from "@/lib/marketing-criativos-admin";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  // requireModuleKeys (não requireModule): a tela precisa saber se a pessoa tem
  // `marketing:criar` pra mostrar o botão de novo criativo. O gate REAL está na
  // API — aqui só decide o que aparece.
  //
  // `contingencia` é ÁREA IRMÃ, não sub daqui: a aba só aparece pra quem tem o
  // quadradinho dela. Quem tem a Contingência e não tem o Marketing entra pela
  // barra lateral, em /marketing/contingencia.
  const { profile, keys } = await requireModuleKeys("marketing");
  return (
    <MarketingClient
      eu={{ id: profile.id, nome: profile.name, admin: ehAdmin(profile) }}
      podeCriar={keys.includes("marketing:criar")}
      podeDesempenho={keys.includes("marketing:desempenho")}
      podeContingencia={keys.includes("contingencia")}
      // Aba Páginas (LinkTridi e Central de Tutoriais): quem tem o Marketing
      // vê e edita — é a área dona delas desde set/2026.
      podeLinkTridiLista
      podeLinkTridi
      podeTutoriais
    />
  );
}
