import { redirect } from "next/navigation";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { paginaInicialDe, resolverPaginaInicial } from "@/lib/pagina-inicial";

export const dynamic = "force-dynamic";

// Landing pós-login: manda pra página inicial da pessoa (definida na ficha dela,
// aba Acesso) e, na falta, pra home natural do papel.
export default async function Inicio() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const [escolhida, keys] = await Promise.all([
    paginaInicialDe(profile.id),
    resolveMyModuleKeys(profile),
  ]);
  redirect(resolverPaginaInicial(escolhida, keys, profile.role));
}
