import { requireModuleKeys } from "@/lib/require-auth";
import { AdministracaoClient } from "./AdministracaoClient";

export const dynamic = "force-dynamic";

export default async function AdministracaoPage() {
  const { keys } = await requireModuleKeys("administracao");
  // Só o painel de TV sobrou aqui. As outras chaves continuam existindo na
  // grade e agora liberam as telas nos lugares novos: `:marketplaces` abre
  // Comercial › Canais e `:notificacoes` mostra "Enviar aviso" no sino.
  const perms = { paineis: keys.includes("administracao:paineis") };
  return <AdministracaoClient perms={perms} />;
}
