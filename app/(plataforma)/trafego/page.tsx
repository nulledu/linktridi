import { requireModuleKeys } from "@/lib/require-auth";
import { TrafegoClient } from "./TrafegoClient";

export const dynamic = "force-dynamic";

export default async function TrafegoPage() {
  // requireModuleKeys (não requireModule): a tela precisa saber se o usuário tem
  // a sub-permissão `trafego:gerenciar` pra mostrar os controles de pausar/
  // ativar/orçamento. O gate REAL continua na API — isto aqui só decide se o
  // botão aparece.
  const { profile, keys } = await requireModuleKeys("trafego");
  return <TrafegoClient userId={profile.id} podeGerenciar={keys.includes("trafego:gerenciar")} />;
}
