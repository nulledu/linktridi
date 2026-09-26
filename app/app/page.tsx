import { redirect } from "next/navigation";
import { getProfile } from "@/lib/require-auth";
import { listAtividades } from "@/lib/atividades";
import { AppClient } from "./AppClient";

export const dynamic = "force-dynamic";

export default async function ColaboradorAppPage() {
  const me = await getProfile();
  if (!me) redirect("/login?next=/app");
  const atividades = await listAtividades({ para_id: me.id });
  return <AppClient nome={me.name || me.username} atividades={atividades} />;
}
